/**
 * Single-draft endpoint powering the approval dashboard.
 *
 *   GET    /api/drafts/:id  -> fetch one draft (with its topic)
 *   PATCH  /api/drafts/:id  -> edit content and/or move PENDING/APPROVED/REJECTED
 *   DELETE /api/drafts/:id  -> remove a draft
 *
 * Only review-stage statuses are settable here; PUBLISHED/FAILED transitions
 * are owned by the publisher worker (Phase 5).
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  asNonEmptyString,
  INVALID_DATE,
  parseDraftStatus,
  parseScheduledAt,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const draft = await prisma.draft.findUnique({
    where: { id },
    include: { topic: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  return NextResponse.json({ draft });
}

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
  const update: Prisma.DraftUpdateInput = {};

  if ("content" in data) {
    const content = asNonEmptyString(data.content);
    if (!content) {
      return NextResponse.json(
        { error: "`content` cannot be empty" },
        { status: 400 },
      );
    }
    update.content = content;
  }

  if ("status" in data) {
    const status = parseDraftStatus(data.status);
    if (!status) {
      return NextResponse.json(
        { error: "`status` must be PENDING, APPROVED, or REJECTED" },
        { status: 400 },
      );
    }
    update.status = status;
    // Clearing a prior failure keeps the queue tidy when re-reviewing.
    if (status !== "REJECTED") {
      update.error = null;
      // Re-reviewing resets the publisher's retry budget for this draft.
      update.attempts = 0;
    }
  }

  if ("scheduledAt" in data) {
    const scheduledAt = parseScheduledAt(data.scheduledAt);
    if (scheduledAt === INVALID_DATE) {
      return NextResponse.json(
        { error: "`scheduledAt` must be an ISO date string or null" },
        { status: 400 },
      );
    }
    update.scheduledAt = scheduledAt;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "Provide `content` and/or `status` to update" },
      { status: 400 },
    );
  }

  try {
    const draft = await prisma.draft.update({
      where: { id },
      data: update,
      include: { topic: true },
    });
    return NextResponse.json({ draft });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
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
    await prisma.draft.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    throw err;
  }
}
