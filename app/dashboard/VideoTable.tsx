"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useOpenVideo } from "../components/ModalProvider";
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
  const openVideo = useOpenVideo();
  const [rows, setRows] = useState<DashboardRow[]>(initial);
  const [busy, setBusy] = useState<Record<string, RowBusy>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  // dnd-kit's auto-generated aria-describedby IDs differ between SSR and the
  // first client render (a known counter-based ID issue). Render a static
  // version on first paint, then upgrade to the sortable version once we're
  // safely on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(
    null,
  );

  // dnd-kit sensors. 5px activation distance so buttons inside the row still
  // register clicks — drag only kicks in once the pointer has travelled.
  // PointerSensor for modern browsers, MouseSensor as a fallback for Playwright
  // (which dispatches mouse events, not pointer events), TouchSensor for
  // mobile, KeyboardSensor for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
    setRows((prev) =>
      prev.map((r) => (r.vimeo_id === editingId ? { ...r, ...patch } : r)),
    );
    cancelEdit();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sorted = [...rows].sort((a, b) => a.position - b.position);
    const oldIdx = sorted.findIndex((r) => r.vimeo_id === active.id);
    const newIdx = sorted.findIndex((r) => r.vimeo_id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const next = arrayMove(sorted, oldIdx, newIdx);
    const positions = next.map((r, i) => ({
      vimeo_id: r.vimeo_id,
      position: i,
    }));

    const beforeSnapshot = new Map(rows.map((r) => [r.vimeo_id, r.position]));
    const posMap = new Map(positions.map((p) => [p.vimeo_id, p.position]));
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
  const ids = useMemo(() => sorted.map((r) => r.vimeo_id), [sorted]);

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
      {mounted ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
              {sorted.length === 0 && <EmptyRow />}
              {sorted.map((r) => (
                <SortableRow
                  key={r.vimeo_id}
                  row={r}
                  isEditing={editingId === r.vimeo_id}
                  editingAny={editingId !== null}
                  draft={draft}
                  setDraft={setDraft}
                  rowBusy={busy[r.vimeo_id]}
                  onEdit={() => startEdit(r)}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  onDelete={() => onDelete(r.vimeo_id, r.name)}
                  onRetry={() => onRetry(r.vimeo_id)}
                  onWatch={() =>
                    openVideo({
                      id: r.vimeo_id,
                      hash: r.vimeo_hash,
                      name: r.name,
                      role: r.role,
                      thumb: r.poster_url,
                    })
                  }
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {sorted.length === 0 && <EmptyRow />}
          {sorted.map((r) => (
            <RowBody
              key={r.vimeo_id}
              row={r}
              isEditing={false}
              editingAny={editingId !== null}
              draft={null}
              setDraft={setDraft}
              rowBusy={undefined}
              onEdit={() => {}}
              onSave={() => {}}
              onCancel={() => {}}
              onDelete={() => {}}
              onRetry={() => {}}
              onWatch={() => {}}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyRow() {
  return (
    <li className="px-4 py-8 text-center text-[13px] text-neutral-500">
      No videos yet. Add one above.
    </li>
  );
}

type RowProps = {
  row: DashboardRow;
  isEditing: boolean;
  editingAny: boolean;
  draft: Draft | null;
  setDraft: (d: Draft) => void;
  rowBusy: RowBusy;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onWatch: () => void;
};

function SortableRow(props: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.row.vimeo_id, disabled: props.isEditing });

  return (
    <RowBody
      {...props}
      dnd={{
        liRef: setNodeRef,
        liStyle: {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 10 : undefined,
        },
        liExtraClass: isDragging
          ? "shadow-md ring-1 ring-inset ring-neutral-300"
          : "",
        handleRef: setActivatorNodeRef,
        handleProps: { ...attributes, ...listeners },
      }}
    />
  );
}

type DndSlots = {
  liRef: (node: HTMLLIElement | null) => void;
  liStyle: React.CSSProperties;
  liExtraClass: string;
  handleRef: (node: HTMLButtonElement | null) => void;
  handleProps: Record<string, unknown>;
};

function RowBody({
  row: r,
  isEditing,
  editingAny,
  draft,
  setDraft,
  rowBusy,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onRetry,
  onWatch,
  dnd,
}: RowProps & { dnd?: DndSlots }) {
  return (
    <li
      ref={dnd?.liRef}
      style={dnd?.liStyle}
      className={`grid grid-cols-[24px_80px_1fr_auto_auto_auto] items-center gap-4 bg-white px-4 py-3 ${
        dnd?.liExtraClass ?? ""
      }`}
    >
      <button
        ref={dnd?.handleRef}
        type="button"
        aria-label="Drag to reorder"
        title={isEditing || !dnd ? undefined : "Drag to reorder"}
        disabled={isEditing || !dnd}
        className={`flex h-6 w-6 select-none items-center justify-center bg-transparent text-neutral-400 ${
          isEditing || !dnd
            ? "opacity-30"
            : "cursor-grab hover:text-neutral-700 active:cursor-grabbing"
        }`}
        {...(dnd?.handleProps ?? {})}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="3" r="1" />
          <circle cx="9" cy="3" r="1" />
          <circle cx="5" cy="7" r="1" />
          <circle cx="9" cy="7" r="1" />
          <circle cx="5" cy="11" r="1" />
          <circle cx="9" cy="11" r="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onWatch}
        disabled={r.status !== "ready"}
        title={r.status === "ready" ? "Watch full video" : undefined}
        aria-label={`Watch ${r.name}`}
        className="group relative block aspect-video w-[80px] overflow-hidden rounded-sm bg-neutral-100 disabled:cursor-not-allowed"
      >
        {r.poster_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={r.poster_url}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        {r.status === "ready" && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}
      </button>
      <div className="min-w-0">
        {isEditing && draft ? (
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
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
        <div className="mt-0.5 text-[11px] text-neutral-500">{r.vimeo_id}</div>
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
            <TextButton onClick={onSave} disabled={rowBusy === "edit"}>
              {rowBusy === "edit" ? "Saving…" : "Save"}
            </TextButton>
            <TextButton onClick={onCancel}>Cancel</TextButton>
          </>
        ) : (
          <>
            {r.status === "ready" && (
              <TextButton onClick={onWatch}>Watch</TextButton>
            )}
            <TextButton onClick={onEdit} disabled={editingAny}>
              Edit
            </TextButton>
            {r.status === "failed" && (
              <TextButton onClick={onRetry} disabled={rowBusy === "retry"}>
                {rowBusy === "retry" ? "Retrying…" : "Retry"}
              </TextButton>
            )}
            <TextButton
              onClick={onDelete}
              disabled={rowBusy === "delete"}
              tone="danger"
            >
              {rowBusy === "delete" ? "Deleting…" : "Delete"}
            </TextButton>
          </>
        )}
      </div>
    </li>
  );
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
      className={`inline-flex items-center rounded-full px-2 py-1 text-[9px] font-medium uppercase leading-none tracking-[0.08em] ring-1 ring-inset ${color}`}
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
      className={`whitespace-nowrap text-[11px] uppercase tracking-wide transition disabled:opacity-30 disabled:hover:text-current ${color}`}
    >
      {children}
    </button>
  );
}

function fromRealtime(
  next: DashboardRow & {
    clip_path: string | null;
    poster_path: string | null;
  },
): DashboardRow {
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
