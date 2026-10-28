import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const noteSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ត្រូវបញ្ចូលកំណត់ចំណាំដែលមានប្រវែងមិនលើសពី ១,០០០ តួអក្សរ។" }, { status: 400 });
  const { customerId } = await params;
  try {
    const customer = await db.customer.findFirst({ where: { id: customerId, storeId: context.storeId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });
    const note = await db.$transaction(async (tx) => {
      const created = await tx.customerNote.create({ data: { customerId, body: parsed.data.body } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "CUSTOMER_NOTE_CREATED", entity: "Customer", entityId: customerId } });
      return created;
    });
    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Customer note creation failed:", error);
    return NextResponse.json({ error: "មិនអាចរក្សាទុកកំណត់ចំណាំអតិថិជនបានទេ។" }, { status: 500 });
  }
}
