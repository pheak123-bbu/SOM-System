import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  // Only Owner and Admin can inspect security & audit logs
  if (context.role !== "OWNER" && context.role !== "ADMIN") {
    return NextResponse.json({ error: "អ្នកគ្មានសិទ្ធិមើលកំណត់ត្រាសុវត្ថិភាព (Audit Logs) ទេ។" }, { status: 403 });
  }

  // Rate limit: max 60 audit log requests per minute per store
  const rate = await checkRateLimit(`audit:${context.storeId}`, 60, 60);
  if (!rate.success) {
    return NextResponse.json({ error: "សំណើច្រើនពេកក្នុងពេលតែមួយ។ សូមរង់ចាំបន្តិច។" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
  const action = searchParams.get("action") || undefined;
  const entity = searchParams.get("entity") || undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  try {
    const where: any = {
      storeId: context.storeId,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(search ? {
        OR: [
          { action: { contains: search, mode: "insensitive" } },
          { entity: { contains: search, mode: "insensitive" } },
          { entityId: { contains: search, mode: "insensitive" } },
          { user: { name: { contains: search, mode: "insensitive" } } },
          { user: { email: { contains: search, mode: "insensitive" } } },
        ],
      } : {}),
    };

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              memberships: {
                where: { storeId: context.storeId },
                select: { role: true },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      logs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        user: log.user ? {
          id: log.user.id,
          name: log.user.name,
          email: log.user.email,
          avatarUrl: log.user.avatarUrl,
          role: log.user.memberships[0]?.role || "STAFF",
        } : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Audit logs query error:", error);
    return NextResponse.json({ error: "មិនអាចទាញយកកំណត់ត្រាសកម្មភាពបានទេ។" }, { status: 500 });
  }
}
