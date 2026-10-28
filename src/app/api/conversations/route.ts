import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  try {
    const conversations = await db.conversation.findMany({
      where: {
        storeId: context.storeId,
        ...(search ? { OR: [
          { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
          { messages: { some: { body: { contains: search, mode: "insensitive" } } } },
        ] } : {}),
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
        suggestions: { where: { status: "PENDING" }, select: { id: true, intent: true, confidence: true }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ conversations });
  } catch (error) {
    console.error("Conversation list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកការសន្ទនាបានទេ។" }, { status: 500 });
  }
}
