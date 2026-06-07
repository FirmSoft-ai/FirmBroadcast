/**
 * Provider-agnostic prompt construction + output cleanup for LinkedIn posts.
 *
 * Shared by every LLM adapter so the post style, length guidance, and sanitize
 * rules stay identical no matter which model generates the text.
 */

import type { PostLength, PostTone } from "@/lib/post-options";

/** LinkedIn hard-caps post text at 3000 chars; we stay well under that. */
export const MAX_POST_CHARS = 1300;

const LENGTH_GUIDANCE: Record<PostLength, string> = {
  short: "Keep it tight: roughly 300-500 characters, 1-2 short paragraphs.",
  medium: "Aim for roughly 600-900 characters across 2-3 short paragraphs.",
  long: `Go in-depth: roughly 1000-${MAX_POST_CHARS} characters across 3-4 short paragraphs.`,
};

/** Build the system instruction shared across providers. */
export function buildSystemPrompt(tone: PostTone, length: PostLength): string {
  return [
    "You are an expert LinkedIn ghostwriter who writes high-engagement posts for professionals.",
    "Write a single LinkedIn post about the user's topic. Follow these rules strictly:",
    "- Open with a strong scroll-stopping hook in the first line.",
    "- Follow with a concise, valuable body that delivers a clear insight or story.",
    "- End with a call-to-action or a question that invites comments.",
    "- Add 3-5 relevant hashtags on the final line.",
    `- Adopt a ${tone} tone.`,
    `- ${LENGTH_GUIDANCE[length]}`,
    `- Never exceed ${MAX_POST_CHARS} characters total.`,
    "- Output PLAIN TEXT only. Do NOT use markdown, bold, italics, headings, or code fences.",
    "- Use line breaks for readability. Emojis are allowed sparingly when they fit the tone.",
    "- Return ONLY the post text, with no preamble, labels, or surrounding quotation marks.",
  ].join("\n");
}

/** Build the user-facing prompt from the topic + optional extra steering. */
export function buildUserPrompt(topic: string, instructions?: string): string {
  return [
    `Topic: ${topic}`,
    instructions ? `Additional guidance: ${instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip stray markdown/quote artifacts and enforce the character cap. */
export function sanitize(text: string): string {
  let out = text.trim();

  // Remove a wrapping pair of quotes the model sometimes adds.
  if (
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith("'") && out.endsWith("'"))
  ) {
    out = out.slice(1, -1).trim();
  }

  // Drop leftover markdown emphasis markers and heading hashes at line starts.
  out = out
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S.*?\S)\*(?=\s|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "");

  if (out.length > MAX_POST_CHARS) {
    out = out.slice(0, MAX_POST_CHARS).trimEnd();
  }

  return out;
}
