import { NextResponse } from "next/server";
import { authCookieOptions, pendingAuthCookie, sessionCookie } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", authCookieOptions(0));
  response.cookies.set(pendingAuthCookie.name, "", authCookieOptions(0));
  return response;
}
