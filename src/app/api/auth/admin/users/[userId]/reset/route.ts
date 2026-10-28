import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetKeycloakUserPassword } from "@/lib/keycloak-admin";

const resetSchema = z.object({
  password: z.string().min(8, "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។").max(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role !== MembershipRole.OWNER) return NextResponse.json({ error: "មានតែម្ចាស់ហាងប៉ុណ្ណោះដែលអាចកំណត់ពាក្យសម្ងាត់ឡើងវិញបាន។" }, { status: 403 });

  const parsed = resetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ (យ៉ាងហោចណាស់ ៨ តួអក្សរ)។", details: parsed.error.flatten() }, { status: 400 });

  const { userId } = await params;
  try {
    const user = await db.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { storeId: context.storeId } },
      },
      select: { id: true, email: true, name: true },
    });

    if (!user) return NextResponse.json({ error: "រកមិនឃើញអ្នកប្រើប្រាស់នេះទេ។" }, { status: 404 });

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // Update password in Keycloak
    await resetKeycloakUserPassword(user.email, parsed.data.password).catch((err) =>
      console.warn("Keycloak password sync notice:", err),
    );

    await db.auditLog.create({
      data: {
        storeId: context.storeId,
        userId: context.userId,
        action: "PASSWORD_RESET_BY_ADMIN",
        entity: "User",
        entityId: user.id,
        metadata: { targetEmail: user.email },
      },
    });

    return NextResponse.json({ success: true, message: "បានកំណត់ពាក្យសម្ងាត់ឡើងវិញដោយជោគជ័យ។" });
  } catch (error) {
    console.error("Admin reset password failed:", error);
    return NextResponse.json({ error: "មិនអាចកំណត់ពាក្យសម្ងាត់ឡើងវិញបានទេ។" }, { status: 500 });
  }
}
