import { NextResponse } from "next/server";
import { OrderStatus, SalesChannel } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrder, OrderRuleError } from "@/lib/orders";
import { checkRateLimit } from "@/lib/rate-limit";

const orderSchema = z.object({
  customerId: z.string().min(1),
  channel: z.nativeEnum(SalesChannel),
  status: z.enum([OrderStatus.DRAFT, OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.DELIVERED]),
  idempotencyKey: z.string().uuid(),
  deliveryAddress: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  courier: z.string().trim().max(60).optional().nullable(),
  trackingNumber: z.string().trim().max(100).optional().nullable(),
  paymentMethod: z.string().trim().max(50).optional().nullable(),
  paymentStatus: z.string().trim().max(50).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  exchangeRate: z.number().positive().optional().nullable(),
  discount: z.number().nonnegative().max(10_000_000),
  deliveryFee: z.number().nonnegative().max(10_000_000),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().optional(), quantity: z.number().int() })).min(1).max(50),
});

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const search = params.get("search")?.trim() ?? "";
  const customerId = params.get("customerId");
  const courier = params.get("courier")?.trim();
  const paymentStatus = params.get("paymentStatus")?.trim();
  const province = params.get("province")?.trim();
  const source = params.get("source")?.trim();
  const statusValue = params.get("status");
  if (statusValue && !Object.values(OrderStatus).includes(statusValue as OrderStatus)) {
    return NextResponse.json({ error: "លក្ខខណ្ឌច្រោះស្ថានភាពការបញ្ជាទិញមិនត្រឹមត្រូវទេ។" }, { status: 400 });
  }
  const status = statusValue as OrderStatus | null;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") ?? 10) || 10));
  const where: any = {
    storeId: context.storeId,
    ...(customerId ? { customerId } : {}),
    ...(status ? { status } : {}),
    ...(courier ? { courier } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(province ? { province } : {}),
    ...(source === "AI" ? { suggestion: { isNot: null } } : {}),
    ...(source === "DIRECT" ? { channel: SalesChannel.DIRECT } : {}),
    ...(search ? { OR: [
      { orderNumber: { contains: search, mode: "insensitive" as const } },
      { trackingNumber: { contains: search, mode: "insensitive" as const } },
      { customer: { name: { contains: search, mode: "insensitive" as const } } },
      { customer: { phone: { contains: search } } },
    ] } : {}),
  };
  try {
    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        include: {
          customer: true,
          items: true,
          suggestion: {
            select: {
              id: true,
              confidence: true,
              intent: true,
              status: true,
              jobId: true,
              conversationId: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.order.count({ where }),
    ]);
    return NextResponse.json({ orders, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error("Order list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });

  // Rate limit: max 60 order creations per minute per store to prevent order spamming
  const rate = await checkRateLimit(`orders:create:${context.storeId}`, 60, 60);
  if (!rate.success) {
    return NextResponse.json({ error: "សំណើបង្កើតការបញ្ជាទិញច្រើនពេកក្នុងពេលតែមួយ។ សូមរង់ចាំមួយភ្លែត។" }, { status: 429 });
  }

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានការបញ្ជាទិញមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  try {
    const order = await createOrder({ storeId: context.storeId, userId: context.userId, ...parsed.data });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderRuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Order creation failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}
