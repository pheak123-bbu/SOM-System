import { IntentClassification } from "@prisma/client";
import { z } from "zod";
import { matchCatalogProducts } from "./matcher";

const intentValues = [
  "GENERAL_INQUIRY", "PRODUCT_INTEREST", "COMPARING_PRODUCTS", "ORDER_DETAILS_MISSING",
  "AWAITING_CUSTOMER_CONFIRMATION", "PURCHASE_INTENT", "PURCHASE_CONFIRMED",
  "ORDER_CHANGE_REQUEST", "CANCELLATION_REQUEST", "NO_PURCHASE", "UNKNOWN",
] as const satisfies readonly IntentClassification[];

export const detectionOutputSchema = z.object({
  intent: z.enum(intentValues),
  confidence: z.number().int().min(0).max(100),
  items: z.array(z.object({
    productName: z.string().trim().min(1).max(160),
    variantName: z.string().trim().max(120).nullable(),
    quantity: z.number().int().min(1).max(1000),
  })).max(30),
  missingInformation: z.array(z.string().trim().min(1).max(120)).max(20),
  evidenceMessageIds: z.array(z.string().min(1)).max(30),
  explanation: z.string().trim().min(1).max(1000),
  requiresSellerReview: z.literal(true),
  relatedOrderReference: z.string().max(120).nullable(),
});

export type DetectionOutput = z.infer<typeof detectionOutputSchema>;

export interface OrderDetectionProvider {
  readonly name: string;
  readonly model: string;
  analyze(prompt: string): Promise<unknown>;
}

export class OllamaDetectionProvider implements OrderDetectionProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly fallbackProvider = new CambodiaSocialPatternProvider();

  constructor() {
    this.model = process.env.AI_MODEL?.trim() || "qwen2.5:7b";
    this.baseUrl = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
  }

  async analyze(prompt: string): Promise<unknown> {
    if (!this.baseUrl || !this.model) {
      return this.fallbackProvider.analyze(prompt);
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: "json",
          messages: [
            {
              role: "system",
              content:
                "Classify social commerce intent conservatively. Preserve the meaning of Khmer, English, and mixed-language text. Write explanation and missingInformation in Khmer, preserving catalogue product and variant names exactly. A question, stock inquiry, or price check (such as 'តើមានសល់អត់', 'តម្លៃប៉ុន្មាន', 'size M?') MUST be classified as PRODUCT_INTEREST or GENERAL_INQUIRY, never PURCHASE_INTENT or PURCHASE_CONFIRMED. Only classify as PURCHASE_INTENT, ORDER_DETAILS_MISSING, or PURCHASE_CONFIRMED when customer explicitly requests to buy or order ('កម្មង់', 'កុម្ម៉ង់', 'កុម្មង់', 'យក', 'ទិញ', 'ចង់បាន', 'order', 'ផ្ញើមក'). Never create an order, claim seller approval, or infer consent from confidence. Return only the requested JSON. Every intent requires seller review.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        console.warn(`[Ollama] Returned HTTP ${response.status}. Falling back to CambodiaSocialPatternProvider.`);
        return this.fallbackProvider.analyze(prompt);
      }

      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("message" in data) ||
        typeof data.message !== "object" ||
        !data.message ||
        !("content" in data.message) ||
        typeof data.message.content !== "string"
      ) {
        return this.fallbackProvider.analyze(prompt);
      }

      return JSON.parse(data.message.content);
    } catch (cause) {
      console.warn(
        `[Ollama] Failed or unreachable (${cause instanceof Error ? cause.message : String(cause)}). Using CambodiaSocialPatternProvider fallback.`
      );
      return this.fallbackProvider.analyze(prompt);
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CloudLLMConfig {
  provider: "groq" | "openai" | "gemini" | "deepseek" | string;
  apiKey: string;
  model?: string;
  endpoint?: string;
}

export class CloudLLMProvider implements OrderDetectionProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fallbackProvider = new CambodiaSocialPatternProvider();

  constructor(options: CloudLLMConfig) {
    this.name = options.provider;
    this.apiKey = options.apiKey;
    if (options.provider === "groq") {
      this.endpoint = options.endpoint || "https://api.groq.com/openai/v1/chat/completions";
      this.model = options.model || "llama-3.3-70b-versatile";
    } else if (options.provider === "openai") {
      this.endpoint = options.endpoint || "https://api.openai.com/v1/chat/completions";
      this.model = options.model || "gpt-4o-mini";
    } else if (options.provider === "gemini") {
      this.endpoint = options.endpoint || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      this.model = options.model || "gemini-1.5-flash";
    } else if (options.provider === "deepseek") {
      this.endpoint = options.endpoint || "https://api.deepseek.com/chat/completions";
      this.model = options.model || "deepseek-chat";
    } else {
      this.endpoint = options.endpoint || "https://api.openai.com/v1/chat/completions";
      this.model = options.model || "gpt-4o-mini";
    }
  }

  async analyze(prompt: string): Promise<unknown> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: this.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an expert Cambodian social commerce AI assistant. Classify social commerce intent conservatively. Preserve the meaning of Khmer, English, and mixed-language text. Write explanation and missingInformation in Khmer, preserving catalogue product and variant names exactly. A question, stock inquiry, or price check (such as 'តើមានសល់អត់', 'តម្លៃប៉ុន្មាន', 'size M?', 'តើមានអាវសាច់កប្បាសទេបង') MUST be classified as PRODUCT_INTEREST or GENERAL_INQUIRY, never PURCHASE_INTENT or PURCHASE_CONFIRMED. Match products even when customer uses colloquial Khmer synonyms (e.g. 'អាវសាច់កប្បាស' matches 'អាវយឺតកប្បាស', 'ខោលីនិន' matches 'ខោជើងវែងក្រណាត់លីនិន'). Return only valid JSON. Every intent requires seller review.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        console.warn(`[Cloud AI ${this.name}] HTTP ${response.status}. Falling back to CambodiaSocialPatternProvider.`);
        return this.fallbackProvider.analyze(prompt);
      }

      const data: any = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return this.fallbackProvider.analyze(prompt);
      }

      return JSON.parse(content);
    } catch (err) {
      console.warn(`[Cloud AI ${this.name}] Failed. Falling back to CambodiaSocialPatternProvider:`, err instanceof Error ? err.message : err);
      return this.fallbackProvider.analyze(prompt);
    }
  }
}

