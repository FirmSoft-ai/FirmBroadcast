/**
 * Typed, validated access to environment variables.
 *
 * Variables are grouped so that features which are not yet wired up (LinkedIn
 * OAuth, Gemini) don't crash the app at boot. Call the matching getter where a
 * value is actually required and it will throw a clear error if missing.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

function appendQueryParam(url: string, key: string, value: string): string {
  if (url.includes(`${key}=`)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${key}=${value}`;
}

import {
  assertSupabaseCredentials,
  parsePostgresHost,
} from "@/lib/database-url";

/**
 * Normalize Supabase pooler URLs for Prisma on serverless (Vercel, etc.).
 * Transaction mode (port 6543) needs pgbouncer=true and a low connection limit.
 */
function normalizeDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string. SQLite (file:…) is not supported with the pg adapter.",
    );
  }

  const host = parsePostgresHost(trimmed);
  const usesTransactionPooler =
    host?.includes("pooler.supabase.com") && trimmed.includes(":6543");

  let normalized = trimmed;
  if (usesTransactionPooler) {
    normalized = appendQueryParam(normalized, "pgbouncer", "true");
    normalized = appendQueryParam(normalized, "connection_limit", "1");
  }

  return normalized;
}

/** Fail fast in production when DATABASE_URL cannot work from serverless. */
function assertServerlessDatabaseUrl(url: string): void {
  if (process.env.NODE_ENV !== "production") return;

  const host = parsePostgresHost(url);
  if (!host) return;

  if (host === "localhost" || host === "127.0.0.1") {
    throw new Error(
      "DATABASE_URL points to localhost, which is unreachable on Vercel. Set DATABASE_URL to your Supabase Transaction pooler URL (port 6543, ?pgbouncer=true).",
    );
  }

  if (/^db\.[^.]+\.supabase\.co$/i.test(host)) {
    throw new Error(
      "DATABASE_URL uses Supabase direct connection (db.*.supabase.co), which is unreachable from Vercel serverless. In Vercel env vars, set DATABASE_URL to the Transaction pooler URL from Supabase → Connect → ORMs → Prisma (host aws-0-[region].pooler.supabase.com, port 6543, ?pgbouncer=true). Keep the direct URL in DIRECT_URL for local migrations only.",
    );
  }
}

function resolveDatabaseUrl(): string {
  const url = normalizeDatabaseUrl(required("DATABASE_URL"));
  assertSupabaseCredentials(url, "DATABASE_URL");
  assertServerlessDatabaseUrl(url);
  return url;
}

/** Always-needed core config (DB + app). */
export const env = {
  DATABASE_URL: resolveDatabaseUrl(),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: optional("APP_URL") ?? "http://localhost:3000",
} as const;

function getSupabasePublishableKey(): string {
  const publishable = optional("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (publishable) return publishable;

  const legacyAnon = optional("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (legacyAnon) return legacyAnon;

  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)",
  );
}

/** Supabase Auth (email/password login). */
export function getSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getSupabasePublishableKey(),
  };
}

/** Key used to encrypt LinkedIn tokens at rest (32-byte, base64 or hex). */
export function getEncryptionKey(): string {
  return required("APP_ENCRYPTION_KEY");
}

/** LinkedIn OAuth credentials (Phase 2). */
export function getLinkedInConfig() {
  return {
    clientId: required("LINKEDIN_CLIENT_ID"),
    clientSecret: required("LINKEDIN_CLIENT_SECRET"),
    redirectUri: `https://${env.APP_URL}/api/auth/linkedin/callback`,
  };
}

/**
 * Versioned LinkedIn REST API date sent as the `LinkedIn-Version` header on
 * `POST /rest/posts`. LinkedIn ships monthly versions in `YYYYMM` form.
 */
export function getLinkedInApiVersion(): string {
  return optional("LINKEDIN_API_VERSION") ?? "202605";
}

function positiveInt(name: string, fallback: number): number {
  const raw = optional(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Publisher worker config (Phase 5). Generation/publishing *schedules* now live
 * in the DB (managed from Settings); only the publish safety limits remain in
 * env so they can be tuned per-deploy.
 */
export function getWorkerConfig() {
  return {
    /** Give up (mark FAILED) after this many publish attempts. */
    maxPublishAttempts: positiveInt("MAX_PUBLISH_ATTEMPTS", 5),
    /** Max approved drafts published per publisher tick (rate-limit guard). */
    publishBatchSize: positiveInt("PUBLISH_BATCH_SIZE", 5),
  };
}
