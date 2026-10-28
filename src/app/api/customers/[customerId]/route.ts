import { NextResponse } from "next/server";
import { SalesChannel } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.union([z.email(), z.literal("")]).optional().nullable(),
  preferredChannel: z.nativeEnum(SalesChannel).optional().nullable(),
  telegramUsername: z.string().trim().max(60).optional().nullable(),
  facebookId: z.string().trim().max(100).optional().nullable(),
  codRiskOverride: z.enum(["AUTO", "TRUSTED", "HIGH_RISK"]).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានអតិថិជនមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { customerId } = await params;
  try {
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id: customerId, storeId: context.storeId },
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone || null,
          email: parsed.data.email?.toLowerCase() || null,
          preferredChannel: parsed.data.preferredChannel || null,
          ...(parsed.data.telegramUsername !== undefined ? { telegramUsername: parsed.data.telegramUsername } : {}),
          ...(parsed.data.facebookId !== undefined ? { facebookId: parsed.data.facebookId } : {}),
          ...(parsed.data.codRiskOverride !== undefined ? { codRiskOverride: parsed.data.codRiskOverride } : {}),
        },
      });
      if (result.count !== 1) return null;
      const customer = await tx.customer.findFirst({ where: { id: customerId, storeId: context.storeId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "CUSTOMER_UPDATED", entity: "Customer", entityId: customerId } });
      return customer;
    });
    if (!updated) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });
    return NextResponse.json({ customer: updated });
  } catch (error) {
    console.error("Customer update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែព័ត៌មានអតិថិជនបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId } = await params;
  try {
    const customer = await db.customer.findFirst({
      where: { id: customerId, storeId: context.storeId },
      select: { id: true, _count: { select: { orders: true, notes: true, addresses: true, conversations: true } } },
    });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });
    const linked = customer._count.orders + customer._count.notes + customer._count.addresses + customer._count.conversations;
    if (linked > 0) return NextResponse.json({ error: "មិនអាចលុបអតិថិជនដែលមានការបញ្ជាទិញ កំណត់ចំណាំ អាសយដ្ឋាន ឬការសន្ទនាភ្ជាប់បានទេ។ សូមដកតំណភ្ជាប់ទាំងនោះជាមុន។" }, { status: 409 });
    await db.$transaction(async (tx) => {
      await tx.customer.deleteMany({ where: { id: customerId, storeId: context.storeId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "CUSTOMER_DELETED", entity: "Customer", entityId: customerId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Customer deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបអតិថិជនបានទេ។" }, { status: 500 });
  }
}
