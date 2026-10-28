import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  const { conversationId } = await params;
  try {
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, storeId: context.storeId },
      include: {
        customer: true,
        messages: { orderBy: { sentAt: "desc" }, take: 500 },
        suggestions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5 },
      },
    });
    if (!conversation) return NextResponse.json({ error: "រកមិនឃើញការសន្ទនាទេ។" }, { status: 404 });
    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("Conversation detail failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកការសន្ទនាបានទេ។" }, { status: 500 });
  }
}
