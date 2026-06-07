/**
 * Local dev scheduler — mirrors the Vercel cron tick on a once-a-minute loop.
 *
 * Usage:
 *   npm run worker             # start the master loop
 *   npm run worker:scheduler   # run a single scheduler tick, then exit
 *   npm run worker:publisher   # run a single publisher tick, then exit
 *
 * In production on Vercel, scheduling is handled by `/api/cron/tick` via
 * `vercel.json`. This script is only needed for local development.
 */

import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { runCronTick } from "@/lib/cron/tick";
import { createLogger } from "@/worker/log";
import { runPublisherTick } from "@/worker/publisher";
import { runSchedulerTick } from "@/worker/scheduler";

const log = createLogger("worker");

const TICK_MS = 60_000;

/** Guard against overlapping runs when a tick outlives its interval. */
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
  const tick = once("master", runCronTick);

  setInterval(tick, TICK_MS);
  log.info("Worker started", { intervalMs: TICK_MS });

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
