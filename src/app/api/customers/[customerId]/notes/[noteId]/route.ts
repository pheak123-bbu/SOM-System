import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ body: z.string().trim().min(1).max(1000) });

async function getCustomerNote(customerId: string, noteId: string, storeId: string) {
  return db.customerNote.findFirst({
    where: { id: noteId, customerId, customer: { storeId } },
    select: { id: true },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string; noteId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "កំណត់ចំណាំត្រូវមានចន្លោះពី ១ ដល់ ១,០០០ តួអក្សរ។" }, { status: 400 });
  const { customerId, noteId } = await params;
  try {
    if (!await getCustomerNote(customerId, noteId, context.storeId)) return NextResponse.json({ error: "រកមិនឃើញកំណត់ចំណាំទេ។" }, { status: 404 });
    const note = await db.customerNote.update({ where: { id: noteId }, data: { body: parsed.data.body } });
    await db.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "CUSTOMER_NOTE_UPDATED", entity: "Customer", entityId: customerId } });
    return NextResponse.json({ note });
  } catch (error) {
    console.error("Customer note update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែកំណត់ចំណាំបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ customerId: string; noteId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId, noteId } = await params;
  try {
    if (!await getCustomerNote(customerId, noteId, context.storeId)) return NextResponse.json({ error: "រកមិនឃើញកំណត់ចំណាំទេ។" }, { status: 404 });
    await db.$transaction(async (tx) => {
      await tx.customerNote.delete({ where: { id: noteId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "CUSTOMER_NOTE_DELETED", entity: "Customer", entityId: customerId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Customer note deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបកំណត់ចំណាំបានទេ។" }, { status: 500 });
  }
}
