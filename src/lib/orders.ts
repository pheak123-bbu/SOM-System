import { randomUUID } from "node:crypto";
import { OrderStatus, Prisma, SalesChannel, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { canTransitionOrder } from "@/lib/order-status";
import { recordStockMovementInTx } from "@/lib/inventory";

export class OrderRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderRuleError";
  }
}

function cents(value: number, field: string) {
  const rounded = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || Math.abs(rounded - value * 100) > 1e-7 || !Number.isSafeInteger(rounded)) {
    throw new OrderRuleError(`${field} ត្រូវតែជាចំនួនវិជ្ជមាន ឬសូន្យ ហើយមានខ្ទង់ទសភាគមិនលើសពីពីរខ្ទង់។`);
  }
  return rounded;
}

type CreateOrderInput = {
  storeId: string;
  customerId: string;
  channel: SalesChannel;
  status: OrderStatus;
  userId?: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  courier?: string | null;
  trackingNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  province?: string | null;
  exchangeRate?: number | null;
  idempotencyKey: string;
  discount: number;
  deliveryFee: number;
  items: { productId: string; variantId?: string; quantity: number }[];
};

export async function createOrderInTransaction(tx: Prisma.TransactionClient, input: CreateOrderInput) {
  const existingOrder = await tx.order.findFirst({
    where: { storeId: input.storeId, idempotencyKey: input.idempotencyKey },
    include: { customer: true, items: true },
  });
  if (existingOrder) return existingOrder;
  if (input.items.length === 0 || input.items.length > 50) throw new OrderRuleError("ការបញ្ជាទិញត្រូវមានមុខទំនិញចាប់ពី ១ ដល់ ៥០ មុខ។");
  if (
    input.status !== OrderStatus.DRAFT &&
    input.status !== OrderStatus.PENDING_CONFIRMATION &&
    input.status !== OrderStatus.CONFIRMED &&
    input.status !== OrderStatus.DELIVERED
  ) {
    throw new OrderRuleError("ការបញ្ជាទិញថ្មីអាចរក្សាទុកជាសេចក្ដីព្រាង រង់ចាំការបញ្ជាក់ បានបញ្ជាក់ ឬបានប្រគល់។");
  }

  const discountCents = cents(input.discount, "ការបញ្ចុះតម្លៃ");
  const deliveryCents = cents(input.deliveryFee, "ថ្លៃដឹកជញ្ជូន");
  const customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId: input.storeId }, select: { id: true, name: true } });
  if (!customer) throw new OrderRuleError("រកមិនឃើញអតិថិជនក្នុងហាងនេះទេ។");

  const resolvedItems = await Promise.all(input.items.map(async (item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 1000) {
      throw new OrderRuleError("ចំនួនមុខទំនិញត្រូវជាចំនួនគត់ពី ១ ដល់ ១,០០០។");
    }
    const product = await tx.product.findFirst({
      where: { id: item.productId, storeId: input.storeId, active: true },
      include: { variants: { where: { active: true } } },
    });
    if (!product) throw new OrderRuleError("ផលិតផលដែលបានជ្រើសរើសមិនអាចប្រើបានទេ។");
    const variant = item.variantId ? product.variants.find((entry) => entry.id === item.variantId) : null;
    if (item.variantId && !variant) throw new OrderRuleError("ជម្រើសផលិតផលដែលបានជ្រើសរើសមិនអាចប្រើបានទេ។");
    if (product.variants.length > 0 && !variant) throw new OrderRuleError(`សូមជ្រើសរើសជម្រើសដែលអាចប្រើបានសម្រាប់ ${product.name}។`);
    const stock = variant?.stock ?? product.stock;
    if (stock !== null && stock !== undefined && stock < item.quantity) throw new OrderRuleError(`${product.name} មានស្តុកមិនគ្រប់គ្រាន់ទេ។`);
    const price = variant?.price ?? product.price;
    const unitCents = cents(Number(price), "តម្លៃផលិតផល");
    const rawCost = variant?.costPrice ?? product.costPrice;
    const costCents = rawCost !== null && rawCost !== undefined ? cents(Number(rawCost), "តម្លៃដើម") : null;
    return {
      productId: product.id,
      variantId: variant?.id,
      productName: product.name,
      productSku: variant?.sku ?? product.sku,
      variantName: variant?.name,
      quantity: item.quantity,
      unitCents,
      lineCents: unitCents * item.quantity,
      costCents,
    };
  }));

  const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineCents, 0);
  if (discountCents > subtotalCents) throw new OrderRuleError("ការបញ្ចុះតម្លៃមិនអាចលើសពីតម្លៃសរុបមុខទំនិញបានទេ។");
  const totalCents = subtotalCents - discountCents + deliveryCents;
  const orderNumber = `SS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const toMoney = (amount: number) => new Prisma.Decimal((amount / 100).toFixed(2));

  // Real Inventory Reservation / Stock Deduction Logic for direct CONFIRMED / DELIVERED orders (e.g. POS sales)
  if (input.status === OrderStatus.CONFIRMED || input.status === OrderStatus.DELIVERED) {
    const movementType = input.channel === "DIRECT" ? StockMovementType.SALE_POS : StockMovementType.SALE_ORDER;
    for (const item of resolvedItems) {
      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (variant && variant.stock !== null) {
          if (variant.stock < item.quantity) {
            throw new OrderRuleError(`ជម្រើស ${item.variantName || item.productName} មានស្តុកមិនគ្រប់គ្រាន់ទេ (នៅសល់ ${variant.stock} ប៉ុន្តែត្រូវការ ${item.quantity})។`);
          }
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId!,
            variantId: item.variantId,
            type: movementType,
            quantity: -item.quantity,
            reason: input.channel === "DIRECT" ? "លក់ផ្ទាល់នៅហាង (POS Sale)" : `លក់តាមការបញ្ជាទិញ #${orderNumber}`,
            referenceId: orderNumber,
            performedBy: customer.name || "Customer",
          });
        }
      } else if (item.productId) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product && product.stock !== null) {
          if (product.stock < item.quantity) {
            throw new OrderRuleError(`ផលិតផល ${item.productName} មានស្តុកមិនគ្រប់គ្រាន់ទេ (នៅសល់ ${product.stock} ប៉ុន្តែត្រូវការ ${item.quantity})។`);
          }
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId,
            type: movementType,
            quantity: -item.quantity,
            reason: input.channel === "DIRECT" ? "លក់ផ្ទាល់នៅហាង (POS Sale)" : `លក់តាមការបញ្ជាទិញ #${orderNumber}`,
            referenceId: orderNumber,
            performedBy: customer.name || "Customer",
          });
        }
      }
    }
  }

  const order = await tx.order.create({
    data: {
      storeId: input.storeId,
      customerId: customer.id,
      orderNumber,
      idempotencyKey: input.idempotencyKey,
      channel: input.channel,
      status: input.status,
      courier: input.courier?.trim() || null,
      trackingNumber: input.trackingNumber?.trim() || null,
      paymentMethod: input.paymentMethod?.trim() || "COD",
      paymentStatus: input.paymentStatus?.trim() || "UNPAID",
      province: input.province?.trim() || null,
      exchangeRate: input.exchangeRate ? new Prisma.Decimal(input.exchangeRate) : new Prisma.Decimal(4100),
      paidAt: input.paymentStatus === "PAID" ? new Date() : null,
      subtotal: toMoney(subtotalCents),
      discount: toMoney(discountCents),
      deliveryFee: toMoney(deliveryCents),
      total: toMoney(totalCents),
      deliveryAddress: input.deliveryAddress?.trim() || null,
      notes: input.notes?.trim() || null,
      items: {
        create: resolvedItems.map((item) => ({
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          productSku: item.productSku,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: toMoney(item.unitCents),
          lineTotal: toMoney(item.lineCents),
          costPrice: item.costCents !== null ? toMoney(item.costCents) : null,
        })),
      },
      history: { create: { to: input.status, note: "Order created" } },
    },
    include: { customer: true, items: true },
  });
  await tx.auditLog.create({
    data: { storeId: input.storeId, userId: input.userId, action: "ORDER_CREATED", entity: "Order", entityId: order.id, metadata: { orderNumber: order.orderNumber } },
  });
  return order;
}

