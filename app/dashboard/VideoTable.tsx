"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

type Status = "pending" | "processing" | "ready" | "failed";
type Category = "film-tv" | "commercial" | "music";
type Role = "Producer" | "Talent";

export type DashboardRow = {
  vimeo_id: string;
  vimeo_hash: string;
  name: string;
  category: Category;
  role: Role;
  status: Status;
  poster_url: string | null;
  error_message: string | null;
  position: number;
  created_at: string;
};

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/`;

export function VideoTable({ initial }: { initial: DashboardRow[] }) {
  const [rows, setRows] = useState<DashboardRow[]>(initial);
  const [busy, setBusy] = useState<Record<string, "delete" | "retry" | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  // Live updates via Supabase Realtime. Status flips (pending → processing →
  // ready / failed), inserts, and deletes all surface here.
  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createSupabaseBrowserClient();
    }
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("videos-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as DashboardRow & {
                clip_path: string | null;
                poster_path: string | null;
              };
              if (prev.some((r) => r.vimeo_id === next.vimeo_id)) return prev;
              const merged: DashboardRow = {
                vimeo_id: next.vimeo_id,
                vimeo_hash: next.vimeo_hash,
                name: next.name,
                category: next.category,
                role: next.role,
                status: next.status,
                poster_url: next.poster_path ? STORAGE_BASE + next.poster_path : null,
                error_message: next.error_message ?? null,
                position: next.position,
                created_at: next.created_at,
              };
              return [...prev, merged].sort((a, b) => a.position - b.position);
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { vimeo_id: string };
              return prev.filter((r) => r.vimeo_id !== old.vimeo_id);
            }
            // UPDATE
            const next = payload.new as DashboardRow & {
              poster_path: string | null;
            };
            return prev.map((r) =>
              r.vimeo_id === next.vimeo_id
                ? {
                    ...r,
                    status: next.status,
                    error_message: next.error_message ?? null,
                    poster_url: next.poster_path
                      ? STORAGE_BASE + next.poster_path
                      : r.poster_url,
                  }
                : r,
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This removes the row and the storage objects.`)) {
      return;
    }
    setBusy((b) => ({ ...b, [id]: "delete" }));
    setError(null);
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setBusy((b) => ({ ...b, [id]: undefined }));
    if (!res.ok && res.status !== 204) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`delete: ${body?.message ?? body?.error ?? res.status}`);
    }
    // Realtime will remove the row; no manual update needed.
  };

  const onRetry = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: "retry" }));
    setError(null);
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    setBusy((b) => ({ ...b, [id]: undefined }));
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`retry: ${body?.message ?? body?.error ?? res.status}`);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.position - b.position),
    [rows],
  );

  return (
    <div className="mt-4">
      {error && (
        <p
          aria-live="polite"
          className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      )}
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {sorted.length === 0 && (
          <li className="px-4 py-8 text-center text-[13px] text-neutral-500">
            No videos yet. Add one above.
          </li>
        )}
        {sorted.map((r) => (
          <li
            key={r.vimeo_id}
            className="grid grid-cols-[80px_1fr_auto_auto_auto] items-center gap-4 px-4 py-3"
          >
            <div className="aspect-video w-[80px] overflow-hidden rounded-sm bg-neutral-100">
              {r.poster_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.poster_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <div
                className="font-serif text-[16px] leading-tight tracking-tight"
                style={{ fontFamily: "var(--font-roslindale-display)" }}
              >
                {r.name}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {r.vimeo_id}
              </div>
              {r.error_message && (
                <div className="mt-1 truncate text-[11px] text-red-600">
                  {r.error_message}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 text-[10.5px] uppercase tracking-wide text-neutral-600">
              <span>{r.category}</span>
              <span>{r.role}</span>
            </div>
            <StatusPill status={r.status} />
            <div className="flex gap-2">
              {r.status === "failed" && (
                <button
                  type="button"
                  onClick={() => onRetry(r.vimeo_id)}
                  disabled={busy[r.vimeo_id] === "retry"}
                  className="rounded-md border border-neutral-300 px-2.5 py-1 text-[11.5px] text-neutral-700 hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-60"
                >
                  {busy[r.vimeo_id] === "retry" ? "Retrying…" : "Retry"}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(r.vimeo_id, r.name)}
                disabled={busy[r.vimeo_id] === "delete"}
                className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11.5px] text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {busy[r.vimeo_id] === "delete" ? "Deleting…" : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const cls =
    status === "ready"
      ? "bg-emerald-50 text-emerald-700"
      : status === "failed"
      ? "bg-red-50 text-red-700"
      : status === "processing"
      ? "bg-amber-50 text-amber-700"
      : "bg-neutral-100 text-neutral-700";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}
