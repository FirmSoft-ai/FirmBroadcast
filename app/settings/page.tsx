"use client";

import { useEffect, useState } from "react";
import type { ScheduleConfig, ScheduleFrequency } from "@/lib/schedule";

interface ProviderView {
  id: string;
  label: string;
  models: string[];
  defaultModel: string;
  apiKeyUrl: string;
  model: string;
  keySet: boolean;
  isActive: boolean;
}

interface ScheduleView {
  enabled: boolean;
  schedule: ScheduleConfig;
  description: string;
  lastRunAt: string | null;
}

interface SettingsResponse {
  providers: ProviderView[];
  activeProvider: string | null;
  generation: ScheduleView;
  publishing: ScheduleView;
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FREQUENCIES: { value: ScheduleFrequency; label: string }[] = [
  { value: "hourly", label: "Every hour" },
  { value: "interval", label: "Every N hours" },
  { value: "daily", label: "Daily at a time" },
  { value: "weekly", label: "Weekly on a day" },
];

function ScheduleEditor({
  value,
  onChange,
}: {
  value: ScheduleConfig;
  onChange: (next: ScheduleConfig) => void;
}) {
  const set = (patch: Partial<ScheduleConfig>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-500">
          Frequency
        </label>
        <select
          value={value.frequency}
          onChange={(e) =>
            set({ frequency: e.target.value as ScheduleFrequency })
          }
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {value.frequency === "interval" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Every (hours)
          </label>
          <input
            type="number"
            min={1}
            max={168}
            value={value.everyHours ?? 6}
            onChange={(e) => set({ everyHours: Number(e.target.value) })}
            className="w-24 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      )}

      {value.frequency === "weekly" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Day
          </label>
          <select
            value={value.dayOfWeek ?? 0}
            onChange={(e) => set({ dayOfWeek: Number(e.target.value) })}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {(value.frequency === "daily" || value.frequency === "weekly") && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Hour
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={value.hour ?? 0}
            onChange={(e) => set({ hour: Number(e.target.value) })}
            className="w-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      )}

      {value.frequency !== "interval" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-500">
            Minute
          </label>
          <input
            type="number"
            min={0}
            max={59}
            value={value.minute ?? 0}
            onChange={(e) => set({ minute: Number(e.target.value) })}
            className="w-20 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // Local editable state.
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [activeProvider, setActiveProvider] = useState<string>("");
  const [generation, setGeneration] = useState<ScheduleView | null>(null);
  const [publishing, setPublishing] = useState<ScheduleView | null>(null);

  function hydrate(res: SettingsResponse) {
    setData(res);
    setModels(Object.fromEntries(res.providers.map((p) => [p.id, p.model])));
    setActiveProvider(res.activeProvider ?? res.providers[0]?.id ?? "");
    setGeneration(res.generation);
    setPublishing(res.publishing);
    setKeyInputs({});
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load settings");
        hydrate(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!generation || !publishing) return;
    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      const providers = (data?.providers ?? []).map((p) => {
        const entry: { id: string; model: string; apiKey?: string } = {
          id: p.id,
          model: models[p.id] ?? p.model,
        };
        const typed = keyInputs[p.id]?.trim();
        if (typed) entry.apiKey = typed;
        return entry;
      });

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers,
          activeProvider,
          generation: {
            enabled: generation.enabled,
            schedule: generation.schedule,
          },
          publishing: {
            enabled: publishing.enabled,
            schedule: publishing.schedule,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save settings");
      hydrate(json);
      setSavedNote("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <p className="text-sm text-zinc-500">Loading settings…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Configure your AI model and how often posts are generated and
          published.
        </p>
      </div>

      {/* AI model */}
      <section className="mb-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h2 className="text-sm font-medium">AI model</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Add an API key for a provider, choose its model, and pick which one
            is active. Keys are encrypted and never shown again.
          </p>
        </div>

        <div className="space-y-4">
          {data?.providers.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="active-provider"
                    checked={activeProvider === p.id}
                    onChange={() => setActiveProvider(p.id)}
                  />
                  {p.label}
                  {activeProvider === p.id && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/50 dark:text-green-400">
                      Active
                    </span>
                  )}
                </label>
                <a
                  href={p.apiKeyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#0a66c2] hover:underline"
                >
                  Get API key
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">
                    API key
                  </label>
                  <input
                    type="password"
                    value={keyInputs[p.id] ?? ""}
                    onChange={(e) =>
                      setKeyInputs((prev) => ({
                        ...prev,
                        [p.id]: e.target.value,
                      }))
                    }
                    placeholder={
                      p.keySet ? "•••••••• (configured)" : "Enter API key"
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-500">
                    Model
                  </label>
                  <select
                    value={models[p.id] ?? p.model}
                    onChange={(e) =>
                      setModels((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {p.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Schedules */}
      <section className="mb-8 space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h2 className="text-sm font-medium">Schedules</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            The worker checks every minute and runs each job when due. Generating
            and publishing are scheduled independently.
          </p>
        </div>

        {generation && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={generation.enabled}
                onChange={(e) =>
                  setGeneration({ ...generation, enabled: e.target.checked })
                }
              />
              Automatic post generation
            </label>
            <div className={generation.enabled ? "" : "opacity-50"}>
              <ScheduleEditor
                value={generation.schedule}
                onChange={(schedule) =>
                  setGeneration({ ...generation, schedule })
                }
              />
              {generation.lastRunAt && (
                <p className="mt-2 text-xs text-zinc-500">
                  Last generated{" "}
                  {new Date(generation.lastRunAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}

        <hr className="border-zinc-200 dark:border-zinc-800" />

        {publishing && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={publishing.enabled}
                onChange={(e) =>
                  setPublishing({ ...publishing, enabled: e.target.checked })
                }
              />
              Automatic publishing of approved posts
            </label>
            <div className={publishing.enabled ? "" : "opacity-50"}>
              <ScheduleEditor
                value={publishing.schedule}
                onChange={(schedule) =>
                  setPublishing({ ...publishing, schedule })
                }
              />
              {publishing.lastRunAt && (
                <p className="mt-2 text-xs text-zinc-500">
                  Last published run{" "}
                  {new Date(publishing.lastRunAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {savedNote && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {savedNote}
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>
    </main>
  );
}
