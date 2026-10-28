import { Prisma, StockMovementType } from "@prisma/client";
import { db } from "@/lib/db";
import { recordStockMovementInTx } from "@/lib/inventory";
import { recordAudit } from "@/lib/audit";
import { sendFacebookPrivateReply, sendFacebookMessengerMessage } from "@/lib/facebook";

export interface ParsedCfComment {
  rawText: string;
  cfCode: string | null;
  quantity: number;
  phone: string | null;
  note: string | null;
}

const KHMER_DIGIT_MAP: Record<string, string> = {
  "០": "0", "១": "1", "២": "2", "៣": "3", "៤": "4",
  "៥": "5", "៦": "6", "៧": "7", "៨": "8", "៩": "9",
};

const KHMER_WORD_NUMBERS: Record<string, number> = {
  "មួយ": 1, "ពីរ": 2, "បី": 3, "បួន": 4, "ប្រាំ": 5,
  "ប្រាំមួយ": 6, "ប្រាំពីរ": 7, "ប្រាំបី": 8, "ប្រាំបួន": 9, "ដប់": 10,
};

/**
 * Normalizes Khmer digits and numbers to Arabic digits.
 */
export function normalizeKhmerDigits(text: string): string {
  return text.replace(/[០-៩]/g, (ch) => KHMER_DIGIT_MAP[ch] || ch);
}

/**
 * Parses a Facebook Live comment into CF code, quantity, and optional phone/note.
 * Handles patterns such as:
 * - "R445 1", "R445 2", "123 1", "A65 x2"
 * - "CF R445", "CF 123 2", "cf a65"
 * - "យក R445 មួយ", "យក 123 2", "ទិញ A65 1"
 * - "កូដ R445 ចំនួន 2 012345678"
 * - "R445 012345678 ភ្នំពេញ"
 */
export function parseCfComment(text: string): ParsedCfComment {
  const original = (text || "").trim();
  if (!original) {
    return { rawText: original, cfCode: null, quantity: 1, phone: null, note: null };
  }

  // 1. Convert Khmer digits to Arabic digits
  let normalized = normalizeKhmerDigits(original);

  // 2. Extract Cambodian phone number if present (0 followed by 8-9 digits)
  let phone: string | null = null;
  const phoneMatch = normalized.match(/(?:(?:\+855|855)|0)[1-9]\d{7,8}/);
  if (phoneMatch) {
    phone = phoneMatch[0];
    normalized = normalized.replace(phone, " ");
  }

  // 3. Remove leading prefix keywords
  // e.g. "CF", "Code", "កូដ", "យក", "ទិញ", "សុំ", "ដាក់", "order", "want"
  normalized = normalized.replace(/^(?:CF|cf|Cf|code|Code|កូដ|យក|ទិញ|សុំ|ដាក់|order|want)\s*[:=\-]?\s*/i, "");

  // 4. Check for word quantity like "មួយ", "ពីរ", "ចំនួន 2"
  let quantity = 1;
  for (const [khmerWord, numVal] of Object.entries(KHMER_WORD_NUMBERS)) {
    if (normalized.includes(khmerWord)) {
      quantity = numVal;
      normalized = normalized.replace(khmerWord, " ");
      break;
    }
  }

  // Check for "ចំនួន X" or "qty X"
  const qtyPrefixMatch = normalized.match(/(?:ចំនួន|qty|x|X)\s*(\d+)/);
  if (qtyPrefixMatch) {
    quantity = Math.max(1, parseInt(qtyPrefixMatch[1], 10));
    normalized = normalized.replace(qtyPrefixMatch[0], " ");
  }

  // 5. Tokens extraction
  const tokens = normalized.trim().split(/\s+/).filter(Boolean);

  let cfCode: string | null = null;
  const remainingTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // If we haven't found a code yet
    if (!cfCode) {
      // Check if token contains code and quantity together like "R445x2" or "123-2"
      const codeQtyJoined = token.match(/^([a-zA-Z0-9_\-]+)[xX*](\d+)$/);
      if (codeQtyJoined) {
        cfCode = codeQtyJoined[1].toUpperCase();
        quantity = Math.max(1, parseInt(codeQtyJoined[2], 10));
        continue;
      }

      // Check if token is a valid CF code (alphanumeric, at least 2 chars, or 123)
      if (/^[a-zA-Z0-9_\-]{2,20}$/.test(token)) {
        cfCode = token.toUpperCase();
        // Check if the next token is an explicit number quantity
        if (i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
          quantity = Math.max(1, parseInt(tokens[i + 1], 10));
          i++; // skip next token
        }
        continue;
      }
    }

    remainingTokens.push(token);
  }

  const note = remainingTokens.length > 0 ? remainingTokens.join(" ") : null;

  return {
    rawText: original,
    cfCode,
    quantity,
    phone,
    note,
  };
}

