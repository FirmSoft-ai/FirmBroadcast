import { isScheduleDue } from "@/lib/schedule";
import {
  getResolvedSchedules,
  markGenerationRun,
  markPublishRun,
} from "@/lib/settings";
import { createLogger } from "@/worker/log";
import { runPublisherTick } from "@/worker/publisher";
import { runSchedulerTick } from "@/worker/scheduler";

const log = createLogger("cron");

export interface CronTickResult {
  generation: { ran: boolean; result?: Awaited<ReturnType<typeof runSchedulerTick>> };
  publishing: { ran: boolean; result?: Awaited<ReturnType<typeof runPublisherTick>> };
}

/** One cron tick: consult DB schedules and run whatever is due. */
export async function runCronTick(now: Date = new Date()): Promise<CronTickResult> {
  const cfg = await getResolvedSchedules();
  const result: CronTickResult = {
    generation: { ran: false },
    publishing: { ran: false },
  };

  if (
    cfg.generationEnabled &&
    isScheduleDue(cfg.generationSchedule, cfg.lastGenerationAt, now)
  ) {
    log.info("Generation due; running scheduler tick");
    result.generation.ran = true;
    result.generation.result = await runSchedulerTick(now);
    await markGenerationRun(now);
  }

  if (
    cfg.publishingEnabled &&
    isScheduleDue(cfg.publishingSchedule, cfg.lastPublishAt, now)
  ) {
    log.info("Publishing due; running publisher tick");
    result.publishing.ran = true;
    result.publishing.result = await runPublisherTick(now);
    await markPublishRun(now);
  }

  return result;
}
