import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const categorySchema = z.object({
  name: z.string().trim().min(1, "សូមបញ្ចូលឈ្មោះប្រភេទ").max(80, "ឈ្មោះប្រភេទមិនអាចលើសពី 80 តួអក្សរឡើយ"),
  description: z.string().max(500, "ការពិពណ៌នាមិនអាចលើសពី 500 តួអក្សរឡើយ").optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "កូដពណ៌មិនត្រឹមត្រូវ").optional().nullable(),
  icon: z.string().max(50).optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";

  try {
    const categories = await db.category.findMany({
      where: {
        storeId: context.storeId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description ?? "",
        color: cat.color ?? "#3164ce",
        icon: cat.icon ?? null,
        active: cat.active,
        productCount: cat._count.products,
        createdAt: cat.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Categories fetch failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកប្រភេទផលិតផលបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role === "STAFF") {
    return NextResponse.json({ error: "មានតែម្ចាស់ហាង និងអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងប្រភេទផលិតផលបាន។" }, { status: 403 });
  }

  const parsed = categorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "ព័ត៌មានប្រភេទផលិតផលមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.category.findUnique({
      where: {
        storeId_name: {
          storeId: context.storeId,
          name: parsed.data.name,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: `ប្រភេទផលិតផល «${parsed.data.name}» មានរួចហើយ។` }, { status: 409 });
    }

    const category = await db.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          storeId: context.storeId,
          name: parsed.data.name,
          description: parsed.data.description || null,
          color: parsed.data.color || "#3164ce",
          icon: parsed.data.icon || null,
          active: parsed.data.active ?? true,
        },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "CATEGORY_CREATED",
          entity: "Category",
          entityId: created.id,
          metadata: { name: created.name },
        },
      });

      return created;
    });

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        description: category.description ?? "",
        color: category.color ?? "#3164ce",
        icon: category.icon ?? null,
        active: category.active,
        productCount: category._count.products,
        createdAt: category.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error("Category creation failed:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើតប្រភេទផលិតផលបានទេ។" }, { status: 500 });
  }
}
