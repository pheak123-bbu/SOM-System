import { NextResponse } from "next/server";
import { SalesChannel } from "@prisma/client";
import { z } from "zod";
import { enqueueDetection } from "@/lib/ai/queue";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const simulatorSchema = z.object({
  customerId: z.string().min(1),
  channel: z.nativeEnum(SalesChannel),
  body: z.string().trim().min(1).max(10_000),
  senderType: z.enum(["CUSTOMER", "SELLER"]),
  externalConversationId: z.string().max(200).optional(),
  externalMessageId: z.string().max(200).optional(),
  sentAt: z.iso.datetime().optional(),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "កម្មវិធីសាកល្បងសារត្រូវបានបិទក្នុងបរិស្ថានផលិតកម្ម។" }, { status: 404 });
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });

  // Rate limit: max 30 simulated messages per minute per store
  const rateCheck = await checkRateLimit(`sim:${context.storeId}`, 30, 60);
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "សំណើសាកល្បងសារច្រើនពេកក្នុងពេលតែមួយ។ សូមរង់ចាំមួយភ្លែត។" },
      { status: 429 },
    );
  }
  const parsed = simulatorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានសារសាកល្បងមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id: parsed.data.customerId, storeId: context.storeId }, select: { id: true } });
      if (!customer) throw new Error("រកមិនឃើញអតិថិជនក្នុងហាងនេះទេ។");
      let conversation = parsed.data.externalConversationId
        ? await tx.conversation.findFirst({ where: { storeId: context.storeId, channel: parsed.data.channel, externalId: parsed.data.externalConversationId } })
        : null;
      if (!conversation) {
        conversation = await tx.conversation.create({
          data: { storeId: context.storeId, customerId: customer.id, channel: parsed.data.channel, externalId: parsed.data.externalConversationId ?? null },
        });
      }
      if (parsed.data.externalMessageId) {
        const existing = await tx.message.findFirst({ where: { conversationId: conversation.id, externalId: parsed.data.externalMessageId } });
        if (existing) return { conversationId: conversation.id, messageId: existing.id, duplicate: true, jobId: null };
      }
      const message = await tx.message.create({
        data: {
          conversationId: conversation.id,
          externalId: parsed.data.externalMessageId ?? null,
          senderName: parsed.data.senderType === "CUSTOMER" ? "អតិថិជន" : "អ្នកលក់",
          senderType: parsed.data.senderType,
          body: parsed.data.body,
          sentAt: parsed.data.sentAt ? new Date(parsed.data.sentAt) : new Date(),
        },
      });
      await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.sentAt } });
      const job = parsed.data.senderType === "CUSTOMER"
        ? await tx.detectionJob.create({ data: { storeId: context.storeId, conversationId: conversation.id, messageId: message.id, status: "QUEUED" } })
        : null;
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "SIMULATED_MESSAGE_RECEIVED", entity: "Message", entityId: message.id } });
      return { conversationId: conversation.id, messageId: message.id, duplicate: false, jobId: job?.id ?? null };
    });
    if (result.duplicate) return NextResponse.json(result, { status: 200 });
    if (result.jobId) {
      try { await enqueueDetection(result.jobId); }
      catch (error) {
        await db.detectionJob.update({ where: { id: result.jobId }, data: { status: "FAILED", failure: error instanceof Error ? error.message : "ការផ្សព្វផ្សាយជួររង់ចាំបរាជ័យ។" } });
        return NextResponse.json({ ...result, detectionQueued: false, warning: "សារត្រូវបានរក្សាទុក ប៉ុន្តែជួររង់ចាំ AI មិនអាចប្រើបានទេ។ សូមសាកល្បងរកឃើញម្ដងទៀត បន្ទាប់ពីស្ដារ Redis។" }, { status: 202 });
      }
    }
    return NextResponse.json({ ...result, detectionQueued: Boolean(result.jobId), simulated: true }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "រកមិនឃើញអតិថិជនក្នុងហាងនេះទេ។") return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Simulated message ingestion failed:", error);
    return NextResponse.json({ error: "មិនអាចរក្សាទុកសារសាកល្បងបានទេ។" }, { status: 500 });
  }
}
