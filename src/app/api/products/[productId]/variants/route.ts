import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(80).optional().nullable(),
  price: z.number().nonnegative().max(10_000_000).nullable().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងជម្រើសផលិតផលបាន។" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានជម្រើសផលិតផលមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { productId } = await params;
  try {
    const product = await db.product.findFirst({ where: { id: productId, storeId: context.storeId }, select: { id: true } });
    if (!product) return NextResponse.json({ error: "រកមិនឃើញផលិតផលទេ។" }, { status: 404 });
    const variant = await db.$transaction(async (tx) => {
      const created = await tx.productVariant.create({ data: { productId, ...parsed.data, sku: parsed.data.sku || null } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "PRODUCT_VARIANT_CREATED", entity: "Product", entityId: productId } });
      return created;
    });
    return NextResponse.json({ variant }, { status: 201 });
  } catch (error) {
    console.error("Product variant creation failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតជម្រើសផលិតផលបានទេ។ សូមពិនិត្យ SKU។" }, { status: 409 });
  }
}
