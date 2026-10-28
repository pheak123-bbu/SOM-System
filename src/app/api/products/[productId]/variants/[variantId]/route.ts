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

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string; variantId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងជម្រើសផលិតផលបាន។" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានជម្រើសផលិតផលមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { productId, variantId } = await params;
  try {
    const updated = await db.$transaction(async (tx) => {
      const result = await tx.productVariant.updateMany({
        where: { id: variantId, productId, product: { storeId: context.storeId } },
        data: { ...parsed.data, sku: parsed.data.sku || null },
      });
      if (result.count !== 1) return null;
      const variant = await tx.productVariant.findFirst({ where: { id: variantId, productId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "PRODUCT_VARIANT_UPDATED", entity: "Product", entityId: productId } });
      return variant;
    });
    if (!updated) return NextResponse.json({ error: "រកមិនឃើញជម្រើសផលិតផលទេ។" }, { status: 404 });
    return NextResponse.json({ variant: updated });
  } catch (error) {
    console.error("Product variant update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែជម្រើសផលិតផលបានទេ។ សូមពិនិត្យ SKU។" }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ productId: string; variantId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងជម្រើសផលិតផលបាន។" }, { status: 403 });
  const { productId, variantId } = await params;
  try {
    const variant = await db.productVariant.findFirst({
      where: { id: variantId, productId, product: { storeId: context.storeId } },
      select: { id: true, _count: { select: { orderItems: true } } },
    });
    if (!variant) return NextResponse.json({ error: "រកមិនឃើញជម្រើសផលិតផលទេ។" }, { status: 404 });
    if (variant._count.orderItems) return NextResponse.json({ error: "មិនអាចលុបជម្រើសដែលមានក្នុងការបញ្ជាទិញបានទេ។ សូមបិទជម្រើសជំនួស។" }, { status: 409 });
    await db.$transaction(async (tx) => {
      await tx.productVariant.delete({ where: { id: variantId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "PRODUCT_VARIANT_DELETED", entity: "Product", entityId: productId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Product variant deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបជម្រើសផលិតផលបានទេ។" }, { status: 500 });
  }
}
