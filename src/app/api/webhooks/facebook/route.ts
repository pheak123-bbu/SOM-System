import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendFacebookPrivateReply, sendFacebookMessengerMessage } from "@/lib/facebook";
import { parseCfComment, processLiveCfComment } from "@/lib/live-cf/engine";
import { matchCatalogProducts } from "@/lib/ai/matcher";
import { generateAutoReplyWithMedia } from "@/lib/ai/auto-reply";
import { Prisma } from "@prisma/client";

const DEFAULT_VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "social_seller_fb_secret";

/**
 * GET: Webhook verification endpoint required by Meta Developer Dashboard.
 * When you enter the Webhook URL in Meta, Meta sends a GET request with:
 * - hub.mode = "subscribe"
 * - hub.verify_token = your verify token
 * - hub.challenge = a random challenge string
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe") {
    // Check if token matches default or any store's configured verifyToken
    const fbConn = await db.channelConnection.findFirst({
      where: { channel: "FACEBOOK" },
    });
    const configuredToken = (fbConn?.metadata as any)?.verifyToken || DEFAULT_VERIFY_TOKEN;

    if (token === configuredToken || token === DEFAULT_VERIFY_TOKEN) {
      console.log("Facebook Webhook verified successfully!");
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
  }

  return NextResponse.json({ error: "Verification token mismatch" }, { status: 403 });
}

/**
 * POST: Handles incoming real-time events from Meta:
 * 1. Feed / Live Comments (field: "feed") -> Detects CF / Product -> Sends Private Reply to Messenger!
 * 2. Messenger messages ("messaging") -> Auto-detects order details & replies.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.object !== "page") {
      return NextResponse.json({ status: "ignored", reason: "not_a_page_object" }, { status: 200 });
    }

    // Load active Facebook Connection
    const fbConn = await db.channelConnection.findFirst({
      where: { channel: "FACEBOOK", status: "CONNECTED" },
    });

    const meta = (fbConn?.metadata as any) || {};
    const pageAccessToken = meta.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN || "";
    const pageId = meta.pageId || process.env.FB_PAGE_ID || "";
    const storeId = fbConn?.storeId || (await db.store.findFirst({ select: { id: true } }))?.id;

    if (!storeId) {
      return NextResponse.json({ error: "No active store found" }, { status: 200 });
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      // 1. Process Feed / Live Stream comments
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field === "feed") {
          const val = change.value;
          if (val && val.item === "comment" && val.verb !== "remove") {
            await handleFacebookComment({
              storeId,
              pageAccessToken,
              pageId,
              commentId: val.comment_id,
              postId: val.post_id,
              from: val.from || { id: "unknown", name: "Facebook User" },
              messageText: val.message || "",
            });
          }
        }
      }

      // 2. Process Messenger 1-on-1 messages
      const messagings = entry.messaging || [];
      for (const msgEvent of messagings) {
        if (msgEvent.message && !msgEvent.message.is_echo && msgEvent.message.text) {
          await handleFacebookMessengerMessage({
            storeId,
            pageAccessToken,
            pageId,
            senderId: msgEvent.sender?.id,
            text: msgEvent.message.text,
          });
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("Facebook webhook processing error:", error);
    return NextResponse.json({ error: "Internal processing error" }, { status: 200 });
  }
}

/**
 * Handles incoming comments on Facebook posts or Live Streams.
 * Detects CF codes, registers customer/order, and sends Private Reply to customer's Messenger.
 */
