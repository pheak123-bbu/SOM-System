import { describe, expect, it } from "vitest";
import { detectionOutputSchema, CambodiaSocialPatternProvider } from "@/lib/ai/provider";

describe("structured order detection output", () => {
  it("accepts conservative purchase intent with explicit seller review", () => {
    expect(detectionOutputSchema.safeParse({
      intent: "PURCHASE_INTENT",
      confidence: 81,
      items: [{ productName: "Floral Khmer Skirt", variantName: "Medium", quantity: 1 }],
      missingInformation: ["Delivery address"],
      evidenceMessageIds: ["msg-1"],
      explanation: "The customer wants to purchase but the delivery address is unknown.",
      requiresSellerReview: true,
      relatedOrderReference: null,
    }).success).toBe(true);
  });

  it("rejects unsupported evidence, out-of-range confidence, and model auto-approval", () => {
    const base = {
      intent: "PURCHASE_CONFIRMED",
      confidence: 100,
      items: [],
      missingInformation: [],
      evidenceMessageIds: [],
      explanation: "Customer clearly agreed.",
      requiresSellerReview: true,
      relatedOrderReference: null,
    };
    expect(detectionOutputSchema.safeParse({ ...base, confidence: 101 }).success).toBe(false);
    expect(detectionOutputSchema.safeParse({ ...base, requiresSellerReview: false }).success).toBe(false);
  });
});

describe("CambodiaSocialPatternProvider intent classification & deduplication", () => {
  const provider = new CambodiaSocialPatternProvider();
  const catalogue = [
    {
      name: "អាវយឺតកប្បាស",
      sku: "TS-01",
      variants: [{ name: "S" }, { name: "M" }, { name: "L" }],
    },
    {
      name: "សំពត់ខ្មែរ",
      sku: "SK-01",
      variants: [],
    },
  ];

  it("classifies pure product questions and price inquiries as PRODUCT_INTEREST (not an order)", async () => {
    const prompt = JSON.stringify({
      messages: [
        { id: "m1", senderType: "CUSTOMER", body: "អាវយឺតកប្បាស តម្លៃប៉ុន្មានបង? នៅសល់អត់?" },
      ],
      catalogue,
    });

    const result: any = await provider.analyze(prompt);
    expect(result.intent).toBe("PRODUCT_INTEREST");
    expect(result.explanation).toContain("មិនទាន់មានការបញ្ជាក់ទិញទេ");
    expect(result.items.length).toBe(1);
    expect(result.items[0].productName).toBe("អាវយឺតកប្បាស");
  });

  it("classifies explicit order with address and phone as PURCHASE_CONFIRMED", async () => {
    const prompt = JSON.stringify({
      messages: [
        { id: "m1", senderType: "CUSTOMER", body: "ខ្ញុំកម្មង់ អាវយឺតកប្បាស Size M មួយ ដឹកមកទួលគោក លេខ 012 345 678" },
      ],
      catalogue,
    });

    const result: any = await provider.analyze(prompt);
    expect(result.intent).toBe("PURCHASE_CONFIRMED");
    expect(result.confidence).toBe(95);
    expect(result.items[0].variantName).toBe("M");
    expect(result.missingInformation).toHaveLength(0);
  });

  it("classifies order intent without address/phone as ORDER_DETAILS_MISSING", async () => {
    const prompt = JSON.stringify({
      messages: [
        { id: "m1", senderType: "CUSTOMER", body: "ខ្ញុំយក អាវយឺតកប្បាស មួយបង" },
      ],
      catalogue,
    });

    const result: any = await provider.analyze(prompt);
    expect(result.intent).toBe("ORDER_DETAILS_MISSING");
    expect(result.missingInformation).toContain("Delivery address");
    expect(result.missingInformation).toContain("Customer phone");
  });
});

