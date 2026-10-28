import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  _request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
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

    const publishedSnapshot = {
      sessionId: session.id,
      bannerText: session.bannerText,
      activePinId: session.activePinId,
      publishedAt: new Date().toISOString(),
      products: session.products.map((p) => ({
        id: p.id,
        productId: p.productId,
        variantId: p.variantId,
        cfCode: p.cfCode,
        customTitle: p.customTitle || p.product?.name,
        customPrice: Number(p.customPrice),
        imageUrl: p.imageUrl || p.product?.imageUrl || null,
        allocatedStock: p.allocatedStock,
        remainingStock: p.remainingStock,
        position: p.position,
        posX: p.posX,
        posY: p.posY,
        scale: p.scale || 1.0,
        cardSize: p.cardSize || "MEDIUM",
        orderIndex: p.orderIndex,
        isActive: p.isActive,
        product: {
          name: p.product?.name,
          imageUrl: p.product?.imageUrl,
        },
      })),
    };

    const publishedAt = new Date();
    await db.liveSession.update({
      where: { id: sessionId },
      data: {
        publishedLayout: JSON.stringify(publishedSnapshot),
        publishedAt,
      },
    });

    return NextResponse.json({
      success: true,
      publishedAt: publishedAt.toISOString(),
      productCount: publishedSnapshot.products.length,
      message: "បានធ្វើសមកាលកម្ម (Sync) ទៅកាន់កញ្ចក់ Live Stream Overlay ដោយជោគជ័យ!",
    });
  } catch (error) {
    console.error("Publish live session error:", error);
    return NextResponse.json({
      error: "មិនអាចធ្វើសមកាលកម្ម (Sync) ទៅកាន់ Live Stream បានទេ។",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
