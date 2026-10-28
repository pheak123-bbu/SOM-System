import { db } from "@/lib/db";
import { formatDualCurrency, DEFAULT_EXCHANGE_RATE } from "@/lib/cambodia";
import { matchCatalogProducts, isProductOrStockInquiry, normalizeKhmer } from "./matcher";

export interface AutoReplyOptions {
  customerName: string;
  messageText: string;
  isGroup?: boolean;
  store: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string | null;
    exchangeRate?: number | any | null;
    bakongAccountId?: string | null;
  };
  detection?: {
    intent: string;
    confidence: number;
    explanation?: string;
    items?: Array<{
      productId?: string | null;
      variantId?: string | null;
      productName: string;
      variantName?: string | null;
      quantity: number;
    }>;
  } | null;
  detectedPhone?: string | null;
  recentBotReplyAt?: Date | null;
  settings?: {
    autoReplyEnabled?: boolean;
    autoReplyStockCheck?: boolean;
    autoReplyOrderNotice?: boolean;
    customNote?: string | null;
    aiProvider?: string | null;
    aiApiKey?: string | null;
    aiModel?: string | null;
  };
  cloudAI?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    endpoint?: string;
  };
}

export interface AutoReplyResult {
  text: string;
  imageUrl?: string | null;
  productImages: string[];
}

const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, "");

