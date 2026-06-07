/**
 * Manual publish endpoint — the "Publish now" action on the dashboard.
 *
 *   POST /api/drafts/:id/publish
 *
 * Publishes an APPROVED (or previously FAILED) draft to LinkedIn immediately,
 * reusing the same `publishPost` path the publisher worker uses. On success the
 * draft becomes PUBLISHED with its returned URN; on failure the error is stored
 * and the draft is left for another attempt.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getDefaultAccount } from "@/lib/linkedin/account";
import { publishPost } from "@/lib/linkedin/post";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const draft = await prisma.draft.findUnique({ where: { id } });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  if (draft.status !== "APPROVED" && draft.status !== "FAILED") {
    return NextResponse.json(
      { error: "Only approved drafts can be published." },
      { status: 409 },
    );
  }

  const account = draft.accountId
    ? await prisma.account.findUnique({ where: { id: draft.accountId } })
    : await getDefaultAccount();

  if (!account) {
    return NextResponse.json(
      { error: "No connected LinkedIn account available to publish." },
      { status: 400 },
    );
  }

  try {
    const { urn } = await publishPost({
      accountId: account.id,
      authorUrn: account.authorUrn,
      commentary: draft.content,
    });

    const updated = await prisma.draft.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        linkedInPostUrn: urn,
        accountId: account.id,
        attempts: { increment: 1 },
        error: null,
      },
      include: { topic: true },
    });

    return NextResponse.json({ draft: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    const updated = await prisma.draft.update({
      where: { id },
      data: {
        status: "APPROVED",
        attempts: { increment: 1 },
        error: message,
        accountId: account.id,
      },
      include: { topic: true },
    });
    return NextResponse.json({ draft: updated, error: message }, { status: 502 });
  }
}
