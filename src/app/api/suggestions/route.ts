import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const extractedSchema = z.object({
  items: z.array(z.object({
    productId: z.string().nullable(),
    variantId: z.string().nullable(),
    productName: z.string(),
    variantName: z.string().nullable(),
    quantity: z.number().int(),
  })).default([]),
});

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });

  try {
    const rawSuggestions = await db.orderSuggestion.findMany({
      where: { storeId: context.storeId },
      include: {
        conversation: {
          include: {
            customer: true,
            messages: { orderBy: { sentAt: "desc" }, take: 4 },
          },
        },
        order: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const suggestions = rawSuggestions.map((item) => {
      const parsed = extractedSchema.safeParse(item.extracted);
      return {
        id: item.id,
        status: item.status,
        intent: item.intent,
        confidence: item.confidence,
        explanation: item.explanation,
        missingInfo: item.missingInfo,
        createdAt: item.createdAt.toISOString(),
        customer: item.conversation.customer?.name ?? "អតិថិជនមិនស្គាល់",
        customerId: item.conversation.customer?.id ?? null,
        channel: item.conversation.channel,
        conversationId: item.conversationId,
        orderId: item.orderId ?? null,
        order: item.order
          ? {
              id: item.order.id,
              orderNumber: item.order.orderNumber,
              status: item.order.status,
              total: Number(item.order.total),
              createdAt: item.order.createdAt.toISOString(),
            }
          : null,
        items: parsed.success ? parsed.data.items : [],
        messages: item.conversation.messages.map((m) => ({
          body: m.body.replace(/🖼️\s*រូបភាព[៖:]\s*data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").replace(/data:image\/[a-zA-Z0-9+/=;,-]+/gi, "").trim(),
          sender: m.senderName ?? (m.senderType === "SELLER" ? "អ្នកលក់" : "អតិថិជន"),
          at: m.sentAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Suggestions fetch error:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកសំណើ AI បានទេ។" }, { status: 500 });
  }
}