export interface ProcessCfInput {
  storeId: string;
  sessionId: string;
  customerName: string;
  customerId?: string;
  senderId?: string; // Facebook sender ID / profile
  commentId?: string; // Facebook comment ID for private reply
  commentText: string;
}

export interface ProcessCfResult {
  success: boolean;
  reason?: "NO_CODE_DETECTED" | "PRODUCT_NOT_FOUND" | "OUT_OF_STOCK" | "SESSION_INACTIVE" | "ERROR";
  orderId?: string;
  orderNumber?: string;
  code?: string;
  productName?: string;
  imageUrl?: string | null;
  price?: number;
  quantity?: number;
  total?: number;
  remainingStock?: number;
  customer?: { id: string; name: string; phone?: string | null };
  conversationId?: string;
  messengerConfirmation?: string;
  messengerSent?: boolean;
  realMessengerDispatched?: boolean;
  message: string;
}

/**
 * Transactionally processes a live comment:
 * 1. Matches CF code to active LiveSessionProduct
 * 2. Checks and deducts remaining live stock
 * 3. Records stock movement in inventory
 * 4. Creates a customer order
 * 5. Returns a structured result with formatted Khmer auto-reply message
 */
export async function processLiveCfComment(
  input: ProcessCfInput,
  externalTx?: Prisma.TransactionClient
): Promise<ProcessCfResult> {
  const parsed = parseCfComment(input.commentText);

  if (!parsed.cfCode) {
    return {
      success: false,
      reason: "NO_CODE_DETECTED",
      message: "មិនមានកូដទំនិញក្នុងមតិយោបល់ (Comment) ទេ។ (ឧទាហរណ៍: R445 1, A65 2, 123)",
    };
  }

  const runWithTx = async (tx: Prisma.TransactionClient): Promise<ProcessCfResult> => {
    // 1. Verify Session
    const session = await tx.liveSession.findFirst({
      where: { id: input.sessionId, storeId: input.storeId },
      select: { id: true, title: true, status: true },
    });

    if (!session || session.status === "ENDED") {
      return {
        success: false,
        reason: "SESSION_INACTIVE" as const,
        code: parsed.cfCode!,
        message: "ការផ្សាយផ្ទាល់ (Live) នេះត្រូវបានបញ្ចប់ ឬមិនមានដំណើរការទេ។",
      };
    }

    // 2. Find product in live session
    const liveProduct = await tx.liveSessionProduct.findFirst({
      where: {
        sessionId: session.id,
        cfCode: { equals: parsed.cfCode!, mode: "insensitive" },
        isActive: true,
      },
      include: {
        product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true } },
        variant: { select: { id: true, name: true, sku: true, stock: true } },
      },
    });

    if (!liveProduct) {
      return {
        success: false,
        reason: "PRODUCT_NOT_FOUND" as const,
        code: parsed.cfCode!,
        message: `⚠️ រកមិនឃើញទំនិញកូដ "${parsed.cfCode}" ក្នុង Live នេះទេ។`,
      };
    }

    const productName = liveProduct.customTitle || liveProduct.product.name;
    const unitPrice = Number(liveProduct.customPrice);
    const lineTotal = unitPrice * parsed.quantity;

    // 3. Check stock availability
    if (liveProduct.remainingStock < parsed.quantity) {
      return {
        success: false,
        reason: "OUT_OF_STOCK" as const,
        code: liveProduct.cfCode,
        productName,
        remainingStock: liveProduct.remainingStock,
        message: `⚠️ សូមអភ័យទោស @${input.customerName}! ទំនិញ "${productName}" (កូដ: ${liveProduct.cfCode}) បានអស់ពីស្តុកហើយ${liveProduct.remainingStock > 0 ? ` (នៅសល់ត្រឹមតែ ${liveProduct.remainingStock})` : ""}។`,
      };
    }

    const newLiveStock = liveProduct.remainingStock - parsed.quantity;

    // 4. Deduct live product stock
    await tx.liveSessionProduct.update({
      where: { id: liveProduct.id },
      data: { remainingStock: newLiveStock },
    });

    // 5. Deduct actual inventory via stock movement
    await recordStockMovementInTx(tx, {
      storeId: input.storeId,
      productId: liveProduct.productId,
      variantId: liveProduct.variantId,
      type: StockMovementType.SALE_ORDER,
      quantity: -parsed.quantity,
      reason: `Live CF (${session.title}) - កូដ: ${liveProduct.cfCode}`,
      referenceId: session.id,
      performedBy: "Live CF Engine",
    });

    // 6. Find or create Customer
    let customer: { id: string; name: string; phone: string | null };
    if (input.customerId) {
      const existing = await tx.customer.findFirst({
        where: { id: input.customerId, storeId: input.storeId },
        select: { id: true, name: true, phone: true },
      });
      if (existing) {
        customer = existing;
      } else {
        customer = await tx.customer.create({
          data: {
            storeId: input.storeId,
            name: input.customerName,
            phone: parsed.phone || null,
            preferredChannel: "FACEBOOK",
            facebookId: input.senderId || null,
          },
          select: { id: true, name: true, phone: true },
        });
      }
    } else {
      // Find by facebookId or phone or name
      const found = await tx.customer.findFirst({
        where: {
          storeId: input.storeId,
          OR: [
            ...(input.senderId ? [{ facebookId: input.senderId }] : []),
            ...(parsed.phone ? [{ phone: parsed.phone }] : []),
            { name: input.customerName },
          ],
        },
        select: { id: true, name: true, phone: true },
      });

      if (found) {
        customer = found;
        if (parsed.phone && !found.phone) {
          await tx.customer.update({
            where: { id: found.id },
            data: { phone: parsed.phone },
          });
          customer.phone = parsed.phone;
        }
      } else {
        customer = await tx.customer.create({
          data: {
            storeId: input.storeId,
            name: input.customerName,
            phone: parsed.phone || null,
            preferredChannel: "FACEBOOK",
            facebookId: input.senderId || null,
          },
          select: { id: true, name: true, phone: true },
        });
      }
    }

    // 7. Create Order
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `CF-${Date.now().toString().slice(-4)}-${randomSuffix}`;

    const order = await tx.order.create({
      data: {
        storeId: input.storeId,
        customerId: customer.id,
        orderNumber,
        status: "PENDING_CONFIRMATION",
        channel: "FACEBOOK",
        subtotal: lineTotal,
        total: lineTotal,
        notes: `Live CF: ${liveProduct.cfCode} x ${parsed.quantity} (${session.title})${parsed.note ? ` | ${parsed.note}` : ""}`,
        paymentMethod: "COD",
        paymentStatus: "UNPAID",
        items: {
          create: [
            {
              productId: liveProduct.productId,
              variantId: liveProduct.variantId,
              productName,
              productSku: liveProduct.product.sku,
              quantity: parsed.quantity,
              unitPrice,
              lineTotal,
            },
          ],
        },
      },
      select: { id: true, orderNumber: true },
    });

    await recordAudit(
      {
        storeId: input.storeId,
        action: "LIVE_CF_ORDER_CREATED",
        entity: "Order",
        entityId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          cfCode: liveProduct.cfCode,
          productName,
          quantity: parsed.quantity,
          total: lineTotal,
          customerName: input.customerName,
        },
      },
      tx
    );

    // 8. Auto-create/update Conversation & record both comment & auto-confirmation Messenger message
    let conversationId: string | undefined;
    const now = new Date();
    const messengerConfirmation =
      `🎉 ជម្រាបសួរ ${input.customerName}!\n` +
      `ការកក់ទំនិញ «${productName}» (កូដ: ${liveProduct.cfCode}) ចំនួន ${parsed.quantity} ` +
      `($${lineTotal.toFixed(2)}) ទទួលបានជោគជ័យហើយ!\n` +
      `📋 លេខបញ្ជាទិញ: ${order.orderNumber}\n\n` +
      `📦 សូមផ្ញើលេខទូរស័ព្ទ និងទីតាំងដឹកជញ្ជូនរបស់លោកអ្នកមកកាន់ទីនេះ ដើម្បីឱ្យខាងប្អូនរៀបចំវេចខ្ចប់ និងផ្ញើជូនបានឆាប់រហ័ស។ សូមអរគុណច្រើន!`;

    try {
      if (tx.conversation && tx.message) {
        const externalId = input.senderId || `fb-${customer.id}`;
        let conversation = await tx.conversation.findFirst({
          where: {
            storeId: input.storeId,
            channel: "FACEBOOK",
            OR: [
              { customerId: customer.id },
              ...(input.senderId ? [{ externalId: input.senderId }] : []),
            ],
          },
        });

        if (!conversation) {
          conversation = await tx.conversation.create({
            data: {
              storeId: input.storeId,
              channel: "FACEBOOK",
              customerId: customer.id,
              externalId,
              lastMessageAt: now,
            },
          });
        } else if (!conversation.customerId) {
          await tx.conversation.update({
            where: { id: conversation.id },
            data: { customerId: customer.id },
          });
        }

        conversationId = conversation.id;

        // 1. Customer incoming live comment message
        await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderName: input.customerName,
            senderType: "CUSTOMER",
            body: input.commentText,
            sentAt: now,
          },
        });

        // 2. Messenger bot automated order confirmation reply
        const botMsg = await tx.message.create({
          data: {
            conversationId: conversation.id,
            senderName: "ប្រព័ន្ធស្វ័យប្រវត្តិ (Messenger Bot)",
            senderType: "SELLER",
            body: messengerConfirmation,
            sentAt: new Date(now.getTime() + 1000),
          },
        });

        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: botMsg.sentAt },
        });
      }
    } catch (convErr) {
      console.warn("Could not save live CF conversation messages:", convErr);
    }

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      code: liveProduct.cfCode,
      productName,
      imageUrl: liveProduct.imageUrl || liveProduct.product.imageUrl,
      price: unitPrice,
      quantity: parsed.quantity,
      total: lineTotal,
      remainingStock: newLiveStock,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      conversationId,
      messengerConfirmation,
      messengerSent: true,
      realMessengerDispatched: false,
      message: `🎉 @${input.customerName} បានកក់ ${productName} (កូដ: ${liveProduct.cfCode}) ចំនួន ${parsed.quantity} ($${lineTotal.toFixed(2)}) ដោយជោគជ័យ! ស្តុកនៅសល់: ${newLiveStock}។ ✉️ បានផ្ញើសារបញ្ជាក់ទៅកាន់ Messenger រួចរាល់`,
    };
  };

  const result = await (externalTx ? runWithTx(externalTx) : db.$transaction(async (tx) => runWithTx(tx)));

  if (result.success && result.messengerConfirmation && db.channelConnection) {
    try {
      const fbConn = await db.channelConnection.findFirst({
        where: { storeId: input.storeId, channel: "FACEBOOK", status: "CONNECTED" },
      });
      const meta = (fbConn?.metadata as any) || {};
      const pageAccessToken = meta.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;

      if (pageAccessToken) {
        if (input.commentId) {
          const fbRes = await sendFacebookPrivateReply(pageAccessToken, input.commentId, result.messengerConfirmation);
          result.realMessengerDispatched = fbRes.success;
        } else if (input.senderId && !input.senderId.startsWith("sim-")) {
          const fbRes = await sendFacebookMessengerMessage(pageAccessToken, input.senderId, result.messengerConfirmation);
          result.realMessengerDispatched = fbRes.success;
        }
      }
    } catch (fbErr) {
      console.warn("Could not dispatch real Facebook Messenger message:", fbErr);
    }
  }

  return result;
}
