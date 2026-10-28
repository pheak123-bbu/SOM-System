import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const addProductSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  cfCode: z.string().trim().min(1).max(20),
  customTitle: z.string().max(200).optional(),
  customPrice: z.number().positive(),
  imageUrl: z.string().optional(),
  allocatedStock: z.number().int().min(1).default(10),
  position: z.enum(["LEFT", "RIGHT", "PINNED", "HIDDEN", "CUSTOM"]).default("LEFT"),
  posX: z.number().nullable().optional(),
  posY: z.number().nullable().optional(),
  scale: z.number().min(0.4).max(3.0).default(1.0),
  cardSize: z.enum(["SMALL", "MEDIUM", "LARGE", "CUSTOM"]).default("MEDIUM"),
});

const updateProductSchema = z.object({
  id: z.string().min(1),
  cfCode: z.string().trim().min(1).max(20).optional(),
  customTitle: z.string().max(200).optional(),
  customPrice: z.number().positive().optional(),
  imageUrl: z.string().optional(),
  remainingStock: z.number().int().min(0).optional(),
  allocatedStock: z.number().int().min(0).optional(),
  position: z.enum(["LEFT", "RIGHT", "PINNED", "HIDDEN", "CUSTOM"]).optional(),
  posX: z.number().nullable().optional(),
  posY: z.number().nullable().optional(),
  scale: z.number().min(0.4).max(3.0).optional(),
  cardSize: z.enum(["SMALL", "MEDIUM", "LARGE", "CUSTOM"]).optional(),
  isActive: z.boolean().optional(),
});

const batchUpdateSchema = z.object({
  batch: z.array(
    z.object({
      id: z.string().min(1),
      position: z.enum(["LEFT", "RIGHT", "PINNED", "HIDDEN", "CUSTOM"]).optional(),
      posX: z.number().nullable().optional(),
      posY: z.number().nullable().optional(),
      scale: z.number().min(0.4).max(3.0).optional(),
      cardSize: z.enum(["SMALL", "MEDIUM", "LARGE", "CUSTOM"]).optional(),
    })
  ),
});

export async function GET(
  _request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;

  try {
    const products = await db.liveSessionProduct.findMany({
      where: { sessionId },
      orderBy: [{ position: "asc" }, { orderIndex: "asc" }, { cfCode: "asc" }],
      include: {
        product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true, price: true } },
        variant: { select: { id: true, name: true, sku: true, stock: true, price: true } },
      },
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Live products get error:", error);
    return NextResponse.json({ error: "មិនអាចទាញយកទំនិញ Live បានទេ។" }, { status: 500 });
  }
}

