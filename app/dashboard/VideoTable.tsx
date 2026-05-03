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

type Draft = { name: string; category: Category; role: Role };
type RowBusy = "delete" | "retry" | "edit" | undefined;

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "film-tv", label: "Film/TV" },
  { value: "commercial", label: "Commercial" },
  { value: "music", label: "Music" },
];
const ROLES: Role[] = ["Producer", "Talent"];

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/`;

export function VideoTable({ initial }: { initial: DashboardRow[] }) {
  const [rows, setRows] = useState<DashboardRow[]>(initial);
  const [busy, setBusy] = useState<Record<string, RowBusy>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

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
              return [...prev, fromRealtime(next)].sort(
                (a, b) => a.position - b.position,
              );
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { vimeo_id: string };
              return prev.filter((r) => r.vimeo_id !== old.vimeo_id);
            }
            const next = payload.new as DashboardRow & {
              poster_path: string | null;
            };
            return prev.map((r) =>
              r.vimeo_id === next.vimeo_id
                ? {
                    ...r,
                    name: next.name,
                    category: next.category,
                    role: next.role,
                    status: next.status,
                    error_message: next.error_message ?? null,
                    position: next.position,
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

  const setRowBusy = (id: string, value: RowBusy) =>
    setBusy((b) => ({ ...b, [id]: value }));

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This removes the row and the storage objects.`)) {
      return;
    }
    setRowBusy(id, "delete");
    setError(null);
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setRowBusy(id, undefined);
    if (!res.ok && res.status !== 204) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`delete: ${body?.message ?? body?.error ?? res.status}`);
    }
  };

  const onRetry = async (id: string) => {
    setRowBusy(id, "retry");
    setError(null);
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
      method: "POST",
    });
    setRowBusy(id, undefined);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`retry: ${body?.message ?? body?.error ?? res.status}`);
    }
  };

  const startEdit = (r: DashboardRow) => {
    setEditingId(r.vimeo_id);
    setDraft({ name: r.name, category: r.category, role: r.role });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;
    const original = rows.find((r) => r.vimeo_id === editingId);
    if (!original) return;
    const patch: Partial<Draft> = {};
    if (draft.name !== original.name) patch.name = draft.name.trim();
    if (draft.category !== original.category) patch.category = draft.category;
    if (draft.role !== original.role) patch.role = draft.role;

    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setRowBusy(editingId, "edit");
    setError(null);
    const res = await fetch(`/api/videos/${encodeURIComponent(editingId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setRowBusy(editingId, undefined);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`edit: ${body?.message ?? body?.error ?? res.status}`);
      return;
    }
    // Optimistic local update — Realtime will confirm.
    setRows((prev) =>
      prev.map((r) => (r.vimeo_id === editingId ? { ...r, ...patch } : r)),
    );
    cancelEdit();
  };

  /** Move row `fromId` to the position currently occupied by `toId`,
   *  shifting everything between them by one. Renumbers positions densely
   *  (0..n-1) and POSTs the full new ordering in a single request. */
  const moveTo = async (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const sorted = [...rows].sort((a, b) => a.position - b.position);
    const fromIdx = sorted.findIndex((r) => r.vimeo_id === fromId);
    const toIdx = sorted.findIndex((r) => r.vimeo_id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...sorted];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    const positions = next.map((r, i) => ({
      vimeo_id: r.vimeo_id,
      position: i,
    }));

    // Optimistic local renumber
    const posMap = new Map(positions.map((p) => [p.vimeo_id, p.position]));
    const beforeSnapshot = new Map(rows.map((r) => [r.vimeo_id, r.position]));
    setRows((prev) =>
      prev.map((r) => ({ ...r, position: posMap.get(r.vimeo_id) ?? r.position })),
    );
    setError(null);

    const res = await fetch("/api/videos/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ positions }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`reorder: ${body?.message ?? body?.error ?? res.status}`);
      // Revert if the server didn't accept it; Realtime would also eventually
      // re-sync, but be eager about it.
      setRows((prev) =>
        prev.map((r) => ({
          ...r,
          position: beforeSnapshot.get(r.vimeo_id) ?? r.position,
        })),
      );
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
        {sorted.map((r) => {
          const isEditing = editingId === r.vimeo_id;
          const isDragging = draggingId === r.vimeo_id;
          const isDragTarget =
            dragOverId === r.vimeo_id && draggingId !== null && !isDragging;
          return (
            <li
              key={r.vimeo_id}
              draggable={!isEditing}
              onDragStart={(e) => {
                setDraggingId(r.vimeo_id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", r.vimeo_id);
              }}
              onDragOver={(e) => {
                if (!draggingId || draggingId === r.vimeo_id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== r.vimeo_id) setDragOverId(r.vimeo_id);
              }}
              onDragLeave={() => {
                if (dragOverId === r.vimeo_id) setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = draggingId;
                setDraggingId(null);
                setDragOverId(null);
                if (from && from !== r.vimeo_id) void moveTo(from, r.vimeo_id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDragOverId(null);
              }}
              className={`grid grid-cols-[24px_80px_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors ${
                isDragging ? "opacity-40" : ""
              } ${
                isDragTarget
                  ? "bg-neutral-50 ring-1 ring-inset ring-neutral-300"
                  : ""
              }`}
            >
              <DragHandle disabled={isEditing} />
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
                {isEditing && draft ? (
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    autoFocus
                    className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 font-serif text-[16px] outline-none focus:border-[#040d08]"
                    style={{ fontFamily: "var(--font-roslindale-display)" }}
                  />
                ) : (
                  <div
                    className="font-serif text-[16px] leading-tight tracking-tight"
                    style={{ fontFamily: "var(--font-roslindale-display)" }}
                  >
                    {r.name}
                  </div>
                )}
                <div className="mt-0.5 text-[11px] text-neutral-500">
                  {r.vimeo_id}
                </div>
                {r.error_message && (
                  <div className="mt-1 truncate text-[11px] text-red-600">
                    {r.error_message}
                  </div>
                )}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-neutral-600">
                {isEditing && draft ? (
                  <div className="flex items-center gap-2">
                    <SelectShell>
                      <select
                        value={draft.category}
                        onChange={(e) =>
                          setDraft({ ...draft, category: e.target.value as Category })
                        }
                        className={editSelectCls}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </SelectShell>
                    <SelectShell>
                      <select
                        value={draft.role}
                        onChange={(e) =>
                          setDraft({ ...draft, role: e.target.value as Role })
                        }
                        className={editSelectCls}
                      >
                        {ROLES.map((rr) => (
                          <option key={rr} value={rr}>
                            {rr}
                          </option>
                        ))}
                      </select>
                    </SelectShell>
                  </div>
                ) : (
                  <span className="whitespace-nowrap">
                    {r.category} · {r.role}
                  </span>
                )}
              </div>
              <StatusPill status={r.status} />
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide">
                {isEditing ? (
                  <>
                    <TextButton
                      onClick={saveEdit}
                      disabled={busy[r.vimeo_id] === "edit"}
                    >
                      {busy[r.vimeo_id] === "edit" ? "Saving…" : "Save"}
                    </TextButton>
                    <TextButton onClick={cancelEdit}>Cancel</TextButton>
                  </>
                ) : (
                  <>
                    <TextButton
                      onClick={() => startEdit(r)}
                      disabled={editingId !== null}
                    >
                      Edit
                    </TextButton>
                    {r.status === "failed" && (
                      <TextButton
                        onClick={() => onRetry(r.vimeo_id)}
                        disabled={busy[r.vimeo_id] === "retry"}
                      >
                        {busy[r.vimeo_id] === "retry" ? "Retrying…" : "Retry"}
                      </TextButton>
                    )}
                    <TextButton
                      onClick={() => onDelete(r.vimeo_id, r.name)}
                      disabled={busy[r.vimeo_id] === "delete"}
                      tone="danger"
                    >
                      {busy[r.vimeo_id] === "delete" ? "Deleting…" : "Delete"}
                    </TextButton>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DragHandle({ disabled }: { disabled: boolean }) {
  return (
    <span
      aria-hidden="true"
      title={disabled ? undefined : "Drag to reorder"}
      className={`flex h-6 w-6 select-none items-center justify-center text-neutral-400 ${
        disabled
          ? "opacity-30"
          : "cursor-grab hover:text-neutral-700 active:cursor-grabbing"
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <circle cx="5" cy="3" r="1" />
        <circle cx="9" cy="3" r="1" />
        <circle cx="5" cy="7" r="1" />
        <circle cx="9" cy="7" r="1" />
        <circle cx="5" cy="11" r="1" />
        <circle cx="9" cy="11" r="1" />
      </svg>
    </span>
  );
}

function fromRealtime(next: DashboardRow & {
  clip_path: string | null;
  poster_path: string | null;
}): DashboardRow {
  return {
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
}

function StatusPill({ status }: { status: Status }) {
  const color =
    status === "ready"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "failed"
      ? "bg-red-50 text-red-700 ring-red-200"
      : status === "processing"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-neutral-50 text-neutral-600 ring-neutral-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-medium uppercase tracking-[0.08em] ring-1 ring-inset ${color}`}
    >
      {status}
    </span>
  );
}

const editSelectCls =
  "h-[28px] w-full appearance-none rounded-md border border-neutral-300 bg-white pl-2.5 pr-7 text-[11px] uppercase tracking-wide outline-none focus:border-[#040d08]";

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 3.5L5 6.5L8 3.5" />
      </svg>
    </div>
  );
}

function TextButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-red-700 hover:text-red-900"
      : "text-neutral-700 hover:text-[#040d08]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer whitespace-nowrap text-[11px] uppercase tracking-wide transition disabled:cursor-default disabled:opacity-30 disabled:hover:text-current ${color}`}
    >
      {children}
    </button>
  );
}
