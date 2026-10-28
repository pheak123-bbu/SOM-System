import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { processLiveCfComment } from "@/lib/live-cf/engine";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const commentSchema = z.object({
  customerName: z.string().min(1).max(100).default("អតិថិជន Live"),
  customerId: z.string().optional(),
  senderId: z.string().max(200).optional(),
  commentText: z.string().trim().min(1).max(1000),
});

export async function POST(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  // Rate limit: max 30 comments per 30 seconds to prevent DDoS / spam flood attacks
  const rateCheck = await checkRateLimit(`live-comments:${sessionId}`, 30, 30);
  if (!rateCheck.success) {
    return NextResponse.json(
      { error: "សំណើខមមិនច្រើនពេកក្នុងពេលតែមួយ។ សូមរង់ចាំបន្តិច។" },
      { status: 429 }
    );
  }

  try {
    const json = await request.json();
    const parsed = commentSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យខមមិនមិនត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
      select: { id: true, status: true },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញ Live Session នេះទេ។" }, { status: 404 });
    }

    // Process comment through CF Engine
    const result = await processLiveCfComment({
      storeId: context.storeId,
      sessionId,
      customerName: parsed.data.customerName,
      customerId: parsed.data.customerId,
      senderId: parsed.data.senderId,
      commentText: parsed.data.commentText,
    });

    // Fetch updated products state to return to client
    const updatedProducts = await db.liveSessionProduct.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { orderIndex: "asc" }],
      include: {
        product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true } },
      },
    });

    return NextResponse.json({
      result,
      products: updatedProducts,
    });
  } catch (error) {
    console.error("Live comment processing error:", error);
    return NextResponse.json({ error: "មានបញ្ហាក្នុងដំណើរការខមមិន Live CF។" }, { status: 500 });
  }
}