export async function POST(
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
    const parsed = addProductSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យមិនត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញ Live Session នេះទេ។" }, { status: 404 });
    }

    // Verify product belongs to store
    const catalogProduct = await db.product.findFirst({
      where: { id: parsed.data.productId, storeId: context.storeId },
    });

    if (!catalogProduct) {
      return NextResponse.json({ error: "រកមិនឃើញផលិតផលក្នុងហាងទេ។" }, { status: 404 });
    }

    // Check if code already used in this session
    const codeUpper = parsed.data.cfCode.toUpperCase();
    const existingCode = await db.liveSessionProduct.findFirst({
      where: { sessionId, cfCode: codeUpper },
    });

    if (existingCode) {
      return NextResponse.json({ error: `កូដ CF "${codeUpper}" មានប្រើក្នុង Live នេះរួចហើយ។ សូមជ្រើសរើសកូដផ្សេង។` }, { status: 409 });
    }

    const liveProduct = await db.liveSessionProduct.create({
      data: {
        sessionId,
        productId: parsed.data.productId,
        variantId: parsed.data.variantId || null,
        cfCode: codeUpper,
        customTitle: parsed.data.customTitle || catalogProduct.name,
        customPrice: parsed.data.customPrice,
        imageUrl: parsed.data.imageUrl || catalogProduct.imageUrl,
        allocatedStock: parsed.data.allocatedStock,
        remainingStock: parsed.data.allocatedStock,
        position: parsed.data.position,
        posX: parsed.data.posX,
        posY: parsed.data.posY,
        scale: parsed.data.scale,
        cardSize: parsed.data.cardSize,
        isActive: true,
      },
      include: {
        product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true } },
      },
    });

    return NextResponse.json({ product: liveProduct }, { status: 201 });
  } catch (error) {
    console.error("Live product create error:", error);
    return NextResponse.json({ error: "មិនអាចបន្ថែមទំនិញទៅក្នុង Live បានទេ។" }, { status: 500 });
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

    // Check if this is a batch position/layout update request
    if (Array.isArray(json.batch)) {
      const parsedBatch = batchUpdateSchema.safeParse(json);
      if (!parsedBatch.success) {
        return NextResponse.json({ error: "ទិន្នន័យ batch មិនត្រឹមត្រូវ។", details: parsedBatch.error.flatten() }, { status: 400 });
      }

      const session = await db.liveSession.findFirst({
        where: { id: sessionId, storeId: context.storeId },
      });

      if (!session) {
        return NextResponse.json({ error: "រកមិនឃើញ Live Session នេះទេ។" }, { status: 404 });
      }

      await db.$transaction(
        parsedBatch.data.batch.map((item) =>
          db.liveSessionProduct.update({
            where: { id: item.id, sessionId },
            data: {
              ...(item.position !== undefined ? { position: item.position } : {}),
              ...(item.posX !== undefined ? { posX: item.posX } : {}),
              ...(item.posY !== undefined ? { posY: item.posY } : {}),
              ...(item.scale !== undefined ? { scale: item.scale } : {}),
              ...(item.cardSize !== undefined ? { cardSize: item.cardSize } : {}),
            },
          })
        )
      );

      const updatedProducts = await db.liveSessionProduct.findMany({
        where: { sessionId },
        orderBy: [{ position: "asc" }, { orderIndex: "asc" }, { cfCode: "asc" }],
        include: {
          product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true, price: true } },
          variant: { select: { id: true, name: true, sku: true, stock: true, price: true } },
        },
      });

      return NextResponse.json({ products: updatedProducts });
    }

    const parsed = updateProductSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "ទិន្នន័យមិនត្រឹមត្រូវ។", details: parsed.error.flatten() }, { status: 400 });
    }

    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញ Live Session នេះទេ។" }, { status: 404 });
    }

    const liveProduct = await db.liveSessionProduct.findFirst({
      where: { id: parsed.data.id, sessionId },
    });

    if (!liveProduct) {
      return NextResponse.json({ error: "រកមិនឃើញទំនិញ Live នេះទេ។" }, { status: 404 });
    }

    const codeUpper = parsed.data.cfCode ? parsed.data.cfCode.toUpperCase() : undefined;
    if (codeUpper && codeUpper !== liveProduct.cfCode) {
      const codeClash = await db.liveSessionProduct.findFirst({
        where: { sessionId, cfCode: codeUpper, id: { not: liveProduct.id } },
      });
      if (codeClash) {
        return NextResponse.json({ error: `កូដ CF "${codeUpper}" មានប្រើក្នុង Live នេះរួចហើយ។` }, { status: 409 });
      }
    }

    const updated = await db.liveSessionProduct.update({
      where: { id: liveProduct.id },
      data: {
        ...(codeUpper ? { cfCode: codeUpper } : {}),
        ...(parsed.data.customTitle !== undefined ? { customTitle: parsed.data.customTitle } : {}),
        ...(parsed.data.customPrice !== undefined ? { customPrice: parsed.data.customPrice } : {}),
        ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}),
        ...(parsed.data.remainingStock !== undefined ? { remainingStock: parsed.data.remainingStock } : {}),
        ...(parsed.data.allocatedStock !== undefined ? { allocatedStock: parsed.data.allocatedStock } : {}),
        ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
        ...(parsed.data.posX !== undefined ? { posX: parsed.data.posX } : {}),
        ...(parsed.data.posY !== undefined ? { posY: parsed.data.posY } : {}),
        ...(parsed.data.scale !== undefined ? { scale: parsed.data.scale } : {}),
        ...(parsed.data.cardSize !== undefined ? { cardSize: parsed.data.cardSize } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, stock: true, imageUrl: true } },
      },
    });

    return NextResponse.json({ product: updated });
  } catch (error) {
    console.error("Live product patch error:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែទំនិញ Live បានទេ។" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await props.params;
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("id");
    if (!productId) {
      return NextResponse.json({ error: "តម្រូវឱ្យមាន id នៃទំនិញ។" }, { status: 400 });
    }

    const session = await db.liveSession.findFirst({
      where: { id: sessionId, storeId: context.storeId },
    });

    if (!session) {
      return NextResponse.json({ error: "រកមិនឃើញ Live Session នេះទេ។" }, { status: 404 });
    }

    await db.liveSessionProduct.delete({
      where: { id: productId, sessionId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Live product delete error:", error);
    return NextResponse.json({ error: "មិនអាចលុបទំនិញពី Live បានទេ។" }, { status: 500 });
  }
}
