"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Category = "film-tv" | "commercial" | "music";
type Role = "Producer" | "Talent";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "film-tv", label: "Film/TV" },
  { value: "commercial", label: "Commercial" },
  { value: "music", label: "Music" },
];

const ROLES: Role[] = ["Producer", "Talent"];

export function AddVideoForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("commercial");
  const [role, setRole] = useState<Role>("Talent");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: url.trim(), name: name.trim(), category, role }),
    });
    setPending(false);
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
    setCategory("commercial");
    setRole("Talent");
    // Refresh server data — VideoTable's realtime subscription will also pick
    // up the new pending row, but a refresh guarantees the SSR list is in sync.
    router.refresh();
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-x-4 gap-y-3 rounded-lg border border-neutral-200 bg-neutral-50/40 p-5 md:grid-cols-[1.5fr_1fr_auto_auto_auto]"
    >
      <Field label="Vimeo URL">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://vimeo.com/1234567/abcd1234ef"
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
      <Field label="&nbsp;">
        <button
          type="submit"
          disabled={pending || !url.trim() || !name.trim()}
          className="h-[38px] text-[12px] uppercase tracking-wider text-[#040d08] transition hover:opacity-60 disabled:opacity-30"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </Field>
      {error && (
        <p
          aria-live="polite"
          className="md:col-span-5 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      )}
    </form>
  );
}

const inputCls =
  "h-[38px] w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] outline-none focus:border-[#040d08]";

const selectCls =
  "h-[38px] w-full appearance-none rounded-md border border-neutral-300 bg-white pl-3 pr-8 text-[13px] outline-none focus:border-[#040d08]";

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
      <span
        // dangerouslySetInnerHTML so a `&nbsp;` placeholder keeps row height
        // aligned for the unlabeled submit button column.
        className="text-[10.5px] uppercase tracking-wide text-neutral-600"
        dangerouslySetInnerHTML={{ __html: label }}
      />
      {children}
    </label>
  );
}
