import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authCookieOptions, getPendingAuth, issueSession, pendingAuthCookie, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ password: z.string().min(12).max(128) });

export async function POST(request: Request) {
  const pending = await getPendingAuth();
  if (!pending || pending.step !== "password-change") {
    return NextResponse.json({ error: "សូមចូលប្រើឡើងវិញ ដើម្បីប្ដូរពាក្យសម្ងាត់។" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ពាក្យសម្ងាត់ថ្មីត្រូវមានចន្លោះពី ១២ ដល់ ១២៨ តួអក្សរ។" }, { status: 400 });

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: pending.userId,
          mustChangePassword: true,
          authVersion: pending.authVersion,
        },
        data: { passwordHash, mustChangePassword: false, authVersion: { increment: 1 } },
      });
      if (changed.count === 1) {
        await tx.auditLog.create({
          data: {
            storeId: pending.storeId,
            userId: pending.userId,
            action: "USER_PASSWORD_CHANGED",
            entity: "User",
            entityId: pending.userId,
            metadata: {},
          },
        });
      }
      return changed;
    });
    if (result.count !== 1) return NextResponse.json({ error: "សំណើប្ដូរពាក្យសម្ងាត់នេះមិនអាចប្រើបានទេ។" }, { status: 409 });
    const authVersion = pending.authVersion + 1;
    const token = await issueSession(pending.userId, pending.storeId, authVersion);
    const response = NextResponse.json({ step: "complete" });
    response.cookies.set(sessionCookie.name, token, authCookieOptions(sessionCookie.maxAge));
    response.cookies.set(pendingAuthCookie.name, "", authCookieOptions(0));
    return response;
  } catch (error) {
    console.error("Required password change failed:", error);
    return NextResponse.json({ error: "មិនអាចប្ដូរពាក្យសម្ងាត់បានទេ។" }, { status: 500 });
  }
}
