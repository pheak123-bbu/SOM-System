import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/inventory", () => ({
  recordStockMovementInTx: vi.fn().mockResolvedValue({
    previousStock: 10,
    newStock: 8,
    movement: { id: "sm-1" },
  }),
}));

import { normalizeKhmerDigits, parseCfComment, processLiveCfComment } from "./engine";

describe("Live CF Engine - Comment Parser", () => {
  it("normalizes Khmer digits to standard digits", () => {
    expect(normalizeKhmerDigits("០១២៣៤៥៦៧៨៩")).toBe("0123456789");
    expect(normalizeKhmerDigits("R៤៤៥")).toBe("R445");
  });

  it("parses simple code and quantity", () => {
    const result1 = parseCfComment("R445 1");
    expect(result1.cfCode).toBe("R445");
    expect(result1.quantity).toBe(1);

    const result2 = parseCfComment("A65 2");
    expect(result2.cfCode).toBe("A65");
    expect(result2.quantity).toBe(2);

    const result3 = parseCfComment("123");
    expect(result3.cfCode).toBe("123");
    expect(result3.quantity).toBe(1);
  });

  it("handles CF and Code prefixes", () => {
    const result1 = parseCfComment("CF R445");
    expect(result1.cfCode).toBe("R445");
    expect(result1.quantity).toBe(1);

    const result2 = parseCfComment("cf: 123 2");
    expect(result2.cfCode).toBe("123");
    expect(result2.quantity).toBe(2);

    const result3 = parseCfComment("Code R445 x3");
    expect(result3.cfCode).toBe("R445");
    expect(result3.quantity).toBe(3);
  });

  it("handles Khmer prefixes and word quantities", () => {
    const result1 = parseCfComment("យក R445 មួយ");
    expect(result1.cfCode).toBe("R445");
    expect(result1.quantity).toBe(1);

    const result2 = parseCfComment("ទិញ A65 ពីរ");
    expect(result2.cfCode).toBe("A65");
    expect(result2.quantity).toBe(2);

    const result3 = parseCfComment("កូដ 123 ចំនួន 3");
    expect(result3.cfCode).toBe("123");
    expect(result3.quantity).toBe(3);
  });

  it("extracts phone numbers and extra address notes", () => {
    const result = parseCfComment("R445 1 012345678 ភ្នំពេញ");
    expect(result.cfCode).toBe("R445");
    expect(result.quantity).toBe(1);
    expect(result.phone).toBe("012345678");
    expect(result.note).toBe("ភ្នំពេញ");
  });

  it("handles code with attached quantity like R445x2", () => {
    const result = parseCfComment("R445x2");
    expect(result.cfCode).toBe("R445");
    expect(result.quantity).toBe(2);
  });

  it("returns null cfCode when no valid code is found", () => {
    const result = parseCfComment("សួស្តីបង តម្លៃប៉ុន្មានដែរ?");
    expect(result.cfCode).toBeNull();
  });
});

describe("Live CF Engine - Transaction Processor", () => {
  it("processes CF comment and successfully deducts stock and creates order", async () => {
    const mockTx: any = {
      liveSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "sess-1", title: "Live Show", status: "ACTIVE" }),
      },
      liveSessionProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lp-1",
          cfCode: "R445",
          customTitle: "Care Lotion",
          customPrice: "1.90",
          remainingStock: 10,
          productId: "prod-1",
          variantId: null,
          product: { id: "prod-1", name: "Care Lotion", sku: "R445", imageUrl: "/lotion.jpg" },
        }),
        update: vi.fn().mockResolvedValue({ id: "lp-1", remainingStock: 8 }),
      },
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: "cust-1", name: "Sokha", phone: null }),
        update: vi.fn(),
        create: vi.fn(),
      },
      order: {
        create: vi.fn().mockResolvedValue({ id: "ord-1", orderNumber: "CF-2026-1001" }),
      },
    };

    const res = await processLiveCfComment(
      {
        storeId: "store-1",
        sessionId: "sess-1",
        customerName: "Sokha",
        commentText: "R445 2",
      },
      mockTx
    );

    expect(res.success).toBe(true);
    expect(res.code).toBe("R445");
    expect(res.quantity).toBe(2);
    expect(res.total).toBe(3.8);
    expect(res.remainingStock).toBe(8);
    expect(mockTx.liveSessionProduct.update).toHaveBeenCalledWith({
      where: { id: "lp-1" },
      data: { remainingStock: 8 },
    });
    expect(mockTx.order.create).toHaveBeenCalled();
  });

  it("fails gracefully when stock is insufficient", async () => {
    const mockTx: any = {
      liveSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "sess-1", title: "Live Show", status: "ACTIVE" }),
      },
      liveSessionProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lp-1",
          cfCode: "R445",
          customTitle: "Care Lotion",
          customPrice: "1.90",
          remainingStock: 1, // Only 1 in stock!
          productId: "prod-1",
          product: { id: "prod-1", name: "Care Lotion" },
        }),
      },
    };

    const res = await processLiveCfComment(
      {
        storeId: "store-1",
        sessionId: "sess-1",
        customerName: "Sokha",
        commentText: "R445 2",
      },
      mockTx
    );

    expect(res.success).toBe(false);
    expect(res.reason).toBe("OUT_OF_STOCK");
    expect(res.remainingStock).toBe(1);
    expect(res.message).toContain("បានអស់ពីស្តុកហើយ");
  });

  it("creates conversation and auto-confirmation message for Messenger", async () => {
    const mockTx: any = {
      liveSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "sess-1", title: "Live Show", status: "ACTIVE" }),
      },
      liveSessionProduct: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lp-1",
          cfCode: "R445",
          customTitle: "Care Lotion",
          customPrice: "1.90",
          remainingStock: 10,
          productId: "prod-1",
          variantId: null,
          product: { id: "prod-1", name: "Care Lotion", sku: "R445", imageUrl: "/lotion.jpg" },
        }),
        update: vi.fn().mockResolvedValue({ id: "lp-1", remainingStock: 9 }),
      },
      customer: {
        findFirst: vi.fn().mockResolvedValue({ id: "cust-1", name: "Sokha", phone: null }),
        update: vi.fn(),
        create: vi.fn(),
      },
      order: {
        create: vi.fn().mockResolvedValue({ id: "ord-1", orderNumber: "CF-2026-9999" }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "conv-1", customerId: "cust-1", channel: "FACEBOOK" }),
        update: vi.fn(),
      },
      message: {
        create: vi.fn().mockImplementation((args: any) =>
          Promise.resolve({ id: `msg-${Math.random()}`, ...args.data })
        ),
      },
    };

    const res = await processLiveCfComment(
      {
        storeId: "store-1",
        sessionId: "sess-1",
        customerName: "Sokha",
        commentText: "R445 1",
      },
      mockTx
    );

    expect(res.success).toBe(true);
    expect(res.conversationId).toBe("conv-1");
    expect(res.messengerSent).toBe(true);
    expect(res.messengerConfirmation).toContain("ការកក់ទំនិញ «Care Lotion» (កូដ: R445)");
    expect(res.messengerConfirmation).toContain("CF-2026-9999");
    expect(mockTx.conversation.create).toHaveBeenCalled();
    // 2 messages: 1 from customer, 1 from bot
    expect(mockTx.message.create).toHaveBeenCalledTimes(2);
  });
});
