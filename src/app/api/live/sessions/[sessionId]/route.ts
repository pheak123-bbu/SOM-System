import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  bannerText: z.string().max(300).optional(),
  topLogoUrl: z.string().url().or(z.string().startsWith("/")).optional(),
  activePinId: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ENDED", "DRAFT"]).optional(),
});

export async function GET(
  _request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;

  try {
    const url = new URL(_request.url);
    const isOverlayView = url.searchParams.get("view") === "overlay";

    // Note: Allow unauthenticated GET if used for OBS browser source overlay!
    const session = await db.liveSession.findUnique({
      where: { id: sessionId },
      include: {
        products: {
          where: { isActive: true },
          orderBy: [{ position: "asc" }, { orderIndex: "asc" }, { cfCode: "asc" }],
          include: {
            product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true, price: true } },
            variant: { select: { id: true, name: true, sku: true, stock: true, price: true } },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញវគ្គផ្សាយផ្ទាល់ (Live Session) នេះទេ។" }, { status: 404 });
    }

    // If requested by the Live Stream Overlay, prioritize the Published/Synced snapshot
    // while keeping real-time stock deductions live!
    if (isOverlayView && session.publishedLayout) {
      try {
        const published = JSON.parse(session.publishedLayout);
        const liveStockMap = new Map<string, number>();
        for (const p of session.products) {
          liveStockMap.set(p.id, p.remainingStock);
        }

        const mergedProducts = (published.products || []).map((p: any) => ({
          ...p,
          remainingStock: liveStockMap.has(p.id) ? liveStockMap.get(p.id) : p.remainingStock,
        }));

        return NextResponse.json({
          session: {
            ...session,
            bannerText: published.bannerText !== undefined ? published.bannerText : session.bannerText,
            activePinId: published.activePinId !== undefined ? published.activePinId : session.activePinId,
            products: mergedProducts,
            isPublishedView: true,
            publishedAt: session.publishedAt,
          },
        });
      } catch (err) {
        console.error("Overlay publishedLayout parse error:", err);
      }
    }

    return NextResponse.json({ session });
  } catch (error) {
    console.error("Live session single get error:", error);
    return NextResponse.json({ error: "មិនអាចទាញយកព័ត៌មាន Live បានទេ។" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const parsed = updateSessionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យមិនត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញវគ្គផ្សាយផ្ទាល់ (Live Session) នេះទេ។" }, { status: 404 });
    }

    const updated = await db.liveSession.update({
      where: { id: sessionId },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.bannerText !== undefined ? { bannerText: parsed.data.bannerText } : {}),
        ...(parsed.data.topLogoUrl !== undefined ? { topLogoUrl: parsed.data.topLogoUrl } : {}),
        ...(parsed.data.activePinId !== undefined ? { activePinId: parsed.data.activePinId } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      },
      include: {
        products: {
          orderBy: [{ position: "asc" }, { orderIndex: "asc" }],
        },
      },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Live session patch error:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែ Live Session បានទេ។" }, { status: 500 });
  }
}
