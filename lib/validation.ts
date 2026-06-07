/**
 * Lightweight request-body validation helpers shared across API routes.
 *
 * The app intentionally avoids a schema library for now; these narrow,
 * purpose-built guards keep route handlers small and type-safe.
 */

import {
  POST_LENGTHS,
  POST_TONES,
  type PostLength,
  type PostTone,
} from "@/lib/post-options";

/** Coerce unknown input to a non-empty trimmed string, or null. */
export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Parse an allowed tone, falling back to undefined for absent/invalid input. */
export function parseTone(value: unknown): PostTone | undefined {
  return typeof value === "string" && (POST_TONES as readonly string[]).includes(value)
    ? (value as PostTone)
    : undefined;
}

/** Parse an allowed length, falling back to undefined for absent/invalid input. */
export function parseLength(value: unknown): PostLength | undefined {
  return typeof value === "string" &&
    (POST_LENGTHS as readonly string[]).includes(value)
    ? (value as PostLength)
    : undefined;
}

/** Parse a Topic status, defaulting to undefined when not provided/invalid. */
export function parseTopicStatus(value: unknown): "ACTIVE" | "PAUSED" | undefined {
  return value === "ACTIVE" || value === "PAUSED" ? value : undefined;
}

/**
 * Draft statuses a human can set from the approval dashboard. PUBLISHED/FAILED
 * are owned by the publisher worker and are intentionally excluded here.
 */
export const REVIEWABLE_DRAFT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
] as const;

export type ReviewableDraftStatus = (typeof REVIEWABLE_DRAFT_STATUSES)[number];

/** Parse a human-settable Draft status, or undefined when invalid/absent. */
export function parseDraftStatus(
  value: unknown,
): ReviewableDraftStatus | undefined {
  return typeof value === "string" &&
    (REVIEWABLE_DRAFT_STATUSES as readonly string[]).includes(value)
    ? (value as ReviewableDraftStatus)
    : undefined;
}

/** Sentinel returned by {@link parseScheduledAt} for malformed date input. */
export const INVALID_DATE = Symbol("INVALID_DATE");

/**
 * Parse an optional publish time for a draft.
 *  - `null`/empty string -> `null` (clear any schedule; publish ASAP)
 *  - valid ISO date string -> `Date`
 *  - anything else -> {@link INVALID_DATE}
 */
export function parseScheduledAt(
  value: unknown,
): Date | null | typeof INVALID_DATE {
  if (value === null) return null;
  if (typeof value !== "string") return INVALID_DATE;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? INVALID_DATE : date;
}
