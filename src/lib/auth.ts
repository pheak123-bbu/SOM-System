import { cookies } from "next/headers";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/keycloak-auth";

const cookieName = "ssom_session";
const sessionDuration = 60 * 60 * 12;
const pendingAuthCookieName = "ssom_pending_auth";
const pendingAuthDuration = 60 * 10;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function issueSession(userId: string, storeId: string, authVersion: number) {
  return new SignJWT({ storeId, authVersion, mfaVerified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${sessionDuration}s`)
    .sign(secretKey());
}

export type PendingAuthStep = "password-change" | "setup" | "verify" | "recovery";

export async function issuePendingAuth(userId: string, storeId: string, step: PendingAuthStep, authVersion: number) {
  return new SignJWT({ storeId, step, authVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${pendingAuthDuration}s`)
    .sign(secretKey());
}

export async function getPendingAuth() {
  const token = (await cookies()).get(pendingAuthCookieName)?.value;
  if (!token) return null;
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    return null;
  }
  if (!payload.sub || typeof payload.storeId !== "string" || typeof payload.step !== "string"
    || typeof payload.authVersion !== "number" || !Number.isSafeInteger(payload.authVersion)) return null;
  if (!["password-change", "setup", "verify", "recovery"].includes(payload.step)) return null;
  const membership = await db.storeMembership.findUnique({
    where: { userId_storeId: { userId: payload.sub, storeId: payload.storeId } },
    select: { user: { select: { authVersion: true } } },
  });
  if (!membership || membership.user.authVersion !== payload.authVersion) return null;
  return {
    userId: payload.sub,
    storeId: payload.storeId,
    step: payload.step as PendingAuthStep,
    authVersion: payload.authVersion,
  };
}

export async function getAuthContext() {
  const session = await getServerSession(authOptions);
  const { id: userId, storeId, authVersion } = session?.user ?? {};
  if (typeof userId !== "string" || typeof storeId !== "string" || typeof authVersion !== "number") return null;
  const membership = await db.storeMembership.findUnique({
    where: { userId_storeId: { userId, storeId } },
    include: { user: { select: { id: true, name: true, email: true, authVersion: true, avatarUrl: true } }, store: true },
  });
  if (!membership || membership.user.authVersion !== authVersion) return null;
  return membership;
}

export const sessionCookie = { name: cookieName, maxAge: sessionDuration };
export const pendingAuthCookie = { name: pendingAuthCookieName, maxAge: pendingAuthDuration };

export function authCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
