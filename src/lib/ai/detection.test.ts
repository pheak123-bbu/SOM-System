import { describe, expect, it, vi, beforeEach } from "vitest";
import { processDetectionJob } from "@/lib/ai/detection";
import { db } from "@/lib/db";
import { SuggestionStatus, IntentClassification, OrderStatus } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    detectionJob: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    orderSuggestion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    suggestionEvidence: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/ai/provider", () => ({
  detectionOutputSchema: {
    safeParse: vi.fn((data) => ({ success: true, data })),
  },
  getDetectionProvider: vi.fn(),
}));

describe("AI Detection Deduplication & Consolidation", () => {
  const storeId = "store-1";
  const conversationId = "conv-1";
  const customerId = "cust-1";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes without creating an OrderSuggestion when customer is only asking questions (PRODUCT_INTEREST)", async () => {
    const { getDetectionProvider } = await import("@/lib/ai/provider");
    vi.mocked(getDetectionProvider).mockReturnValue({
      name: "cambodia-social-ai",
      model: "som-pattern-v1",
      analyze: vi.fn().mockResolvedValue({
        intent: IntentClassification.PRODUCT_INTEREST,
        confidence: 75,
        items: [{ productName: "អាវយឺតកប្បាស", variantName: null, quantity: 1 }],
        missingInformation: [],
        evidenceMessageIds: ["msg-1"],
        explanation: "អតិថិជនបានសាកសួរព័ត៌មាន (មិនទាន់បញ្ជាក់ទិញទេ)",
        requiresSellerReview: true,
        relatedOrderReference: null,
      }),
    });

    vi.mocked(db.detectionJob.findUnique).mockResolvedValue({
      id: "job-1",
      storeId,
      conversationId,
      status: "QUEUED",
      attempts: 0,
    } as any);

    vi.mocked(db.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      storeId,
      customerId,
      messages: [{ id: "msg-1", body: "អាវយឺតកប្បាស តម្លៃប៉ុន្មាន?", sentAt: new Date() }],
      customer: { id: customerId, name: "Sokha" },
    } as any);

    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: "prod-1", name: "អាវយឺតកប្បាស", active: true, variants: [] },
    ] as any);

    vi.mocked(db.order.findMany).mockResolvedValue([]);
    vi.mocked(db.detectionJob.update).mockResolvedValue({} as any);

    const outcome = await processDetectionJob("job-1");

    expect(outcome.suggestionId).toBeNull();
    expect(outcome.intent).toBe(IntentClassification.PRODUCT_INTEREST);
    expect(db.orderSuggestion.create).not.toHaveBeenCalled();
  });

  it("consolidates multi-part messages into the existing PENDING suggestion instead of creating duplicates", async () => {
    const { getDetectionProvider } = await import("@/lib/ai/provider");
    vi.mocked(getDetectionProvider).mockReturnValue({
      name: "cambodia-social-ai",
      model: "som-pattern-v1",
      analyze: vi.fn().mockResolvedValue({
        intent: IntentClassification.PURCHASE_CONFIRMED,
        confidence: 95,
        items: [{ productName: "អាវយឺតកប្បាស", variantName: "M", quantity: 1 }],
        missingInformation: [],
        evidenceMessageIds: ["msg-1", "msg-2"],
        explanation: "អតិថិជនបានបញ្ជាក់ការកម្មង់ទិញ",
        requiresSellerReview: true,
        relatedOrderReference: null,
      }),
    });

    vi.mocked(db.detectionJob.findUnique).mockResolvedValue({
      id: "job-2",
      storeId,
      conversationId,
      status: "QUEUED",
      attempts: 0,
    } as any);

    vi.mocked(db.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      storeId,
      customerId,
      messages: [
        { id: "msg-1", body: "ខ្ញុំកម្មង់ អាវយឺតកប្បាស ១", sentAt: new Date() },
        { id: "msg-2", body: "Size M លេខ 012 345 678", sentAt: new Date() },
      ],
      customer: { id: customerId, name: "Sokha" },
    } as any);

    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: "prod-1", name: "អាវយឺតកប្បាស", active: true, variants: [{ id: "var-1", name: "M", active: true }] },
    ] as any);

    vi.mocked(db.order.findMany).mockResolvedValue([]);
    vi.mocked(db.order.findFirst).mockResolvedValue(null);

    // Existing pending suggestion found in this conversation!
    const existingPending = {
      id: "sug-existing-1",
      storeId,
      conversationId,
      status: SuggestionStatus.PENDING,
      intent: IntentClassification.ORDER_DETAILS_MISSING,
      confidence: 85,
      extracted: { items: [{ productName: "អាវយឺតកប្បាស", variantName: null, quantity: 1 }] },
      evidence: [{ messageId: "msg-1" }],
    };
    vi.mocked(db.orderSuggestion.findMany).mockResolvedValue([existingPending as any]);

    // Mock transaction
    vi.mocked(db.$transaction).mockImplementation(async (callback: any) => {
      const tx = {
        suggestionEvidence: { createMany: vi.fn() },
        orderSuggestion: {
          update: vi.fn().mockResolvedValue({
            ...existingPending,
            intent: IntentClassification.PURCHASE_CONFIRMED,
            confidence: 95,
          }),
        },
        detectionJob: { update: vi.fn() },
      };
      return callback(tx);
    });

    const outcome = await processDetectionJob("job-2");

    expect(outcome.suggestionId).toBe("sug-existing-1");
    expect(outcome.intent).toBe(IntentClassification.PURCHASE_CONFIRMED);
    expect(outcome.consolidated).toBe(true);
    // Did NOT create a second suggestion record!
    expect(db.orderSuggestion.create).not.toHaveBeenCalled();
  });

  it("prevents creating duplicate order suggestion if customer already has an active order in progress", async () => {
    const { getDetectionProvider } = await import("@/lib/ai/provider");
    vi.mocked(getDetectionProvider).mockReturnValue({
      name: "cambodia-social-ai",
      model: "som-pattern-v1",
      analyze: vi.fn().mockResolvedValue({
        intent: IntentClassification.PURCHASE_CONFIRMED,
        confidence: 95,
        items: [{ productName: "អាវយឺតកប្បាស", variantName: "M", quantity: 1 }],
        missingInformation: [],
        evidenceMessageIds: ["msg-3"],
        explanation: "អតិថិជនសួរនាំ",
        requiresSellerReview: true,
        relatedOrderReference: null,
      }),
    });

    vi.mocked(db.detectionJob.findUnique).mockResolvedValue({
      id: "job-3",
      storeId,
      conversationId,
      status: "QUEUED",
      attempts: 0,
    } as any);

    vi.mocked(db.conversation.findFirst).mockResolvedValue({
      id: conversationId,
      storeId,
      customerId,
      messages: [
        { id: "msg-3", body: "បងបានផ្ញើទំនិញមកនៅ? នេះលេខ 012 345 678", sentAt: new Date() },
      ],
      customer: { id: customerId, name: "Sokha" },
    } as any);

    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: "prod-1", name: "អាវយឺតកប្បាស", active: true, variants: [{ id: "var-1", name: "M", active: true }] },
    ] as any);

    vi.mocked(db.order.findMany).mockResolvedValue([]);

    // Customer already has an active order in progress
    vi.mocked(db.order.findFirst).mockResolvedValue({
      id: "order-active-1",
      orderNumber: "SOM-2026-0099",
      status: OrderStatus.CONFIRMED,
      createdAt: new Date(),
    } as any);

    const outcome = await processDetectionJob("job-3");

    expect(outcome.suggestionId).toBeNull();
    expect(outcome.relatedOrderReference).toBe("SOM-2026-0099");
    // Protected against duplicate order creation
    expect(db.orderSuggestion.create).not.toHaveBeenCalled();
  });
});
