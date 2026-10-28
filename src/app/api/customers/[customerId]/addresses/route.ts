import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const addressSchema = z.object({
  label: z.string().trim().max(60).optional(),
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().min(1).max(500),
  province: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  commune: z.string().trim().max(100).optional().nullable(),
  isDefault: z.boolean().default(false),
});

export async function GET(_: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId } = await params;
  try {
    const customer = await db.customer.findFirst({ where: { id: customerId, storeId: context.storeId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });

    const addresses = await db.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ addresses });
  } catch (error) {
    console.error("Fetch customer addresses failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកអាសយដ្ឋានបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { customerId } = await params;
  const parsed = addressSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានអាសយដ្ឋានមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });

  try {
    const customer = await db.customer.findFirst({ where: { id: customerId, storeId: context.storeId }, select: { id: true } });
    if (!customer) return NextResponse.json({ error: "រកមិនឃើញអតិថិជនទេ។" }, { status: 404 });

    const created = await db.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }
      const address = await tx.customerAddress.create({
        data: {
          customerId,
          label: parsed.data.label || null,
          recipient: parsed.data.recipient,
          phone: parsed.data.phone || null,
          address: parsed.data.address,
          province: parsed.data.province || null,
          district: parsed.data.district || null,
          commune: parsed.data.commune || null,
          isDefault: parsed.data.isDefault,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CUSTOMER_ADDRESS_CREATED",
          entity: "CustomerAddress",
          entityId: address.id,
        },
      });
      return address;
    });

    return NextResponse.json({ address: created }, { status: 201 });
  } catch (error) {
    console.error("Create customer address failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតអាសយដ្ឋានបានទេ។" }, { status: 500 });
  }
}
