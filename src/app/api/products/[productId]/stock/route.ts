import { NextResponse } from "next/server";
import { z } from "zod";
import { StockMovementType } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordStockMovementInTx } from "@/lib/inventory";

const stockSchema = z.object({
  delta: z.number().int().optional(),
  setStock: z.number().int().nonnegative().optional(),
  variantId: z.string().optional(),
  reason: z.string().trim().max(200).optional(),
}).refine((data) => data.delta !== undefined || data.setStock !== undefined, {
  message: "ត្រូវបញ្ជាក់ចំនួនកែសម្រួល (delta) ឬចំនួនស្តុកផ្ទាល់ (setStock)។",
});

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { productId } = await params;
  const parsed = stockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានកែសម្រួលស្តុកមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });

  try {
    const product = await db.product.findFirst({
      where: { id: productId, storeId: context.storeId },
      include: { variants: true },
    });
    if (!product) return NextResponse.json({ error: "រកមិនឃើញផលិតផលទេ។" }, { status: 404 });

    const result = await db.$transaction(async (tx) => {
      let previousStock = 0;
      let newStock = 0;
      let quantityDelta = 0;

      if (parsed.data.variantId) {
        const variant = product.variants.find((v) => v.id === parsed.data.variantId);
        if (!variant) throw new Error("រកមិនឃើញជម្រើសផលិតផលទេ។");

        previousStock = variant.stock ?? 0;
        newStock = parsed.data.setStock !== undefined ? parsed.data.setStock : Math.max(0, previousStock + (parsed.data.delta ?? 0));
        quantityDelta = newStock - previousStock;

        await tx.productVariant.update({
          where: { id: variant.id },
          data: { stock: newStock },
        });
      } else {
        previousStock = product.stock ?? 0;
        newStock = parsed.data.setStock !== undefined ? parsed.data.setStock : Math.max(0, previousStock + (parsed.data.delta ?? 0));
        quantityDelta = newStock - previousStock;

        await tx.product.update({
          where: { id: product.id },
          data: { stock: newStock },
        });
      }

      const movementType = quantityDelta > 0 ? StockMovementType.STOCK_IN : StockMovementType.ADJUSTMENT;

      await tx.stockMovement.create({
        data: {
          storeId: context.storeId,
          productId: product.id,
          variantId: parsed.data.variantId || null,
          type: movementType,
          quantity: quantityDelta,
          previousStock,
          newStock,
          reason: parsed.data.reason || "កែសម្រួលស្តុកដោយដៃ (Manual Adjustment)",
          performedBy: context.user?.name || context.user?.email || "Staff",
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: "PRODUCT_STOCK_ADJUSTED",
          entity: "Product",
          entityId: productId,
          metadata: {
            variantId: parsed.data.variantId,
            previousStock,
            newStock,
            quantityDelta,
            reason: parsed.data.reason || "Manual Adjustment",
          },
        },
      });

      return { newStock, previousStock, quantityDelta };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Stock adjustment failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "មិនអាចកែសម្រួលស្តុកបានទេ។" }, { status: 500 });
  }
}
