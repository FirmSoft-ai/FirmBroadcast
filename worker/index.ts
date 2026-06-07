/**
 * Worker entry point — the hands-off autoposter loop.
 *
 * Usage (via package scripts):
 *   npm run worker             # start the master loop (once-a-minute tick)
 *   npm run worker:scheduler   # run a single scheduler tick, then exit
 *   npm run worker:publisher   # run a single publisher tick, then exit
 *
 * The master loop fires every minute and reads the DB-backed schedules
 * (managed from Settings) to decide whether generation and/or publishing are
 * due. Changing schedules in the UI takes effect on the next tick — no restart
 * required. `dotenv/config` is imported first so the standalone process picks
 * up the same `.env` Next.js uses.
 */

import "dotenv/config";

import cron from "node-cron";
import { prisma } from "@/lib/prisma";
import { isScheduleDue } from "@/lib/schedule";
import {
  getResolvedSchedules,
  markGenerationRun,
  markPublishRun,
} from "@/lib/settings";
import { createLogger } from "@/worker/log";
import { runPublisherTick } from "@/worker/publisher";
import { runSchedulerTick } from "@/worker/scheduler";

const log = createLogger("worker");

const MASTER_CRON = "* * * * *"; // every minute

/** One master tick: consult the DB schedules and run whatever is due. */
async function masterTick(now: Date = new Date()): Promise<void> {
  const cfg = await getResolvedSchedules();

  if (
    cfg.generationEnabled &&
    isScheduleDue(cfg.generationSchedule, cfg.lastGenerationAt, now)
  ) {
    log.info("Generation due; running scheduler tick");
    await runSchedulerTick(now);
    await markGenerationRun(now);
  }

  if (
    cfg.publishingEnabled &&
    isScheduleDue(cfg.publishingSchedule, cfg.lastPublishAt, now)
  ) {
    log.info("Publishing due; running publisher tick");
    await runPublisherTick(now);
    await markPublishRun(now);
  }
}

/** Guard against overlapping runs when a tick outlives its cron interval. */
function once(name: string, fn: () => Promise<unknown>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) {
      log.warn("Skipping tick; previous run still in progress", { tick: name });
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      log.error("Tick threw", {
        tick: name,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      running = false;
    }
  };
}

async function runOnce(mode: "scheduler" | "publisher"): Promise<void> {
  try {
    if (mode === "scheduler") await runSchedulerTick();
    else await runPublisherTick();
  } finally {
    await prisma.$disconnect();
  }
}

function startLoop(): void {
  const tick = once("master", masterTick);

  cron.schedule(MASTER_CRON, tick);
  log.info("Worker started", { masterCron: MASTER_CRON });

  // Kick once at boot so a freshly started worker doesn't idle until the next
  // minute boundary.
  void tick();

  const shutdown = (signal: string) => {
    log.info("Shutting down", { signal });
    void prisma.$disconnect().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode === "scheduler" || mode === "publisher") {
    await runOnce(mode);
    return;
  }
  if (mode && mode !== "loop") {
    log.error("Unknown argument", { mode });
    process.exit(1);
  }
  startLoop();
}

void main();
