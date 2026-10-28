import { NextResponse } from "next/server";
import { getPendingAuth } from "@/lib/auth";
import { createTotpEnrollment } from "@/lib/totp-enrollment";

export async function POST() {
  const pending = await getPendingAuth();
  if (!pending || pending.step !== "setup") {
    return NextResponse.json({ error: "សូមចូលប្រើឡើងវិញ ដើម្បីកំណត់កម្មវិធីផ្ទៀងផ្ទាត់។" }, { status: 401 });
  }

  try {
    const enrollment = await createTotpEnrollment(pending.userId);
    return NextResponse.json(enrollment);
  } catch (error) {
    console.error("Authenticator enrollment setup failed:", error);
    return NextResponse.json({ error: "មិនអាចរៀបចំកម្មវិធីផ្ទៀងផ្ទាត់បានទេ។" }, { status: 500 });
  }
}
