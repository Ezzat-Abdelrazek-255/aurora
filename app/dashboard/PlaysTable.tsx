"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../components/Spinner";
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

import { useOpenPlay } from "../components/ModalProvider";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { CATEGORIES, ROLES, type Category, type Role } from "../lib/videos";

type Status = "pending" | "processing" | "ready" | "failed";

export type DashboardPlayRow = {
  slug: string;
  name: string;
  category: Category;
  role: Role;
  status: Status;
  cover_url: string | null;
  gallery_urls: string[];
  error_message: string | null;
  position: number;
  created_at: string;
};

type Draft = { name: string; category: Category; role: Role };
type RowBusy = "delete" | "edit" | undefined;

const STORAGE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/`;

export function PlaysTable({ initial }: { initial: DashboardPlayRow[] }) {
  const openPlay = useOpenPlay();
  const [rows, setRows] = useState<DashboardPlayRow[]>(initial);
  const [busy, setBusy] = useState<Record<string, RowBusy>>({});
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(
    null,
  );

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
    let cancelled = false;

    // Mirror VideoTable: bind the auth token to the realtime channel so the
    // 'authed full access' RLS policy applies and pending/processing rows
    // reach the dashboard subscriber.
    const onAuthChange = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? null);
    });

    const channel = supabase
      .channel("plays-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "plays" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              const next = payload.new as DashboardPlayRow & {
                cover_path: string | null;
                gallery_paths: string[] | null;
              };
              if (prev.some((r) => r.slug === next.slug)) return prev;
              return [...prev, fromRealtime(next)].sort(
                (a, b) => a.position - b.position,
              );
            }
            if (payload.eventType === "DELETE") {
              const old = payload.old as { slug: string };
              return prev.filter((r) => r.slug !== old.slug);
            }
            const next = payload.new as DashboardPlayRow & {
              cover_path: string | null;
              gallery_paths: string[] | null;
            };
            return prev.map((r) =>
              r.slug === next.slug
                ? {
                    ...r,
                    name: next.name,
                    category: next.category,
                    role: next.role,
                    status: next.status,
                    error_message: next.error_message ?? null,
                    position: next.position,
                    cover_url: next.cover_path
                      ? STORAGE_BASE + next.cover_path
                      : r.cover_url,
                    gallery_urls: next.gallery_paths
                      ? next.gallery_paths.map((p) => STORAGE_BASE + p)
                      : r.gallery_urls,
                  }
                : r,
            );
          });
        },
      );

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      onAuthChange.data.subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const setRowBusy = (slug: string, value: RowBusy) =>
    setBusy((b) => ({ ...b, [slug]: value }));

  const onDelete = async (slug: string, name: string) => {
    if (
      !confirm(
        `Delete "${name}"? This removes the row and ${rows.find((r) => r.slug === slug)?.gallery_urls.length ?? "all"} gallery image(s).`,
      )
    ) {
      return;
    }
    setRowBusy(slug, "delete");
    setError(null);
    const res = await fetch(`/api/plays/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    });
    setRowBusy(slug, undefined);
    if (!res.ok && res.status !== 204) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`delete: ${body?.message ?? body?.error ?? res.status}`);
    }
  };

  const startEdit = (r: DashboardPlayRow) => {
    setEditingSlug(r.slug);
    setDraft({ name: r.name, category: r.category, role: r.role });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingSlug(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingSlug || !draft) return;
    const original = rows.find((r) => r.slug === editingSlug);
    if (!original) return;
    const patch: Partial<Draft> = {};
    if (draft.name !== original.name) patch.name = draft.name.trim();
    if (draft.category !== original.category) patch.category = draft.category;
    if (draft.role !== original.role) patch.role = draft.role;

    if (Object.keys(patch).length === 0) {
      cancelEdit();
      return;
    }

    setRowBusy(editingSlug, "edit");
    setError(null);
    const res = await fetch(`/api/plays/${encodeURIComponent(editingSlug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setRowBusy(editingSlug, undefined);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`edit: ${body?.message ?? body?.error ?? res.status}`);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.slug === editingSlug ? { ...r, ...patch } : r)),
    );
    cancelEdit();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sorted = [...rows].sort((a, b) => a.position - b.position);
    const oldIdx = sorted.findIndex((r) => r.slug === active.id);
    const newIdx = sorted.findIndex((r) => r.slug === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const next = arrayMove(sorted, oldIdx, newIdx);
    const positions = next.map((r, i) => ({ slug: r.slug, position: i }));

    const beforeSnapshot = new Map(rows.map((r) => [r.slug, r.position]));
    const posMap = new Map(positions.map((p) => [p.slug, p.position]));
    setRows((prev) =>
      prev.map((r) => ({ ...r, position: posMap.get(r.slug) ?? r.position })),
    );
    setError(null);

    const res = await fetch("/api/plays/reorder", {
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
          position: beforeSnapshot.get(r.slug) ?? r.position,
        })),
      );
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.position - b.position),
    [rows],
  );
  const ids = useMemo(() => sorted.map((r) => r.slug), [sorted]);

  const onView = (r: DashboardPlayRow) => {
    if (r.gallery_urls.length === 0) return;
    openPlay({
      slug: r.slug,
      name: r.name,
      role: r.role,
      gallery: r.gallery_urls,
      startIndex: 0,
    });
  };

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
                  key={r.slug}
                  row={r}
                  isEditing={editingSlug === r.slug}
                  editingAny={editingSlug !== null}
                  draft={draft}
                  setDraft={setDraft}
                  rowBusy={busy[r.slug]}
                  onEdit={() => startEdit(r)}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  onDelete={() => onDelete(r.slug, r.name)}
                  onView={() => onView(r)}
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
              key={r.slug}
              row={r}
              isEditing={false}
              editingAny={editingSlug !== null}
              draft={null}
              setDraft={setDraft}
              rowBusy={undefined}
              onEdit={() => {}}
              onSave={() => {}}
              onCancel={() => {}}
              onDelete={() => {}}
              onView={() => {}}
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
      No plays yet. Add one above.
    </li>
  );
}

type RowProps = {
  row: DashboardPlayRow;
  isEditing: boolean;
  editingAny: boolean;
  draft: Draft | null;
  setDraft: (d: Draft) => void;
  rowBusy: RowBusy;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onView: () => void;
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
  } = useSortable({ id: props.row.slug, disabled: props.isEditing });

  return (
    <RowBody
      {...props}
      dnd={{
        liRef: setNodeRef,
        liStyle: {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 50 : 1,
          position: "relative",
        },
        liExtraClass: isDragging
          ? "shadow-2xl border border-dashed border-neutral-400 bg-white"
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
  onView,
  dnd,
}: RowProps & { dnd?: DndSlots }) {
  return (
    <li
      ref={dnd?.liRef}
      style={dnd?.liStyle}
      onKeyDown={
        isEditing
          ? (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              }
            }
          : undefined
      }
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
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
        onClick={onView}
        disabled={r.status !== "ready" || r.gallery_urls.length === 0}
        title={r.status === "ready" ? "View gallery" : undefined}
        aria-label={`View ${r.name}`}
        className="group relative block aspect-video w-[80px] overflow-hidden rounded-sm bg-neutral-100 disabled:cursor-not-allowed"
      >
        {r.cover_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={r.cover_url}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        {r.status === "ready" && r.gallery_urls.length > 1 && (
          <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">
            +{r.gallery_urls.length - 1}
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
            className="box-border h-[28px] w-full rounded-md border border-neutral-300 bg-white px-2 font-serif text-[14px] leading-none outline-none focus:border-[#040d08]"
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
        {!isEditing && (
          <div className="mt-0.5 text-[11px] text-neutral-500">{r.slug}</div>
        )}
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
              <span className="inline-flex items-center gap-1.5">
                {rowBusy === "edit" && <Spinner size={11} />}
                {rowBusy === "edit" ? "Saving" : "Save"}
              </span>
            </TextButton>
            <TextButton onClick={onCancel}>Cancel</TextButton>
          </>
        ) : (
          <>
            {r.status === "ready" && r.gallery_urls.length > 0 && (
              <TextButton onClick={onView}>View</TextButton>
            )}
            <TextButton onClick={onEdit} disabled={editingAny}>
              Edit
            </TextButton>
            <TextButton
              onClick={onDelete}
              disabled={rowBusy === "delete"}
              tone="danger"
            >
              <span className="inline-flex items-center gap-1.5">
                {rowBusy === "delete" && <Spinner size={11} />}
                {rowBusy === "delete" ? "Deleting" : "Delete"}
              </span>
            </TextButton>
          </>
        )}
      </div>
    </li>
  );
}

const STATUS_PILL_CLASS: Record<Status, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  processing: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-neutral-50 text-neutral-600 ring-neutral-200",
};

function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex h-[18px] items-center rounded-full px-2 text-[9px] font-medium uppercase leading-none tracking-[0.08em] ring-1 ring-inset ${STATUS_PILL_CLASS[status]}`}
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
  next: DashboardPlayRow & {
    cover_path: string | null;
    gallery_paths: string[] | null;
  },
): DashboardPlayRow {
  return {
    slug: next.slug,
    name: next.name,
    category: next.category,
    role: next.role,
    status: next.status,
    cover_url: next.cover_path ? STORAGE_BASE + next.cover_path : null,
    gallery_urls: (next.gallery_paths ?? []).map((p) => STORAGE_BASE + p),
    error_message: next.error_message ?? null,
    position: next.position,
    created_at: next.created_at,
  };
}
