/**
 * Publisher tick: the "auto-post on schedule" half of the loop.
 *
 * Polls APPROVED drafts whose `scheduledAt` is due (null means "as soon as
 * possible") and that still have retries left, then publishes each via
 * {@link publishPost}. On success the draft becomes PUBLISHED with its returned
 * URN; on failure `attempts` is incremented and the draft is either re-queued
 * with exponential backoff (re-using `scheduledAt` as the next-attempt time) or
 * marked FAILED once `maxPublishAttempts` is reached.
 */

import type { Draft } from "@/app/generated/prisma/client";
import { getWorkerConfig } from "@/lib/env";
import { getDefaultAccount } from "@/lib/linkedin/account";
import { publishPost } from "@/lib/linkedin/post";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/worker/log";

const log = createLogger("publisher");

export interface PublisherTickResult {
  due: number;
  published: number;
  retried: number;
  failed: number;
}

/** Exponential backoff (capped at 60 min) keyed off the prior attempt count. */
function backoffMs(priorAttempts: number): number {
  const minutes = Math.min(2 ** priorAttempts, 60);
  return minutes * 60_000;
}

async function publishOne(
  draft: Draft,
  maxAttempts: number,
  now: Date,
): Promise<"published" | "retried" | "failed"> {
  try {
    const account = draft.accountId
      ? await prisma.account.findUnique({ where: { id: draft.accountId } })
      : await getDefaultAccount();

    if (!account) {
      throw new Error("No connected LinkedIn account available to publish.");
    }

    const { urn } = await publishPost({
      accountId: account.id,
      authorUrn: account.authorUrn,
      commentary: draft.content,
    });

    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        linkedInPostUrn: urn,
        accountId: account.id,
        attempts: { increment: 1 },
        error: null,
      },
    });

    log.info("Published draft", { draftId: draft.id, urn });
    return "published";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = draft.attempts + 1;
    const giveUp = attempts >= maxAttempts;

    await prisma.draft.update({
      where: { id: draft.id },
      data: {
        status: giveUp ? "FAILED" : "APPROVED",
        attempts,
        error: message,
        // Re-queue with backoff; leave scheduledAt untouched once we give up.
        scheduledAt: giveUp
          ? draft.scheduledAt
          : new Date(now.getTime() + backoffMs(draft.attempts)),
      },
    });

    if (giveUp) {
      log.error("Draft failed permanently", {
        draftId: draft.id,
        attempts,
        error: message,
      });
      return "failed";
    }

    log.warn("Draft publish failed; will retry", {
      draftId: draft.id,
      attempts,
      error: message,
    });
    return "retried";
  }
}

/** Run a single publisher pass over the due APPROVED drafts. */
export async function runPublisherTick(
  now: Date = new Date(),
): Promise<PublisherTickResult> {
  const { maxPublishAttempts, publishBatchSize } = getWorkerConfig();

  const due = await prisma.draft.findMany({
    where: {
      status: "APPROVED",
      attempts: { lt: maxPublishAttempts },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: publishBatchSize,
  });

  let published = 0;
  let retried = 0;
  let failed = 0;

  for (const draft of due) {
    const outcome = await publishOne(draft, maxPublishAttempts, now);
    if (outcome === "published") published += 1;
    else if (outcome === "retried") retried += 1;
    else failed += 1;
  }

  const result: PublisherTickResult = {
    due: due.length,
    published,
    retried,
    failed,
  };
  log.info("Publisher tick complete", { ...result });
  return result;
}