export class CambodiaSocialPatternProvider implements OrderDetectionProvider {
  readonly name = "cambodia-social-ai";
  readonly model = "som-pattern-v1";

  async analyze(prompt: string): Promise<unknown> {
    let payload: {
      messages?: Array<{ id: string; senderType?: string; senderName?: string; body?: string }>;
      catalogue?: Array<{ name: string; sku?: string | null; variants?: Array<{ name: string; sku?: string | null }> }>;
    };
    try {
      payload = JSON.parse(prompt);
    } catch {
      throw new Error("ទម្រង់ prompt មិនត្រឹមត្រូវទេ។");
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const catalogue = Array.isArray(payload.catalogue) ? payload.catalogue : [];
    const customerMessages = messages.filter((m) => m.senderType === "CUSTOMER" || !m.senderType);

    if (customerMessages.length === 0) {
      return {
        intent: "GENERAL_INQUIRY",
        confidence: 50,
        items: [],
        missingInformation: [],
        evidenceMessageIds: messages[0]?.id ? [messages[0].id] : [],
        explanation: "មិនមានសារពីអតិថិជនដើម្បីវិភាគទេ។",
        requiresSellerReview: true,
        relatedOrderReference: null,
      };
    }

    const combinedText = customerMessages.map((m) => m.body ?? "").join(" ");
    const evidenceIds = customerMessages.map((m) => m.id);

    // 1. Detect Products & Variants & Quantities from Catalogue using Smart Semantic Matcher
    const detectedItems: Array<{ productName: string; variantName: string | null; quantity: number }> = [];
    const matchedProducts = matchCatalogProducts(combinedText, catalogue as any);

    for (const prod of matchedProducts) {
      const prodName = String(prod.name || "").trim();
      let matchedVariant: string | null = null;
      if (Array.isArray(prod.variants) && prod.variants.length > 0) {
        for (const v of prod.variants) {
          const vName = String(v.name || "").trim();
          if (!vName) continue;
          // 1. Direct or boundary-based match
          const pattern = /^[a-zA-Z0-9]+$/.test(vName)
            ? `(?:^|[^a-zA-Z0-9])${escapeRegex(vName)}(?:[^a-zA-Z0-9]|$)`
            : escapeRegex(vName);
          if (new RegExp(pattern, "i").test(combinedText)) {
            matchedVariant = vName;
            break;
          }

          // 2. Parenthesized code match (e.g. "មធ្យម (M)" matches "Size M" or "M")
          const parenMatch = vName.match(/\(([a-zA-Z0-9]+)\)/);
          if (parenMatch) {
            const code = parenMatch[1];
            const codeRegex = new RegExp(`(?:^|[^a-zA-Z0-9]|size\\s*)${escapeRegex(code)}(?:[^a-zA-Z0-9]|$)`, "i");
            if (codeRegex.test(combinedText)) {
              matchedVariant = vName;
              break;
            }
          }

          // 3. Delimited attribute match (e.g. "បន៍ត្នោតខ្ចី · មធ្យម" matches "មធ្យម" or "បន៍ត្នោតខ្ចី")
          const parts = vName.split(/[·/,-]/).map((p) => p.trim()).filter((p) => p.length >= 2);
          for (const part of parts) {
            if (new RegExp(escapeRegex(part), "i").test(combinedText)) {
              matchedVariant = vName;
              break;
            }
          }
          if (matchedVariant) break;
        }
      }

      let qty = 1;
      const khmerNums: Record<string, number> = {
        "មួយ": 1, "ពីរ": 2, "បី": 3, "បួន": 4, "ប្រាំ": 5,
        "១": 1, "២": 2, "៣": 3, "៤": 4, "៥": 5, "៦": 6, "៧": 7, "៨": 8, "៩": 9, "១០": 10,
      };
      for (const [word, num] of Object.entries(khmerNums)) {
        if (combinedText.includes(word)) {
          qty = num;
          break;
        }
      }

      const qtyMatch = combinedText.match(/(?:ចំនួន|យក|ទិញ|x|\*)\s*(\d+)/i) ||
        combinedText.match(/(\d+)\s*(?:កំប៉ុង|ឈុត|កញ្ចប់|ដប|គូ|ដើម|កេស|អាវ|ខោ|ក្បាល|pcs|pc)/i);
      if (qtyMatch) {
        const parsedQty = parseInt(qtyMatch[1], 10);
        if (parsedQty > 0 && parsedQty <= 1000) qty = parsedQty;
      }

      detectedItems.push({
        productName: prodName,
        variantName: matchedVariant,
        quantity: qty,
      });
    }

    // Fallback: If purchase words appear and catalogue exists, match best catalogue item
    if (detectedItems.length === 0 && catalogue.length > 0) {
      const isPurchase = /(?:កម្មង់|កុម្ម៉ង់|កុម្មង់|ទិញ|យក|order|ចង់បាន|ដឹកមក|ផ្ញើមក)/i.test(combinedText);
      if (isPurchase) {
        const prod = catalogue[0];
        detectedItems.push({
          productName: prod.name,
          variantName: prod.variants?.[0]?.name ?? null,
          quantity: 1,
        });
      }
    }

    // 2. Classify Intent & Missing Info
    const hasInquiryKeywords = /(?:តើ|សល់|ប៉ុន្មាន|ថ្លៃ|តម្លៃ|ខ្លះ|អត់|ទេ|\?|សួរ|ព័ត៌មាន|detail|info|price|ស្តុក|មាន(?:អត់|ទេ)?)/i.test(combinedText);
    const hasOrderKeywords = /(?:កម្មង់|កុម្ម៉ង់|កុម្មង់|កម៉្មង់|យក|ទិញ|ចង់បាន|order|confirm|ផ្ញើមក|ដឹកមក|ទម្លាក់លេខ|ទម្លាក់ទីតាំង)/i.test(combinedText);
    const hasAddress = /(?:ភ្នំពេញ|ខេត្ត|ទួលគោក|បឹងកេងកង|សៀមរាប|បាត់ដំបង|ផ្ទះលេខ|ផ្លូវ|សង្កាត់|ខណ្ឌ|ក្រុង|ភូមិ)/i.test(combinedText);
    const hasPhone = /(?:0|\+?855)[1-9]\d{7,8}/.test(combinedText.replace(/[\s-]/g, ""));

    let intent: IntentClassification = IntentClassification.GENERAL_INQUIRY;
    const missing: string[] = [];

    if (detectedItems.length > 0) {
      if (hasInquiryKeywords && !hasOrderKeywords) {
        // Customer is asking about availability, price, or product info, not committing to order
        intent = IntentClassification.PRODUCT_INTEREST;
      } else if (hasOrderKeywords && hasAddress && hasPhone) {
        intent = IntentClassification.PURCHASE_CONFIRMED;
      } else if (hasOrderKeywords) {
        intent = IntentClassification.ORDER_DETAILS_MISSING;
      } else {
        intent = IntentClassification.PRODUCT_INTEREST;
      }

      if (intent === IntentClassification.PURCHASE_CONFIRMED || intent === IntentClassification.ORDER_DETAILS_MISSING) {
        if (!hasAddress) missing.push("Delivery address");
        if (!hasPhone) missing.push("Customer phone");
        for (const item of detectedItems) {
          const prod = catalogue.find((p) => p.name === item.productName);
          if (prod && Array.isArray(prod.variants) && prod.variants.length > 0 && !item.variantName) {
            missing.push(`Variant selection for ${item.productName}`);
          }
        }
      }
    } else {
      if (/(?:តម្លៃ|ប៉ុន្មាន|ថ្លៃ|how much|price|សួរ|មានអត់|សល់អត់)/i.test(combinedText)) {
        intent = IntentClassification.PRODUCT_INTEREST;
      } else {
        intent = IntentClassification.GENERAL_INQUIRY;
      }
    }

    const confidence = detectedItems.length > 0
      ? (intent === IntentClassification.PURCHASE_CONFIRMED ? 95 : intent === IntentClassification.ORDER_DETAILS_MISSING ? 88 : 75)
      : 60;

    const explanation = intent === IntentClassification.PRODUCT_INTEREST
      ? `អតិថិជនបានសាកសួរព័ត៌មាន ឬស្ថានភាពស្តុកអំពី ${detectedItems.map((i) => i.productName).join(", ")} (មិនទាន់មានការបញ្ជាក់ទិញទេ)។`
      : detectedItems.length > 0
        ? `អតិថិជនបានស្នើកម្មង់ ${detectedItems.map((i) => `${i.productName}${i.variantName ? ` (${i.variantName})` : ""} ចំនួន ${i.quantity}`).join(", ")}។ ${missing.length ? "ព័ត៌មានបន្ថែមនៅខ្វះមួយចំនួនដែលត្រូវការអ្នកលក់ពិនិត្យ។" : "ព័ត៌មានកម្មង់ និងការដឹកជញ្ជូនមានគ្រប់គ្រាន់។"}`
        : "អតិថិជនកំពុងសាកសួរព័ត៌មានទូទៅ មិនទាន់មានការបញ្ជាក់ទិញមុខទំនិញជាក់លាក់នៅឡើយទេ។";

    return {
      intent,
      confidence,
      items: detectedItems,
      missingInformation: missing,
      evidenceMessageIds: evidenceIds.slice(0, 10),
      explanation,
      requiresSellerReview: true as const,
      relatedOrderReference: null,
    };
  }
}

export function getDetectionProvider(): OrderDetectionProvider {
  const selected = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const skipOllama =
    process.env.SKIP_OLLAMA === "true" ||
    process.env.SKIP_OLLAMA === "1" ||
    Boolean(process.env.VERCEL);

  // 1. Cloud AI Provider Check (Groq, OpenAI, Gemini, DeepSeek)
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const genericApiKey = process.env.AI_API_KEY?.trim();

  if (selected === "groq" || (!selected && groqKey)) {
    if (groqKey) {
      return new CloudLLMProvider({
        provider: "groq",
        apiKey: groqKey,
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
      });
    }
  }

  if (selected === "openai" || (!selected && openaiKey)) {
    if (openaiKey) {
      return new CloudLLMProvider({
        provider: "openai",
        apiKey: openaiKey,
        model: process.env.AI_MODEL || "gpt-4o-mini",
      });
    }
  }

  if (selected === "gemini" || (!selected && geminiKey)) {
    if (geminiKey) {
      return new CloudLLMProvider({
        provider: "gemini",
        apiKey: geminiKey,
        model: process.env.AI_MODEL || "gemini-1.5-flash",
      });
    }
  }

  if (selected === "deepseek" || (!selected && deepseekKey)) {
    if (deepseekKey) {
      return new CloudLLMProvider({
        provider: "deepseek",
        apiKey: deepseekKey,
        model: process.env.AI_MODEL || "deepseek-chat",
      });
    }
  }

  if (genericApiKey) {
    return new CloudLLMProvider({
      provider: selected || "openai",
      apiKey: genericApiKey,
      model: process.env.AI_MODEL,
      endpoint: process.env.AI_ENDPOINT,
    });
  }

  // 2. Ollama Local Provider (if explicitly enabled)
  if (selected === "ollama" && !skipOllama) {
    return new OllamaDetectionProvider();
  }

  // 3. Built-in Cambodian Social Pattern Engine (zero disk footprint, instant response)
  return new CambodiaSocialPatternProvider();
}
