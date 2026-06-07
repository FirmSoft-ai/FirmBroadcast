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

/** Always-needed core config (DB + app). */
export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_URL: optional("APP_URL") ?? "http://localhost:3000",
} as const;

/** Supabase Auth (email/password login). */
export function getSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
    redirectUri:
      optional("LINKEDIN_REDIRECT_URI") ??
      `${env.APP_URL}/api/auth/linkedin/callback`,
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