export async function createOrder(input: CreateOrderInput) {
  try {
    return await db.$transaction((tx) => createOrderInTransaction(tx, input));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.order.findFirst({
        where: { storeId: input.storeId, idempotencyKey: input.idempotencyKey },
        include: { customer: true, items: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

async function updateOrderStatusInTransaction(tx: Prisma.TransactionClient, input: {
  storeId: string;
  orderId: string;
  status: OrderStatus;
  note?: string;
  userId?: string;
}) {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, storeId: input.storeId },
    include: { items: true },
  });
  if (!order) return null;
  if (!canTransitionOrder(order.status, input.status)) throw new OrderRuleError("មិនអាចប្ដូរស្ថានភាពការបញ្ជាទិញនេះបានទេ។");

  // Real Inventory Reservation / Stock Deduction Logic
  // When an order transitions to CONFIRMED, deduct stock
  if (input.status === OrderStatus.CONFIRMED && (order.status === OrderStatus.DRAFT || order.status === OrderStatus.PENDING_CONFIRMATION)) {
    const movementType = order.channel === "DIRECT" ? StockMovementType.SALE_POS : StockMovementType.SALE_ORDER;
    for (const item of order.items) {
      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (variant && variant.stock !== null) {
          if (variant.stock < item.quantity) {
            throw new OrderRuleError(`ជម្រើស ${item.variantName || item.productName} មានស្តុកមិនគ្រប់គ្រាន់ទេ (នៅសល់ ${variant.stock} ប៉ុន្តែត្រូវការ ${item.quantity})។`);
          }
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId || "",
            variantId: item.variantId,
            type: movementType,
            quantity: -item.quantity,
            reason: `បញ្ជាក់ការបញ្ជាទិញ #${order.orderNumber}`,
            referenceId: order.orderNumber,
            performedBy: "Staff / Owner",
          });
        }
      } else if (item.productId) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product && product.stock !== null) {
          if (product.stock < item.quantity) {
            throw new OrderRuleError(`ផលិតផល ${item.productName} មានស្តុកមិនគ្រប់គ្រាន់ទេ (នៅសល់ ${product.stock} ប៉ុន្តែត្រូវការ ${item.quantity})។`);
          }
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId,
            type: movementType,
            quantity: -item.quantity,
            reason: `បញ្ជាក់ការបញ្ជាទិញ #${order.orderNumber}`,
            referenceId: order.orderNumber,
            performedBy: "Staff / Owner",
          });
        }
      }
    }
  }

  // When an order transitions to CANCELLED, restore/replenish stock if it was previously confirmed, processing, or shipped
  if (input.status === OrderStatus.CANCELLED && ([OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED] as OrderStatus[]).includes(order.status)) {
    for (const item of order.items) {
      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (variant && variant.stock !== null) {
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId || "",
            variantId: item.variantId,
            type: StockMovementType.RETURN_RESTOCK,
            quantity: item.quantity,
            reason: `បោះបង់ការបញ្ជាទិញ #${order.orderNumber} (បញ្ចូលស្តុកវិញ)`,
            referenceId: order.orderNumber,
            performedBy: "Staff / Owner",
          });
        }
      } else if (item.productId) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product && product.stock !== null) {
          await recordStockMovementInTx(tx, {
            storeId: input.storeId,
            productId: item.productId,
            type: StockMovementType.RETURN_RESTOCK,
            quantity: item.quantity,
            reason: `បោះបង់ការបញ្ជាទិញ #${order.orderNumber} (បញ្ចូលស្តុកវិញ)`,
            referenceId: order.orderNumber,
            performedBy: "Staff / Owner",
          });
        }
      }
    }
  }

  const changed = await tx.order.updateMany({
    where: { id: order.id, storeId: input.storeId, status: order.status },
    data: { status: input.status },
  });
  if (changed.count !== 1) throw new OrderRuleError("ការបញ្ជាទិញត្រូវបានកែប្រែ ខណៈពេលកំពុងរក្សាទុក។ សូមផ្ទុកទំព័រឡើងវិញ ហើយសាកល្បងម្ដងទៀត។");
  await tx.orderStatusHistory.create({
    data: { orderId: order.id, from: order.status, to: input.status, note: input.note?.trim() || null },
  });
  const updated = await tx.order.findFirst({
    where: { id: order.id, storeId: input.storeId },
    include: { customer: true, items: true, history: { orderBy: { createdAt: "desc" } } },
  });
  if (!updated) throw new OrderRuleError("រកមិនឃើញការបញ្ជាទិញ បន្ទាប់ពីកែប្រែស្ថានភាពទេ។");
  await tx.auditLog.create({
    data: { storeId: input.storeId, userId: input.userId, action: "ORDER_STATUS_CHANGED", entity: "Order", entityId: order.id, metadata: { from: order.status, to: input.status } },
  });
  return updated;
}

