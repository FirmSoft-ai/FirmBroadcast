"use client";

import { useEffect, useState } from "react";
import {
  LENGTH_LABELS,
  POST_LENGTHS,
  POST_TONES,
} from "@/lib/post-options";

interface Topic {
  id: string;
  text: string;
  status: string;
  tone: string | null;
  length: string | null;
  createdAt: string;
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New-topic form state.
  const [text, setText] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/topics");
        const data = await res.json();
        if (!cancelled) setTopics(data.topics ?? []);
      } catch {
        if (!cancelled) setError("Failed to load topics");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createTopic() {
    if (!text.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          tone: tone || undefined,
          length: length || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      setText("");
      setTone("");
      setLength("");
      setTopics((prev) => [data.topic, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(topic: Topic) {
    const next = topic.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await fetch(`/api/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      const data = await res.json();
      setTopics((prev) =>
        prev.map((t) => (t.id === topic.id ? data.topic : t)),
      );
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/topics/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTopics((prev) => prev.filter((t) => t.id !== id));
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Topics</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Reusable prompts the scheduler turns into drafts. Active topics are
          generated on the schedule set in{" "}
          <a href="/settings" className="text-[#0a66c2] hover:underline">
            Settings
          </a>
          .
        </p>
      </div>

      {/* New topic form */}
      <section className="mb-10 space-y-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-medium">Add a topic</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. Practical tips for engineering managers running 1:1s"
          className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Default tone
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Any</option>
              {POST_TONES.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Default length
            </label>
            <select
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Any</option>
              {POST_LENGTHS.map((l) => (
                <option key={l} value={l}>
                  {LENGTH_LABELS[l]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={createTopic}
          disabled={!text.trim() || creating}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {creating ? "Adding…" : "Add topic"}
        </button>
      </section>

      {error && (
        <p className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Topic list */}
      <section className="space-y-3">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : topics.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No topics yet. Add one above to enable scheduled generation.
          </p>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{topic.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      topic.status === "ACTIVE"
                        ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {topic.status}
                  </span>
                  {topic.tone && (
                    <span className="capitalize">{topic.tone}</span>
                  )}
                  {topic.length && (
                    <span>
                      {LENGTH_LABELS[
                        topic.length as keyof typeof LENGTH_LABELS
                      ] ?? topic.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => toggleStatus(topic)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  {topic.status === "ACTIVE" ? "Pause" : "Activate"}
                </button>
                <button
                  onClick={() => remove(topic.id)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
