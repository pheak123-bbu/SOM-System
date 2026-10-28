import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { SalesChannel, MembershipRole, Prisma } from "@prisma/client";
import { processTelegramUpdate } from "@/app/api/webhooks/telegram/route";
import { callTelegramApi, TelegramApiResponse } from "@/lib/telegram";

const telegramActionSchema = z.object({
  action: z.enum(["set_webhook", "delete_webhook", "check_status", "save_settings", "sync_pending_updates"]),
  botToken: z.string().trim().min(10, "Telegram Bot Token មិនត្រឹមត្រូវ").optional(),
  webhookUrl: z.string().trim().url().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyStockCheck: z.boolean().optional(),
  autoReplyOrderNotice: z.boolean().optional(),
  aiProvider: z.string().optional(),
  aiApiKey: z.string().optional(),
  aiModel: z.string().optional(),
});

export async function GET() {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
    }

    const connection = await db.channelConnection.findUnique({
      where: {
        storeId_channel: {
          storeId: context.storeId,
          channel: SalesChannel.TELEGRAM,
        },
      },
    });

    const metadata = (connection?.metadata as Record<string, any>) || {};
    const botToken = metadata.botToken as string | undefined;

    let telegramLiveInfo: Record<string, any> | null = null;
    let webhookError: string | null = null;
    if (botToken) {
      try {
        const cleanToken = botToken.replace(/^bot/i, "").trim();
        const data = await callTelegramApi(cleanToken, "getWebhookInfo", undefined, 5000).catch((): TelegramApiResponse => ({ ok: false }));
        if (data.ok) {
          telegramLiveInfo = data.result;
          if (data.result?.last_error_message) {
            webhookError = data.result.last_error_message;
          }
        }
      } catch {
        // ignore
      }
    }

    const pendingCount = telegramLiveInfo?.pending_update_count ?? 0;

    return NextResponse.json({
      connected: connection?.status === "CONNECTED",
      status: connection?.status ?? "NOT_CONNECTED",
      botUsername: metadata.botUsername ?? null,
      botName: metadata.botName ?? null,
      webhookUrl: metadata.webhookUrl ?? null,
      autoReplyEnabled: metadata.autoReplyEnabled ?? true,
      autoReplyStockCheck: metadata.autoReplyStockCheck ?? true,
      autoReplyOrderNotice: metadata.autoReplyOrderNotice ?? true,
      aiProvider: metadata.aiProvider ?? (process.env.GROQ_API_KEY ? "groq" : process.env.OPENAI_API_KEY ? "openai" : process.env.GEMINI_API_KEY ? "gemini" : process.env.AI_PROVIDER || "pattern"),
      aiApiKey: metadata.aiApiKey ?? "",
      hasConfiguredApiKey: Boolean(metadata.aiApiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
      hasWebhookSecret: Boolean(metadata.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET),
      aiModel: metadata.aiModel ?? (process.env.AI_MODEL || ""),
      telegramLiveInfo,
      webhookError,
      hasWebhookError: Boolean(webhookError),
      pendingCount,
    });
  } catch (err) {
    console.error("GET /api/telegram error:", err);
    return NextResponse.json(
      { error: "មិនអាចទាញយកព័ត៌មាន Telegram បានទេ", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
    }

    if (context.role !== MembershipRole.OWNER && context.role !== MembershipRole.ADMIN) {
      return NextResponse.json(
        { error: "មានតែម្ចាស់ហាង ឬអ្នកគ្រប់គ្រងប៉ុណ្ណោះដែលអាចភ្ជាប់ Telegram បាន។" },
        { status: 403 }
      );
    }

    const json = await request.json().catch(() => null);
    const parsed = telegramActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ទិន្នន័យមិនត្រឹមត្រូវ", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action } = parsed.data;

    // Handle auto-reply settings update without needing bot token validation
    if (action === "save_settings") {
      const existing = await db.channelConnection.findUnique({
        where: { storeId_channel: { storeId: context.storeId, channel: SalesChannel.TELEGRAM } },
      });
      const oldMeta = (existing?.metadata as Record<string, any>) || {};
      const newMeta = {
        ...oldMeta,
        autoReplyEnabled: parsed.data.autoReplyEnabled ?? oldMeta.autoReplyEnabled ?? true,
        autoReplyStockCheck: parsed.data.autoReplyStockCheck ?? oldMeta.autoReplyStockCheck ?? true,
        autoReplyOrderNotice: parsed.data.autoReplyOrderNotice ?? oldMeta.autoReplyOrderNotice ?? true,
        aiProvider: parsed.data.aiProvider !== undefined ? parsed.data.aiProvider : oldMeta.aiProvider ?? "pattern",
        aiApiKey: parsed.data.aiApiKey !== undefined ? parsed.data.aiApiKey : oldMeta.aiApiKey ?? "",
        aiModel: parsed.data.aiModel !== undefined ? parsed.data.aiModel : oldMeta.aiModel ?? "",
      };

      await db.channelConnection.upsert({
        where: { storeId_channel: { storeId: context.storeId, channel: SalesChannel.TELEGRAM } },
        create: {
          storeId: context.storeId,
          channel: SalesChannel.TELEGRAM,
          status: "NOT_CONNECTED",
          metadata: newMeta,
        },
        update: {
          metadata: newMeta,
        },
      });

      return NextResponse.json({
        ok: true,
        message: "បានរក្សាទុកការកំណត់ឆ្លើយតបស្វ័យប្រវត្តិតាម AI រួចរាល់។",
      });
    }

    // Handle sync/pull pending updates directly without waiting for webhook
    if (action === "sync_pending_updates") {
      const existing = await db.channelConnection.findUnique({
        where: { storeId_channel: { storeId: context.storeId, channel: SalesChannel.TELEGRAM } },
      });
      const metadata = (existing?.metadata as Record<string, any>) || {};
      const currentToken = (parsed.data.botToken ? parsed.data.botToken.replace(/^bot/i, "").trim() : metadata.botToken) as string;
      if (!currentToken) {
        return NextResponse.json({ error: "មិនទាន់មាន Bot Token ទេ" }, { status: 400 });
      }

      const currentWebhookUrl = metadata.webhookUrl as string | undefined;

      // 1. Temporarily delete webhook so getUpdates is allowed by Telegram API
      await callTelegramApi(currentToken, "deleteWebhook?drop_pending_updates=false", undefined, 8000).catch(() => {});

      // 2. Pull all pending messages
      const updatesData = await callTelegramApi(currentToken, "getUpdates?limit=50&timeout=2", undefined, 10000).catch(() => ({ ok: false, result: [] }));
      const updates: any[] = Array.isArray(updatesData.result) ? updatesData.result : [];

      let processedCount = 0;
      let highestUpdateId = 0;
      for (const update of updates) {
        if (update.update_id && update.update_id > highestUpdateId) {
          highestUpdateId = update.update_id;
        }
        try {
          await processTelegramUpdate(update);
          processedCount++;
        } catch (err) {
          console.warn("Error processing Telegram update in sync:", err);
        }
      }

      // Acknowledge updates with offset
      if (highestUpdateId > 0) {
        await callTelegramApi(currentToken, `getUpdates?offset=${highestUpdateId + 1}&limit=1`, undefined, 5000).catch(() => {});
      }

      // 3. Re-register webhook if one was configured
      if (currentWebhookUrl) {
        await callTelegramApi(
          currentToken,
          "setWebhook",
          {
            url: currentWebhookUrl,
            drop_pending_updates: false,
            ...(metadata.webhookSecret ? { secret_token: metadata.webhookSecret } : {}),
          },
          8000
        ).catch(() => {});
      }

      return NextResponse.json({
        ok: true,
        syncedCount: processedCount,
        message: processedCount > 0
          ? `បានទាញយក និងឆ្លើយតបសារចំនួន ${processedCount} សារដោយជោគជ័យ!`
          : "ពុំមានសារដែលកំពុងរង់ចាំនៅលើ Telegram Server ឡើយ។",
      });
    }

    if (!parsed.data.botToken) {
      return NextResponse.json({ error: "សូមបញ្ចូល Telegram Bot Token" }, { status: 400 });
    }

    // Strip leading "bot" prefix if user copied "bot123456:..." from docs
    const botToken = parsed.data.botToken.replace(/^bot/i, "").trim();
    let webhookUrl = parsed.data.webhookUrl?.trim();

    // Auto-normalize webhook URL: ensure it ends with /api/webhooks/telegram
    if (webhookUrl && !webhookUrl.includes("/api/webhooks/telegram")) {
      webhookUrl = `${webhookUrl.replace(/\/+$/, "")}/api/webhooks/telegram`;
    }

    // 1. Verify Bot Token with getMe
    const meData = await callTelegramApi(botToken, "getMe", undefined, 8000).catch(
      (): TelegramApiResponse => ({ ok: false, description: "Invalid response from Telegram" })
    );
    if (!meData.ok) {
      return NextResponse.json(
        { error: `Telegram Bot Token មិនត្រឹមត្រូវ: ${meData.description || "Authentication failed"}` },
        { status: 400 }
      );
    }

    const botUser = meData.result;

    if (action === "set_webhook") {
      if (!webhookUrl) {
        return NextResponse.json({ error: "សូមបញ្ចូល Webhook URL" }, { status: 400 });
      }

      if (!webhookUrl.startsWith("https://")) {
        return NextResponse.json(
          { error: "Telegram តម្រូវឱ្យ Webhook URL ប្រើប្រាស់ HTTPS និងជា Public URL (ឧ. ngrok)" },
          { status: 400 }
        );
      }

      const existing = await db.channelConnection.findUnique({
        where: { storeId_channel: { storeId: context.storeId, channel: SalesChannel.TELEGRAM } },
      });
      const oldMeta = (existing?.metadata as Record<string, any>) || {};

      // Auto-generate or reuse secure Webhook Secret Token for Telegram verification
      const webhookSecret =
        process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
        oldMeta.webhookSecret ||
        crypto.randomBytes(32).toString("hex");

      // Register Webhook with Telegram API including secret_token
      const hookData = await callTelegramApi(
        botToken,
        "setWebhook",
        {
          url: webhookUrl,
          drop_pending_updates: false,
          secret_token: webhookSecret,
        },
        8000
      ).catch(() => ({ ok: false, description: "Failed to parse Telegram response" }));
      if (!hookData.ok) {
        return NextResponse.json(
          { error: `មិនអាចភ្ជាប់ Webhook បានទេ: ${hookData.description || "Unknown error"}` },
          { status: 400 }
        );
      }

      const newMeta = {
        ...oldMeta,
        botToken,
        webhookUrl,
        webhookSecret,
        botUsername: botUser.username,
        botName: botUser.first_name,
        connectedAt: new Date().toISOString(),
        autoReplyEnabled: parsed.data.autoReplyEnabled ?? oldMeta.autoReplyEnabled ?? true,
        autoReplyStockCheck: parsed.data.autoReplyStockCheck ?? oldMeta.autoReplyStockCheck ?? true,
        autoReplyOrderNotice: parsed.data.autoReplyOrderNotice ?? oldMeta.autoReplyOrderNotice ?? true,
      };

      // Save connection
      await db.channelConnection.upsert({
        where: {
          storeId_channel: {
            storeId: context.storeId,
            channel: SalesChannel.TELEGRAM,
          },
        },
        create: {
          storeId: context.storeId,
          channel: SalesChannel.TELEGRAM,
          status: "CONNECTED",
          metadata: newMeta,
        },
        update: {
          status: "CONNECTED",
          metadata: newMeta,
        },
      });

      return NextResponse.json({
        ok: true,
        message: `បានភ្ជាប់ Telegram Bot @${botUser.username} ទៅកាន់ Webhook ដោយជោគជ័យ!`,
        bot: botUser,
      });
    }

    if (action === "delete_webhook") {
      await callTelegramApi(botToken, "deleteWebhook", undefined, 8000).catch(() => {});

      await db.channelConnection.upsert({
        where: {
          storeId_channel: {
            storeId: context.storeId,
            channel: SalesChannel.TELEGRAM,
          },
        },
        create: {
          storeId: context.storeId,
          channel: SalesChannel.TELEGRAM,
          status: "NOT_CONNECTED",
          metadata: Prisma.DbNull,
        },
        update: {
          status: "NOT_CONNECTED",
          metadata: Prisma.DbNull,
        },
      });

      return NextResponse.json({
        ok: true,
        message: "បានផ្តាច់ Webhook និង Telegram Bot រួចរាល់។",
      });
    }

    // Check status
    const infoData = await callTelegramApi(botToken, "getWebhookInfo", undefined, 8000).catch(
      (): TelegramApiResponse => ({ ok: false })
    );

    return NextResponse.json({
      ok: true,
      bot: botUser,
      webhookInfo: infoData.result,
    });
  } catch (error) {
    console.error("POST /api/telegram unhandled error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "មានបញ្ហាក្នុងការទាក់ទង Telegram API" },
      { status: 500 }
    );
  }
}