async function handleFacebookComment(input: {
  storeId: string;
  pageAccessToken: string;
  pageId: string;
  commentId: string;
  postId?: string;
  from: { id: string; name: string };
  messageText: string;
}) {
  const { storeId, pageAccessToken, pageId, commentId, from, messageText } = input;

  // Do not reply to comments made by the Page itself
  if (from.id === pageId) return;

  const trimmed = messageText.trim();
  if (!trimmed) return;

  // 1. Check if there is an active Live Session in this store
  const activeSession = await db.liveSession.findFirst({
    where: { storeId, status: "ACTIVE" },
  });

  if (activeSession) {
    // Process through the Cambodian Live CF Engine
    const cfResult = await processLiveCfComment({
      sessionId: activeSession.id,
      storeId,
      customerName: from.name,
      senderId: from.id,
      commentId,
      commentText: trimmed,
    });

    if (cfResult.success && cfResult.orderId) {
      return;
    }
  }

  // 2. If not live CF, parse as general catalog purchase or product inquiry
  const products = await db.product.findMany({
    where: { storeId, active: true },
    include: { variants: true },
  });

  const parsedCf = parseCfComment(trimmed);
  const matched = matchCatalogProducts(
    trimmed,
    products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku || "",
      category: p.category || "",
      variants: p.variants.map((v) => ({ name: v.name, sku: v.sku || "" })),
    }))
  );

  if (matched.length > 0 || parsedCf.cfCode) {
    // Upsert Customer
    let customer = await db.customer.findFirst({
      where: { storeId, OR: [{ facebookId: from.id }, { name: from.name }] },
    });

    if (!customer) {
      customer = await db.customer.create({
        data: {
          storeId,
          name: from.name,
          facebookId: from.id,
          phone: parsedCf.phone || null,
          preferredChannel: "FACEBOOK",
        },
      });
    }

    // Upsert Conversation
    let conversation = await db.conversation.findUnique({
      where: {
        storeId_channel_externalId: {
          storeId,
          channel: "FACEBOOK",
          externalId: from.id,
        },
      },
    });

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          storeId,
          channel: "FACEBOOK",
          externalId: from.id,
          customerId: customer.id,
          lastMessageAt: new Date(),
        },
      });
    }

    // Save Message
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderName: from.name,
        senderType: "CUSTOMER",
        body: trimmed,
        sentAt: new Date(),
      },
    });

    // Create Order Suggestion for Seller Review
    const items = matched.map((m) => ({
      productId: m.id,
      productName: m.name,
      quantity: parsedCf.quantity || 1,
    }));

    await db.orderSuggestion.create({
      data: {
        storeId,
        conversationId: conversation.id,
        status: "PENDING",
        intent: "PURCHASE_INTENT",
        confidence: 88,
        explanation: `អតិថិជនបានខមិនលើ Facebook: «${trimmed}»`,
        extracted: {
          items: items.length > 0 ? items : [{ productName: parsedCf.cfCode || "ទំនិញកម្មង់", quantity: parsedCf.quantity }],
        } as Prisma.InputJsonValue,
      },
    });

    // Send confirmation to Messenger!
    if (pageAccessToken) {
      const replyText =
        `ជម្រាបសួរ ${from.name}! 👋 ខ្ញុំបានកត់ត្រាសំណើរបស់លោកអ្នករួចហើយ។\n` +
        `តើលោកអ្នកចង់កម្មង់ដឹកជញ្ជូនទៅកាន់ទីតាំងណាដែរ (ភ្នំពេញ ឬតាមខេត្ត)? សូមផ្ញើលេខទូរស័ព្ទមកទីនេះដើម្បីឱ្យខាងប្អូនបញ្ជាក់ការកម្មង់ជូន!`;

      await sendFacebookPrivateReply(pageAccessToken, commentId, replyText);
    }
  }
}

/**
 * Handles incoming Messenger chats.
 */
async function handleFacebookMessengerMessage(input: {
  storeId: string;
  pageAccessToken: string;
  pageId: string;
  senderId?: string;
  text: string;
}) {
  const { storeId, pageAccessToken, pageId, senderId, text } = input;
  if (!senderId || senderId === pageId) return;

  // Resolve customer & conversation
  let customer = await db.customer.findFirst({
    where: { storeId, facebookId: senderId },
  });

  if (!customer) {
    customer = await db.customer.create({
      data: {
        storeId,
        name: `FB User ${senderId.slice(-4)}`,
        facebookId: senderId,
        preferredChannel: "FACEBOOK",
      },
    });
  }

  let conversation = await db.conversation.findUnique({
    where: {
      storeId_channel_externalId: {
        storeId,
        channel: "FACEBOOK",
        externalId: senderId,
      },
    },
  });

  if (!conversation) {
    conversation = await db.conversation.create({
      data: {
        storeId,
        channel: "FACEBOOK",
        externalId: senderId,
        customerId: customer.id,
        lastMessageAt: new Date(),
      },
    });
  }

  await db.message.create({
    data: {
      conversationId: conversation.id,
      senderName: customer.name,
      senderType: "CUSTOMER",
      body: text,
      sentAt: new Date(),
    },
  });

  // Run AI Auto-Reply if enabled
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, phone: true, address: true, exchangeRate: true, bakongAccountId: true },
  });

  const reply = await generateAutoReplyWithMedia({
    customerName: customer.name,
    messageText: text,
    store: store
      ? {
          id: store.id,
          name: store.name,
          phone: store.phone,
          address: store.address,
          exchangeRate: store.exchangeRate ? Number(store.exchangeRate) : null,
          bakongAccountId: store.bakongAccountId,
        }
      : { id: storeId, name: "ហាងយើងខ្ញុំ" },
  });

  if (reply && reply.text && pageAccessToken) {
    await sendFacebookMessengerMessage(pageAccessToken, senderId, reply.text);

    // Save seller reply to conversation
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderName: "ហាង (AI Bot)",
        senderType: "SELLER",
        body: reply.text,
        sentAt: new Date(),
      },
    });
  }
}
