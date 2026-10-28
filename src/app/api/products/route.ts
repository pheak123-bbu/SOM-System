import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(80).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().trim().max(80).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  price: z.number().nonnegative().max(10_000_000),
  stock: z.number().int().nonnegative().nullable().optional(),
  imageUrl: z.string().max(2_000_000).optional().nullable(),
});

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  try {
    const products = await db.product.findMany({
      where: {
        storeId: context.storeId,
        ...(search ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { category: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      include: { variants: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: 100,
    });
    return NextResponse.json({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku ?? "",
        category: product.category ?? "មិនទាន់ចាត់ថ្នាក់",
        categoryId: product.categoryId ?? null,
        price: Number(product.price),
        stock: product.stock,
        active: product.active,
        description: product.description ?? "",
        imageUrl: product.imageUrl ?? null,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price ? Number(variant.price) : null,
          stock: variant.stock,
          active: variant.active,
        })),
      })),
    });
  } catch (error) {
    console.error("Product list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកផលិតផលបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងផលិតផលបាន។" }, { status: 403 });
  const parsed = productSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានផលិតផលមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  try {
    let finalCategoryId = parsed.data.categoryId || null;
    let finalCategoryName = parsed.data.category || null;

    if (finalCategoryId) {
      const cat = await db.category.findFirst({ where: { id: finalCategoryId, storeId: context.storeId } });
      if (cat) finalCategoryName = cat.name;
    } else if (finalCategoryName) {
      const cat = await db.category.findFirst({ where: { name: finalCategoryName, storeId: context.storeId } });
      if (cat) {
        finalCategoryId = cat.id;
      }
    }

    const product = await db.product.create({
      data: {
        storeId: context.storeId,
        name: parsed.data.name,
        price: parsed.data.price,
        stock: parsed.data.stock ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        sku: parsed.data.sku || null,
        description: parsed.data.description || null,
        category: finalCategoryName,
        categoryId: finalCategoryId,
      },
      include: { variants: true },
    });
    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku ?? "",
        category: product.category ?? "មិនទាន់ចាត់ថ្នាក់",
        categoryId: product.categoryId ?? null,
        price: Number(product.price),
        stock: product.stock,
        active: product.active,
        description: product.description ?? "",
        imageUrl: product.imageUrl ?? null,
        variants: product.variants.map((variant) => ({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: variant.price ? Number(variant.price) : null,
          stock: variant.stock,
          active: variant.active,
        })),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Product creation failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតផលិតផលបានទេ។ សូមពិនិត្យមើលថាលេខកូដ SKU ត្រូវបានប្រើរួចឬនៅ។" }, { status: 409 });
  }
}
