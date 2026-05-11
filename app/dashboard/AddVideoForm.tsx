"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "../components/Spinner";
import { resizeImage } from "../lib/imageResize";
import { CATEGORIES, ROLES, type Category, type Role } from "../lib/videos";

export function AddVideoForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("brands");
  const [role, setRole] = useState<Role>("Talent");
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("url", url.trim());
      form.set("name", name.trim());
      form.set("category", category);
      form.set("role", role);
      if (thumbnail) {
        setProgress("Optimizing thumbnail…");
        const resized = await resizeImage(thumbnail);
        form.set(
          "thumbnail",
          new File([resized.blob], resized.name, { type: "image/jpeg" }),
        );
      }
      setProgress("Adding…");
      const res = await fetch("/api/videos", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; message?: string }
          | null;
        const tag = body?.error ?? `${res.status}`;
        setError(body?.message ? `${tag}: ${body.message}` : tag);
        return;
      }
      setUrl("");
      setName("");
      setCategory("brands");
      setRole("Talent");
      setThumbnail(null);
      // Refresh server data — VideoTable's realtime subscription will also pick
      // up the new pending row, but a refresh guarantees the SSR list is in sync.
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
      className="mt-4 grid gap-x-4 gap-y-3 rounded-lg border border-neutral-200 bg-neutral-50/40 p-5 md:grid-cols-[1.5fr_1fr_auto_auto_auto_auto]"
    >
      <Field label="Vimeo URL">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://vimeo.com/1234567 (or .../abcd1234ef)"
          className={inputCls}
        />
      </Field>
      <Field label="Name">
        <input
          type="text"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Apple, Tokyo Olympics, …"
          className={inputCls}
        />
      </Field>
      <Field label="Category">
        <SelectShell>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className={selectCls}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </SelectShell>
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
      <Field label="Thumbnail (optional)">
        <label className="inline-flex h-[38px] w-fit max-w-full cursor-pointer items-center rounded-md bg-neutral-200 px-3 text-[11.5px] uppercase tracking-wide text-[#040d08] hover:bg-neutral-300">
          <span className="truncate">{thumbnail?.name ?? "Choose file"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
      </Field>
      {/* Submit lives outside <Field> — wrapping it in a <label> with
          empty text destroys the button's accessible name. `self-end`
          aligns the row with the bottom of the input fields above. */}
      <button
        type="submit"
        aria-label="Add video"
        disabled={pending || !url.trim() || !name.trim()}
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
          className="md:col-span-6 text-[12.5px] text-red-700"
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
