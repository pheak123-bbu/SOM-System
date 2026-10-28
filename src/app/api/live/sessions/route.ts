import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSessionSchema = z.object({
  title: z.string().min(1).max(200),
  bannerText: z.string().max(300).optional(),
  topLogoUrl: z.string().url().or(z.string().startsWith("/")).optional(),
});

export async function GET() {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    let activeSession = await db.liveSession.findFirst({
      where: { storeId: context.storeId, status: "ACTIVE" },
      include: {
        products: {
          orderBy: [{ position: "asc" }, { orderIndex: "asc" }, { cfCode: "asc" }],
          include: {
            product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true, price: true } },
            variant: { select: { id: true, name: true, sku: true, stock: true, price: true } },
          },
        },
      },
    });

    // If no active session exists, initialize an initial live session so the user can test right away
    if (!activeSession) {
      // Find or seed products for the live demo
      let storeProducts = await db.product.findMany({
        where: { storeId: context.storeId, active: true },
        take: 6,
      });

      if (storeProducts.length === 0) {
        // Auto-seed sample products matching Cambodian livestream conventions
        const seedItems = [
          { name: "សាប៊ូកក់សក់ Care ក្លិនក្រអូប", sku: "R445", price: 1.90, stock: 50, imageUrl: "https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=300&q=80" },
          { name: "ខ្នើយគេងទន់ស្រួល A65", sku: "A65", price: 1.62, stock: 35, imageUrl: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=300&q=80" },
          { name: "កាបូបយួរដៃពណ៌ផ្កាឈូក EVA 123", sku: "123", price: 2.50, stock: 25, imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&q=80" },
          { name: "ទឹកអប់ប្រណិត V790", sku: "V790", price: 1.90, stock: 40, imageUrl: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=300&q=80" },
          { name: "ពូកខ្នាតស្ដង់ដារ H89", sku: "H89", price: 10.00, stock: 15, imageUrl: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=300&q=80" },
          { name: "ភួយរោមចៀមទន់ H324", sku: "H324", price: 4.50, stock: 30, imageUrl: "https://images.unsplash.com/photo-1580301762395-21ce84d00bc6?w=300&q=80" },
        ];

        storeProducts = await Promise.all(
          seedItems.map((item) =>
            db.product.create({
              data: {
                storeId: context.storeId,
                name: item.name,
                sku: item.sku,
                price: item.price,
                stock: item.stock,
                imageUrl: item.imageUrl,
              },
            })
          )
        );
      }

      // Create initial active live session
      activeSession = await db.liveSession.create({
        data: {
          storeId: context.storeId,
          title: "Facebook Live លក់ទំនិញពិសេសប្រចាំថ្ងៃ (CF Studio)",
          status: "ACTIVE",
          bannerText: "លេខទូរស័ព្ទទំនាក់ទំនង 012 345 678 | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង",
          products: {
            create: storeProducts.slice(0, 6).map((p, index) => {
              const cfCodes = ["R445", "123", "A65", "V790", "H89", "H324"];
              const assignedCode = cfCodes[index] || p.sku || `CF${index + 1}`;
              const isLeft = index % 2 === 0;
              return {
                productId: p.id,
                cfCode: assignedCode,
                customTitle: p.name,
                customPrice: p.price,
                imageUrl: p.imageUrl,
                allocatedStock: p.stock ?? 20,
                remainingStock: p.stock ?? 20,
                position: index === 0 ? "PINNED" : isLeft ? "LEFT" : "RIGHT",
                orderIndex: index,
                isActive: true,
              };
            }),
          },
        },
        include: {
          products: {
            orderBy: [{ position: "asc" }, { orderIndex: "asc" }],
            include: {
              product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true, price: true } },
              variant: { select: { id: true, name: true, sku: true, stock: true, price: true } },
            },
          },
        },
      });
    }

    // Get order stats for this live session
    const recentOrders = await db.order.findMany({
      where: {
        storeId: context.storeId,
        channel: "FACEBOOK",
        notes: { contains: "Live CF" },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
      },
    });

    return NextResponse.json({
      session: activeSession,
      recentOrders,
    });
  } catch (error) {
    console.error("Live session fetch error:", error);
    return NextResponse.json({ error: "មិនអាចទាញយកទិន្នន័យ Live Session បានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    const json = await request.json();
    const parsed = createSessionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យមិនត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
    }

    // Deactivate previous active sessions if any
    await db.liveSession.updateMany({
      where: { storeId: context.storeId, status: "ACTIVE" },
      data: { status: "ENDED" },
    });

    const newSession = await db.liveSession.create({
      data: {
        storeId: context.storeId,
        title: parsed.data.title,
        bannerText: parsed.data.bannerText || "លេខទូរស័ព្ទទំនាក់ទំនង 012 345 678 | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង",
        topLogoUrl: parsed.data.topLogoUrl,
        status: "ACTIVE",
      },
      include: {
        products: true,
      },
    });

    return NextResponse.json({ session: newSession });
  } catch (error) {
    console.error("Live session create error:", error);
    return NextResponse.json({ error: "មិនអាចបង្កើត Live Session ថ្មីបានទេ។" }, { status: 500 });
  }
}
