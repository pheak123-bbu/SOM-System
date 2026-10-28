import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
let connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL must be configured.");

// If running directly on Windows/host where container hostname "db" cannot be resolved
if (typeof window === "undefined" && connectionString.includes("@db:5432/")) {
  const isHostEnvironment = process.platform === "win32" || process.env.LOCAL_DEV === "true";
  if (isHostEnvironment) {
    const localDbPort = process.env.LOCAL_DB_PORT || "5433";
    connectionString = connectionString.replace("@db:5432/", `@127.0.0.1:${localDbPort}/`);
  }
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
