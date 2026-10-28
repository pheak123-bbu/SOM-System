import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { sanitizeAuditMetadata } from "./audit";

describe("Audit Log Sanitization", () => {
  it("redacts plain text passwords and sensitive keys", () => {
    const sensitiveData = {
      email: "owner@seller.com",
      password: "SuperSecretPassword123!",
      passwordHash: "$2b$12$eX4mpL3...",
      twoFactorSecret: "JBSWY3DPEHPK3PXP",
      recoveryCodes: ["code1", "code2"],
      storeName: "Eva Shopping",
      nested: {
        api_token: "xyz123abc",
        clientSecret: "very_secret",
        normalField: "allowed",
      },
    };

    const sanitized = sanitizeAuditMetadata(sensitiveData) as any;

    expect(sanitized.email).toBe("owner@seller.com");
    expect(sanitized.storeName).toBe("Eva Shopping");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.passwordHash).toBe("[REDACTED]");
    expect(sanitized.twoFactorSecret).toBe("[REDACTED]");
    expect(sanitized.recoveryCodes).toBe("[REDACTED]");
    expect(sanitized.nested.api_token).toBe("[REDACTED]");
    expect(sanitized.nested.clientSecret).toBe("[REDACTED]");
    expect(sanitized.nested.normalField).toBe("allowed");
  });
});
