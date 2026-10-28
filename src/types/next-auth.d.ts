import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      storeId: string;
      authVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    storeId: string;
    authVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    localUserId?: string;
    storeId?: string;
    authVersion?: number;
  }
}
