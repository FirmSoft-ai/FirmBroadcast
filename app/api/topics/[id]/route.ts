/**
 * Single-topic endpoint.
 *
 *   PATCH  /api/topics/:id  -> update text/status/tone/length
 *   DELETE /api/topics/:id  -> remove a topic (drafts keep, topicId set null)
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  asNonEmptyString,
  parseLength,
  parseTone,
  parseTopicStatus,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const update: Prisma.TopicUpdateInput = {};

  if ("text" in data) {
    const text = asNonEmptyString(data.text);
    if (!text) {
      return NextResponse.json(
        { error: "`text` cannot be empty" },
        { status: 400 },
      );
    }
    update.text = text;
  }
  if ("status" in data) {
    const status = parseTopicStatus(data.status);
    if (!status) {
      return NextResponse.json(
        { error: "`status` must be ACTIVE or PAUSED" },
        { status: 400 },
      );
    }
    update.status = status;
  }
  if ("tone" in data) update.tone = parseTone(data.tone) ?? null;
  if ("length" in data) update.length = parseLength(data.length) ?? null;

  try {
    const topic = await prisma.topic.update({ where: { id }, data: update });
    return NextResponse.json({ topic });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    await prisma.topic.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
    throw err;
  }
}
