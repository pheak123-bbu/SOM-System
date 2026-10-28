import { NextResponse } from "next/server";
import { z } from "zod";
import { StockMovementType } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordStockMovement } from "@/lib/inventory";

const newMovementSchema = z.object({
  productId: z.string().min(1, "សូមជ្រើសរើសផលិតផល"),
  variantId: z.string().optional().nullable(),
  type: z.nativeEnum(StockMovementType),
  quantity: z.number().int(),
  reason: z.string().max(255).optional().nullable(),
  referenceId: z.string().max(100).optional().nullable(),
});

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() || "";
  const type = searchParams.get("type") as StockMovementType | null;
  const productId = searchParams.get("productId") || undefined;
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get("pageSize") || "10", 10)));

  const whereClause: any = {
    storeId: context.storeId,
  };

  if (type && Object.values(StockMovementType).includes(type)) {
    whereClause.type = type;
  }

  if (productId) {
    whereClause.productId = productId;
  }

  if (search) {
    whereClause.OR = [
      { product: { name: { contains: search, mode: "insensitive" } } },
      { product: { sku: { contains: search, mode: "insensitive" } } },
      { reason: { contains: search, mode: "insensitive" } },
      { referenceId: { contains: search, mode: "insensitive" } },
      { performedBy: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [total, movements] = await Promise.all([
      db.stockMovement.count({ where: whereClause }),
      db.stockMovement.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: {
            select: { id: true, name: true, sku: true, price: true },
          },
          variant: {
            select: { id: true, name: true, sku: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      movements: movements.map((m) => ({
        id: m.id,
        productId: m.productId,
        productName: m.product.name,
        productSku: m.product.sku,
        variantId: m.variantId,
        variantName: m.variant?.name || null,
        type: m.type,
        quantity: m.quantity,
        previousStock: m.previousStock,
        newStock: m.newStock,
        reason: m.reason,
        referenceId: m.referenceId,
        performedBy: m.performedBy,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    console.error("Fetch stock movements failed:", error);
    return NextResponse.json(
      { error: "មិនអាចផ្ទុកប្រវត្តិស្តុកបានទេ។" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = newMovementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "ព័ត៌មានមិនត្រឹមត្រូវ", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId, variantId, type, quantity, reason, referenceId } = parsed.data;

  // Quantity cannot be 0
  if (quantity === 0) {
    return NextResponse.json(
      { error: "ចំនួនកែសម្រួលត្រូវតែខុសពីសូន្យ (0)។" },
      { status: 400 }
    );
  }

  try {
    const product = await db.product.findFirst({
      where: { id: productId, storeId: context.storeId },
      include: { variants: true },
    });

    if (!product) {
      return NextResponse.json({ error: "រកមិនឃើញផលិតផលទេ។" }, { status: 404 });
    }

    if (variantId && !product.variants.some((v) => v.id === variantId)) {
      return NextResponse.json({ error: "រកមិនឃើញជម្រើសផលិតផលទេ។" }, { status: 404 });
    }

    const result = await recordStockMovement({
      storeId: context.storeId,
      productId,
      variantId: variantId || null,
      type,
      quantity,
      reason: reason || (quantity > 0 ? "នាំចូលស្តុក (Restock)" : "កាត់ស្តុកដោយដៃ"),
      referenceId: referenceId || null,
      performedBy: context.user?.name || context.user?.email || "Staff",
    });

    return NextResponse.json({
      success: true,
      movement: result.movement,
      previousStock: result.previousStock,
      newStock: result.newStock,
    });
  } catch (error) {
    console.error("Record stock movement failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "មិនអាចកត់ត្រាស្តុកបានទេ។" },
      { status: 500 }
    );
  }
}
