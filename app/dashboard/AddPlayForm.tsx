"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../components/Spinner";
import { ROLES, type Role } from "../lib/videos";

const MAX_DIM = 2400; // px on longest edge — matches the Drive seed pipeline.
const QUALITY = 0.82;

type ResizedImage = {
  blob: Blob;
  width: number;
  height: number;
  name: string;
};

/**
 * Resize-and-recompress in the browser before upload. Keeps the network
 * payload sane (and the storage bucket cheap) without needing a server-side
 * sharp dependency. Uses createImageBitmap so EXIF orientation is honored on
 * Chromium and Safari. Falls back to <img> if createImageBitmap is missing.
 */
async function resizeImage(file: File): Promise<ResizedImage> {
  const bitmap: ImageBitmap | HTMLImageElement = await createBitmap(file);
  const w0 = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const h0 = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, MAX_DIM / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  // ImageBitmap holds GPU resources — release them before the canvas blob
  // encode so memory stays bounded when the user drops 20 photos at once.
  if ("close" in bitmap) bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("toBlob returned null");
  const stem = file.name.replace(/\.[^.]+$/, "") || "image";
  return { blob, width: w, height: h, name: `${stem}.jpg` };
}

async function createBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img> path on browsers that throw on certain MIME types.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AddPlayForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Talent");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (files.length === 0) {
      setError("At least one image is required");
      return;
    }
    setPending(true);
    try {
      setProgress(`Optimizing 0 / ${files.length}…`);
      const resized: ResizedImage[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Optimizing ${i + 1} / ${files.length}…`);
        resized.push(await resizeImage(files[i]));
      }
      const cover = resized[0];
      const aspect = cover.width / cover.height;

      setProgress("Uploading…");
      const form = new FormData();
      form.set("name", name.trim());
      form.set("role", role);
      form.set("category", "theatre");
      form.set("aspect", String(aspect));
      for (const r of resized) {
        form.append("images", new File([r.blob], r.name, { type: "image/jpeg" }));
      }
      const res = await fetch("/api/plays", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        const tag = body?.error ?? `${res.status}`;
        setError(body?.message ? `${tag}: ${body.message}` : tag);
        return;
      }
      setName("");
      setRole("Talent");
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-x-4 gap-y-3 rounded-lg border border-neutral-200 bg-neutral-50/40 p-5 md:grid-cols-[1.5fr_auto_2fr_auto]"
    >
      <Field label="Name">
        <input
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="A View From the Bridge"
          className={inputCls}
        />
      </Field>
      <Field label="Role">
        <SelectShell>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={selectCls}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </SelectShell>
      </Field>
      <Field label={`Images (first becomes the cover) — ${files.length} selected`}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block h-[38px] w-full text-[12.5px] file:mr-3 file:h-[30px] file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-200 file:px-3 file:text-[11.5px] file:uppercase file:tracking-wide file:text-[#040d08] hover:file:bg-neutral-300"
        />
      </Field>
      <button
        type="submit"
        aria-label="Add play"
        disabled={pending || !name.trim() || files.length === 0}
        className="box-border inline-flex h-[38px] items-center justify-center self-end px-3 text-[12px] uppercase leading-none tracking-wider text-[#040d08] transition hover:opacity-60 disabled:opacity-30"
      >
        <span className="inline-flex items-center gap-2">
          {pending && <Spinner size={12} />}
          {pending ? progress ?? "Adding" : "Add"}
        </span>
      </button>
      {error && (
        <p
          aria-live="polite"
          className="md:col-span-4 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      )}
    </form>
  );
}

const inputCls =
  "box-border block h-[38px] w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] leading-none outline-none focus:border-[#040d08]";

const selectCls =
  "box-border block h-[38px] w-full appearance-none rounded-md border border-neutral-300 bg-white pl-3 pr-8 text-[13px] leading-none outline-none focus:border-[#040d08]";

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 3.5L5 6.5L8 3.5" />
      </svg>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] uppercase tracking-wide text-neutral-600">
        {label}
      </span>
      {children}
    </label>
  );
}
