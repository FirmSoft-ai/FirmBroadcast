/**
 * Read/write helpers for the app's DB-backed configuration:
 *   - the singleton `AppSetting` row (generation/publishing schedules), and
 *   - `LlmProvider` rows (per-provider API key + model + active flag).
 *
 * Shared by the Settings API routes and the cron tick so both see one source of
 * truth. API keys are encrypted at rest via `lib/crypto`.
 */

import type { AppSetting } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_GENERATION_SCHEDULE,
  DEFAULT_PUBLISHING_SCHEDULE,
  parseSchedule,
  type ScheduleConfig,
} from "@/lib/schedule";

const SINGLETON_ID = "singleton";

/** Fetch (creating on first access) the singleton AppSetting row. */
export async function getAppSetting(): Promise<AppSetting> {
  return prisma.appSetting.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

export interface ResolvedSchedules {
  generationEnabled: boolean;
  generationSchedule: ScheduleConfig;
  lastGenerationAt: Date | null;
  publishingEnabled: boolean;
  publishingSchedule: ScheduleConfig;
  lastPublishAt: Date | null;
}

/** AppSetting with schedules parsed into structured configs. */
export async function getResolvedSchedules(): Promise<ResolvedSchedules> {
  const s = await getAppSetting();
  return {
    generationEnabled: s.generationEnabled,
    generationSchedule: parseSchedule(
      s.generationSchedule,
      DEFAULT_GENERATION_SCHEDULE,
    ),
    lastGenerationAt: s.lastGenerationAt,
    publishingEnabled: s.publishingEnabled,
    publishingSchedule: parseSchedule(
      s.publishingSchedule,
      DEFAULT_PUBLISHING_SCHEDULE,
    ),
    lastPublishAt: s.lastPublishAt,
  };
}

export async function markGenerationRun(at: Date): Promise<void> {
  await prisma.appSetting.update({
    where: { id: SINGLETON_ID },
    data: { lastGenerationAt: at },
  });
}

export async function markPublishRun(at: Date): Promise<void> {
  await prisma.appSetting.update({
    where: { id: SINGLETON_ID },
    data: { lastPublishAt: at },
  });
}
