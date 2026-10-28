import { describe, expect, it, vi } from "vitest";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpCode,
  verifyTotp,
} from "./totp";

describe("authenticator TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpCode(secret, 1)).toBe("287082");
  });

  it("verifies a code only within the allowed time window", () => {
    const now = 1_700_000_000_000;
    const secret = generateTotpSecret();
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpCode(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, "invalid", now)).toBeNull();
    expect(verifyTotp(secret, "000000", now + 300_000)).toBeNull();
  });

  it("encrypts secrets at rest and rejects tampering", () => {
    vi.stubEnv("MFA_ENCRYPTION_KEY", "a separate stable mfa encryption test key");
    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
    const [iv, tag, cipher] = encrypted.split(".");
    expect(() => decryptTotpSecret(`${iv}.${tag}.${Buffer.from(cipher, "base64url").fill(0).toString("base64url")}`)).toThrow();
    vi.unstubAllEnvs();
  });

  it("generates unique one-time recovery codes with case-normalized hashes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z0-9_-]{12}$/.test(code))).toBe(true);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase()));
  });
});
