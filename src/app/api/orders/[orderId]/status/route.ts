import { NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { OrderRuleError, updateOrderStatus } from "@/lib/orders";

const statusSchema = z.object({ status: z.nativeEnum(OrderStatus), note: z.string().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ត្រូវបញ្ជាក់ស្ថានភាពបន្ទាប់ដែលត្រឹមត្រូវ។" }, { status: 400 });
  try {
    const { orderId } = await params;
    const order = await updateOrderStatus({ storeId: context.storeId, orderId, status: parsed.data.status, note: parsed.data.note, userId: context.userId });
    if (!order) return NextResponse.json({ error: "រកមិនឃើញការបញ្ជាទិញទេ។" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof OrderRuleError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Order status update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែស្ថានភាពការបញ្ជាទិញបានទេ។" }, { status: 500 });
  }
}
