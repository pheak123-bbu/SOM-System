import { StockMovementType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export interface RecordMovementInput {
  storeId: string;
  productId: string;
  variantId?: string | null;
  type: StockMovementType;
  quantity: number; // positive for IN, negative for OUT
  reason?: string | null;
  referenceId?: string | null;
  performedBy?: string | null;
}

/**
 * Records a stock movement and updates the product/variant stock in a single transaction.
 */
export async function recordStockMovementInTx(
  tx: Prisma.TransactionClient,
  input: RecordMovementInput
) {
  let previousStock: number | null = null;
  let newStock: number | null = null;

  if (input.variantId) {
    const variant = await tx.productVariant.findUnique({
      where: { id: input.variantId },
      select: { id: true, stock: true },
    });
    if (variant && variant.stock !== null) {
      previousStock = variant.stock;
      newStock = Math.max(0, variant.stock + input.quantity);
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: newStock },
      });
    }
  } else if (input.productId) {
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, stock: true },
    });
    if (product && product.stock !== null) {
      previousStock = product.stock;
      newStock = Math.max(0, product.stock + input.quantity);
      await tx.product.update({
        where: { id: product.id },
        data: { stock: newStock },
      });
    }
  }

  const movement = await tx.stockMovement.create({
    data: {
      storeId: input.storeId,
      productId: input.productId,
      variantId: input.variantId || null,
      type: input.type,
      quantity: input.quantity,
      previousStock,
      newStock,
      reason: input.reason || null,
      referenceId: input.referenceId || null,
      performedBy: input.performedBy || null,
    },
  });

  return { previousStock, newStock, movement };
}

/**
 * Convenience wrapper for calling recordStockMovement outside an existing transaction.
 */
export async function recordStockMovement(input: RecordMovementInput) {
  return db.$transaction(async (tx) => {
    return recordStockMovementInTx(tx, input);
  });
}
