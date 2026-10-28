import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Password login has been disabled. Sign in with Keycloak." },
    { status: 410 },
  );
}
