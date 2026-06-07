"use client";

import { useEffect, useState } from "react";
import {
  LENGTH_LABELS,
  POST_LENGTHS,
  POST_TONES,
  type PostLength,
  type PostTone,
} from "@/lib/post-options";

interface TopicOption {
  id: string;
  text: string;
  tone: string | null;
  length: string | null;
}

const MAX_PREVIEW_CHARS = 1300;

export default function GeneratePage() {
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [topicId, setTopicId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<PostTone>("professional");
  const [length, setLength] = useState<PostLength>("medium");
  const [instructions, setInstructions] = useState("");

  const [content, setContent] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/topics")
      .then((res) => (res.ok ? res.json() : { topics: [] }))
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => setTopics([]));
  }, []);

  function onSelectTopic(id: string) {
    setTopicId(id);
    const topic = topics.find((t) => t.id === id);
    if (topic) {
      setPrompt(topic.text);
      if (topic.tone && (POST_TONES as readonly string[]).includes(topic.tone)) {
        setTone(topic.tone as PostTone);
      }
      if (
        topic.length &&
        (POST_LENGTHS as readonly string[]).includes(topic.length)
      ) {
        setLength(topic.length as PostLength);
      }
    }
  }

  async function generate() {
    setError(null);
    setSavedNote(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: topicId || undefined,
          topic: prompt || undefined,
          tone,
          length,
          instructions: instructions || undefined,
          save: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setContent(data.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function saveDraft() {
    setError(null);
    setSavedNote(null);
    setSaving(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: topicId || undefined,
          content,
          tone,
          length,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSavedNote("Saved to the approval queue as a PENDING draft.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const canGenerate = prompt.trim().length > 0 && !generating;
  const charCount = content.length;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Post Generator
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Draft a LinkedIn post from any topic with Gemini. Preview, tweak, then
          save it to the approval queue.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Controls */}
        <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Start from a saved topic{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <select
              value={topicId}
              onChange={(e) => onSelectTopic(e.target.value)}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">— None (ad-hoc) —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.text.length > 60 ? `${t.text.slice(0, 60)}…` : t.text}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Topic / prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (topicId) setTopicId("");
              }}
              rows={4}
              placeholder="e.g. Lessons learned shipping our first AI feature to production"
              className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as PostTone)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm capitalize dark:border-zinc-700 dark:bg-zinc-900"
              >
                {POST_TONES.map((t) => (
                  <option key={t} value={t} className="capitalize">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Length</label>
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as PostLength)}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {POST_LENGTHS.map((l) => (
                  <option key={l} value={l}>
                    {LENGTH_LABELS[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Extra guidance{" "}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. target engineering leaders, mention our launch"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {generating
              ? "Generating…"
              : content
                ? "Regenerate"
                : "Generate post"}
          </button>
        </section>

        {/* Preview */}
        <section className="flex flex-col rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">Preview</label>
            <span
              className={`text-xs ${
                charCount > MAX_PREVIEW_CHARS
                  ? "text-red-600"
                  : "text-zinc-500"
              }`}
            >
              {charCount} / {MAX_PREVIEW_CHARS}
            </span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            placeholder="Your generated post will appear here. You can edit it before saving."
            className="flex-1 resize-y whitespace-pre-wrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
          />

          <button
            onClick={saveDraft}
            disabled={!content.trim() || saving}
            className="mt-4 w-full rounded-md border border-zinc-300 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {saving ? "Saving…" : "Save to approval queue"}
          </button>
        </section>
      </div>

      {(error || savedNote) && (
        <div className="mt-6">
          {error && (
            <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
          {savedNote && (
            <p className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
              {savedNote}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
