import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "secret",
  "token",
  "twofactorsecret",
  "recoverycodes",
  "authsecret",
  "cookie",
  "clientsecret",
  "key",
  "credential",
  "credentials",
]);

/**
 * Recursively redacts any sensitive credentials (passwords, tokens, secrets)
 * so that hacker or log reader can NEVER see plain-text auth secrets.
 */
export function sanitizeAuditMetadata(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeAuditMetadata);
  }

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token")
    ) {
      clean[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      clean[key] = sanitizeAuditMetadata(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export interface RecordAuditInput {
  storeId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates an immutable audit log record with sanitized metadata.
 */
export async function recordAudit(
  input: RecordAuditInput,
  tx?: Prisma.TransactionClient
) {
  const runner = tx || db;
  const safeMetadata = input.metadata ? (sanitizeAuditMetadata(input.metadata) as Prisma.InputJsonValue) : Prisma.JsonNull;

  try {
    if (!runner?.auditLog?.create) {
      return null;
    }
    return await runner.auditLog.create({
      data: {
        storeId: input.storeId,
        userId: input.userId || null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId || null,
        metadata: safeMetadata,
      },
    });
  } catch (error) {
    // Non-blocking: audit log failure should not crash primary transaction
    console.error("Failed to write audit log:", error);
    return null;
  }
}
