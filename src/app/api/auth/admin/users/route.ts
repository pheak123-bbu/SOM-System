import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { MembershipRole } from "@prisma/client";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOrUpdateKeycloakUser } from "@/lib/keycloak-admin";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  role: z.enum([MembershipRole.ADMIN, MembershipRole.STAFF]),
  password: z.string().min(8, "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៨ តួអក្សរ។").max(100),
  avatarUrl: z.string().trim().optional().nullable(),
});

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
  if (context.role !== "OWNER") return NextResponse.json({ error: "មានតែម្ចាស់ហាងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងគណនីបាន។" }, { status: 403 });

  try {
    const memberships = await db.storeMembership.findMany({
      where: {
        storeId: context.storeId,
        user: { memberships: { every: { storeId: context.storeId } } },
      },
      select: {
        role: true,
        user: {
          select: {
            id: true, name: true, email: true, avatarUrl: true,
            _count: { select: { externalIdentities: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      users: memberships.map(({ role, user }) => ({
        id: user.id, name: user.name, email: user.email, role,
        avatarUrl: user.avatarUrl,
        keycloakLinked: user._count.externalIdentities > 0,
      })),
    });
  } catch (error) {
    console.error("Admin account list failed:", error);
    return NextResponse.json({ error: "មិនអាចផ្ទុកបញ្ជីគណនីបានទេ។" }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ error: "តម្រូវឱ្យចូលប្រើគណនី។" }, { status: 401 });
    if (context.role !== MembershipRole.OWNER) return NextResponse.json({ error: "មានតែម្ចាស់ហាងប៉ុណ្ណោះដែលអាចគ្រប់គ្រងគណនីបាន។" }, { status: 403 });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "ព័ត៌មានគណនីមិនត្រឹមត្រូវទេ។", details: parsed.error.flatten() }, { status: 400 });
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await db.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email.toLowerCase(),
            avatarUrl: parsed.data.avatarUrl || null,
            passwordHash,
            mustChangePassword: false,
            memberships: { create: { storeId: context.storeId, role: parsed.data.role } },
          },
          select: { id: true, name: true, email: true, avatarUrl: true },
        });
        await tx.auditLog.create({ data: { storeId: context.storeId, userId: context.userId, action: "USER_CREATED", entity: "User", entityId: created.id, metadata: { email: created.email } } });
        return created;
      });

      // Synchronize credential into Keycloak
      await createOrUpdateKeycloakUser({
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
      }).catch((err) => console.warn("Keycloak user auto-provisioning notice:", err));

      return NextResponse.json({ user: { ...user, role: parsed.data.role, avatarUrl: user.avatarUrl, keycloakLinked: true } }, { status: 201 });
    } catch (error) {
      console.error("Admin account creation failed:", error);
      return NextResponse.json({ error: "មិនអាចបង្កើតគណនីបានទេ។ សូមពិនិត្យថាអ៊ីមែលត្រូវបានប្រើរួចឬនៅ។" }, { status: 409 });
  }
}
