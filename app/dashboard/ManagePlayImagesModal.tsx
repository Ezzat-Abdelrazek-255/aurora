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
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Spinner } from "../components/Spinner";
import { resizeImage } from "../lib/imageResize";

type Item = { path: string; url: string };

export function ManagePlayImagesModal({
  slug,
  name,
  paths,
  urls,
  onClose,
  onChange,
}: {
  slug: string;
  name: string;
  paths: string[];
  urls: string[];
  onClose: () => void;
  onChange: (next: { paths: string[]; urls: string[] }) => void;
}) {
  const initial = useMemo<Item[]>(
    () => paths.map((p, i) => ({ path: p, url: urls[i] ?? "" })),
    [paths, urls],
  );
  const [items, setItems] = useState<Item[]>(initial);
  const [busy, setBusy] = useState<"reorder" | "add" | "delete" | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const dirty = useMemo(() => {
    if (items.length !== initial.length) return true;
    return items.some((it, i) => it.path !== initial[i].path);
  }, [items, initial]);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((x) => x.path === active.id);
      const newIdx = prev.findIndex((x) => x.path === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const saveOrder = async () => {
    if (!dirty) return;
    setBusy("reorder");
    setError(null);
    const res = await fetch(
      `/api/plays/${encodeURIComponent(slug)}/gallery`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paths: items.map((it) => it.path) }),
      },
    );
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`reorder: ${body?.message ?? body?.error ?? res.status}`);
      return;
    }
    onChange({
      paths: items.map((it) => it.path),
      urls: items.map((it) => it.url),
    });
  };

  const onAddFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy("add");
    setError(null);
    try {
      setProgress(`Optimizing 0 / ${files.length}…`);
      const form = new FormData();
      for (let i = 0; i < files.length; i++) {
        setProgress(`Optimizing ${i + 1} / ${files.length}…`);
        const r = await resizeImage(files[i]);
        form.append(
          "images",
          new File([r.blob], r.name, { type: "image/jpeg" }),
        );
      }
      setProgress("Uploading…");
      const res = await fetch(
        `/api/plays/${encodeURIComponent(slug)}/gallery`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        setError(`add: ${body?.message ?? body?.error ?? res.status}`);
        return;
      }
      const body = (await res.json()) as { gallery_paths: string[] };
      const nextPaths = body.gallery_paths;
      const nextUrls = nextPaths.map(
        (p) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/${p}`,
      );
      setItems(nextPaths.map((p, i) => ({ path: p, url: nextUrls[i] })));
      onChange({ paths: nextPaths, urls: nextUrls });
      if (addInputRef.current) addInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const onDelete = async (path: string) => {
    if (items.length <= 1) {
      setError("Cannot remove the last image. Delete the play instead.");
      return;
    }
    if (!confirm("Remove this image from the gallery?")) return;
    setBusy("delete");
    setError(null);
    const res = await fetch(
      `/api/plays/${encodeURIComponent(slug)}/gallery`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      },
    );
    setBusy(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      setError(`delete: ${body?.message ?? body?.error ?? res.status}`);
      return;
    }
    const body = (await res.json()) as { gallery_paths: string[] };
    const nextPaths = body.gallery_paths;
    const nextUrls = nextPaths.map(
      (p) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/${p}`,
    );
    setItems(nextPaths.map((p, i) => ({ path: p, url: nextUrls[i] })));
    onChange({ paths: nextPaths, urls: nextUrls });
  };

  const ids = items.map((it) => it.path);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Manage images for ${name}`}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-5 py-3">
          <div className="min-w-0">
            <h3
              className="truncate font-serif text-[18px] leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-roslindale-display)" }}
            >
              {name}
            </h3>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              Drag to reorder · {items.length} image{items.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close"
            className="text-[11px] uppercase tracking-wide text-neutral-700 hover:text-[#040d08] disabled:opacity-30"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && (
            <p
              aria-live="polite"
              className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
            >
              {error}
            </p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {items.map((it, i) => (
                  <SortableThumb
                    key={it.path}
                    item={it}
                    index={i}
                    canDelete={items.length > 1}
                    onDelete={() => onDelete(it.path)}
                    disabled={!!busy}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-5 py-3">
          <label className="inline-flex h-[34px] cursor-pointer items-center rounded-md bg-neutral-200 px-3 text-[11.5px] uppercase tracking-wide text-[#040d08] hover:bg-neutral-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-30">
            <span className="inline-flex items-center gap-2">
              {busy === "add" && <Spinner size={11} />}
              {busy === "add" ? progress ?? "Adding" : "Add images"}
            </span>
            <input
              ref={addInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={!!busy}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []);
                if (fs.length > 0) void onAddFiles(fs);
              }}
              className="hidden"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={!!busy}
              className="text-[11px] uppercase tracking-wide text-neutral-700 hover:text-[#040d08] disabled:opacity-30"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveOrder}
              disabled={!dirty || !!busy}
              className="inline-flex h-[34px] items-center rounded-md bg-[#040d08] px-4 text-[11.5px] uppercase tracking-wide text-white hover:opacity-80 disabled:opacity-30"
            >
              <span className="inline-flex items-center gap-2">
                {busy === "reorder" && <Spinner size={11} />}
                {busy === "reorder" ? "Saving" : "Save order"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableThumb({
  item,
  index,
  canDelete,
  onDelete,
  disabled,
}: {
  item: Item;
  index: number;
  canDelete: boolean;
  onDelete: () => void;
  disabled: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.path, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group relative aspect-[4/3] overflow-hidden rounded-md bg-neutral-100 ring-1 ring-neutral-200 ${
        isDragging ? "shadow-xl ring-neutral-400" : ""
      }`}
    >
      <button
        type="button"
        aria-label={`Drag image ${index + 1}`}
        disabled={disabled}
        className="absolute inset-0 block h-full w-full cursor-grab touch-none active:cursor-grabbing disabled:cursor-not-allowed"
        {...attributes}
        {...listeners}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </button>
      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {index + 1}
      </span>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Remove image ${index + 1}`}
          className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M2 2L8 8M8 2L2 8" />
          </svg>
        </button>
      )}
    </li>
  );
}
