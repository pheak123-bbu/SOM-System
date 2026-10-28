import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { bulkUpdateOrderStatus, OrderRuleError } from "@/lib/orders";

const safeStatuses = [
  OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED,
] as const;
const schema = z.object({
  orderIds: z.array(z.string().min(1).max(64)).min(1).max(100).refine((ids) => new Set(ids).size === ids.length),
  status: z.enum(safeStatuses),
});

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "សូមជ្រើសការបញ្ជាទិញ និងស្ថានភាពបន្ទាប់ដែលត្រឹមត្រូវ។" }, { status: 400 });
  try {
    const orders = await bulkUpdateOrderStatus({
      storeId: context.storeId,
      userId: context.userId,
      orderIds: parsed.data.orderIds,
      status: parsed.data.status,
    });
    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof OrderRuleError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Bulk order status update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែស្ថានភាពការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}
