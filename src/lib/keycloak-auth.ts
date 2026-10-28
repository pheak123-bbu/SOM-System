import { Prisma } from "@prisma/client";
import type { NextAuthOptions, Profile } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/+$/, "");
const internalIssuer = (process.env.KEYCLOAK_INTERNAL_URL || issuer)?.replace(/\/+$/, "");
const clientId = process.env.KEYCLOAK_CLIENT_ID;
const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

export const keycloakConfigured = Boolean(issuer && internalIssuer && clientId && clientSecret && nextAuthSecret);

async function resolveIdentity(profile: Profile) {
  const subject = profile.sub;
  if (typeof subject !== "string" || !subject) return null;

  // 1. Check if this Keycloak subject is already linked to an existing user
  const existing = await db.externalIdentity.findFirst({
    where: { subject },
    include: {
      user: {
        select: {
          id: true,
          memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { storeId: true } },
        },
      },
    },
  });
  if (existing) {
    const membership = existing.user.memberships[0];
    return membership ? { userId: existing.user.id, storeId: membership.storeId } : null;
  }

  // 2. Extract email from profile (email or preferred_username if formatted as email)
  const candidateEmail = (
    (typeof profile.email === "string" && profile.email.trim()) ||
    ("preferred_username" in profile && typeof profile.preferred_username === "string" && profile.preferred_username.includes("@") ? profile.preferred_username.trim() : "")
  ).toLowerCase();

  if (!candidateEmail) return null;

  const user = await db.user.findUnique({
    where: { email: candidateEmail },
    select: {
      id: true,
      memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { storeId: true } },
    },
  });
  const membership = user?.memberships[0];
  if (!user || !membership) return null;

  const currentIssuer = issuer || "http://localhost:8180/realms/social-seller";

  try {
    await db.$transaction(async (tx) => {
      await tx.externalIdentity.upsert({
        where: { issuer_subject: { issuer: currentIssuer, subject } },
        create: { issuer: currentIssuer, subject, userId: user.id },
        update: { userId: user.id },
      });
      await tx.auditLog.create({
        data: {
          storeId: membership.storeId,
          userId: user.id,
          action: "KEYCLOAK_IDENTITY_LINKED",
          entity: "User",
          entityId: user.id,
          metadata: { issuer: currentIssuer, email: candidateEmail },
        },
      });
    });
    return { userId: user.id, storeId: membership.storeId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const linked = await db.externalIdentity.findFirst({
        where: { subject },
        include: {
          user: {
            select: {
              id: true,
              memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { storeId: true } },
            },
          },
        },
      });
      const linkedMembership = linked?.user.memberships[0];
      return linked && linkedMembership
        ? { userId: linked.user.id, storeId: linkedMembership.storeId }
        : null;
    }
    throw error;
  }
}

const credentialsProvider = CredentialsProvider({
  id: "credentials",
  name: "Email and Password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    if (!credentials?.email || !credentials?.password) return null;
    const email = credentials.email.trim().toLowerCase();

    // Brute-force protection: max 5 login attempts per email per 60 seconds
    const rateCheck = await checkRateLimit(`auth:${email}`, 5, 60);
    if (!rateCheck.success) {
      // Find user store to record audit log if possible
      const targetUser = await db.user.findUnique({
        where: { email },
        include: { memberships: { take: 1, select: { storeId: true } } },
      });
      if (targetUser?.memberships[0]) {
        await recordAudit({
          storeId: targetUser.memberships[0].storeId,
          userId: targetUser.id,
          action: "AUTH_RATE_LIMIT_TRIGGERED",
          entity: "Security",
          metadata: { email, message: "Exceeded 5 login attempts per 60s" },
        });
      }
      throw new Error("ការប៉ុនប៉ងចូលគណនីច្រើនដងពេក។ សូមរង់ចាំ ១ នាទី រួចសាកល្បងម្ដងទៀត។");
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        memberships: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { storeId: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      return null;
    }

    const valid = await bcrypt.compare(credentials.password, user.passwordHash);
    const membership = user.memberships[0];

    if (!valid) {
      if (membership) {
        await recordAudit({
          storeId: membership.storeId,
          userId: user.id,
          action: "USER_LOGIN_FAILED",
          entity: "User",
          entityId: user.id,
          metadata: { email, reason: "INVALID_PASSWORD" },
        });
      }
      return null;
    }

    if (!membership) return null;

    await recordAudit({
      storeId: membership.storeId,
      userId: user.id,
      action: "USER_LOGIN_SUCCESS",
      entity: "User",
      entityId: user.id,
      metadata: { email },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      storeId: membership.storeId,
      authVersion: user.authVersion,
    };
  },
});

const keycloakAuthProviders: NextAuthOptions["providers"] = issuer && internalIssuer && clientId && clientSecret
  ? [
      credentialsProvider,
      KeycloakProvider({
        issuer,
        clientId,
        clientSecret,
        wellKnown: undefined,
        authorization: {
          url: `${issuer}/protocol/openid-connect/auth`,
          params: { scope: "openid email profile", kc_locale: "km" },
        },
        token: `${internalIssuer}/protocol/openid-connect/token`,
        userinfo: `${internalIssuer}/protocol/openid-connect/userinfo`,
        jwks_endpoint: `${internalIssuer}/protocol/openid-connect/certs`,
      }),
    ]
  : [credentialsProvider];

export const authOptions: NextAuthOptions = {
  providers: keycloakAuthProviders,
  secret: nextAuthSecret,
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "credentials") {
        return Boolean(user && user.id);
      }
      if (!keycloakConfigured || account?.provider !== "keycloak" || !profile) return false;
      return Boolean(await resolveIdentity(profile));
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.localUserId = user.id;
        token.storeId = user.storeId;
        token.authVersion = user.authVersion;
      }
      if (account?.provider === "keycloak" && profile) {
        const identity = await resolveIdentity(profile);
        if (!identity) throw new Error("The Keycloak account is not linked to an authorized store user.");
        const u = await db.user.findUnique({
          where: { id: identity.userId },
          select: { authVersion: true },
        });
        if (!u) throw new Error("The linked application user no longer exists.");
        token.localUserId = identity.userId;
        token.storeId = identity.storeId;
        token.authVersion = u.authVersion;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.localUserId === "string"
        && typeof token.storeId === "string" && typeof token.authVersion === "number") {
        session.user.id = token.localUserId;
        session.user.storeId = token.storeId;
        session.user.authVersion = token.authVersion;
      }
      return session;
    },
  },
};
