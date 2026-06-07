"use client";

import { useCallback, useEffect, useState } from "react";
import { DraftCard, type Draft } from "./components/draft-card";

interface Account {
  id: string;
  authorType: string;
  authorUrn: string;
  name: string | null;
  email: string | null;
  scope: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "PUBLISHED", label: "Published" },
  { value: "", label: "All" },
] as const;

type Counts = Record<string, number>;

export default function DashboardPage() {
  const [filter, setFilter] = useState<string>("PENDING");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<
    { kind: "success" | "error"; text: string } | null
  >(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/drafts${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load drafts");
      setDrafts(data.drafts ?? []);
      setNextCursor(data.nextCursor ?? null);
      setCounts(data.counts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      params.set("cursor", nextCursor);
      const res = await fetch(`/api/drafts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load drafts");
      setDrafts((prev) => [...prev, ...(data.drafts ?? [])]);
      setNextCursor(data.nextCursor ?? null);
      setCounts(data.counts ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drafts");
    } finally {
      setLoadingMore(false);
    }
  }, [filter, nextCursor]);

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/drafts?limit=1`);
      const data = await res.json();
      if (res.ok) setCounts(data.counts ?? {});
    } catch {
      // Non-fatal; badges just stay stale until the next load.
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      if (res.ok) setAccounts(data.accounts ?? []);
    } catch {
      // Non-fatal; the panel just shows no connections.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount/filter-change
    loadDrafts();
  }, [loadDrafts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    loadAccounts();
  }, [loadAccounts]);

  // Surface the OAuth callback result, then strip the query params from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    if (connected === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time banner from OAuth redirect params
      setBanner({
        kind: "success",
        text: `Connected ${params.get("account") ?? "LinkedIn account"}.`,
      });
    } else if (connected === "0") {
      setBanner({
        kind: "error",
        text: params.get("error") ?? "Failed to connect LinkedIn.",
      });
    }
    if (connected !== null) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  function onDraftChanged(updated: Draft) {
    setDrafts((prev) => {
      // Drop the draft from the list if it no longer matches the active filter.
      if (filter && updated.status !== filter) {
        return prev.filter((d) => d.id !== updated.id);
      }
      return prev.map((d) => (d.id === updated.id ? updated : d));
    });
    void refreshCounts();
  }

  function onDraftRemoved(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    void refreshCounts();
  }

  async function disconnect(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Disconnect failed");
      }
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Review generated drafts, edit and approve them for publishing, and
          manage connected accounts.
        </p>
      </div>

      {banner && (
        <p
          className={`mb-6 rounded-md px-4 py-3 text-sm ${
            banner.kind === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          {banner.text}
        </p>
      )}

      {/* Connected accounts */}
      <section className="mb-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Connected accounts</h2>
          <a
            href="/api/auth/linkedin"
            className="rounded-md bg-[#0a66c2] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#004182]"
          >
            Connect LinkedIn
          </a>
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No accounts connected yet. Connect a LinkedIn profile to enable
            publishing.
          </p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {account.name ?? account.authorUrn}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-500">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                      {account.authorType === "ORGANIZATION"
                        ? "Company page"
                        : "Personal"}
                    </span>
                    {account.email && <span>{account.email}</span>}
                    {account.expiresAt && (
                      <span>
                        Token expires{" "}
                        {new Date(account.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => disconnect(account.id)}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => {
          const count = f.value ? counts[f.value] : counts.ALL;
          return (
            <button
              key={f.value || "all"}
              onClick={() => setFilter(f.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                filter === f.value
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-black"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }`}
            >
              {f.label}
              {count !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-xs ${
                    filter === f.value
                      ? "bg-white/20 dark:bg-black/10"
                      : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mb-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {/* Drafts */}
      <section className="space-y-4">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : drafts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No drafts here yet. Generate one from the Post Generator.
          </p>
        ) : (
          drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onChanged={onDraftChanged}
              onRemoved={onDraftRemoved}
              onError={setError}
            />
          ))
        )}

        {!loading && nextCursor && (
          <div className="pt-2 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
