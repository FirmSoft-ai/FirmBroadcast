/**
 * Draft generation endpoint (shared by the Post Generator page).
 *
 *   POST /api/drafts/generate
 *
 * Accepts EITHER a saved `topicId` OR an ad-hoc `topic` string, plus optional
 * `tone`, `length`, and free-form `instructions`. Runs the Gemini generator and
 * either returns a preview (`save: false`) or persists a PENDING draft.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePost } from "@/lib/llm";
import {
  asNonEmptyString,
  parseLength,
  parseTone,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  const topicId = asNonEmptyString(data.topicId);
  let topicText = asNonEmptyString(data.topic);
  let tone = parseTone(data.tone);
  let length = parseLength(data.length);
  const instructions = asNonEmptyString(data.instructions) ?? undefined;
  const save = data.save !== false; // default: persist a PENDING draft

  // A saved topic seeds both the prompt text and any default tone/length.
  if (topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    topicText = topicText ?? topic.text;
    tone = tone ?? parseTone(topic.tone);
    length = length ?? parseLength(topic.length);
  }

  if (!topicText) {
    return NextResponse.json(
      { error: "Provide a `topic` string or a valid `topicId`" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await generatePost(topicText, { tone, length, instructions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate post";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  if (!save) {
    return NextResponse.json({
      preview: true,
      content: result.content,
      tone: result.tone,
      length: result.length,
    });
  }

  const draft = await prisma.draft.create({
    data: {
      topicId: topicId ?? undefined,
      content: result.content,
      status: "PENDING",
      source: "MANUAL",
      tone: result.tone,
      length: result.length,
    },
  });

  return NextResponse.json({ draft }, { status: 201 });
}
