import { execSync } from "child_process";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/seed-runner.mjs <DATABASE_URL>");
  process.exit(1);
}

process.env.DATABASE_URL = url;
process.env.SEED_OWNER_EMAIL = "owner@socialseller.local";
process.env.SEED_OWNER_PASSWORD = "SocialSellerLocalOnly-2026!";

console.log("Pushing Prisma schema to database...");
execSync(`npx prisma db push --url "${url}"`, { stdio: "inherit", env: process.env });

console.log("Seeding database with fashion products and demo store...");
execSync(`npx tsx prisma/seed.ts`, { stdio: "inherit", env: process.env });

console.log("Done successfully!");