export async function updateOrderStatus(input: {
  storeId: string;
  orderId: string;
  status: OrderStatus;
  note?: string;
  userId?: string;
}) {
  return db.$transaction((tx) => updateOrderStatusInTransaction(tx, input));
}

export async function bulkUpdateOrderStatus(input: {
  storeId: string;
  orderIds: string[];
  status: OrderStatus;
  userId?: string;
}) {
  if (input.orderIds.length === 0 || input.orderIds.length > 100 || new Set(input.orderIds).size !== input.orderIds.length) {
    throw new OrderRuleError("ការជ្រើសរើសត្រូវមានការបញ្ជាទិញពី ១ ដល់ ១០០ ដែលមិនស្ទួនគ្នា។");
  }
  return db.$transaction(async (tx) => {
    const updated = [];
    for (const orderId of input.orderIds) {
      const order = await updateOrderStatusInTransaction(tx, {
        storeId: input.storeId, orderId, status: input.status, userId: input.userId,
      });
      if (!order) throw new OrderRuleError("មិនអាចរកឃើញការបញ្ជាទិញមួយក្នុងការជ្រើសរើសនេះទេ។ គ្មានការផ្លាស់ប្ដូរត្រូវបានរក្សាទុកឡើយ។");
      updated.push(order);
    }
    return updated;
  });
}
