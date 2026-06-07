import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";
import { PrismaClient } from "@/app/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Reuse a single PrismaClient across hot reloads in development to avoid
 * exhausting database connections. In production a fresh client is created.
 *
 * Prisma 7's `prisma-client` generator requires a driver adapter; we use the
 * pg adapter for Supabase Postgres.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isSupabaseDatabase(connectionString: string): boolean {
  return /supabase\.(?:co|com)/i.test(connectionString);
}

function createPoolConfig(connectionString: string): PoolConfig {
  const config: PoolConfig = { connectionString };

  // Supabase requires SSL; cap pool size for serverless runtimes.
  if (isSupabaseDatabase(connectionString)) {
    config.ssl = { rejectUnauthorized: false };
    config.max = 1;
  }

  return config;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(createPoolConfig(env.DATABASE_URL));
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