async function generateCloudAutoReply(
  options: AutoReplyOptions,
  products: any[],
  cloudConfig: { provider: string; apiKey: string; model?: string; endpoint?: string }
): Promise<string | null> {
  const rate = Number(options.store.exchangeRate) || DEFAULT_EXCHANGE_RATE;
  const catalogSummary = products.slice(0, 15).map((p) => {
    const vNames = p.variants?.map((v: any) => v.name).join(", ");
    const priceStr = formatDualCurrency(Number(p.price), rate);
    const inStock = (p.stock ?? 1) > 0 || (p.variants && p.variants.some((v: any) => (v.stock ?? 1) > 0));
    return `- ${p.name} (SKU: ${p.sku || "N/A"}): ${priceStr}, ${inStock ? "មានក្នុងស្តុក" : "អស់ស្តុក"}${vNames ? `, ជម្រើស: ${vNames}` : ""}`;
  }).join("\n");

  const systemPrompt = `You are a warm, polite, and helpful Cambodian social commerce sales assistant for the store "${options.store.name}".
Always communicate in friendly, professional Khmer. Use polite particles like "បង", "ចាស/បាទ", "ណា៎".
Store Info:
- Store Name: ${options.store.name}
- Phone: ${options.store.phone || "មិនទាន់មាន"}
- Address: ${options.store.address || "រាជធានីភ្នំពេញ"}
- Exchange rate: $1 = ${rate} KHR

Live Store Catalogue:
${catalogSummary}

Customer Name: ${options.customerName}

Rules:
1. Always base product answers strictly on the catalog above. Never invent products or fake prices.
2. If customer asks about a product we sell (including colloquial names or fabrics like អាវសាច់កប្បាស for អាវយឺតកប្បាស, ខោលីនិន for ខោជើងវែងក្រណាត់លីនិន), tell them if it's in stock, the price in USD and Riel, and available sizes/variants.
3. If customer asks for something not in the store, politely let them know and suggest available items.
4. If customer is ordering, acknowledge the items and mention the store owner will check and send Bakong KHQR for payment shortly.
5. Keep response concise, friendly, and well formatted with emojis (🙏, 📦, 💵, 💬).`;

  try {
    let endpoint = cloudConfig.endpoint;
    let model = cloudConfig.model;
    if (cloudConfig.provider === "groq") {
      endpoint = endpoint || "https://api.groq.com/openai/v1/chat/completions";
      model = model || "llama-3.3-70b-versatile";
    } else if (cloudConfig.provider === "openai") {
      endpoint = endpoint || "https://api.openai.com/v1/chat/completions";
      model = model || "gpt-4o-mini";
    } else if (cloudConfig.provider === "gemini") {
      endpoint = endpoint || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      model = model || "gemini-1.5-flash";
    } else if (cloudConfig.provider === "deepseek") {
      endpoint = endpoint || "https://api.deepseek.com/chat/completions";
      model = model || "deepseek-chat";
    } else {
      endpoint = endpoint || "https://api.openai.com/v1/chat/completions";
      model = model || "gpt-4o-mini";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cloudConfig.apiKey}`,
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: options.messageText },
        ],
        temperature: 0.3,
        max_tokens: 450,
      }),
    });

    if (!res.ok) {
      console.warn(`[Cloud LLM] HTTP ${res.status}. Falling back to smart semantic auto-reply.`);
      return null;
    }

    const data: any = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } catch (err) {
    console.warn("[Cloud LLM] Call failed, using smart semantic fallback:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generates an intelligent Khmer auto-reply with rich media (product images) that:
 * 1. Checks real-time catalog stock & pricing when customer inquires.
 * 2. Provides product images (imageUrl) directly for Telegram / Social Chat responses.
 * 3. Drafts an instant acknowledgment of order details while clarifying that
 *    the store owner will verify and provide official payment info (KHQR / Cash).
 * 4. Provides store contact info during busy hours.
 */
export async function generateAutoReplyWithMedia(options: AutoReplyOptions): Promise<AutoReplyResult | null> {
  const { customerName, messageText, isGroup, store, detection, detectedPhone, settings } = options;

  // If auto-reply is explicitly disabled, do not reply
  if (settings?.autoReplyEnabled === false) {
    return null;
  }

  const rate = Number(store.exchangeRate) || DEFAULT_EXCHANGE_RATE;
  const normText = normalize(messageText);

  // 0. Cooldown & Courtesy response check for rapid short acknowledgments
  const isRecentReply = Boolean(options.recentBotReplyAt && (Date.now() - new Date(options.recentBotReplyAt).getTime()) < 120_000);
  const isShortAck = /^(?:ok|okay|បាទ|ចាស|ចា|ចា៎|yes|k|thx|thanks|អរគុណ|👍|👌|❤️)$/i.test(messageText.trim().toLowerCase());

  if (isRecentReply && isShortAck) {
    if (normText.includes("អរគុណ") || normText.includes("thanks") || normText.includes("thx")) {
      return {
        text: `🙏 រីករាយណាស់បង ${customerName}! ប្រសិនបើបងត្រូវការជំនួយបន្ថែម អាចផ្ញើសារមកបានគ្រប់ពេលណា៎។`,
        imageUrl: null,
        productImages: [],
      };
    }
    return null; // Suppress duplicate greetings for rapid 'ok' or 'បាទ'
  }

  // 1. Fetch active products with variants from store catalog
  const products = await db.product.findMany({
    where: { storeId: store.id, active: true },
    include: { variants: { where: { active: true } } },
    take: 100,
  });

  // 1. Find products mentioned directly in customer's current message using Smart Semantic Matcher
  let matchedProducts = matchCatalogProducts(messageText, products);

  // 2. If no product name was explicitly typed in this message, inherit from recent conversation context (detection.items)
  if (matchedProducts.length === 0 && detection?.items && detection.items.length > 0) {
    const contextProductIds = detection.items.map((it) => it.productId).filter(Boolean);
    const contextProductNames = detection.items.map((it) => normalize(it.productName));
    matchedProducts = products.filter(
      (p) => contextProductIds.includes(p.id) || contextProductNames.includes(normalize(p.name))
    );
  }

  // 3. Optional Cloud AI Generation (Groq, OpenAI, Gemini, DeepSeek)
  const cloudApiKey =
    options.cloudAI?.apiKey ||
    settings?.aiApiKey ||
    process.env.GROQ_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.AI_API_KEY;

  const cloudProvider =
    options.cloudAI?.provider ||
    settings?.aiProvider ||
    (process.env.GROQ_API_KEY ? "groq" :
     process.env.OPENAI_API_KEY ? "openai" :
     process.env.GEMINI_API_KEY ? "gemini" :
     process.env.DEEPSEEK_API_KEY ? "deepseek" :
     process.env.AI_PROVIDER || "groq");

  if (cloudApiKey && cloudProvider && cloudProvider !== "pattern" && !isShortAck) {
    const cloudReply = await generateCloudAutoReply(options, products, {
      provider: cloudProvider,
      apiKey: cloudApiKey,
      model: options.cloudAI?.model || settings?.aiModel || process.env.AI_MODEL,
      endpoint: options.cloudAI?.endpoint || process.env.AI_ENDPOINT,
    });
    if (cloudReply) {
      const productImages = matchedProducts
        .map((p) => p.imageUrl)
        .filter((url): url is string => typeof url === "string" && url.trim().length > 0);
      return {
        text: cloudReply,
        imageUrl: productImages[0] ?? null,
        productImages,
      };
    }
  }

  // 3. If customer asks general inquiry about available products ("តើមានទំនិញអ្វីខ្លះ", "សល់អីខ្លះ", etc.)
  const isGeneralCatalogInquiry =
    (normText.includes("មាន") && (normText.includes("ខ្លះ") || normText.includes("អ្វី") || normText.includes("អី"))) ||
    (normText.includes("សល់") && (normText.includes("ខ្លះ") || normText.includes("អ្វី") || normText.includes("អី"))) ||
    normText.includes("ទំនិញអ្វីខ្លះ") ||
    normText.includes("មានទំនិញ") ||
    normText.includes("កាតាឡុក") ||
    normText.includes("catalog") ||
    normText.includes("available");

  if (matchedProducts.length === 0 && isGeneralCatalogInquiry) {
    matchedProducts = products
      .filter((p) => {
        if (p.variants.length > 0) {
          return p.variants.some((v) => (v.stock ?? p.stock ?? 1) > 0);
        }
        return (p.stock ?? 1) > 0;
      })
      .slice(0, 4);
    if (matchedProducts.length === 0) {
      matchedProducts = products.slice(0, 4);
    }
  }

  // Standalone thank you check
  if ((normText === "អរគុណ" || normText === "អរគុណបង" || normText === "thanks" || normText === "thankyou") && matchedProducts.length === 0) {
    return {
      text: `🙏 រីករាយណាស់បង ${customerName}! ប្រសិនបើបងត្រូវការជំនួយបន្ថែម អាចផ្ញើសារមកបានគ្រប់ពេលណា៎។`,
      imageUrl: null,
      productImages: [],
    };
  }

  // Question / Inquiry indicators (asking about stock, sizes, colors, price, availability)
  const hasQuestionIndicators =
    normText.includes("តើ") ||
    normText.includes("សល់") ||
    normText.includes("ប៉ុន្មាន") ||
    normText.includes("ថ្លៃ") ||
    normText.includes("តម្លៃ") ||
    normText.includes("ខ្លះ") ||
    normText.includes("អត់") ||
    normText.includes("ទេ") ||
    normText.includes("?") ||
    normText.includes("សួរ") ||
    normText.includes("ព័ត៌មាន") ||
    normText.includes("detail") ||
    normText.includes("info") ||
    normText.includes("price") ||
    normText.includes("ស្តុក") ||
    normText.includes("ពណ៌") ||
    normText.includes("ពណ៍") ||
    isGeneralCatalogInquiry ||
    isProductOrStockInquiry(messageText) ||
    (normText.includes("ទំហំ") && !normText.includes("កុម្ម៉ង់") && !normText.includes("កម្មង់")) ||
    (normText.includes("size") && !normText.includes("កុម្ម៉ង់") && !normText.includes("កម្មង់") && !normText.includes("យក") && !normText.includes("ទិញ"));

  // Try extracting delivery destination from message
  const addressMatch = messageText.match(
    /(?:ដឹក(?:មក|ទៅ)?|ទីតាំង|ផ្ទះលេខ|សង្កាត់|ខណ្ឌ|ខេត្ត|រាជធានី|ផ្សារ)[^,\n.!?]+/i
  );
  const deliveryAddress = addressMatch ? addressMatch[0].trim() : null;

  // Check if customer explicitly intends to purchase in this message
  const hasOrderKeywords =
    normText.includes("កម្មង់") ||
    normText.includes("កុម្ម៉ង់") ||
    normText.includes("កុម្មង់") ||
    normText.includes("កម៉្មង់") ||
    normText.includes("ទិញ") ||
    normText.includes("យក");

  // Check if customer provided delivery address or phone number
  const hasDeliveryOrContact = Boolean(detectedPhone) || Boolean(deliveryAddress);

  // A message is a concrete order if:
  // - It has explicit purchase keywords (កម្មង់, កុម្ម៉ង់, ទិញ, យក)
  // - AND (has delivery/contact details OR detected order items)
  // - AND is NOT asking a question like "សល់អត់", "ប៉ុន្មាន", "តើនៅសល់", etc.
  const isConcreteOrder =
    hasOrderKeywords &&
    (hasDeliveryOrContact || (detection?.items && detection.items.length > 0)) &&
    !normText.includes("សល់") &&
    !normText.includes("ប៉ុន្មាន") &&
    !normText.includes("អត់") &&
    !normText.includes("ទេ") &&
    !normText.includes("?") &&
    !normText.includes("តើ");

  // An inquiry is when customer asks about stock/sizes/price or asks questions
  const isPriceOrStockInquiry =
    !isConcreteOrder &&
    (detection?.intent === "PRODUCT_INTEREST" ||
      hasQuestionIndicators ||
      (matchedProducts.length > 0 && !hasOrderKeywords));

  // ==========================================
  // SCENARIO 1: STOCK, PRICE & PRODUCT INQUIRY
  // ==========================================
  // If customer is inquiring about stock/price/sizes, or just mentioned product names without a concrete order
  if ((isPriceOrStockInquiry || matchedProducts.length > 0) && !isConcreteOrder) {
    if (settings?.autoReplyStockCheck === false) return null;

    if (matchedProducts.length > 0) {
      const productSummaries = matchedProducts.slice(0, 3).map((prod) => {
        const priceLabel = formatDualCurrency(Number(prod.price), rate);

        // Determine stock availability without exposing exact quantities to customers
        let isAvailable = true;
        if (prod.variants.length > 0) {
          isAvailable = prod.variants.some((v) => {
            if (v.stock !== null && v.stock !== undefined) return v.stock > 0;
            return prod.stock === null || prod.stock > 0;
          });
        } else if (prod.stock !== null) {
          isAvailable = prod.stock > 0;
        }

        const stockText = isAvailable ? "✅ មានក្នុងស្តុកស្រាប់" : "❌ ដាច់ស្តុកបណ្តោះអាសន្ន";

        // List only variants that are currently in stock (without showing exact remaining count)
        let variantText = "";
        if (prod.variants.length > 0) {
          const inStockVariants = prod.variants.filter((v) => {
            if (v.stock !== null && v.stock !== undefined) return v.stock > 0;
            return prod.stock === null || prod.stock > 0;
          });
          if (inStockVariants.length > 0) {
            const list = inStockVariants
              .map((v) => {
                const diffPrice = v.price && Number(v.price) !== Number(prod.price)
                  ? ` [${formatDualCurrency(Number(v.price), rate)}]`
                  : "";
                return `${v.name}${diffPrice}`;
              })
              .join(", ");
            variantText = `🎨 ជម្រើសទំហំ/ពណ៌ក្នុងស្តុក៖ ${list}`;
          } else {
            variantText = `🎨 ជម្រើសទំហំ/ពណ៌៖ ❌ អស់គ្រប់ជម្រើសបណ្តោះអាសន្ន`;
          }
        }

        const imageLine = prod.imageUrl && /^https?:\/\//i.test(prod.imageUrl) ? `🖼️ រូបភាព៖ ${prod.imageUrl}` : "";

        return [
          `📦 មុខទំនិញ៖ ${prod.name}`,
          `💵 តម្លៃ៖ ${priceLabel}`,
          `📊 ស្ថានភាពស្តុក៖ ${stockText}`,
          variantText,
          imageLine,
        ]
          .filter(Boolean)
          .join("\n");
      });

      const productImages = matchedProducts
        .map((p) => p.imageUrl)
        .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url.trim()));
      const primaryImageUrl = productImages[0] ?? null;

      return {
        text: [
          `🙏 ជម្រាបសួរអតិថិជន ${customerName}!`,
          `នេះជាព័ត៌មានទំនិញជាក់ស្តែងពីហាង «${store.name}»៖`,
          ``,
          productSummaries.join("\n\n"),
          ``,
          `💬 បងអាចប្រាប់ពីទំហំ/ពណ៌ និងចំនួនដែលបងពេញចិត្ត ដើម្បីកម្មង់ទិញបានណា៎!`,
          settings?.customNote ? `\n📌 ចំណាំ៖ ${settings.customNote}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        imageUrl: primaryImageUrl,
        productImages,
      };
    }

    // Customer asked about products/stock, but the item is NOT in the store catalog (e.g. "តើមានស្បែកជើងទេ?")
    if (matchedProducts.length === 0 && (isPriceOrStockInquiry || hasQuestionIndicators || isProductOrStockInquiry(messageText))) {
      const topAvailable = products.filter((p) => (p.stock ?? 1) > 0).slice(0, 5);
      if (topAvailable.length > 0) {
        const productList = topAvailable
          .map((p) => `• ${p.name} (${formatDualCurrency(Number(p.price), rate)})`)
          .join("\n");

        const availableImages = topAvailable
          .map((p) => p.imageUrl)
          .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url.trim()));

        return {
          text: [
            `🙏 ជម្រាបសួរអតិថិជន ${customerName}!`,
            `សម្រាប់មុខទំនិញដែលបងបានសួរ ហាងយើងខ្ញុំមិនទាន់មានលក់នៅឡើយទេ។`,
            ``,
            `បច្ចុប្បន្នហាង «${store.name}» មានមុខទំនិញពេញនិយមដូចជា៖`,
            productList,
            ``,
            `💬 តើបងចាប់អារម្មណ៍មុខទំនិញណាមួយខាងលើដែរទេ? បងអាចសាកសួរព័ត៌មានបន្ថែមបានណា៎!`,
          ].join("\n"),
          imageUrl: availableImages[0] ?? null,
          productImages: availableImages,
        };
      }
    }
  }

  // ==========================================
  // SCENARIO 2: ORDER PLACEMENT ACKNOWLEDGMENT
  // ==========================================
  // Only trigger when customer actually places an order (never show robotic draft/dashboard messages)
  if (isConcreteOrder) {
    if (settings?.autoReplyOrderNotice === false) return null;

    let itemsTotalUSD = 0;
    const itemLines: string[] = [];

    if (detection?.items && detection.items.length > 0) {
      for (const item of detection.items) {
        const prod = products.find(
          (p) => p.id === item.productId || normalize(p.name) === normalize(item.productName)
        );
        const variant = prod?.variants.find(
          (v) =>
            v.id === item.variantId ||
            (item.variantName && normalize(v.name) === normalize(item.variantName))
        );

        const unitPrice = variant?.price
          ? Number(variant.price)
          : prod?.price
          ? Number(prod.price)
          : 0;
        const lineTotal = unitPrice * item.quantity;
        itemsTotalUSD += lineTotal;

        const priceLabel = unitPrice > 0 ? ` [${formatDualCurrency(lineTotal, rate)}]` : "";
        const variantLabel = item.variantName ? ` (${item.variantName})` : "";
        itemLines.push(`• ${item.productName}${variantLabel} x ${item.quantity}${priceLabel}`);
      }
    }

    const orderImages = matchedProducts
      .map((p) => p.imageUrl)
      .filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url.trim()));

    return {
      text: [
        `🙏 សូមអរគុណបង ${customerName} សម្រាប់ការកម្មង់!`,
        `📦 មុខទំនិញដែលបងបានជ្រើសរើស៖`,
        itemLines.length ? itemLines.join("\n") : `• សារកម្មង់៖ "${messageText.slice(0, 80)}${messageText.length > 80 ? "…" : ""}"`,
        itemsTotalUSD > 0 ? `💰 តម្លៃទំនិញសរុប៖ ${formatDualCurrency(itemsTotalUSD, rate)}` : "",
        deliveryAddress ? `📍 ទីតាំងដឹកជញ្ជូន៖ ${deliveryAddress}` : "",
        detectedPhone ? `📞 លេខទូរស័ព្ទ៖ ${detectedPhone}` : "",
        ``,
        `💬 ម្ចាស់ហាងកំពុងពិនិត្យ និងរៀបចំផ្ញើព័ត៌មានទូទាត់ប្រាក់ (Bakong KHQR) ជូនបងក្នុងពេលបន្តិចទៀតនេះ!`,
      ]
        .filter((line) => line !== "")
        .join("\n"),
      imageUrl: orderImages[0] ?? null,
      productImages: orderImages,
    };
  }

  // ==========================================
  // SCENARIO 3: GENERAL BUSY / GREETING REPLY
  // ==========================================
  // When no specific product or order was recognized, provide helpful store info
  if (
    normText.includes("សួស្តី") ||
    normText.includes("hello") ||
    normText.includes("hi") ||
    normText.includes("admin") ||
    normText.includes("ជម្រាបសួរ") ||
    normText.includes("ទីតាំង") ||
    normText.includes("ម្តុំណា")
  ) {
    return {
      text: [
        `🙏 ជម្រាបសួរអតិថិជន ${customerName}!`,
        `សូមអរគុណសម្រាប់ការទាក់ទងមកកាន់ «${store.name}»។`,
        store.address ? `📍 ទីតាំងហាង៖ ${store.address}` : "",
        store.phone ? `📞 លេខទំនាក់ទំនង៖ ${store.phone}` : "",
        ``,
        `ម្ចាស់ហាងកំពុងជាប់រវល់បន្តិច ហើយនឹងពិនិត្យឆ្លើយតបសារជូនបងក្នុងពេលឆាប់ៗនេះ។ បងអាចផ្ញើឈ្មោះមុខទំនិញ ឬចម្ងល់ទុកមុនបានណា៎!`,
      ]
        .filter(Boolean)
        .join("\n"),
      imageUrl: null,
      productImages: [],
    };
  }

  // If message doesn't match greetings, stock questions, or orders, default to acknowledgment
  return {
    text: isGroup
      ? `🙏 សូមអរគុណបង ${customerName}! ម្ចាស់ហាងនឹងពិនិត្យឆ្លើយតបជូនបងក្នុងពេលបន្តិចទៀតនេះ។`
      : `🙏 ជម្រាបសួរអតិថិជន ${customerName}! សូមអរគុណសម្រាប់ការទាក់ទងមកកាន់ «${store.name}»។ ម្ចាស់ហាងនឹងពិនិត្យឆ្លើយតបជូនបងក្នុងពេលបន្តិចទៀតនេះ។`,
    imageUrl: null,
    productImages: [],
  };
}

/**
 * Convenience wrapper returning string | null for backward compatibility.
 */
export async function generateAutoReply(options: AutoReplyOptions): Promise<string | null> {
  const result = await generateAutoReplyWithMedia(options);
  return result ? result.text : null;
}
