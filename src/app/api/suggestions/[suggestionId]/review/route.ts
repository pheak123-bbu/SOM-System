import { NextResponse } from "next/server";
import { OrderStatus, SuggestionStatus } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrderInTransaction, OrderRuleError } from "@/lib/orders";

const reviewSchema = z.object({
  decision: z.enum(["APPROVE_AS_DRAFT", "APPROVE_AND_CONFIRM", "NOT_AN_ORDER", "DUPLICATE", "DISMISSED"]),
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().optional(), quantity: z.number().int() })).min(1).max(50).optional(),
  discount: z.number().nonnegative().max(10_000_000).default(0),
  deliveryFee: z.number().nonnegative().max(10_000_000).default(0),
  deliveryAddress: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ suggestionId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានពិនិត្យសំណើមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const isApproving = parsed.data.decision === "APPROVE_AS_DRAFT" || parsed.data.decision === "APPROVE_AND_CONFIRM";
  if (isApproving && !parsed.data.items) {
    return NextResponse.json({ error: "សូមជ្រើសរើស និងបញ្ជាក់មុខទំនិញក្នុងបញ្ជី មុនពេលបង្កើតការបញ្ជាទិញ។" }, { status: 400 });
  }
  const { suggestionId } = await params;
  try {
    const result = await db.$transaction(async (tx) => {
      const suggestion = await tx.orderSuggestion.findFirst({
        where: { id: suggestionId, storeId: context.storeId },
        include: { conversation: { select: { customerId: true, channel: true } }, order: true },
      });
      if (!suggestion) return { notFound: true as const };
      if (suggestion.status !== SuggestionStatus.PENDING) {
        return { alreadyReviewed: true as const, order: suggestion.order };
      }

      let orderId: string | undefined;
      let orderNumber: string | undefined;
      if (isApproving) {
        if (!suggestion.conversation.customerId) throw new OrderRuleError("សូមភ្ជាប់អតិថិជនទៅការសន្ទនានេះ មុនពេលបង្កើតការបញ្ជាទិញ។");
        const targetStatus = parsed.data.decision === "APPROVE_AND_CONFIRM" ? OrderStatus.CONFIRMED : OrderStatus.DRAFT;
        const order = await createOrderInTransaction(tx, {
          storeId: context.storeId,
          customerId: suggestion.conversation.customerId,
          channel: suggestion.conversation.channel,
          status: targetStatus,
          userId: context.userId,
          idempotencyKey: `suggestion-${suggestion.id}`,
          discount: parsed.data.discount,
          deliveryFee: parsed.data.deliveryFee,
          deliveryAddress: parsed.data.deliveryAddress,
          notes: parsed.data.notes,
          items: parsed.data.items!,
        });
        orderId = order.id;
        orderNumber = order.orderNumber;

        // Auto-resolve any remaining pending suggestions for this conversation to prevent duplicate orders
        await tx.orderSuggestion.updateMany({
          where: {
            conversationId: suggestion.conversationId,
            status: SuggestionStatus.PENDING,
            id: { not: suggestionId },
          },
          data: {
            status: SuggestionStatus.DUPLICATE,
            reviewedAt: new Date(),
          },
        });
      }
      const status = isApproving ? SuggestionStatus.APPROVED
        : parsed.data.decision === "NOT_AN_ORDER" ? SuggestionStatus.NOT_AN_ORDER
        : parsed.data.decision === "DUPLICATE" ? SuggestionStatus.DUPLICATE
        : SuggestionStatus.DISMISSED;
      const claimed = await tx.orderSuggestion.updateMany({
        where: { id: suggestionId, storeId: context.storeId, status: SuggestionStatus.PENDING, orderId: null },
        data: { status, orderId, reviewedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("សំណើនេះត្រូវបានពិនិត្យរួចហើយ។ សូមផ្ទុកទំព័រឡើងវិញ ដើម្បីមើលស្ថានភាពបច្ចុប្បន្ន។");
      await tx.detectionReview.create({
        data: { suggestionId, reviewerId: context.userId, decision: parsed.data.decision },
      });
      await tx.auditLog.create({
        data: { storeId: context.storeId, userId: context.userId, action: "SUGGESTION_REVIEWED", entity: "OrderSuggestion", entityId: suggestionId, metadata: { decision: parsed.data.decision, orderId, orderNumber } },
      });
      return { status, orderId, orderNumber };
    });
    if ("notFound" in result) return NextResponse.json({ error: "រកមិនឃើញសំណើទេ។" }, { status: 404 });
    if ("alreadyReviewed" in result) return NextResponse.json({ error: "សំណើនេះត្រូវបានពិនិត្យរួចហើយ។", order: result.order }, { status: 409 });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof OrderRuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("សំណើនេះត្រូវបានពិនិត្យរួចហើយ។")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Suggestion review failed:", error);
    return NextResponse.json({ error: "មិនអាចរក្សាទុកការពិនិត្យសំណើបានទេ។" }, { status: 500 });
  }
}
