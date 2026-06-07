/**
 * Drafts collection endpoint.
 *
 *   GET  /api/drafts        -> list drafts (cursor-paginated; optional ?status=)
 *   POST /api/drafts        -> create a PENDING draft from supplied content
 *
 * The GET path is cursor-paginated (`?limit=` + `?cursor=`) and also returns
 * per-status counts so the dashboard can show tab badges and a "Load more"
 * control that scales as the queue grows. The POST path lets the Post Generator
 * save a previewed/edited post without re-running the model.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  asNonEmptyString,
  parseLength,
  parseTone,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

const DRAFT_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
  "FAILED",
] as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const statusParam = params.get("status");
  const status =
    statusParam && (DRAFT_STATUSES as readonly string[]).includes(statusParam)
      ? statusParam
      : undefined;

  const limitParam = Number(params.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const cursor = params.get("cursor") ?? undefined;

  const drafts = await prisma.draft.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { topic: true },
    take: limit + 1, // fetch one extra to detect a next page
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = drafts.length > limit;
  const page = hasMore ? drafts.slice(0, limit) : drafts;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  // Per-status counts (plus total) for the filter tabs.
  const grouped = await prisma.draft.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = { ALL: 0 };
  for (const s of DRAFT_STATUSES) counts[s] = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    counts.ALL += g._count._all;
  }

  return NextResponse.json({ drafts: page, nextCursor, counts });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const content = asNonEmptyString(data.content);
  if (!content) {
    return NextResponse.json(
      { error: "`content` is required" },
      { status: 400 },
    );
  }

  const topicId = asNonEmptyString(data.topicId);
  if (topicId) {
    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (!topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
  }

  const draft = await prisma.draft.create({
    data: {
      topicId: topicId ?? undefined,
      content,
      status: "PENDING",
      source: "MANUAL",
      tone: parseTone(data.tone),
      length: parseLength(data.length),
    },
  });

  return NextResponse.json({ draft }, { status: 201 });
}
