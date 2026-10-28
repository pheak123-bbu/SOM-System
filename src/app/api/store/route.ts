import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { MembershipRole } from "@prisma/client";

const updateStoreSchema = z.object({
  name: z.string().trim().min(1, "សូមបញ្ចូលឈ្មោះហាង").max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  address: z.string().trim().max(250).optional().nullable(),
  bakongAccountId: z.string().trim().max(100).optional().nullable(),
  exchangeRate: z.number().min(3000).max(6000).optional().nullable(),
  bankName: z.string().trim().max(100).optional().nullable(),
  bankAccountNumber: z.string().trim().max(50).optional().nullable(),
  bankAccountName: z.string().trim().max(100).optional().nullable(),
});

export async function GET() {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  const store = await db.store.findUnique({
    where: { id: context.storeId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      currency: true,
      timezone: true,
      bakongAccountId: true,
      bankName: true,
      bankAccountNumber: true,
      bankAccountName: true,
      exchangeRate: true,
      logoUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!store) {
    return NextResponse.json({ error: "រកមិនឃើញព័ត៌មានហាងទេ។" }, { status: 404 });
  }

  return NextResponse.json({
    store: {
      ...store,
      exchangeRate: Number(store.exchangeRate ?? 4100),
    },
  });
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  if (context.role !== MembershipRole.OWNER && context.role !== MembershipRole.ADMIN) {
    return NextResponse.json(
      { error: "មានតែម្ចាស់ហាង ឬអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចកែប្រែព័ត៌មានហាងបាន។" },
      { status: 403 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = updateStoreSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ព័ត៌មានកែប្រែមិនត្រឹមត្រូវទេ", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const updated = await db.store.update({
      where: { id: context.storeId },
      data: {
        name: parsed.data.name,
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
        ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}),
        ...(parsed.data.bakongAccountId !== undefined ? { bakongAccountId: parsed.data.bakongAccountId } : {}),
        ...(parsed.data.exchangeRate !== undefined ? { exchangeRate: parsed.data.exchangeRate } : {}),
        ...(parsed.data.bankName !== undefined ? { bankName: parsed.data.bankName } : {}),
        ...(parsed.data.bankAccountNumber !== undefined ? { bankAccountNumber: parsed.data.bankAccountNumber } : {}),
        ...(parsed.data.bankAccountName !== undefined ? { bankAccountName: parsed.data.bankAccountName } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      message: "បានកែប្រែព័ត៌មានហាងដោយជោគជ័យ",
      store: {
        ...updated,
        exchangeRate: Number(updated.exchangeRate ?? 4100),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "មិនអាចកែប្រែព័ត៌មានហាងបានទេ។" },
      { status: 500 }
    );
  }
}
