import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  try {
    const products = await db.product.findMany({
      where: { storeId: context.storeId, active: true },
      include: {
        variants: { where: { active: true } },
      },
      orderBy: { name: "asc" },
    });

    let totalUnitsInStock = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockAlerts: Array<{
      productId: string;
      productName: string;
      sku: string | null;
      variantId?: string | null;
      variantName?: string | null;
      currentStock: number;
      lowStockThreshold: number;
      status: "OUT_OF_STOCK" | "LOW_STOCK";
    }> = [];

    for (const prod of products) {
      const threshold = prod.lowStockAlert ?? 5;

      if (prod.variants.length > 0) {
        for (const variant of prod.variants) {
          if (variant.stock !== null) {
            totalUnitsInStock += variant.stock;
            if (variant.stock === 0) {
              outOfStockCount++;
              lowStockAlerts.push({
                productId: prod.id,
                productName: prod.name,
                sku: variant.sku || prod.sku,
                variantId: variant.id,
                variantName: variant.name,
                currentStock: 0,
                lowStockThreshold: threshold,
                status: "OUT_OF_STOCK",
              });
            } else if (variant.stock <= threshold) {
              lowStockCount++;
              lowStockAlerts.push({
                productId: prod.id,
                productName: prod.name,
                sku: variant.sku || prod.sku,
                variantId: variant.id,
                variantName: variant.name,
                currentStock: variant.stock,
                lowStockThreshold: threshold,
                status: "LOW_STOCK",
              });
            }
          }
        }
      } else if (prod.stock !== null) {
        totalUnitsInStock += prod.stock;
        if (prod.stock === 0) {
          outOfStockCount++;
          lowStockAlerts.push({
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            currentStock: 0,
            lowStockThreshold: threshold,
            status: "OUT_OF_STOCK",
          });
        } else if (prod.stock <= threshold) {
          lowStockCount++;
          lowStockAlerts.push({
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            currentStock: prod.stock,
            lowStockThreshold: threshold,
            status: "LOW_STOCK",
          });
        }
      }
    }

    // Sort low stock alerts: out of stock first, then by lowest stock
    lowStockAlerts.sort((a, b) => a.currentStock - b.currentStock);

    // Get today's movements count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayMovementsCount = await db.stockMovement.count({
      where: {
        storeId: context.storeId,
        createdAt: { gte: startOfToday },
      },
    });

    return NextResponse.json({
      summary: {
        totalTrackedProducts: products.length,
        totalUnitsInStock,
        lowStockCount,
        outOfStockCount,
        todayMovementsCount,
      },
      lowStockAlerts: lowStockAlerts.slice(0, 50),
    });
  } catch (error) {
    console.error("Fetch inventory summary failed:", error);
    return NextResponse.json(
      { error: "មិនអាចផ្ទុកទិន្នន័យសង្ខេបស្តុកបានទេ។" },
      { status: 500 }
    );
  }
}
