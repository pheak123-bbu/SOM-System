import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const periodSeconds = 30;

export function generateTotpSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let secret = "";
  for (let index = 0; index < bits.length; index += 5) {
    secret += alphabet[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return secret;
}

function decodeBase32(secret: string) {
  const normalized = secret.replace(/[\s=-]/g, "").toUpperCase();
  if (!normalized || /[^A-Z2-7]/.test(normalized)) throw new Error("Invalid authenticator secret.");
  const bits = [...normalized].map((character) => alphabet.indexOf(character).toString(2).padStart(5, "0")).join("");
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  }
  return bytes;
}

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(now / 1000 / periodSeconds);
  const supplied = Buffer.from(code);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;
    if (step < 0) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return step;
  }
  return null;
}

function encryptionKey() {
  const secret = process.env.MFA_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("MFA_ENCRYPTION_KEY must contain at least 32 characters and remain stable.");
  return createHash("sha256").update(secret).digest();
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptTotpSecret(value: string) {
  const [ivValue, tagValue, encryptedValue, ...extra] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue || extra.length) throw new Error("Invalid encrypted authenticator secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function authenticatorUri(email: string, secret: string) {
  const issuer = "SOM";
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${periodSeconds}`;
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => randomBytes(9).toString("base64url").toUpperCase());
}

export function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}
