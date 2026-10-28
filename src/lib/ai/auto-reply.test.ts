import { describe, expect, it, vi } from "vitest";
import { generateAutoReply, generateAutoReplyWithMedia } from "@/lib/ai/auto-reply";

// Mock prisma db
vi.mock("@/lib/db", () => ({
  db: {
    product: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "prod-1",
          name: "អាវយឺតកប្បាស",
          price: 12.0,
          stock: 45,
          lowStockAlert: 5,
          active: true,
          imageUrl: "https://example.com/cotton-shirt.jpg",
          variants: [
            { id: "var-1", name: "S", price: null, stock: 15, active: true },
            { id: "var-2", name: "M", price: null, stock: 20, active: true },
            { id: "var-3", name: "L", price: null, stock: 10, active: true },
          ],
        },
        {
          id: "prod-2",
          name: "សំពត់ខ្មែរលំនាំផ្កា",
          price: 25.5,
          stock: 0,
          lowStockAlert: 5,
          active: true,
          imageUrl: null,
          variants: [],
        },
      ]),
    },
  },
}));

describe("AI Smart Auto-Reply", () => {
  const store = {
    id: "store-1",
    name: "សោភា ស្ទូឌីយោ",
    phone: "012 999 888",
    address: "ផ្ទះលេខ 28 ផ្លូវ 310 ភ្នំពេញ",
    exchangeRate: 4100,
    bakongAccountId: "sophea@aba",
  };

  it("returns null when auto-reply is disabled", async () => {
    const reply = await generateAutoReply({
      customerName: "Sokha",
      messageText: "សួស្តីបង",
      store,
      settings: { autoReplyEnabled: false },
    });
    expect(reply).toBeNull();
  });

  it("acknowledges order with selected items and specifies owner KHQR payment review without mentioning draft", async () => {
    const reply = await generateAutoReply({
      customerName: "Phay veasnapheak",
      messageText: "សួស្តីបង ខ្ញុំចង់កម្មង់ អាវយឺតកប្បាស Size M ចំនួន ២ ដឹកមកទួលគោក លេខ 012 345 678",
      store,
      detection: {
        intent: "PURCHASE_CONFIRMED",
        confidence: 95,
        items: [{ productId: "prod-1", variantId: "var-2", productName: "អាវយឺតកប្បាស", variantName: "M", quantity: 2 }],
      },
      detectedPhone: "012345678",
    });

    expect(reply).toContain("Phay veasnapheak");
    expect(reply).toContain("អាវយឺតកប្បាស (M) x 2");
    expect(reply).toContain("Bakong KHQR");
    expect(reply).toContain("ម្ចាស់ហាងកំពុងពិនិត្យ");
    expect(reply).not.toContain("សេចក្តីព្រាង");
    expect(reply).not.toContain("ប្រព័ន្ធបានកត់ត្រា");
    expect(reply).toContain("សម្រាប់ការកម្មង់!");
  });

  it("checks stock and price when customer asks about available products without exposing exact quantities or mentioning order drafts", async () => {
    const reply = await generateAutoReply({
      customerName: "Bopha",
      messageText: "អាវយឺតកប្បាស តម្លៃប៉ុន្មានបង? មានស្តុកអត់?",
      store,
      detection: { intent: "PRODUCT_INTEREST", confidence: 88, items: [] },
    });

    expect(reply).toContain("Bopha");
    expect(reply).toContain("អាវយឺតកប្បាស");
    expect(reply).toContain("តម្លៃ");
    expect(reply).toContain("ស្ថានភាពស្តុក៖ ✅ មានក្នុងស្តុកស្រាប់");
    expect(reply).toContain("ជម្រើសទំហំ/ពណ៌ក្នុងស្តុក៖ S, M, L");
    expect(reply).not.toContain("នៅសល់");
    expect(reply).not.toContain("ស្តុក: ");
    expect(reply).not.toContain("45");
    expect(reply).not.toContain("សេចក្តីព្រាង");
    expect(reply).not.toContain("ប្រព័ន្ធបានកត់ត្រា");
    expect(reply).not.toContain("កុម្ម៉ង់បឋម");
  });

  it("shows out of stock when product stock is 0", async () => {
    const reply = await generateAutoReply({
      customerName: "Dara",
      messageText: "សំពត់ខ្មែរលំនាំផ្កា មានក្នុងស្តុកអត់បង?",
      store,
    });

    expect(reply).toContain("សំពត់ខ្មែរលំនាំផ្កា");
    expect(reply).toContain("ដាច់ស្តុកបណ្តោះអាសន្ន");
  });

  it("resolves product from context and answers sizes when customer asks 'តើនៅសល់ទំហំណាខ្លះបង' without repeating product name", async () => {
    const reply = await generateAutoReply({
      customerName: "Phay veasnapheak",
      messageText: "តើនៅសល់ទំហំណាខ្លះបង",
      store,
      detection: {
        intent: "PURCHASE_CONFIRMED", // AI classified thread as PURCHASE_CONFIRMED due to previous message
        confidence: 90,
        items: [{ productId: "prod-1", productName: "អាវយឺតកប្បាស", quantity: 1 }],
      },
    });

    expect(reply).not.toBeNull();
    expect(reply).toContain("Phay veasnapheak");
    expect(reply).toContain("អាវយឺតកប្បាស");
    expect(reply).toContain("ស្ថានភាពស្តុក៖ ✅ មានក្នុងស្តុកស្រាប់");
    expect(reply).toContain("ជម្រើសទំហំ/ពណ៌ក្នុងស្តុក៖ S, M, L");
    expect(reply).not.toContain("សេចក្តីព្រាង");
    expect(reply).not.toContain("ប្រព័ន្ធបានកត់ត្រា");
    expect(reply).not.toContain("45");
  });

  it("provides store info and greeting when busy with general inquiries", async () => {
    const reply = await generateAutoReply({
      customerName: "Kolab",
      messageText: "សួស្តីបង ហាងនៅម្តុំណាដែរ?",
      store,
    });

    expect(reply).toContain("Kolab");
    expect(reply).toContain("សោភា ស្ទូឌីយោ");
    expect(reply).toContain("ផ្ទះលេខ 28 ផ្លូវ 310 ភ្នំពេញ");
    expect(reply).toContain("012 999 888");
  });

  it("suppresses repetitive greeting spam when customer sends short acknowledgment (ok, បាទ) right after bot replied", async () => {
    const reply = await generateAutoReply({
      customerName: "Kolab",
      messageText: "ok",
      store,
      recentBotReplyAt: new Date(Date.now() - 30_000), // 30 seconds ago
    });

    expect(reply).toBeNull();
  });

  it("provides brief courtesy response instead of store info block when customer says thanks", async () => {
    const reply = await generateAutoReply({
      customerName: "Kolab",
      messageText: "អរគុណបង",
      store,
    });

    expect(reply).toContain("Kolab");
    expect(reply).toContain("រីករាយណាស់");
    expect(reply).not.toContain("ផ្ទះលេខ 28");
  });

  it("includes product image when customer asks for available products", async () => {
    const result = await generateAutoReplyWithMedia({
      customerName: "Sreypov",
      messageText: "តើមានទំនិញអ្វីខ្លះបង?",
      store,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain("អាវយឺតកប្បាស");
    expect(result?.text).toContain("🖼️ រូបភាព៖ https://example.com/cotton-shirt.jpg");
    expect(result?.imageUrl).toBe("https://example.com/cotton-shirt.jpg");
    expect(result?.productImages).toContain("https://example.com/cotton-shirt.jpg");
  });

  it("handles colloquial Khmer phrasing 'តើមានអាវសាច់កប្បាសទេបង' and answers with product info & image", async () => {
    const result = await generateAutoReplyWithMedia({
      customerName: "Phay veasnapheak",
      messageText: "តើមានអាវសាច់កប្បាសទេបង",
      store,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain("អាវយឺតកប្បាស");
    expect(result?.text).toContain("ស្ថានភាពស្តុក៖ ✅ មានក្នុងស្តុកស្រាប់");
    expect(result?.text).toContain("ជម្រើសទំហំ/ពណ៌ក្នុងស្តុក៖ S, M, L");
    expect(result?.imageUrl).toBe("https://example.com/cotton-shirt.jpg");
  });

  it("politely informs customer when product is not in catalogue and suggests available items", async () => {
    const result = await generateAutoReplyWithMedia({
      customerName: "Sokha",
      messageText: "តើមានស្បែកជើងទេបង?",
      store,
    });

    expect(result).not.toBeNull();
    expect(result?.text).toContain("មិនទាន់មានលក់នៅឡើយទេ");
    expect(result?.text).toContain("អាវយឺតកប្បាស");
  });
});
