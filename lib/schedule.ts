/**
 * Friendly schedule presets shared by the Settings UI and the worker.
 *
 * Instead of raw cron, schedules are described as one of a few presets and
 * stored as JSON on `AppSetting`. The worker runs a once-a-minute master tick
 * and uses {@link isScheduleDue} to decide whether each job should fire, based
 * on the preset and the last-run timestamp. All times are interpreted in the
 * server's local timezone.
 */

export type ScheduleFrequency = "hourly" | "interval" | "daily" | "weekly";

export interface ScheduleConfig {
  frequency: ScheduleFrequency;
  /** For "interval": run every N hours (>= 1). */
  everyHours?: number;
  /** For "hourly"/"daily"/"weekly": minute of the hour (0-59). */
  minute?: number;
  /** For "daily"/"weekly": hour of the day (0-23). */
  hour?: number;
  /** For "weekly": day of week, 0 = Sunday … 6 = Saturday. */
  dayOfWeek?: number;
}

export const DEFAULT_GENERATION_SCHEDULE: ScheduleConfig = {
  frequency: "daily",
  hour: 9,
  minute: 0,
};

export const DEFAULT_PUBLISHING_SCHEDULE: ScheduleConfig = {
  frequency: "hourly",
  minute: 0,
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Coerce arbitrary input (e.g. a JSON body or stored string) into a config. */
export function normalizeSchedule(input: unknown): ScheduleConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const frequency = raw.frequency;

  switch (frequency) {
    case "interval":
      return {
        frequency: "interval",
        everyHours: clamp(Number(raw.everyHours) || 6, 1, 24 * 7),
      };
    case "hourly":
      return { frequency: "hourly", minute: clamp(Number(raw.minute) || 0, 0, 59) };
    case "weekly":
      return {
        frequency: "weekly",
        dayOfWeek: clamp(Number(raw.dayOfWeek) || 0, 0, 6),
        hour: clamp(Number(raw.hour) || 0, 0, 23),
        minute: clamp(Number(raw.minute) || 0, 0, 59),
      };
    case "daily":
    default:
      return {
        frequency: "daily",
        hour: clamp(Number(raw.hour) || 0, 0, 23),
        minute: clamp(Number(raw.minute) || 0, 0, 59),
      };
  }
}

/** Parse a JSON-encoded schedule string, falling back to `fallback`. */
export function parseSchedule(
  value: string | null | undefined,
  fallback: ScheduleConfig,
): ScheduleConfig {
  if (!value) return fallback;
  try {
    return normalizeSchedule(JSON.parse(value));
  } catch {
    return fallback;
  }
}

/** Serialize a schedule for storage. */
export function serializeSchedule(schedule: ScheduleConfig): string {
  return JSON.stringify(normalizeSchedule(schedule));
}

/**
 * Most recent scheduled boundary at or before `now` for non-interval presets,
 * or null for "interval" (which is evaluated by elapsed time instead).
 */
function previousBoundary(schedule: ScheduleConfig, now: Date): Date | null {
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);

  switch (schedule.frequency) {
    case "hourly": {
      candidate.setMinutes(schedule.minute ?? 0);
      if (candidate > now) candidate.setHours(candidate.getHours() - 1);
      return candidate;
    }
    case "daily": {
      candidate.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      if (candidate > now) candidate.setDate(candidate.getDate() - 1);
      return candidate;
    }
    case "weekly": {
      candidate.setHours(schedule.hour ?? 0, schedule.minute ?? 0, 0, 0);
      const target = schedule.dayOfWeek ?? 0;
      let dayDiff = candidate.getDay() - target;
      if (dayDiff < 0) dayDiff += 7;
      candidate.setDate(candidate.getDate() - dayDiff);
      if (candidate > now) candidate.setDate(candidate.getDate() - 7);
      return candidate;
    }
    default:
      return null;
  }
}

/**
 * Whether `schedule` is due given the last run time and current time. Designed
 * to be called from a once-a-minute tick.
 */
export function isScheduleDue(
  schedule: ScheduleConfig,
  lastRunAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (schedule.frequency === "interval") {
    const everyMs = (schedule.everyHours ?? 6) * 60 * 60_000;
    if (!lastRunAt) return true;
    return now.getTime() - lastRunAt.getTime() >= everyMs;
  }

  const boundary = previousBoundary(schedule, now);
  if (!boundary) return true;
  if (!lastRunAt) return true;
  return lastRunAt.getTime() < boundary.getTime();
}

/** Human-friendly one-line description for the UI. */
export function describeSchedule(schedule: ScheduleConfig): string {
  const time = (h: number, m: number) =>
    `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  switch (schedule.frequency) {
    case "interval":
      return `Every ${schedule.everyHours ?? 6} hour${(schedule.everyHours ?? 6) === 1 ? "" : "s"}`;
    case "hourly":
      return `Every hour at :${String(schedule.minute ?? 0).padStart(2, "0")}`;
    case "weekly":
      return `Every ${WEEKDAYS[schedule.dayOfWeek ?? 0]} at ${time(schedule.hour ?? 0, schedule.minute ?? 0)}`;
    case "daily":
    default:
      return `Every day at ${time(schedule.hour ?? 0, schedule.minute ?? 0)}`;
  }
}
