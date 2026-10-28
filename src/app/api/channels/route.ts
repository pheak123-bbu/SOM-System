import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { SalesChannel, MembershipRole } from "@prisma/client";

const channelUpdateSchema = z.object({
  channel: z.enum(["FACEBOOK", "TIKTOK", "TELEGRAM"]),
  status: z.enum(["CONNECTED", "NOT_CONNECTED", "PENDING"]).optional(),
  metadata: z.record(z.string(), z.any()),
});

export async function GET() {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
    }

    const connections = await db.channelConnection.findMany({
      where: { storeId: context.storeId },
    });

    const channelMap: Record<string, { status: string; metadata: Record<string, any> }> = {};
    for (const c of connections) {
      channelMap[c.channel] = {
        status: c.status,
        metadata: (c.metadata as Record<string, any>) || {},
      };
    }

    return NextResponse.json({ channels: channelMap });
  } catch (err) {
    console.error("GET /api/channels error:", err);
    return NextResponse.json({ error: "មិនអាចទាញយកព័ត៌មានបណ្ដាញលក់បានទេ។" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const context = await getAuthContext();
    if (!context) {
      return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
    }

    if (context.role !== MembershipRole.OWNER && context.role !== MembershipRole.ADMIN) {
      return NextResponse.json({ error: "ត្រូវការសិទ្ធិជា Owner ឬ Admin។" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = channelUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យមិនត្រឹមត្រូវ។" }, { status: 400 });
    }

    const { channel, status, metadata } = parsed.data;

    const existing = await db.channelConnection.findUnique({
      where: {
        storeId_channel: {
          storeId: context.storeId,
          channel: channel as SalesChannel,
        },
      },
    });

    const updatedMetadata = {
      ...((existing?.metadata as Record<string, any>) || {}),
      ...metadata,
    };

    const record = await db.channelConnection.upsert({
      where: {
        storeId_channel: {
          storeId: context.storeId,
          channel: channel as SalesChannel,
        },
      },
      create: {
        storeId: context.storeId,
        channel: channel as SalesChannel,
        status: status || "CONNECTED",
        metadata: updatedMetadata,
      },
      update: {
        status: status !== undefined ? status : existing?.status || "CONNECTED",
        metadata: updatedMetadata,
      },
    });

    return NextResponse.json({
      success: true,
      channel: record.channel,
      status: record.status,
      metadata: record.metadata,
      message: `បានរក្សាទុកការតភ្ជាប់ ${channel} ដោយជោគជ័យ`,
    });
  } catch (err) {
    console.error("POST /api/channels error:", err);
    return NextResponse.json({ error: "មិនអាចរក្សាទុកការតភ្ជាប់បានទេ។" }, { status: 500 });
  }
}
