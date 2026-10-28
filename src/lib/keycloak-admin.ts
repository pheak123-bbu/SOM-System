import { db } from "@/lib/db";

function getKeycloakAdminBaseUrl(): string {
  if (process.env.KEYCLOAK_INTERNAL_URL) {
    return process.env.KEYCLOAK_INTERNAL_URL.replace(/\/realms\/.*$/, "").replace(/\/+$/, "");
  }
  if (process.env.KEYCLOAK_ISSUER_BASE_URL) {
    return process.env.KEYCLOAK_ISSUER_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.KEYCLOAK_ISSUER) {
    return process.env.KEYCLOAK_ISSUER.replace(/\/realms\/.*$/, "").replace(/\/+$/, "");
  }
  return "http://localhost:8180";
}

const REALM = "social-seller";

async function getAdminAccessToken(): Promise<string | null> {
  const username = process.env.KEYCLOAK_ADMIN_USERNAME || "local-admin";
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (!password) {
    console.warn("KEYCLOAK_ADMIN_PASSWORD is not set in environment.");
    return null;
  }

  const baseCandidates = [
    getKeycloakAdminBaseUrl(),
    "http://keycloak:8080",
    "http://127.0.0.1:8180",
    "http://localhost:8180",
  ];

  for (const base of Array.from(new Set(baseCandidates))) {
    try {
      const response = await fetch(`${base}/realms/master/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "admin-cli",
          username,
          password,
          grant_type: "password",
        }),
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.access_token) return data.access_token;
      }
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function findKeycloakUserByEmail(email: string) {
  const token = await getAdminAccessToken();
  if (!token) return null;

  const baseCandidates = [getKeycloakAdminBaseUrl(), "http://keycloak:8080", "http://127.0.0.1:8180", "http://localhost:8180"];
  for (const base of Array.from(new Set(baseCandidates))) {
    try {
      const url = `${base}/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const users = await response.json();
        if (Array.isArray(users) && users.length > 0) return { user: users[0], base, token };
      }
    } catch {
      // try next
    }
  }
  return null;
}

export async function createOrUpdateKeycloakUser(input: {
  name: string;
  email: string;
  password?: string;
}): Promise<{ success: boolean; error?: string }> {
  const token = await getAdminAccessToken();
  if (!token) {
    console.warn("Could not obtain Keycloak admin token; skipping Keycloak user sync.");
    return { success: false, error: "Keycloak admin is unreachable" };
  }

  const existing = await findKeycloakUserByEmail(input.email);
  const base = existing?.base || getKeycloakAdminBaseUrl();

  if (existing?.user?.id) {
    // If password provided, update password
    if (input.password) {
      const resetRes = await fetch(`${base}/admin/realms/${REALM}/users/${existing.user.id}/reset-password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "password",
          value: input.password,
          temporary: false,
        }),
      });
      if (!resetRes.ok) {
        return { success: false, error: "Failed to reset Keycloak user password" };
      }
    }
    return { success: true };
  }

  // Create new user in Keycloak
  const nameParts = input.name.trim().split(/\s+/);
  const firstName = nameParts[0] || input.name;
  const lastName = nameParts.slice(1).join(" ") || "";

  const payload: Record<string, unknown> = {
    username: input.email.trim().toLowerCase(),
    email: input.email.trim().toLowerCase(),
    firstName,
    lastName,
    enabled: true,
    emailVerified: true,
  };

  if (input.password) {
    payload.credentials = [
      {
        type: "password",
        value: input.password,
        temporary: false,
      },
    ];
  }

  const createRes = await fetch(`${base}/admin/realms/${REALM}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok && createRes.status !== 409) {
    const errorText = await createRes.text().catch(() => "");
    console.error("Keycloak user creation failed:", createRes.status, errorText);
    return { success: false, error: "Failed to create user in Keycloak" };
  }

  return { success: true };
}

export async function resetKeycloakUserPassword(
  email: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const found = await findKeycloakUserByEmail(email);
  if (!found || !found.user?.id) {
    // If not in Keycloak yet, create user with password
    return createOrUpdateKeycloakUser({ name: email.split("@")[0], email, password: newPassword });
  }

  const resetRes = await fetch(`${found.base}/admin/realms/${REALM}/users/${found.user.id}/reset-password`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${found.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "password",
      value: newPassword,
      temporary: false,
    }),
  });

  if (!resetRes.ok) {
    const errorText = await resetRes.text().catch(() => "");
    console.error("Keycloak reset password failed:", resetRes.status, errorText);
    return { success: false, error: "Failed to update password in Keycloak" };
  }

  return { success: true };
}

export async function deleteKeycloakUser(email: string): Promise<boolean> {
  const found = await findKeycloakUserByEmail(email);
  if (!found || !found.user?.id) return false;

  const res = await fetch(`${found.base}/admin/realms/${REALM}/users/${found.user.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${found.token}` },
  });

  return res.ok;
}
