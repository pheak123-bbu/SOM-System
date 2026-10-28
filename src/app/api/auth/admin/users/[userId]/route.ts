import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resetKeycloakUserPassword } from "@/lib/keycloak-admin";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  role: z.enum([MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.STAFF]),
  password: z.string().min(8, "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។").max(100).optional().nullable().or(z.literal("")),
  avatarUrl: z.string().trim().optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role !== MembershipRole.OWNER) return NextResponse.json({ error: "មានតែម្ចាស់ហាងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងគណនីបាន។" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានគណនីមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
  const { userId } = await params;
  try {
    const memberships = await db.storeMembership.findMany({
      where: { userId, user: { memberships: { every: { storeId: context.storeId } } } },
      select: { id: true, role: true },
    });
    if (memberships.length !== 1) return NextResponse.json({ error: "មិនអាចកែប្រែគណនីដែលមិនមានក្នុងហាងនេះ ឬភ្ជាប់ទៅហាងផ្សេងបានទេ។" }, { status: 404 });
    if (memberships[0].role === MembershipRole.OWNER && parsed.data.role !== MembershipRole.OWNER) {
      const owners = await db.storeMembership.count({ where: { storeId: context.storeId, role: MembershipRole.OWNER } });
      if (owners <= 1) return NextResponse.json({ error: "មិនអាចបន្ថយតួនាទីម្ចាស់ហាងតែម្នាក់គត់បានទេ។" }, { status: 409 });
    }

    const newPassword = parsed.data.password && parsed.data.password.trim() ? parsed.data.password.trim() : null;
    const passwordHash = newPassword ? await bcrypt.hash(newPassword, 12) : undefined;

    const user = await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl || null } : {}),
          ...(passwordHash ? { passwordHash, mustChangePassword: false } : {}),
          authVersion: { increment: 1 },
        },
      });
      await tx.storeMembership.update({ where: { id: memberships[0].id }, data: { role: parsed.data.role } });
      const updated = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, avatarUrl: true, _count: { select: { externalIdentities: true } } },
      });
      await tx.auditLog.create({
        data: {
          storeId: context.storeId,
          userId: context.userId,
          action: newPassword ? "USER_AND_PASSWORD_UPDATED" : "USER_UPDATED",
          entity: "User",
          entityId: userId,
          metadata: { email: updated.email, role: parsed.data.role, passwordChanged: Boolean(newPassword) },
        },
      });
      return updated;
    });

    if (newPassword) {
      await resetKeycloakUserPassword(user.email, newPassword).catch((err) =>
        console.warn("Keycloak password sync notice:", err),
      );
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: parsed.data.role, avatarUrl: user.avatarUrl, keycloakLinked: user._count.externalIdentities > 0 },
    });
  } catch (error) {
    console.error("Admin account update failed:", error);
    return NextResponse.json({ error: "មិនអាចកែប្រែគណនីបានទេ។ សូមពិនិត្យថាអ៊ីមែលមិនស្ទួន។" }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role !== MembershipRole.OWNER) return NextResponse.json({ error: "មានតែម្ចាស់ហាងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងគណនីបាន។" }, { status: 403 });
  const { userId } = await params;
  if (userId === context.userId) return NextResponse.json({ error: "មិនអាចលុបគណនីដែលកំពុងប្រើបានទេ។" }, { status: 409 });
  try {
    const membership = await db.storeMembership.findUnique({
      where: { userId_storeId: { userId, storeId: context.storeId } },
      select: { id: true, role: true, user: { select: { email: true, memberships: { select: { storeId: true } }, _count: { select: { reviews: true } } } } },
    });
    if (!membership) return NextResponse.json({ error: "រកមិនឃើញគណនីក្នុងហាងនេះទេ។" }, { status: 404 });
    if (membership.user.memberships.length !== 1) return NextResponse.json({ error: "មិនអាចលុបគណនីដែលភ្ជាប់ទៅហាងផ្សេងបានទេ។" }, { status: 409 });
    if (membership.user._count.reviews > 0) return NextResponse.json({ error: "មិនអាចលុបគណនីដែលមានប្រវត្តិពិនិត្យសំណើបានទេ ដើម្បីរក្សាកំណត់ត្រាប្រវត្តិ។" }, { status: 409 });
    if (membership.role === MembershipRole.OWNER) {
      const owners = await db.storeMembership.count({ where: { storeId: context.storeId, role: MembershipRole.OWNER } });
      if (owners <= 1) return NextResponse.json({ error: "មិនអាចលុបម្ចាស់ហាងតែម្នាក់គត់បានទេ។" }, { status: 409 });
    }
    await db.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "USER_DELETED", entity: "User", entityId: userId, metadata: { email: membership.user.email } } });
      await tx.user.delete({ where: { id: userId } });
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Admin account deletion failed:", error);
    return NextResponse.json({ error: "មិនអាចលុបគណនីបានទេ។" }, { status: 500 });
  }
}
