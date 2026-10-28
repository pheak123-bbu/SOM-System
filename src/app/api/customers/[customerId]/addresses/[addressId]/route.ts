import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const updateSchema = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  recipient: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().min(1).max(500).optional(),
  province: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string; addressId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId, addressId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានអាសយដ្ឋានមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });

  try {
    const customer = await db.customer.findFirst({ where: { id: customerId, storeId: context.storeId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });

    const updated = await db.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      const existing = await tx.customerAddress.findFirst({ where: { id: addressId, customerId } });
      if (!existing) return null;

      const address = await tx.customerAddress.update({
        where: { id: addressId },
        data: {
          ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
          ...(parsed.data.recipient !== undefined ? { recipient: parsed.data.recipient } : {}),
          ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
          ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
          ...(parsed.data.province !== undefined ? { province: parsed.data.province } : {}),
          ...(parsed.data.district !== undefined ? { district: parsed.data.district } : {}),
          ...(parsed.data.commune !== undefined ? { commune: parsed.data.commune } : {}),
          ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CUSTOMER_ADDRESS_UPDATED",
          entity: "CustomerAddress",
          entityId: address.id,
        },
      });
      return address;
    });

    if (!updated) return NextResponse.json({ error: "រកមិនឃើញអាសយដ្ឋានទេ។" }, { status: 404 });
    return NextResponse.json({ address: updated });
  } catch (error) {
    console.error("Update customer address failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែអាសយដ្ឋានបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ customerId: string; addressId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId, addressId } = await params;

  try {
    const customer = await db.customer.findFirst({ where: { id: customerId, storeId: context.storeId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });

    const existing = await db.customerAddress.findFirst({ where: { id: addressId, customerId } });
    if (!existing) return NextResponse.json({ error: "រកមិនឃើញអាសយដ្ឋានទេ។" }, { status: 404 });

    await db.$transaction(async (tx) => {
      await tx.customerAddress.delete({ where: { id: addressId } });
      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CUSTOMER_ADDRESS_DELETED",
          entity: "CustomerAddress",
          entityId: addressId,
        },
      });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete customer address failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបអាសយដ្ឋានបានទេ។" }, { status: 500 });
  }
}
