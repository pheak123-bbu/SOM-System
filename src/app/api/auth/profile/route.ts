import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const profileSchema = z.object({
  name: z.string().trim().min(1, "ឈ្មោះមិនអាចទទេបានទេ").max(120).optional(),
  avatarUrl: z.string().trim().optional().nullable(),
});

export async function GET() {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: context.userId },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "រកមិនឃើញគណនីអ្នកប្រើទេ។" }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      ...user,
      role: context.role,
    },
  });
}

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (!context) {
    return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ព័ត៌មានមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await db.user.update({
      where: { id: context.userId },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl || null } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    });

    await db.auditLog.create({
      data: {
        storeId: context.storeId,
        userId: context.userId,
        action: "PROFILE_UPDATED",
        entity: "User",
        entityId: context.userId,
        metadata: {
          name: updated.name,
          hasAvatar: Boolean(updated.avatarUrl),
        },
      },
    });

    return NextResponse.json({
      ok: true,
      user: {
        ...updated,
        role: context.role,
      },
      message: "បានធ្វើបច្ចុប្បន្នភាពប្រវត្តិរូបជោគជ័យ។",
    });
  } catch (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែប្រវត្តិរូបបានទេ។" }, { status: 500 });
  }
}
