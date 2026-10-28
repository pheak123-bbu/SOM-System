import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const updateSchema = z.object({
  name: z.string().trim().min(1, "សូមបញ្ចូលឈ្មោះប្រភេទ").max(80, "ឈ្មោះប្រភេទមិនអាចលើសពី 80 តួអក្សរឡើយ").optional(),
  description: z.string().max(500, "ការពិពណ៌នាមិនអាចលើសពី 500 តួអក្សរឡើយ").optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "កូដពណ៌មិនត្រឹមត្រូវ").optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });

  const { categoryId } = await params;

  try {
    const category = await db.category.findFirst({
      where: { id: categoryId, storeId: context.storeId },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            sku: true,
            price: true,
            stock: true,
            active: true,
            imageUrl: true,
          },
        },
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json({ error: "រកមិនឃើញប្រភេទផលិតផលទេ។" }, { status: 404 });
    }

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        description: category.description ?? "",
        color: category.color ?? "#3164ce",
        icon: category.icon ?? null,
        active: category.active,
        productCount: category._count.products,
        products: category.products.map((p) => ({
          ...p,
          price: Number(p.price),
        })),
        createdAt: category.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Category get error:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកព័ត៌មានប្រភេទផលិតផលបានទេ។" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") {
    return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងប្រភេទផលិតផលបាន។" }, { status: 403 });
  }

  const { categoryId } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ព័ត៌មានមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.category.findFirst({
      where: { id: categoryId, storeId: context.storeId },
    });

    if (!existing) {
      return NextResponse.json({ error: "រកមិនឃើញប្រភេទផលិតផលទេ។" }, { status: 404 });
    }

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const conflict = await db.category.findUnique({
        where: {
          storeId_name: {
            storeId: context.storeId,
            name: parsed.data.name,
          },
        },
      });
      if (conflict && conflict.id !== categoryId) {
        return NextResponse.json({ error: `ប្រភេទផលិតផល «${parsed.data.name}» មានរួចហើយ។` }, { status: 409 });
      }
    }

    const updated = await db.$transaction(async (tx) => {
      const cat = await tx.category.update({
        where: { id: categoryId },
        data: {
          ...(parsed.data.name ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description || null } : {}),
          ...(parsed.data.color !== undefined ? { color: parsed.data.color || "#3164ce" } : {}),
          ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon || null } : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      // If category name was updated, also update product.category string to keep in sync
      if (parsed.data.name && parsed.data.name !== existing.name) {
        await tx.product.updateMany({
          where: { storeId: context.storeId, categoryId: categoryId },
          data: { category: parsed.data.name },
        });
      }

      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CATEGORY_UPDATED",
          entity: "Category",
          entityId: categoryId,
          metadata: { previous: existing.name, current: cat.name },
        },
      });

      return cat;
    });

    return NextResponse.json({
      category: {
        id: updated.id,
        name: updated.name,
        description: updated.description ?? "",
        color: updated.color ?? "#3164ce",
        icon: updated.icon ?? null,
        active: updated.active,
        productCount: updated._count.products,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Category update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែប្រភេទផលិតផលបានទេ។" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") {
    return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចលុបប្រភេទផលិតផលបាន។" }, { status: 403 });
  }

  const { categoryId } = await params;

  try {
    const existing = await db.category.findFirst({
      where: { id: categoryId, storeId: context.storeId },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "រកមិនឃើញប្រភេទផលិតផលទេ។" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      // Unlink products from this category
      await tx.product.updateMany({
        where: { storeId: context.storeId, categoryId: categoryId },
        data: { categoryId: null, category: null },
      });

      await tx.category.delete({
        where: { id: categoryId },
      });

      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CATEGORY_DELETED",
          entity: "Category",
          entityId: categoryId,
          metadata: { name: existing.name, unlinkedProducts: existing._count.products },
        },
      });
    });

    return NextResponse.json({ success: true, deletedName: existing.name });
  } catch (error) {
    console.error("Category delete failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបប្រភេទផលិតផលបានទេ។" }, { status: 500 });
  }
}
