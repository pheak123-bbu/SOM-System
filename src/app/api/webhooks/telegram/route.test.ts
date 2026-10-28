import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    channelConnection: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    store: {
      findFirst: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    detectionJob: {
      create: vi.fn(),
      update: vi.fn(),
    },
    orderSuggestion: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => cb(db)),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 59, limit: 60, reset: 123 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/ai/detection", () => ({
  processDetectionJob: vi.fn().mockResolvedValue({ intent: "PRODUCT_INTEREST" }),
}));

vi.mock("@/lib/ai/queue", () => ({
  enqueueDetection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/auto-reply", () => ({
  generateAutoReplyWithMedia: vi.fn().mockResolvedValue({ text: null, imageUrl: null }),
}));

vi.mock("@/lib/telegram", () => ({
  callTelegramApi: vi.fn().mockResolvedValue({ ok: true }),
}));

import { POST } from "./route";
import { db } from "@/lib/db";

describe("Telegram Webhook Route Security", () => {
  const originalEnv = process.env.TELEGRAM_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalEnv;
  });

  it("rejects request with 401 when TELEGRAM_WEBHOOK_SECRET is set but header is missing", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-token-1234567890abcdef";

    const request = new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { text: "Hello" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Unauthorized: Invalid secret token");
  });

  it("rejects request with 401 when TELEGRAM_WEBHOOK_SECRET is set and header does not match", async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "super-secret-token-1234567890abcdef";

    const request = new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-secret-token-0000000000000000",
      },
      body: JSON.stringify({ message: { text: "Hello" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toContain("Unauthorized: Invalid secret token");
  });

  it("rejects request with 401 when DB channel connection has webhookSecret and header does not match", async () => {
    vi.mocked(db.channelConnection.findFirst).mockResolvedValue({
      id: "conn-1",
      storeId: "store-1",
      channel: "TELEGRAM",
      status: "CONNECTED",
      metadata: { webhookSecret: "db-secret-token-1234567890abcdef" },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const request = new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong-token-value",
      },
      body: JSON.stringify({ message: { text: "Hello" } }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("accepts request when x-telegram-bot-api-secret-token matches expected secret", async () => {
    const validSecret = "valid-secret-token-1234567890abcdef";
    process.env.TELEGRAM_WEBHOOK_SECRET = validSecret;

    vi.mocked(db.store.findFirst).mockResolvedValue({
      id: "store-1",
      name: "Fashion Store",
      phone: "012345678",
      address: "Phnom Penh",
      exchangeRate: 4100,
      bakongAccountId: "bakong@store",
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue(null);
    vi.mocked(db.customer.create).mockResolvedValue({ id: "cust-1", name: "John" } as any);
    vi.mocked(db.conversation.findFirst).mockResolvedValue(null);
    vi.mocked(db.conversation.create).mockResolvedValue({ id: "conv-1" } as any);
    vi.mocked(db.message.findFirst).mockResolvedValue(null);
    vi.mocked(db.message.create).mockResolvedValue({ id: "msg-1" } as any);
    vi.mocked(db.detectionJob.create).mockResolvedValue({ id: "job-1" } as any);

    const request = new Request("http://localhost:3000/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": validSecret,
      },
      body: JSON.stringify({
        message: {
          message_id: 101,
          date: 1700000000,
          chat: { id: 12345, type: "private", first_name: "John" },
          from: { id: 12345, first_name: "John" },
          text: "សួស្តី មានរ៉ូប DR-001 ទេ?",
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
  });
});
