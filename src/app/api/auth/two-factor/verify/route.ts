import { NextResponse } from "next/server";
import { z } from "zod";
import { authCookieOptions, getPendingAuth, issuePendingAuth, issueSession, pendingAuthCookie, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptTotpSecret, generateRecoveryCodes, hashRecoveryCode, verifyTotp } from "@/lib/totp";

const schema = z.object({ code: z.string().regex(/^(?:\d{6}|[A-Za-z0-9_-]{12})$/) });
const maxAttempts = 5;

export async function POST(request: Request) {
  const pending = await getPendingAuth();
  if (!pending || !["setup", "verify"].includes(pending.step)) {
    return NextResponse.json({ error: "សូមចូលប្រើឡើងវិញ ដើម្បីបន្តការផ្ទៀងផ្ទាត់។" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់។" }, { status: 400 });

  try {
    const user = await db.user.findUnique({
      where: { id: pending.userId },
      select: {
        email: true, name: true, authVersion: true, twoFactorSecret: true, twoFactorEnabledAt: true,
        twoFactorFailedAttempts: true, twoFactorLockedUntil: true, twoFactorLastStep: true, mustChangePassword: true,
        twoFactorRecoveryCodes: true,
      },
    });
    if (!user || user.mustChangePassword || !user.twoFactorSecret || (pending.step === "verify" && !user.twoFactorEnabledAt)) {
      return NextResponse.json({ error: "មិនអាចផ្ទៀងផ្ទាត់គណនីនេះបានទេ។" }, { status: 401 });
    }
    const now = new Date();
    if (user.twoFactorLockedUntil && user.twoFactorLockedUntil > now) {
      return NextResponse.json({ error: "គណនីត្រូវបានផ្អាកការផ្ទៀងផ្ទាត់បណ្ដោះអាសន្ន។ សូមសាកល្បងម្ដងទៀតនៅពេលក្រោយ។" }, { status: 429 });
    }
    if (user.twoFactorFailedAttempts >= maxAttempts && user.twoFactorLockedUntil && user.twoFactorLockedUntil > now) {
      return NextResponse.json({ error: "ការផ្ទៀងផ្ទាត់ត្រូវបានចាក់សោបណ្ដោះអាសន្ន។ សូមសាកល្បងម្ដងទៀតនៅពេលក្រោយ។" }, { status: 429 });
    }
    if (user.twoFactorFailedAttempts >= maxAttempts || (user.twoFactorLockedUntil && user.twoFactorLockedUntil <= now)) {
      await db.user.updateMany({
        where: { id: pending.userId, authVersion: pending.authVersion },
        data: { twoFactorFailedAttempts: 0, twoFactorLockedUntil: null },
      });
    }

    const recoveryHash = /^\d{6}$/.test(parsed.data.code) ? null : hashRecoveryCode(parsed.data.code);
    const recoveryUsed = recoveryHash !== null && user.twoFactorRecoveryCodes.includes(recoveryHash);
    const step = recoveryHash === null ? verifyTotp(decryptTotpSecret(user.twoFactorSecret), parsed.data.code) : null;
    if (!recoveryUsed && step === null) {
      const failed = await db.user.updateMany({
        where: { id: pending.userId, authVersion: pending.authVersion },
        data: { twoFactorFailedAttempts: { increment: 1 } },
      });
      if (failed.count !== 1) {
        return NextResponse.json({ error: "សូមចូលប្រើឡើងវិញ ដើម្បីបន្តការផ្ទៀងផ្ទាត់។" }, { status: 401 });
      }
      const currentUser = await db.user.findUnique({
        where: { id: pending.userId },
        select: { twoFactorFailedAttempts: true, authVersion: true },
      });
      if (!currentUser || currentUser.authVersion !== pending.authVersion) {
        return NextResponse.json({ error: "សូមចូលប្រើឡើងវិញ ដើម្បីបន្តការផ្ទៀងផ្ទាត់។" }, { status: 401 });
      }
      if (currentUser.twoFactorFailedAttempts >= maxAttempts) {
        await db.user.updateMany({
          where: { id: pending.userId, authVersion: pending.authVersion },
          data: { twoFactorLockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
        });
        return NextResponse.json({ error: "បញ្ចូលលេខកូដមិនត្រឹមត្រូវច្រើនដងពេក។ សូមសាកល្បងម្ដងទៀតក្រោយ ១៥ នាទី។" }, { status: 429 });
      }
      return NextResponse.json({ error: "លេខកូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវទេ។" }, { status: 401 });
    }

    const recoveryCodes = pending.step === "setup" && step !== null ? generateRecoveryCodes() : [];
    const recoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
    const updated = await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: recoveryUsed
          ? {
            id: pending.userId,
            authVersion: pending.authVersion,
            twoFactorRecoveryCodes: {
              has: recoveryHash ?? "",
              equals: user.twoFactorRecoveryCodes,
            },
          }
          : {
            id: pending.userId,
            authVersion: pending.authVersion,
            OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: BigInt(step ?? 0) } }],
          },
        data: {
          twoFactorLastStep: step === null ? undefined : BigInt(step),
          twoFactorEnabledAt: pending.step === "setup" ? new Date() : undefined,
          twoFactorRecoveryCodes: recoveryUsed
            ? { set: user.twoFactorRecoveryCodes.filter((hash) => hash !== recoveryHash) }
            : pending.step === "setup" ? { set: recoveryCodeHashes } : undefined,
          twoFactorFailedAttempts: 0,
          twoFactorLockedUntil: null,
        },
      });
      if (changed.count === 1 && recoveryUsed) {
        await tx.auditLog.create({
          data: {
            storeId: pending.storeId,
            userId: pending.userId,
            action: "USER_TWO_FACTOR_RECOVERY_USED",
            entity: "User",
            entityId: pending.userId,
            metadata: {},
          },
        });
      }
      return changed;
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: "លេខកូដនេះត្រូវបានប្រើរួចហើយ។ សូមបញ្ចូលលេខកូដថ្មី។" }, { status: 409 });
    }

    if (pending.step === "setup" && recoveryCodes.length > 0) {
      const token = await issuePendingAuth(pending.userId, pending.storeId, "recovery", pending.authVersion);
      const response = NextResponse.json({ recoveryCodes });
      response.cookies.set(pendingAuthCookie.name, token, authCookieOptions(pendingAuthCookie.maxAge));
      return response;
    }
    const token = await issueSession(pending.userId, pending.storeId, user.authVersion);
    const response = NextResponse.json({ user: { name: user.name, email: user.email } });
    response.cookies.set(sessionCookie.name, token, authCookieOptions(sessionCookie.maxAge));
    response.cookies.set(pendingAuthCookie.name, "", authCookieOptions(0));
    return response;
  } catch (error) {
    console.error("Authenticator verification failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទៀងផ្ទាត់លេខកូដបានទេ។" }, { status: 500 });
  }
}
