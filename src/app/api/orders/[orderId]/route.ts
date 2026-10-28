import { NextResponse } from "next/server";
import { Prisma, SalesChannel } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { OrderRuleError } from "@/lib/orders";

const schema = z.object({
  customerId: z.string().min(1).optional(),
  channel: z.nativeEnum(SalesChannel).optional(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  courier: z.string().trim().max(60).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
  paymentMethod: z.string().trim().max(50).optional().nullable(),
  paymentStatus: z.string().trim().max(50).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  exchangeRate: z.number().positive().optional().nullable(),
  discount: z.number().nonnegative().max(10_000_000).optional(),
  deliveryFee: z.number().nonnegative().max(10_000_000).optional(),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().optional(), quantity: z.number().int().min(1).max(1000) })).min(1).max(50).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { orderId } = await params;
  try {
    const order = await db.order.findFirst({
      where: { id: orderId, storeId: context.storeId },
      include: {
        customer: true,
        items: true,
        history: { orderBy: { createdAt: "desc" } },
        suggestion: {
          include: {
            conversation: {
              select: {
                channel: true,
                externalId: true,
                lastMessageAt: true,
              },
            },
            evidence: {
              include: {
                message: true,
              },
            },
          },
        },
      },
    });
    if (!order) return NextResponse.json({ error: "រកមិនឃើញការបញ្ជាទិញទេ។" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    console.error("Order retrieval failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}

function toCents(value: number, label: string) {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || Math.abs(cents - value * 100) > 1e-7 || !Number.isSafeInteger(cents)) {
    throw new OrderRuleError(`${label} ត្រូវតែមានខ្ទង់ទសភាគមិនលើសពីពីរខ្ទង់។`);
  }
  return cents;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានការបញ្ជាទិញមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { orderId } = await params;
  try {
    const order = await db.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({ where: { id: orderId, storeId: context.storeId } });
      if (!existing) return null;

      if (!parsed.data.items) {
        const updateData: Prisma.OrderUpdateInput = {};
        if (parsed.data.deliveryAddress !== undefined) updateData.deliveryAddress = parsed.data.deliveryAddress?.trim() || null;
        if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes?.trim() || null;
        if (parsed.data.courier !== undefined) updateData.courier = parsed.data.courier?.trim() || null;
        if (parsed.data.trackingNumber !== undefined) updateData.trackingNumber = parsed.data.trackingNumber?.trim() || null;
        if (parsed.data.paymentMethod !== undefined) updateData.paymentMethod = parsed.data.paymentMethod?.trim() || null;
        if (parsed.data.paymentStatus !== undefined) {
          updateData.paymentStatus = parsed.data.paymentStatus?.trim() || null;
          updateData.paidAt = parsed.data.paymentStatus === "PAID" ? (existing.paidAt || new Date()) : null;
        }
        if (parsed.data.province !== undefined) updateData.province = parsed.data.province?.trim() || null;
        if (parsed.data.exchangeRate !== undefined) updateData.exchangeRate = parsed.data.exchangeRate ? new Prisma.Decimal(parsed.data.exchangeRate) : null;

        const updated = await tx.order.update({
          where: { id: existing.id },
          data: updateData,
          include: { customer: true, items: true, history: { orderBy: { createdAt: "desc" } } },
        });
        await tx.auditLog.create({
          data: {
            storeId: context.storeId,
            userId: context.userId,
            action: "ORDER_UPDATED",
            entity: "Order",
            entityId: existing.id,
            metadata: { orderNumber: existing.orderNumber, partial: true },
          },
        });
        return updated;
      }

      if (!["DRAFT", "PENDING_CONFIRMATION"].includes(existing.status)) {
        throw new OrderRuleError("អាចកែប្រែមុខទំនិញបានតែការបញ្ជាទិញជាសេចក្ដីព្រាង ឬកំពុងរង់ចាំការបញ្ជាក់ប៉ុណ្ណោះ។");
      }
      const targetCustomerId = parsed.data.customerId || existing.customerId;
      const customer = await tx.customer.findFirst({ where: { id: targetCustomerId, storeId: context.storeId }, select: { id: true } });
      if (!customer) throw new OrderRuleError("អតិថិជនដែលបានជ្រើសរើសមិនមានក្នុងហាងនេះទេ។");
      const discountCents = toCents(parsed.data.discount ?? 0, "ការបញ្ចុះតម្លៃ");
      const deliveryCents = toCents(parsed.data.deliveryFee ?? 0, "ថ្លៃដឹកជញ្ជូន");
      const resolvedItems = await Promise.all(parsed.data.items.map(async (item) => {
        const product = await tx.product.findFirst({
          where: { id: item.productId, storeId: context.storeId, active: true },
          include: { variants: { where: { active: true } } },
        });
        if (!product) throw new OrderRuleError("ផលិតផលដែលបានជ្រើសរើសមិនអាចប្រើបានទេ។");
        const variant = item.variantId ? product.variants.find((entry) => entry.id === item.variantId) : null;
        if (item.variantId && !variant) throw new OrderRuleError("ជម្រើសផលិតផលដែលបានជ្រើសរើសមិនអាចប្រើបានទេ។");
        if (product.variants.length > 0 && !variant) throw new OrderRuleError(`សូមជ្រើសរើសជម្រើសដែលអាចប្រើបានសម្រាប់ ${product.name}។`);
        const stock = variant?.stock ?? product.stock;
        if (stock !== null && stock !== undefined && stock < item.quantity) throw new OrderRuleError(`${product.name} មានស្តុកមិនគ្រប់គ្រាន់ទេ។`);
        const unitCents = toCents(Number(variant?.price ?? product.price), "តម្លៃផលិតផល");
        const rawCost = variant?.costPrice ?? product.costPrice;
        const costCents = rawCost !== null && rawCost !== undefined ? toCents(Number(rawCost), "តម្លៃដើម") : null;
        return {
          productId: product.id,
          variantId: variant?.id ?? null,
          productName: product.name,
          productSku: variant?.sku ?? product.sku,
          variantName: variant?.name ?? null,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal((unitCents / 100).toFixed(2)),
          lineTotal: new Prisma.Decimal(((unitCents * item.quantity) / 100).toFixed(2)),
          lineCents: unitCents * item.quantity,
          costCents,
        };
      }));
      const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineCents, 0);
      if (discountCents > subtotalCents) throw new OrderRuleError("ការបញ្ចុះតម្លៃមិនអាចលើសពីតម្លៃសរុបមុខទំនិញបានទេ។");
      const updated = await tx.order.update({
        where: { id: existing.id },
        data: {
          customerId: customer.id,
          channel: parsed.data.channel ?? existing.channel,
          deliveryAddress: parsed.data.deliveryAddress !== undefined ? (parsed.data.deliveryAddress?.trim() || null) : existing.deliveryAddress,
          notes: parsed.data.notes !== undefined ? (parsed.data.notes?.trim() || null) : existing.notes,
          courier: parsed.data.courier !== undefined ? (parsed.data.courier?.trim() || null) : existing.courier,
          trackingNumber: parsed.data.trackingNumber !== undefined ? (parsed.data.trackingNumber?.trim() || null) : existing.trackingNumber,
          paymentMethod: parsed.data.paymentMethod !== undefined ? (parsed.data.paymentMethod?.trim() || null) : existing.paymentMethod,
          paymentStatus: parsed.data.paymentStatus !== undefined ? (parsed.data.paymentStatus?.trim() || null) : existing.paymentStatus,
          province: parsed.data.province !== undefined ? (parsed.data.province?.trim() || null) : existing.province,
          exchangeRate: parsed.data.exchangeRate !== undefined ? (parsed.data.exchangeRate ? new Prisma.Decimal(parsed.data.exchangeRate) : null) : existing.exchangeRate,
          paidAt: parsed.data.paymentStatus === "PAID" ? (existing.paidAt || new Date()) : (parsed.data.paymentStatus ? null : existing.paidAt),
          subtotal: new Prisma.Decimal((subtotalCents / 100).toFixed(2)),
          discount: new Prisma.Decimal((discountCents / 100).toFixed(2)),
          deliveryFee: new Prisma.Decimal((deliveryCents / 100).toFixed(2)),
          total: new Prisma.Decimal(((subtotalCents - discountCents + deliveryCents) / 100).toFixed(2)),
          items: {
            deleteMany: {},
            create: resolvedItems.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.productName,
              productSku: item.productSku,
              variantName: item.variantName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              costPrice: item.costCents !== null ? new Prisma.Decimal((item.costCents / 100).toFixed(2)) : null,
            })),
          },
        },
        include: { customer: true, items: true, history: { orderBy: { createdAt: "desc" } } },
      });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "ORDER_UPDATED", entity: "Order", entityId: existing.id, metadata: { orderNumber: existing.orderNumber } } });
      return updated;
    });
    if (!order) return NextResponse.json({ error: "រកមិនឃើញការបញ្ជាទិញទេ។" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderRuleError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Order update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { orderId } = await params;
  try {
    const order = await db.order.findFirst({
      where: { id: orderId, storeId: context.storeId },
      include: { suggestion: { select: { id: true } }, items: true },
    });
    if (!order) return NextResponse.json({ error: "រកមិនឃើញការបញ្ជាទិញទេ។" }, { status: 404 });
    if (order.suggestion) return NextResponse.json({ error: "មិនអាចលុបការបញ្ជាទិញដែលភ្ជាប់នឹងសំណើពិនិត្យបានទេ។" }, { status: 409 });
    await db.$transaction(async (tx) => {
      // Restore stock if the order had reserved inventory
      if (["CONFIRMED", "PROCESSING", "SHIPPED"].includes(order.status)) {
        for (const item of order.items) {
          if (item.variantId) {
            const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
            if (variant && variant.stock !== null) {
              await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
            }
          } else if (item.productId) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product && product.stock !== null) {
              await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
            }
          }
        }
      }
      await tx.order.delete({ where: { id: order.id } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "ORDER_DELETED", entity: "Order", entityId: order.id, metadata: { orderNumber: order.orderNumber } } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Order deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}
