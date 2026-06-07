"use client";

import { useState } from "react";
import { LENGTH_LABELS } from "@/lib/post-options";

export interface DraftTopic {
  id: string;
  text: string;
}

export interface Draft {
  id: string;
  content: string;
  status: string;
  source: string;
  tone: string | null;
  length: string | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
  linkedInPostUrn: string | null;
  topic: DraftTopic | null;
}

const MAX_POST_CHARS = 1300;

const STATUS_STYLES: Record<string, string> = {
  PENDING:
    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  APPROVED:
    "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  PUBLISHED: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
};

function linkedInUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`;
}

interface DraftCardProps {
  draft: Draft;
  onChanged: (draft: Draft) => void;
  onRemoved: (id: string) => void;
  onError: (message: string) => void;
}

export function DraftCard({
  draft,
  onChanged,
  onRemoved,
  onError,
}: DraftCardProps) {
  const [content, setContent] = useState(draft.content);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const editable = draft.status !== "PUBLISHED";
  const dirty = content.trim() !== draft.content.trim();
  const overLimit = content.length > MAX_POST_CHARS;

  async function patch(body: Record<string, unknown>, action: string) {
    setBusy(action);
    onError("");
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setContent(data.draft.content);
      onChanged(data.draft);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    onError("");
    try {
      const res = await fetch(`/api/drafts/${draft.id}/publish`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Publish failed");
      onChanged(data.draft);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    setBusy("regenerate");
    onError("");
    try {
      const res = await fetch(`/api/drafts/${draft.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Regenerate failed");
      setContent(data.draft.content);
      onChanged(data.draft);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    onError("");
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
      onRemoved(draft.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  const lengthLabel = draft.length
    ? (LENGTH_LABELS[draft.length as keyof typeof LENGTH_LABELS] ??
      draft.length)
    : null;

  const isLong = draft.content.length > 320;
  const anyBusy = !!busy;

  const btnPrimary =
    "rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const btnGhost =
    "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            STATUS_STYLES[draft.status] ??
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {draft.status}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
          {draft.source === "SCHEDULER" ? "Scheduled" : "Manual"}
        </span>
        {draft.tone && <span className="capitalize">{draft.tone}</span>}
        {lengthLabel && <span>{lengthLabel}</span>}
        <span className="ml-auto">
          {draft.status === "PUBLISHED" && draft.publishedAt
            ? `Published ${new Date(draft.publishedAt).toLocaleString()}`
            : new Date(draft.createdAt).toLocaleString()}
        </span>
      </div>

      {draft.topic && (
        <p className="mb-2 truncate text-xs text-zinc-500">
          Topic:{" "}
          <span className="text-zinc-700 dark:text-zinc-300">
            {draft.topic.text}
          </span>
        </p>
      )}

      {editable ? (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full resize-y whitespace-pre-wrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-zinc-700 dark:bg-zinc-900"
          />
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className={overLimit ? "text-red-600" : "text-zinc-500"}>
              {content.length} / {MAX_POST_CHARS}
            </span>
            {dirty && <span className="text-amber-600">Unsaved edits</span>}
          </div>
        </>
      ) : (
        <div>
          <p
            className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 ${
              !expanded && isLong ? "line-clamp-6" : ""
            }`}
          >
            {draft.content}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {draft.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {draft.error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {draft.status === "PENDING" && (
          <>
            <button
              onClick={() => patch({ content, status: "APPROVED" }, "approve")}
              disabled={anyBusy || !content.trim() || overLimit}
              className={`${btnPrimary} bg-green-600 hover:bg-green-700`}
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => patch({ status: "REJECTED" }, "reject")}
              disabled={anyBusy}
              className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
            >
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
            <button
              onClick={regenerate}
              disabled={anyBusy}
              className={btnGhost}
            >
              {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
            </button>
          </>
        )}

        {(draft.status === "APPROVED" || draft.status === "FAILED") && (
          <>
            <button
              onClick={publish}
              disabled={anyBusy || !content.trim() || overLimit}
              className={`${btnPrimary} bg-[#0a66c2] hover:bg-[#004182]`}
            >
              {busy === "publish"
                ? "Publishing…"
                : draft.status === "FAILED"
                  ? "Retry publish"
                  : "Publish now"}
            </button>
            <button
              onClick={() => patch({ status: "PENDING" }, "revert")}
              disabled={anyBusy}
              className={btnGhost}
            >
              {busy === "revert" ? "Reverting…" : "Revert to pending"}
            </button>
          </>
        )}

        {draft.status === "REJECTED" && (
          <button
            onClick={() => patch({ status: "PENDING" }, "restore")}
            disabled={anyBusy}
            className={btnGhost}
          >
            {busy === "restore" ? "Restoring…" : "Restore to pending"}
          </button>
        )}

        {draft.status === "PUBLISHED" && draft.linkedInPostUrn && (
          <a
            href={linkedInUrl(draft.linkedInPostUrn)}
            target="_blank"
            rel="noreferrer"
            className={`${btnPrimary} bg-[#0a66c2] hover:bg-[#004182]`}
          >
            View on LinkedIn
          </a>
        )}

        {editable && (
          <button
            onClick={() => patch({ content }, "save")}
            disabled={anyBusy || !dirty || !content.trim() || overLimit}
            className={btnGhost}
          >
            {busy === "save" ? "Saving…" : "Save edits"}
          </button>
        )}

        <button
          onClick={remove}
          disabled={anyBusy}
          className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-zinc-900"
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
