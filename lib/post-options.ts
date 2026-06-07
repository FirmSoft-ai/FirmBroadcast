/**
 * Client-safe shared constants for post generation options.
 *
 * Kept separate from `lib/llm/gemini.ts` so UI (client) components can import
 * the option lists without pulling the server-only Gemini SDK / env into the
 * browser bundle.
 */

/** Supported writing tones for generated posts. */
export const POST_TONES = [
  "professional",
  "conversational",
  "inspirational",
  "bold",
  "storytelling",
] as const;

export type PostTone = (typeof POST_TONES)[number];

/** Supported target lengths, mapped to an approximate character budget. */
export const POST_LENGTHS = ["short", "medium", "long"] as const;

export type PostLength = (typeof POST_LENGTHS)[number];

/** Human-friendly labels for length options. */
export const LENGTH_LABELS: Record<PostLength, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
};
