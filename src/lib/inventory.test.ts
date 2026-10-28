import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

import { recordStockMovementInTx } from "@/lib/inventory";
import { StockMovementType } from "@prisma/client";

describe("Inventory Stock Movement Service", () => {
  it("records stock in and increments product stock", async () => {
    const mockTx: any = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", stock: 10 }),
        update: vi.fn().mockResolvedValue({ id: "prod-1", stock: 15 }),
      },
      productVariant: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      stockMovement: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "sm-1", ...data })),
      },
    };

    const result = await recordStockMovementInTx(mockTx, {
      storeId: "store-1",
      productId: "prod-1",
      type: StockMovementType.STOCK_IN,
      quantity: 5,
      reason: "នាំចូលស្តុកបន្ថែម",
      referenceId: "PO-001",
      performedBy: "Dara",
    });

    expect(result.previousStock).toBe(10);
    expect(result.newStock).toBe(15);
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { stock: 15 },
    });
    expect(mockTx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "STOCK_IN",
          quantity: 5,
          previousStock: 10,
          newStock: 15,
          referenceId: "PO-001",
        }),
      })
    );
  });

  it("records stock deduction for orders and prevents negative stock", async () => {
    const mockTx: any = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", stock: 2 }),
        update: vi.fn().mockResolvedValue({ id: "prod-1", stock: 0 }),
      },
      productVariant: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      stockMovement: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "sm-2", ...data })),
      },
    };

    const result = await recordStockMovementInTx(mockTx, {
      storeId: "store-1",
      productId: "prod-1",
      type: StockMovementType.SALE_ORDER,
      quantity: -5, // exceeds current stock
      reason: "លក់តាម Order",
      referenceId: "ORD-99",
      performedBy: "System",
    });

    expect(result.previousStock).toBe(2);
    expect(result.newStock).toBe(0); // Math.max(0, 2 - 5)
    expect(mockTx.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { stock: 0 },
    });
  });

  it("records variant stock movement independently", async () => {
    const mockTx: any = {
      product: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({ id: "var-1", stock: 20 }),
        update: vi.fn().mockResolvedValue({ id: "var-1", stock: 18 }),
      },
      stockMovement: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "sm-3", ...data })),
      },
    };

    const result = await recordStockMovementInTx(mockTx, {
      storeId: "store-1",
      productId: "prod-1",
      variantId: "var-1",
      type: StockMovementType.SALE_POS,
      quantity: -2,
      reason: "លក់ផ្ទាល់ POS",
      referenceId: "POS-100",
      performedBy: "Cashier",
    });

    expect(result.previousStock).toBe(20);
    expect(result.newStock).toBe(18);
    expect(mockTx.productVariant.update).toHaveBeenCalledWith({
      where: { id: "var-1" },
      data: { stock: 18 },
    });
  });
});
