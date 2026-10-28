import QRCode from "qrcode";
import { db } from "@/lib/db";
import { authenticatorUri, decryptTotpSecret, encryptTotpSecret, generateTotpSecret } from "@/lib/totp";

export async function createTotpEnrollment(userId: string) {
  let user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorSecret: true, twoFactorEnabledAt: true },
  });
  if (!user || user.twoFactorEnabledAt) throw new Error("Authenticator enrollment is not available.");

  if (!user.twoFactorSecret) {
    const secret = generateTotpSecret();
    await db.user.updateMany({
      where: { id: userId, twoFactorSecret: null, twoFactorEnabledAt: null },
      data: { twoFactorSecret: encryptTotpSecret(secret) },
    });
    user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorSecret: true, twoFactorEnabledAt: true },
    });
    if (!user || user.twoFactorEnabledAt || !user.twoFactorSecret) {
      throw new Error("Authenticator enrollment could not be initialized.");
    }
  }

  const secret = decryptTotpSecret(user.twoFactorSecret);
  const uri = authenticatorUri(user.email, secret);
  const qrCode = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 224,
    color: { dark: "#172238", light: "#ffffff" },
  });
  return { secret, qrCode };
}
