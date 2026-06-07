/**
 * Regenerate the content of an existing draft.
 *
 *   POST /api/drafts/:id/regenerate
 *
 * Re-runs Gemini and overwrites the draft's content in place, resetting it to
 * PENDING. The source prompt is, in order of precedence: an explicit `topic`
 * in the request body, the linked Topic's text, or the draft's current content.
 * Optional `tone`, `length`, and `instructions` override the draft's stored
 * generation hints.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePost } from "@/lib/llm";
import { asNonEmptyString, parseLength, parseTone } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Body is optional — regenerate-as-is must work with no payload.
  let data: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // No/invalid body: fall back to the draft's stored settings.
  }

  const draft = await prisma.draft.findUnique({
    where: { id },
    include: { topic: true },
  });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const topicText =
    asNonEmptyString(data.topic) ??
    asNonEmptyString(draft.topic?.text) ??
    draft.content;

  const tone =
    parseTone(data.tone) ??
    parseTone(draft.tone) ??
    parseTone(draft.topic?.tone);
  const length =
    parseLength(data.length) ??
    parseLength(draft.length) ??
    parseLength(draft.topic?.length);
  const instructions = asNonEmptyString(data.instructions) ?? undefined;

  let result;
  try {
    result = await generatePost(topicText, { tone, length, instructions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to regenerate post";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const updated = await prisma.draft.update({
    where: { id },
    data: {
      content: result.content,
      tone: result.tone,
      length: result.length,
      status: "PENDING",
      error: null,
    },
    include: { topic: true },
  });

  return NextResponse.json({ draft: updated });
}
