import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { SalesChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { processDetectionJob } from "@/lib/ai/detection";
import { enqueueDetection } from "@/lib/ai/queue";
import { generateAutoReplyWithMedia } from "@/lib/ai/auto-reply";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { callTelegramApi } from "@/lib/telegram";

export interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot?: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
      title?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    date: number;
    text?: string;
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "active",
    channel: "TELEGRAM",
    service: "SOM Telegram Bot AI Webhook",
    message: "Ready to receive Telegram updates and detect orders automatically.",
  });
}

export async function processTelegramUpdate(body: TelegramUpdate) {
  const telegramMessage = body.message;
  if (!telegramMessage || !telegramMessage.text || typeof telegramMessage.text !== "string") {
    // Non-text updates (e.g. photo, sticker, join) acknowledged without error
    return { ok: true, ignored: true, reason: "No text content" };
  }

  // Ignore messages from other bots or our own bot to prevent message loops in groups
  if (telegramMessage.from?.is_bot) {
    return { ok: true, ignored: true, reason: "Message from bot" };
  }

  const messageText = telegramMessage.text.trim();
  if (!messageText) {
    return { ok: true, ignored: true };
  }

  const chatType = telegramMessage.chat.type || "private";
  const isGroup = chatType === "group" || chatType === "supergroup";
  const groupTitle = telegramMessage.chat.title;
  const from = telegramMessage.from || telegramMessage.chat;
  const telegramChatId = String(telegramMessage.chat.id);
  const senderId = from.id ? String(from.id) : telegramChatId;
  const telegramUsername = from.username ? from.username.replace(/^@/, "") : null;
  const customerName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
    (telegramUsername ? `@${telegramUsername}` : `Telegram User ${senderId}`);

  // Unique conversation externalId: in groups, keep conversation scoped per customer so order detection attributes to the right buyer
  const conversationExternalId = isGroup ? `${telegramChatId}:${senderId}` : telegramChatId;

  // Extract Cambodian phone number if mentioned in the message text
  const phonePattern = /(?:(?:\+?855)|0)[1-9]\d{1,2}[-.\s]?\d{3}[-.\s]?\d{3,4}/;
  const phoneMatch = messageText.match(phonePattern);
  const detectedPhone = phoneMatch ? phoneMatch[0].replace(/[-.\s]/g, "") : null;

  // Determine default store
  const store = await db.store.findFirst({
    select: { id: true, name: true, phone: true, address: true, exchangeRate: true, bakongAccountId: true },
  });
  if (!store) {
    return { error: "មិនមានហាងក្នុងប្រព័ន្ធទេ", ok: false };
  }

  const result = await db.$transaction(async (tx) => {
    // 1. Find or create Customer with strict identity resolution:
    let customer: any = null;

    // Priority A: Existing conversation with this exact Telegram sender
    const existingConv = await tx.conversation.findFirst({
      where: { storeId: store.id, channel: SalesChannel.TELEGRAM, externalId: conversationExternalId },
      include: { customer: true },
    });
    if (existingConv?.customer) {
      customer = existingConv.customer;
    }

    // Priority B: Match by telegramUsername if available
    if (!customer && telegramUsername) {
      customer = await tx.customer.findFirst({
        where: { storeId: store.id, telegramUsername },
      });
    }

    // Priority C: Match by exact Customer Name (e.g. "Phay veasnapheak")
    if (!customer && customerName && !customerName.startsWith("Telegram User ")) {
      customer = await tx.customer.findFirst({
        where: { storeId: store.id, name: { equals: customerName, mode: "insensitive" } },
      });
    }

    // Priority D: Match by detected phone ONLY IF the existing customer has matching or placeholder name
    if (!customer && detectedPhone) {
      const phoneMatchCustomer = await tx.customer.findFirst({
        where: { storeId: store.id, phone: detectedPhone },
      });
      if (phoneMatchCustomer) {
        const existingName = phoneMatchCustomer.name.toLowerCase().trim();
        const senderNameLower = customerName.toLowerCase().trim();
        if (
          existingName === senderNameLower ||
          existingName.includes(senderNameLower) ||
          senderNameLower.includes(existingName) ||
          phoneMatchCustomer.name.startsWith("Telegram User")
        ) {
          customer = phoneMatchCustomer;
        }
      }
    }

    if (!customer) {
      customer = await tx.customer.create({
        data: {
          storeId: store.id,
          name: customerName,
          phone: detectedPhone,
          telegramUsername,
          preferredChannel: SalesChannel.TELEGRAM,
        },
      });
    } else {
      // Update customer details if we discovered a new phone or username
      const updates: Record<string, string> = {};
      if (!customer.telegramUsername && telegramUsername) updates.telegramUsername = telegramUsername;
      if (!customer.phone && detectedPhone) updates.phone = detectedPhone;
      // Keep name up-to-date if it was previously a generic placeholder
      if (customer.name.startsWith("Telegram User") && customerName && !customerName.startsWith("Telegram User")) {
        updates.name = customerName;
      }
      if (Object.keys(updates).length > 0) {
        customer = await tx.customer.update({
          where: { id: customer.id },
          data: updates,
        });
      }
    }

    // 2. Find or create Conversation
    let conversation = await tx.conversation.findFirst({
      where: { storeId: store.id, channel: SalesChannel.TELEGRAM, externalId: conversationExternalId },
    });

    const messageDate = telegramMessage.date ? new Date(telegramMessage.date * 1000) : new Date();

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          channel: SalesChannel.TELEGRAM,
          externalId: conversationExternalId,
          lastMessageAt: messageDate,
        },
      });
    } else {
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: messageDate, customerId: customer.id },
      });
    }

    // 3. Idempotency guard: check if message was already ingested
    const existingMessage = await tx.message.findFirst({
      where: { conversationId: conversation.id, externalId: String(telegramMessage.message_id) },
    });
    if (existingMessage) {
      return { duplicate: true as const, conversationId: conversation.id, messageId: existingMessage.id };
    }

    // Create Message record
    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        externalId: String(telegramMessage.message_id),
        senderName: isGroup && groupTitle ? `${customerName} [${groupTitle}]` : customerName,
        senderType: "CUSTOMER",
        body: messageText,
        sentAt: messageDate,
      },
    });

    // 4. Create AI Detection Job
    const job = await tx.detectionJob.create({
      data: {
        storeId: store.id,
        conversationId: conversation.id,
        messageId: message.id,
        status: "QUEUED",
      },
    });

    return {
      storeId: store.id,
      customerId: customer.id,
      customerName: customer.name,
      conversationId: conversation.id,
      messageId: message.id,
      jobId: job.id,
    };
  });

  if ("duplicate" in result && result.duplicate) {
    return { ok: true, duplicate: true, messageId: result.messageId };
  }

  // 5. Process Detection immediately
  let detectionOutcome: unknown = null;
  try {
    detectionOutcome = await processDetectionJob(result.jobId);
  } catch (detectErr) {
    console.warn("Direct detection warning; attempting enqueue:", detectErr);
    try {
      await enqueueDetection(result.jobId);
    } catch (queueErr) {
      await db.detectionJob.update({
        where: { id: result.jobId },
        data: {
          status: "FAILED",
          failure: detectErr instanceof Error ? detectErr.message : "AI Detection failed",
        },
      });
    }
  }

  // 6. Fetch Channel Connection for Bot Token and Auto-Reply settings
  const connection = await db.channelConnection.findUnique({
    where: { storeId_channel: { storeId: store.id, channel: SalesChannel.TELEGRAM } },
  });
  const connectionMeta = (connection?.metadata as Record<string, any>) || {};
  const botToken = connectionMeta.botToken || process.env.TELEGRAM_BOT_TOKEN;

  // 7. Generate intelligent real-time auto-reply (Stock check, Price check, Order Draft notice)
  let replyText: string | null = null;
  let replyImageUrl: string | null = null;
  try {
    const [suggestionRecord, lastBotMessage] = await Promise.all([
      db.orderSuggestion.findFirst({
        where: { jobId: result.jobId },
        select: { intent: true, confidence: true, extracted: true, missingInfo: true, explanation: true },
      }),
      db.message.findFirst({
        where: { conversationId: result.conversationId, senderType: "SELLER" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

    const extractedItems = (suggestionRecord?.extracted as any)?.items;

    const autoReplyResult = await generateAutoReplyWithMedia({
      customerName: result.customerName,
      messageText,
      isGroup,
      store: {
        id: store.id,
        name: store.name,
        phone: store.phone,
        address: store.address,
        exchangeRate: store.exchangeRate,
        bakongAccountId: store.bakongAccountId,
      },
      detection: suggestionRecord ? {
        intent: suggestionRecord.intent,
        confidence: suggestionRecord.confidence,
        explanation: suggestionRecord.explanation,
        items: Array.isArray(extractedItems) ? extractedItems : [],
      } : null,
      detectedPhone,
      recentBotReplyAt: lastBotMessage?.sentAt ? new Date(lastBotMessage.sentAt) : null,
      settings: {
        autoReplyEnabled: connectionMeta.autoReplyEnabled ?? true,
        autoReplyStockCheck: connectionMeta.autoReplyStockCheck ?? true,
        autoReplyOrderNotice: connectionMeta.autoReplyOrderNotice ?? true,
        aiProvider: connectionMeta.aiProvider || process.env.AI_PROVIDER,
        aiApiKey: connectionMeta.aiApiKey,
        aiModel: connectionMeta.aiModel || process.env.AI_MODEL,
      },
    });

    if (autoReplyResult?.text) {
      replyText = autoReplyResult.text;
      replyImageUrl = autoReplyResult.imageUrl || null;
    }
  } catch (err) {
    console.error("Auto-reply generation error in Telegram update:", err);
  }

  // 8. If auto-reply was generated and botToken is available, send to Telegram chat
  if (replyText && botToken) {
    try {
      let sentPhotoOk = false;
      const isPublicHttpImage = replyImageUrl && /^https?:\/\//i.test(replyImageUrl);
      if (isPublicHttpImage) {
        try {
          const photoRes = await callTelegramApi(botToken, "sendPhoto", {
            chat_id: telegramChatId,
            reply_to_message_id: telegramMessage.message_id,
            photo: replyImageUrl,
            caption: replyText.slice(0, 1024),
          }, 8000);
          if (photoRes?.ok) {
            sentPhotoOk = true;
          }
        } catch (photoErr) {
          console.warn("Telegram sendPhoto failed, falling back to sendMessage:", photoErr);
        }
      }

      if (!sentPhotoOk) {
        let sendRes = await callTelegramApi(botToken, "sendMessage", {
          chat_id: telegramChatId,
          reply_to_message_id: telegramMessage.message_id,
          text: replyText,
        }, 8000);

        // If Telegram rejected due to message_to_be_replied_not_found, retry without reply_to_message_id
        if (!sendRes?.ok && (sendRes?.description?.includes("replied") || sendRes?.description?.includes("reply"))) {
          sendRes = await callTelegramApi(botToken, "sendMessage", {
            chat_id: telegramChatId,
            text: replyText,
          }, 8000);
        }
      }

      // Store bot reply in database conversation
      await db.message.create({
        data: {
          conversationId: result.conversationId,
          externalId: `reply-${telegramMessage.message_id}-${Date.now()}`,
          senderName: `${store.name} (AI Bot)`,
          senderType: "SELLER",
          body: replyText,
          sentAt: new Date(),
        },
      });
    } catch (e) {
      console.error("Telegram reply or message record failed:", e);
    }
  }

  return {
    ok: true,
    channel: "TELEGRAM",
    customer: result.customerName,
    messageId: result.messageId,
    jobId: result.jobId,
    detection: detectionOutcome,
    replied: Boolean(replyText),
  };
}

export const maxDuration = 30; // Serverless execution duration limit (Vercel)

export async function POST(request: Request) {
  // 1. Webhook Secret Token Verification (Defense against payload forgery & unauthorized calls)
  const incomingSecret = request.headers.get("x-telegram-bot-api-secret-token");
  let expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!expectedSecret) {
    const connection = await db.channelConnection.findFirst({
      where: { channel: SalesChannel.TELEGRAM, status: "CONNECTED" },
      select: { metadata: true },
    });
    expectedSecret = (connection?.metadata as any)?.webhookSecret;
  }

  if (expectedSecret) {
    const isMatch =
      Boolean(incomingSecret) &&
      incomingSecret!.length === expectedSecret.length &&
      crypto.timingSafeEqual(Buffer.from(incomingSecret!), Buffer.from(expectedSecret));

    if (!isMatch) {
      console.warn("[Security Alert] Unauthorized Telegram webhook attempt: secret token mismatch or missing header.");
      return NextResponse.json({ error: "Unauthorized: Invalid secret token" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      "[Security Warning] Telegram webhook is operating without a secret token. Set TELEGRAM_WEBHOOK_SECRET or re-save connection in Telegram settings."
    );
  }

  // 2. DDoS & Flooding Protection: max 60 webhook updates per IP per minute
  const clientIp = getClientIp(request);
  const rateCheck = await checkRateLimit(`webhook:telegram:${clientIp}`, 60, 60);
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "Too many webhook requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  let body: TelegramUpdate;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const outcome = await processTelegramUpdate(body);
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("Telegram webhook ingestion failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process Telegram update" },
      { status: 500 },
    );
  }
}
