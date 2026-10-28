import { NextResponse } from "next/server";
import { OrderStatus, Prisma, SalesChannel } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayStartInZone, storeDayStart } from "@/lib/dates";

const querySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  days: z.coerce.number().int().min(7).max(366).default(30),
});
const salesStatuses = [OrderStatus.CONFIRMED, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

function asDateKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "ចន្លោះកាលបរិច្ឆេទរបាយការណ៍មិនត្រឹមត្រូវទេ។" }, { status: 400 });
  const now = new Date();
  const timezone = context.store.timezone;
  const toDate = parsed.data.to ?? asDateKey(now, timezone);
  const defaultFrom = new Date(storeDayStart(now, timezone).getTime() - (parsed.data.days - 1) * 86_400_000);
  const fromDate = parsed.data.from ?? asDateKey(defaultFrom, timezone);
  try {
    const start = dayStartInZone(fromDate, timezone);
    const endExclusive = new Date(dayStartInZone(toDate, timezone).getTime() + 86_400_000);
    if (start > endExclusive) return NextResponse.json({ error: "កាលបរិច្ឆេទចាប់ផ្ដើមត្រូវតែមុនកាលបរិច្ឆេទបញ្ចប់។" }, { status: 400 });
    const where = { storeId: context.storeId, status: { in: salesStatuses }, createdAt: { gte: start, lt: endExclusive } };
    const [aggregate, orders, allStatuses, suggestionCounts] = await Promise.all([
      db.order.aggregate({ where, _sum: { total: true }, _avg: { total: true }, _count: { _all: true } }),
      db.order.findMany({
        where,
        select: { total: true, createdAt: true, channel: true, items: { select: { productId: true, productName: true, quantity: true, lineTotal: true } } },
      }),
      db.order.groupBy({ by: ["status"], where: { storeId: context.storeId, createdAt: { gte: start, lt: endExclusive } }, _count: { _all: true } }),
      db.orderSuggestion.groupBy({ by: ["status"], where: { storeId: context.storeId, createdAt: { gte: start, lt: endExclusive } }, _count: { _all: true } }),
    ]);

    const days = new Map<string, { date: string; sales: number; orders: number }>();
    for (let cursor = start.getTime(); cursor < endExclusive.getTime(); cursor += 86_400_000) {
      const key = asDateKey(new Date(cursor), timezone);
      days.set(key, { date: key, sales: 0, orders: 0 });
    }
    const channelTotals = new Map<SalesChannel, { channel: SalesChannel; sales: number; orders: number }>();
    const productTotals = new Map<string, { name: string; units: number; sales: number }>();
    for (const order of orders) {
      const dateKey = asDateKey(order.createdAt, timezone);
      const day = days.get(dateKey);
      if (day) { day.sales += Number(order.total); day.orders += 1; }
      const channel = channelTotals.get(order.channel) ?? { channel: order.channel, sales: 0, orders: 0 };
      channel.sales += Number(order.total);
      channel.orders += 1;
      channelTotals.set(order.channel, channel);
      for (const item of order.items) {
        const key = item.productId ?? item.productName;
        const product = productTotals.get(key) ?? { name: item.productName, units: 0, sales: 0 };
        product.units += item.quantity;
        product.sales += Number(item.lineTotal);
        productTotals.set(key, product);
      }
    }
    const statusCounts = Object.fromEntries(allStatuses.map(({ status, _count }) => [status, _count._all]));
    const suggestionStatusCounts = Object.fromEntries(suggestionCounts.map(({ status, _count }) => [status, _count._all]));
    const totalSales = Number(aggregate._sum.total ?? new Prisma.Decimal(0));
    return NextResponse.json({
      range: { from: fromDate, to: toDate, timezone, salesDefinition: "Confirmed, processing, shipped, and delivered orders; excludes drafts, pending confirmations, and cancelled orders." },
      summary: { sales: totalSales, orders: aggregate._count._all, averageOrderValue: Number(aggregate._avg.total ?? new Prisma.Decimal(0)) },
      timeSeries: [...days.values()],
      channels: [...channelTotals.values()].sort((a, b) => b.sales - a.sales),
      bestSellers: [...productTotals.values()].sort((a, b) => b.units - a.units).slice(0, 8),
      statuses: statusCounts,
      suggestions: suggestionStatusCounts,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid report date.") return NextResponse.json({ error: "កាលបរិច្ឆេទរបាយការណ៍មិនត្រឹមត្រូវទេ។" }, { status: 400 });
    console.error("Report query failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកទិន្នន័យរបាយការណ៍បានទេ។" }, { status: 500 });
  }
}
