/**
 * Scheduler tick: the "generate on a cadence" half of the autoposter loop.
 *
 * When the generation schedule is due (decided by the worker's master tick),
 * this walks every ACTIVE topic and generates a fresh post via the active LLM
 * provider, storing each as a PENDING draft (`source = "SCHEDULER"`) for human
 * approval. A topic's `lastRunAt` is bumped after a successful generation; a
 * transient model error simply leaves that topic to retry on the next due tick.
 */

import { generatePost } from "@/lib/llm";
import { prisma } from "@/lib/prisma";
import { parseLength, parseTone } from "@/lib/validation";
import { createLogger } from "@/worker/log";

const log = createLogger("scheduler");

export interface SchedulerTickResult {
  considered: number;
  generated: number;
  failed: number;
}

/** Run a single scheduler pass over all ACTIVE topics. */
export async function runSchedulerTick(
  now: Date = new Date(),
): Promise<SchedulerTickResult> {
  const topics = await prisma.topic.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  let generated = 0;
  let failed = 0;

  for (const topic of topics) {
    try {
      const result = await generatePost(topic.text, {
        tone: parseTone(topic.tone),
        length: parseLength(topic.length),
      });

      await prisma.draft.create({
        data: {
          topicId: topic.id,
          content: result.content,
          status: "PENDING",
          source: "SCHEDULER",
          tone: result.tone,
          length: result.length,
        },
      });

      await prisma.topic.update({
        where: { id: topic.id },
        data: { lastRunAt: now },
      });

      generated += 1;
      log.info("Generated draft from topic", { topicId: topic.id });
    } catch (err) {
      failed += 1;
      log.error("Topic generation failed", {
        topicId: topic.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result: SchedulerTickResult = {
    considered: topics.length,
    generated,
    failed,
  };
  log.info("Scheduler tick complete", { ...result });
  return result;
}
