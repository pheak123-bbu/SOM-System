import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  price: z.number().nonnegative().max(10_000_000),
  stock: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean().optional(),
  imageUrl: z.string().max(2_000_000).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងផលិតផលបាន។" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានផលិតផលមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { productId } = await params;
  try {
    let finalCategoryId = parsed.data.categoryId !== undefined ? parsed.data.categoryId : undefined;
    let finalCategoryName = parsed.data.category !== undefined ? parsed.data.category : undefined;

    if (finalCategoryId !== undefined && finalCategoryId) {
      const cat = await db.category.findFirst({ where: { id: finalCategoryId, storeId: context.storeId } });
      if (cat) finalCategoryName = cat.name;
    } else if (finalCategoryName !== undefined && finalCategoryName) {
      const cat = await db.category.findFirst({ where: { name: finalCategoryName, storeId: context.storeId } });
      if (cat) finalCategoryId = cat.id;
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: any = {
        name: parsed.data.name,
        price: parsed.data.price,
        sku: parsed.data.sku || null,
        description: parsed.data.description || null,
      };
      if (parsed.data.stock !== undefined) updateData.stock = parsed.data.stock;
      if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
      if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl;
      if (finalCategoryName !== undefined) updateData.category = finalCategoryName;
      if (finalCategoryId !== undefined) updateData.categoryId = finalCategoryId;

      const updated = await tx.product.updateMany({
        where: { id: productId, storeId: context.storeId },
        data: updateData,
      });
      if (updated.count !== 1) return null;
      const product = await tx.product.findFirst({ where: { id: productId, storeId: context.storeId }, include: { variants: true } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "PRODUCT_UPDATED", entity: "Product", entityId: productId } });
      return product;
    });
    if (!result) return NextResponse.json({ error: "រកមិនឃើញផលិតផលទេ។" }, { status: 404 });
    return NextResponse.json({
      product: {
        id: result.id,
        name: result.name,
        sku: result.sku ?? "",
        category: result.category ?? "មិនទាន់ចាត់ថ្នាក់",
        categoryId: result.categoryId ?? null,
        price: Number(result.price),
        stock: result.stock,
        active: result.active,
        description: result.description ?? "",
        imageUrl: result.imageUrl ?? null,
        variants: result.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price ? Number(variant.price) : null,
          stock: variant.stock,
          active: variant.active,
        })),
      },
    });
  } catch (error) {
    console.error("Product update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែផលិតផលបានទេ។ សូមពិនិត្យ SKU។" }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ productId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងផលិតផលបាន។" }, { status: 403 });
  const { productId } = await params;
  try {
    const product = await db.product.findFirst({
      where: { id: productId, storeId: context.storeId },
      select: { id: true, _count: { select: { orderItems: true, variants: true } } },
    });
    if (!product) return NextResponse.json({ error: "រកមិនឃើញផលិតផលទេ។" }, { status: 404 });
    if (product._count.orderItems || product._count.variants) {
      return NextResponse.json({ error: "មិនអាចលុបផលិតផលដែលមានមុខទំនិញក្នុងការបញ្ជាទិញ ឬជម្រើសភ្ជាប់បានទេ។ សូមដកតំណភ្ជាប់ទាំងនោះ ឬបិទផលិតផលជំនួស។" }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      await tx.product.deleteMany({ where: { id: productId, storeId: context.storeId } });
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "PRODUCT_DELETED", entity: "Product", entityId: productId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Product deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបផលិតផលបានទេ។" }, { status: 500 });
  }
}
