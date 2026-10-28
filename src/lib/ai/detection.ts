import { DetectionJob, IntentClassification, OrderStatus, Prisma, SuggestionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { detectionOutputSchema, getDetectionProvider } from "@/lib/ai/provider";

const eligibleIntents = new Set<IntentClassification>([
  IntentClassification.ORDER_DETAILS_MISSING,
  IntentClassification.AWAITING_CUSTOMER_CONFIRMATION,
  IntentClassification.PURCHASE_INTENT,
  IntentClassification.PURCHASE_CONFIRMED,
]);

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export async function processDetectionJob(jobId: string) {
  const job = await db.detectionJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("មិនមានកំណត់ត្រាការងាររកឃើញនេះទៀតទេ។");
  await db.detectionJob.update({ where: { id: jobId }, data: { status: "PROCESSING", attempts: { increment: 1 }, failure: null } });
  try {
    const conversation = await db.conversation.findFirst({
      where: { id: job.conversationId, storeId: job.storeId },
      include: { messages: { orderBy: { sentAt: "desc" }, take: 40 }, customer: true },
    });
    if (!conversation) throw new Error("រកមិនឃើញការសន្ទនាក្នុងហាងនេះទេ។");
    const [products, existingOrders, approvedEvidence] = await Promise.all([
      db.product.findMany({ where: { storeId: job.storeId, active: true }, include: { variants: { where: { active: true } } }, take: 300 }),
      conversation.customerId
        ? db.order.findMany({ where: { storeId: job.storeId, customerId: conversation.customerId }, select: { orderNumber: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 })
        : Promise.resolve([]),
      db.suggestionEvidence?.findMany
        ? db.suggestionEvidence.findMany({
            where: {
              suggestion: {
                conversationId: job.conversationId,
                status: SuggestionStatus.APPROVED,
              },
            },
            select: { messageId: true },
          })
        : Promise.resolve([]),
    ]);

    const approvedMessageIds = new Set(approvedEvidence.map((e) => e.messageId));
    const targetMsg = (job.messageId ? conversation.messages.find((m) => m.id === job.messageId) : null) ?? conversation.messages[0];
    const targetTime = targetMsg ? new Date(targetMsg.sentAt).getTime() : Date.now();
    const sessionWindowMs = 6 * 60 * 60 * 1000; // 6 hours session window

    // Exclude messages already fulfilled in an approved order, and scope to recent conversational interaction
    let scopedMessages = conversation.messages.filter((m) => {
      if (approvedMessageIds.has(m.id)) return false;
      const msgTime = new Date(m.sentAt).getTime();
      return Math.abs(targetTime - msgTime) <= sessionWindowMs;
    });
    if (scopedMessages.length === 0 && targetMsg) {
      scopedMessages = [targetMsg];
    }

    const messages = [...scopedMessages].reverse();
    const provider = getDetectionProvider();
    const prompt = JSON.stringify({
      instructions: [
        "Return JSON matching these keys: intent, confidence (integer 0-100), items (productName, variantName or null, quantity), missingInformation, evidenceMessageIds, explanation, requiresSellerReview=true, relatedOrderReference or null.",
        "Only cite evidenceMessageIds that appear below. Match product and variant names only from the catalogue. Never invent prices or IDs.",
        "Distinguish PRODUCT_INTEREST, PURCHASE_INTENT, and PURCHASE_CONFIRMED. PURCHASE_CONFIRMED requires explicit customer confirmation in context. Questions, comparisons, and thanks are not purchase confirmations.",
        "Write explanation and missingInformation in Khmer. Preserve product and variant names exactly as written in the catalogue.",
      ],
      customerName: conversation.customer?.name ?? null,
      previousOrders: existingOrders,
      messages: messages.map(({ id, senderName, senderType, body, sentAt }) => ({ id, senderName, senderType, body, sentAt })),
      catalogue: products.map((product) => ({
        name: product.name,
        sku: product.sku,
        variants: product.variants.map((variant) => ({ name: variant.name, sku: variant.sku })),
      })),
    });
    const raw = await provider.analyze(prompt);
    const parsed = detectionOutputSchema.safeParse(raw);
    if (!parsed.success) throw new Error("លទ្ធផល AI មិនត្រូវនឹងទម្រង់ទិន្នន័យដែលបានទាមទារទេ។");
    const messageIds = new Set(messages.map((message) => message.id));
    const validEvidenceIds = parsed.data.evidenceMessageIds.filter((id) => messageIds.has(id));
    const finalEvidenceIds = validEvidenceIds.length > 0 ? validEvidenceIds : [messages[0]?.id].filter(Boolean) as string[];

    if (!eligibleIntents.has(parsed.data.intent)) {
      await db.detectionJob.update({ where: { id: jobId }, data: { status: "COMPLETED", provider: provider.name, model: provider.model, completedAt: new Date() } });
      return { suggestionId: null, intent: parsed.data.intent };
    }

    const missingInformation = new Set(parsed.data.missingInformation);
    const matchedItems = parsed.data.items.map((item) => {
      const product = products.find((entry) => normalize(entry.name) === normalize(item.productName));
      if (!product) {
        missingInformation.add(`មិនអាចផ្គូផ្គងផលិតផលបាន៖ ${item.productName}`);
        return { productId: null, variantId: null, productName: item.productName, variantName: item.variantName, quantity: item.quantity };
      }
      const variant = item.variantName
        ? product.variants.find((entry) => normalize(entry.name) === normalize(item.variantName!))
        : undefined;
      if (item.variantName && !variant) missingInformation.add(`សូមបញ្ជាក់ជម្រើស៖ ${item.variantName}`);
      if (!item.variantName && product.variants.length) missingInformation.add(`សូមជ្រើសរើសជម្រើសសម្រាប់ ${product.name}`);
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: product.name,
        variantName: variant?.name ?? item.variantName,
        quantity: item.quantity,
      };
    });
    // 1. Guard against duplicate orders if customer already has an active order in progress
    if (conversation.customerId) {
      const activeRecentOrder = await db.order.findFirst({
        where: {
          storeId: job.storeId,
          customerId: conversation.customerId,
          status: { in: [OrderStatus.DRAFT, OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.PROCESSING] },
          createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
      });

      if (activeRecentOrder) {
        const combinedText = messages.map((m) => m.body).join(" ").toLowerCase();
        const isShippingOrPaymentFollowUp = /(?:បងបានផ្ញើ|ផ្ញើនៅ|ផ្ញើរនៅ|ផ្ញើទំនិញ|ដល់ណា|ពេលណាដល់|ដឹកដល់ណា|បាញ់លុយ|ផ្ទេរប្រាក់|បង្កាន់ដៃ|នេះលុយ|បានបាញ់|បានផ្ទេរ|paid|slip|transfer)/i.test(combinedText);
        const wantsSeparateNewOrder = /(?:(?:ខ្ញុំ)?ចង់(?:កុម្ម៉ង់|កុម្មង់|កម្មង់|កម៉្មង់|ទិញ|យក)|(?:កុម្ម៉ង់|កុម្មង់|កម្មង់|កម៉្មង់|ទិញ|យក)(?:ថែម|ថ្មី)?|ថែមមួយទៀត|order\s*(?:more|new)?)/i.test(combinedText);

        if (isShippingOrPaymentFollowUp || (!wantsSeparateNewOrder && matchedItems.length === 0)) {
          // Follow-up or payment slip for an existing order in progress; prevent duplicate order suggestion
          await db.detectionJob.update({
            where: { id: jobId },
            data: { status: "COMPLETED", provider: provider.name, model: provider.model, completedAt: new Date() },
          });
          return { suggestionId: null, intent: parsed.data.intent, relatedOrderReference: activeRecentOrder.orderNumber };
        }
      }
    }

    // 2. Consolidate into existing PENDING suggestion if same customer/conversation already has one
    const pending = await db.orderSuggestion.findMany({
      where: { storeId: job.storeId, conversationId: conversation.id, status: SuggestionStatus.PENDING },
      include: { evidence: { select: { messageId: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const activePending = pending[0];
    if (activePending) {
      const updated = await db.$transaction(async (tx) => {
        // Merge evidence message IDs
        const existingEvidenceIds = new Set(activePending.evidence.map((e) => e.messageId));
        const newEvidenceIds = finalEvidenceIds.filter((id) => !existingEvidenceIds.has(id));
        if (newEvidenceIds.length > 0) {
          await tx.suggestionEvidence.createMany({
            data: newEvidenceIds.map((messageId) => ({
              suggestionId: activePending.id,
              messageId,
            })),
            skipDuplicates: true,
          });
        }

        // Intelligently merge items:
        const existingExtracted = activePending.extracted as { items?: any[]; relatedOrderReference?: string | null } | null;
        const existingItems = Array.isArray(existingExtracted?.items) ? existingExtracted.items : [];
        let mergedItems = matchedItems.length > 0 ? matchedItems : existingItems;
        if (matchedItems.length > 0 && existingItems.length > 0) {
          const itemMap = new Map<string, any>();
          for (const it of existingItems) {
            itemMap.set(`${it.productId || it.productName}:${it.variantId || it.variantName || ""}`, it);
          }
          for (const it of matchedItems) {
            itemMap.set(`${it.productId || it.productName}:${it.variantId || it.variantName || ""}`, it);
          }
          mergedItems = Array.from(itemMap.values());
        }

        // Determine intent progression:
        const intentRank: Record<string, number> = {
          PURCHASE_INTENT: 1,
          ORDER_DETAILS_MISSING: 2,
          AWAITING_CUSTOMER_CONFIRMATION: 3,
          PURCHASE_CONFIRMED: 4,
        };
        const currentRank = intentRank[activePending.intent] || 0;
        const newRank = intentRank[parsed.data.intent] || 0;
        const bestIntent = newRank >= currentRank ? parsed.data.intent : activePending.intent;

        const updatedRecord = await tx.orderSuggestion.update({
          where: { id: activePending.id },
          data: {
            intent: bestIntent,
            confidence: Math.max(activePending.confidence, parsed.data.confidence),
            extracted: {
              items: mergedItems,
              relatedOrderReference: parsed.data.relatedOrderReference || existingExtracted?.relatedOrderReference || null,
              requiresSellerReview: true,
              lastUpdatedByJobId: job.id,
            } as Prisma.InputJsonValue,
            missingInfo: [...missingInformation],
            explanation: parsed.data.explanation,
            provider: provider.name,
            model: provider.model,
          },
        });

        await tx.detectionJob.update({
          where: { id: jobId },
          data: { status: "COMPLETED", provider: provider.name, model: provider.model, completedAt: new Date() },
        });

        return updatedRecord;
      });

      return { suggestionId: updated.id, intent: updated.intent, consolidated: true };
    }

    // 3. Create fresh suggestion if no pending suggestion existed
    const suggestion = await db.$transaction(async (tx) => {
      const existingForJob = await tx.orderSuggestion.findFirst({ where: { jobId: job.id } });
      const created = existingForJob ?? await tx.orderSuggestion.create({
        data: {
          storeId: job.storeId,
          conversationId: conversation.id,
          jobId: job.id,
          status: SuggestionStatus.PENDING,
          intent: parsed.data.intent,
          confidence: parsed.data.confidence,
          extracted: {
            items: matchedItems,
            relatedOrderReference: parsed.data.relatedOrderReference,
            requiresSellerReview: true,
          } as Prisma.InputJsonValue,
          missingInfo: [...missingInformation],
          explanation: parsed.data.explanation,
          provider: provider.name,
          model: provider.model,
          evidence: { create: finalEvidenceIds.map((messageId) => ({ messageId })) },
        },
      });
      await tx.detectionJob.update({ where: { id: jobId }, data: { status: "COMPLETED", provider: provider.name, model: provider.model, completedAt: new Date() } });
      return created;
    });
    return { suggestionId: suggestion.id, intent: suggestion.intent };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ការរកឃើញបរាជ័យដោយមិនដឹងមូលហេតុ។";
    await db.detectionJob.update({ where: { id: jobId }, data: { status: "FAILED", failure: reason } });
    throw error;
  }
}

export function newDetectionJob(storeId: string, conversationId: string): Promise<DetectionJob> {
  return db.detectionJob.create({ data: { storeId, conversationId, status: "QUEUED" } });
}
