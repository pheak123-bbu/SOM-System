import { NextResponse } from "next/server";
import { authCookieOptions, getPendingAuth, issueSession, pendingAuthCookie, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const pending = await getPendingAuth();
  if (!pending || pending.step !== "recovery") {
    return NextResponse.json({ error: "សូមបញ្ចប់ការកំណត់កម្មវិធីផ្ទៀងផ្ទាត់ជាមុន។" }, { status: 401 });
  }
  try {
    const user = await db.user.findUnique({
      where: { id: pending.userId },
      select: { id: true, name: true, email: true, authVersion: true, twoFactorEnabledAt: true, mustChangePassword: true },
    });
    if (!user || !user.twoFactorEnabledAt || user.mustChangePassword) {
      return NextResponse.json({ error: "មិនអាចបញ្ចប់ការចូលប្រើនេះបានទេ។" }, { status: 401 });
    }
    const token = await issueSession(user.id, pending.storeId, user.authVersion);
    const response = NextResponse.json({ user: { name: user.name, email: user.email } });
    response.cookies.set(sessionCookie.name, token, authCookieOptions(sessionCookie.maxAge));
    response.cookies.set(pendingAuthCookie.name, "", authCookieOptions(0));
    return response;
  } catch (error) {
    console.error("Authenticator enrollment completion failed:", error);
    return NextResponse.json({ error: "មិនអាចបញ្ចប់ការចូលប្រើបានទេ។" }, { status: 500 });
  }
}
