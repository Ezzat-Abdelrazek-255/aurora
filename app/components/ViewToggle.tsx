"use client";

import { useView } from "./ViewProvider";

const BUTTON_PX = 32;
const GAP_PX = 2;

// Inlined Lucide icons (LayoutGrid + List). Avoids pulling lucide-react for
// two glyphs. Keep the size/strokeWidth defaults consistent with the rest of
// the UI (15px / 2).
function LayoutGridIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  );
}

function ListIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
      <path d="M3 6h.01" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M8 6h13" />
    </svg>
  );
}

export function ViewToggle() {
  const { view, setView } = useView();
  const isList = view === "list";

  return (
    <div
      className="fixed right-4 top-4 z-50 flex items-center p-1"
      style={{ gap: GAP_PX, fontFamily: "var(--font-roslindale-text)" }}
      role="group"
      aria-label="Layout view"
    >
      {/* Sliding active indicator */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-1 top-1 rounded-[4px] bg-neutral-900"
        style={{
          width: BUTTON_PX,
          height: BUTTON_PX,
          transform: `translateX(${isList ? BUTTON_PX + GAP_PX : 0}px)`,
          transition: "transform 0.5s var(--ease-primary)",
        }}
      />

      <button
        type="button"
        onClick={() => setView("grid")}
        aria-pressed={!isList}
        title="Grid view"
        className={`relative z-10 flex items-center justify-center rounded-full ${
          !isList ? "text-white" : "text-neutral-500 hover:text-neutral-900"
        }`}
        style={{
          width: BUTTON_PX,
          height: BUTTON_PX,
          transition: "color 0.3s var(--ease-primary)",
        }}
      >
        <LayoutGridIcon />
      </button>

      <button
        type="button"
        onClick={() => setView("list")}
        aria-pressed={isList}
        title="List view"
        className={`relative z-10 flex items-center justify-center rounded-full ${
          isList ? "text-white" : "text-neutral-500 hover:text-neutral-900"
        }`}
        style={{
          width: BUTTON_PX,
          height: BUTTON_PX,
          transition: "color 0.3s var(--ease-primary)",
        }}
      >
        <ListIcon />
      </button>
    </div>
  );
}
