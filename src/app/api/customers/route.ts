import { NextResponse } from "next/server";
import { SalesChannel } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const purchaseStatuses = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const customerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  preferredChannel: z.nativeEnum(SalesChannel).optional(),
  telegramUsername: z.string().trim().max(60).optional().nullable(),
  facebookId: z.string().trim().max(100).optional().nullable(),
  codRiskOverride: z.enum(["AUTO", "TRUSTED", "HIGH_RISK"]).optional(),
});

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const search = params.get("search")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 10) || 10));
  const where = {
    storeId: context.storeId,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { phone: { contains: search } },
      { email: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: {
          _count: { select: { orders: { where: { status: { in: [...purchaseStatuses] } } }, conversations: true } },
          orders: { where: { status: { in: [...purchaseStatuses] } }, select: { total: true, createdAt: true }, orderBy: { createdAt: "desc" } },
          notes: { orderBy: { createdAt: "desc" }, take: 3 },
        },
        orderBy: { updatedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize,
      }),
      db.customer.count({ where }),
    ]);
    return NextResponse.json({
      customers: rows.map(({ orders, ...customer }) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        channel: customer.preferredChannel ?? "DIRECT",
        telegramUsername: customer.telegramUsername,
        facebookId: customer.facebookId,
        codRiskOverride: customer.codRiskOverride,
        conversationCount: customer._count.conversations,
        orderCount: customer._count.orders,
        totalSpent: orders.reduce((sum, order) => sum + Number(order.total), 0),
        lastOrderAt: orders[0]?.createdAt ?? null,
        notes: customer.notes.map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt })),
      })),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Customer list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកបញ្ជីអតិថិជនបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = customerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "សូមបញ្ចូលឈ្មោះអតិថិជន និងព័ត៌មានទំនាក់ទំនងដែលត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
  try {
    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          storeId: context.storeId,
          name: parsed.data.name,
          phone: parsed.data.phone || null,
          email: parsed.data.email?.toLowerCase() || null,
          preferredChannel: parsed.data.preferredChannel,
          telegramUsername: parsed.data.telegramUsername || null,
          facebookId: parsed.data.facebookId || null,
          codRiskOverride: parsed.data.codRiskOverride || "AUTO",
        },
      });
      await tx.auditLog.create({ data: { storeId: context.storeId, action: "CUSTOMER_CREATED", entity: "Customer", entityId: created.id } });
      return created;
    });
    return NextResponse.json({ customer }, { status: 201 });
  } catch (error) {
    console.error("Customer creation failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតអតិថិជនបានទេ។" }, { status: 500 });
  }
}
