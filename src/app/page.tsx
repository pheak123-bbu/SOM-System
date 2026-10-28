import { OrderStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { storeDayStart } from "@/lib/dates";
import { Workspace } from "@/components/workspace";
import { z } from "zod";

const salesStatuses = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
const extractedSchema = z.object({
  items: z.array(z.object({
    productId: z.string().nullable(),
    variantId: z.string().nullable(),
    productName: z.string(),
    variantName: z.string().nullable(),
    quantity: z.number().int(),
  })).default([]),
});

export default async function HomePage() {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  const today = storeDayStart(new Date(), context.store.timezone);
  const storeId = context.storeId;
  const [totalOrders, ordersToday, pendingOrders, awaitingReview, sales, customersCount, activeProducts, lowStockProducts, lowStockVariants, recentOrders, customers, spending, products, suggestions, conversations, categories] = await Promise.all([
    db.order.count({ where: { storeId } }),
    db.order.count({ where: { storeId, createdAt: { gte: today } } }),
    db.order.count({ where: { storeId, status: OrderStatus.PENDING_CONFIRMATION } }),
    db.orderSuggestion.count({ where: { storeId, status: "PENDING" } }),
    db.order.aggregate({ where: { storeId, status: { in: salesStatuses } }, _sum: { total: true } }),
    db.customer.count({ where: { storeId } }),
    db.product.count({ where: { storeId, active: true } }),
    db.product.count({ where: { storeId, active: true, stock: { lte: 5 }, variants: { none: { active: true } } } }),
    db.productVariant.count({ where: { active: true, stock: { lte: 5 }, product: { storeId, active: true } } }),
    db.order.findMany({ where: { storeId }, include: { customer: true, items: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.customer.findMany({
      where: { storeId },
      include: {
        _count: { select: { orders: { where: { status: { in: salesStatuses } } }, conversations: true } },
        orders: { where: { status: { not: OrderStatus.CANCELLED } }, orderBy: { createdAt: "desc" }, take: 1, select: { total: true, createdAt: true } },
        notes: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.order.groupBy({ by: ["customerId"], where: { storeId, status: { in: salesStatuses } }, _sum: { total: true }, _count: { _all: true } }),
    db.product.findMany({ where: { storeId }, include: { variants: true }, orderBy: [{ active: "desc" }, { name: "asc" }], take: 100 }),
    db.orderSuggestion.findMany({
      where: { storeId },
      include: {
        conversation: {
          include: {
            customer: true,
            messages: { where: { senderType: "CUSTOMER" }, orderBy: { sentAt: "desc" }, take: 3 },
          },
        },
        order: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.conversation.findMany({
      where: { storeId },
      include: { customer: true, messages: { orderBy: { sentAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" },
      take: 30,
    }),
    db.category.findMany({
      where: { storeId },
      include: { _count: { select: { products: true } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
  ]);

  const spentByCustomer = new Map(spending.map((row) => [row.customerId, Number(row._sum.total ?? 0)]));
  return (
    <Workspace
      user={{
        name: context.user.name,
        role: context.role,
        store: context.store.name,
        currency: context.store.currency,
        storePhone: context.store.phone ?? undefined,
        storeAddress: context.store.address ?? undefined,
        bakongAccountId: context.store.bakongAccountId ?? undefined,
        exchangeRate: Number(context.store.exchangeRate ?? 4100),
        avatarUrl: context.user.avatarUrl ?? undefined,
      }}
      summary={{
        totalOrders,
        ordersToday,
        pendingOrders,
        awaitingReview,
        totalSales: Number(sales._sum.total ?? 0),
        customersCount,
        activeProducts,
        lowStockCount: lowStockProducts + lowStockVariants,
      }}
      orders={recentOrders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customer: order.customer.name,
        phone: order.customer.phone ?? "",
        status: order.status,
        channel: order.channel,
        total: Number(order.total),
        itemNames: order.items.map((item) => `${item.productName}${item.variantName ? ` · ${item.variantName}` : ""}`).join(", "),
        createdAt: order.createdAt.toISOString(),
        courier: order.courier,
        trackingNumber: order.trackingNumber,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        province: order.province,
        notes: order.notes,
        deliveryAddress: order.deliveryAddress,
      }))}
      customers={customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        channel: customer.preferredChannel ?? "DIRECT",
        orderCount: customer._count.orders,
        conversationCount: customer._count.conversations,
        totalSpent: spentByCustomer.get(customer.id) ?? 0,
        lastOrderAt: customer.orders[0]?.createdAt.toISOString() ?? null,
        notes: customer.notes.map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt.toISOString() })),
        telegramUsername: customer.telegramUsername,
        facebookId: customer.facebookId,
        codRiskOverride: customer.codRiskOverride,
      }))}
      products={products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku ?? "",
        category: product.category ?? "មិនទាន់ចាត់ថ្នាក់",
        categoryId: product.categoryId ?? null,
        price: Number(product.price),
        stock: product.stock,
        active: product.active,
        description: product.description ?? "",
        imageUrl: product.imageUrl ?? null,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price ? Number(variant.price) : null,
          stock: variant.stock,
          active: variant.active,
        })),
      }))}
      categories={categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description ?? "",
        color: cat.color ?? "#3164ce",
        icon: cat.icon ?? null,
        active: cat.active,
        productCount: cat._count.products,
        createdAt: cat.createdAt.toISOString(),
      }))}
      suggestions={suggestions.map((suggestion) => ({
        id: suggestion.id,
        status: suggestion.status,
        intent: suggestion.intent,
        confidence: suggestion.confidence,
        items: extractedSchema.safeParse(suggestion.extracted).success
          ? extractedSchema.parse(suggestion.extracted).items
          : [],
        explanation: suggestion.explanation,
        missingInfo: suggestion.missingInfo,
        createdAt: suggestion.createdAt.toISOString(),
        customer: suggestion.conversation.customer?.name ?? "អតិថិជនមិនស្គាល់",
        channel: suggestion.conversation.channel,
        messages: suggestion.conversation.messages.map((message) => ({
          body: message.body.replace(/🖼️\s*រូបភាព[៖:]\s*data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").replace(/data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").trim(),
          sender: message.senderName,
          at: message.sentAt.toISOString(),
        })),
      }))}
      conversations={conversations.map((conversation) => ({
        id: conversation.id,
        customer: conversation.customer?.name ?? "មិនទាន់ភ្ជាប់អតិថិជន",
        customerId: conversation.customerId,
        channel: conversation.channel,
        externalId: conversation.externalId,
        lastMessage: conversation.messages[0]?.body ?? "មិនទាន់មានសារទេ",
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        messages: [],
      }))}
      simulatorEnabled={process.env.NODE_ENV !== "production"}
    />
  );
}
