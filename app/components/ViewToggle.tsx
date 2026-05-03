"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type ViewMode = "grid" | "list";

export function ViewToggle({ view }: { view: ViewMode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setView = (next: ViewMode) => {
    if (next === view) return;
    const params = new URLSearchParams(sp.toString());
    if (next === "grid") params.delete("view");
    else params.set("view", next);
    startTransition(() => {
      router.push(`/?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div
      className="fixed right-4 top-4 z-50 flex items-center gap-0.5 rounded-full border border-neutral-200 bg-white/85 p-1 shadow-sm backdrop-blur"
      style={{ fontFamily: "var(--font-roslindale-text)" }}
      aria-label="Layout view"
      role="group"
    >
      <button
        type="button"
        onClick={() => setView("grid")}
        disabled={pending}
        aria-pressed={view === "grid"}
        title="Grid view"
        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
          view === "grid"
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setView("list")}
        disabled={pending}
        aria-pressed={view === "list"}
        title="List view"
        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${
          view === "list"
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="6" height="3" rx="0.5" />
          <rect x="11" y="5" width="10" height="2" rx="0.5" />
          <rect x="3" y="11" width="6" height="3" rx="0.5" />
          <rect x="11" y="11" width="10" height="2" rx="0.5" />
          <rect x="3" y="17" width="6" height="3" rx="0.5" />
          <rect x="11" y="17" width="10" height="2" rx="0.5" />
        </svg>
      </button>
    </div>
  );
}
