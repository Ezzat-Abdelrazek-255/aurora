"use client";

import { useView } from "./ViewProvider";

const BUTTON_PX = 32;
const GAP_PX = 2;

export function ViewToggle() {
  const { view, setView } = useView();
  const isList = view === "list";

  return (
    <div
      className="fixed right-4 top-4 z-50 flex items-center rounded-full border border-neutral-200 bg-white/90 p-1 shadow-sm backdrop-blur"
      style={{ gap: GAP_PX, fontFamily: "var(--font-roslindale-text)" }}
      role="group"
      aria-label="Layout view"
    >
      {/* Sliding active indicator */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 top-1 rounded-full bg-neutral-900 transition-transform duration-300 ease-out"
        style={{
          width: BUTTON_PX,
          height: BUTTON_PX,
          transform: `translateX(${isList ? BUTTON_PX + GAP_PX : 0}px)`,
        }}
      />

      <button
        type="button"
        onClick={() => setView("grid")}
        aria-pressed={!isList}
        title="Grid view"
        className={`relative z-10 flex items-center justify-center rounded-full transition-colors duration-200 ${
          !isList ? "text-white" : "text-neutral-500 hover:text-neutral-900"
        }`}
        style={{ width: BUTTON_PX, height: BUTTON_PX }}
      >
        <GridIcon />
      </button>

      <button
        type="button"
        onClick={() => setView("list")}
        aria-pressed={isList}
        title="List view"
        className={`relative z-10 flex items-center justify-center rounded-full transition-colors duration-200 ${
          isList ? "text-white" : "text-neutral-500 hover:text-neutral-900"
        }`}
        style={{ width: BUTTON_PX, height: BUTTON_PX }}
      >
        <ListIcon />
      </button>
    </div>
  );
}

function GridIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Three rows: a small thumbnail rect on the left, a line to its right */}
      <rect x="3" y="4.5" width="6" height="4" rx="0.8" />
      <line x1="11" y1="6.5" x2="21" y2="6.5" />
      <rect x="3" y="10" width="6" height="4" rx="0.8" />
      <line x1="11" y1="12" x2="21" y2="12" />
      <rect x="3" y="15.5" width="6" height="4" rx="0.8" />
      <line x1="11" y1="17.5" x2="21" y2="17.5" />
    </svg>
  );
}
