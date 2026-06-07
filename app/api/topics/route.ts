/**
 * Topics collection endpoint.
 *
 *   GET  /api/topics  -> list all topics (newest first)
 *   POST /api/topics  -> create a topic
 *
 * Topics are reusable prompts the scheduler turns into drafts on the global
 * generation schedule; they can also seed the on-demand Post Generator.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  asNonEmptyString,
  parseLength,
  parseTone,
  parseTopicStatus,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const topics = await prisma.topic.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ topics });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const text = asNonEmptyString(data.text);
  if (!text) {
    return NextResponse.json(
      { error: "`text` is required" },
      { status: 400 },
    );
  }

  const topic = await prisma.topic.create({
    data: {
      text,
      status: parseTopicStatus(data.status) ?? "ACTIVE",
      tone: parseTone(data.tone),
      length: parseLength(data.length),
    },
  });

  return NextResponse.json({ topic }, { status: 201 });
}
