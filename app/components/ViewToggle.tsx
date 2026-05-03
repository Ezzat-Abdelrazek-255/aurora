"use client";

import { LayoutGrid, List } from "lucide-react";
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
        className="pointer-events-none absolute left-1 top-1 rounded-full bg-neutral-900"
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
        <LayoutGrid size={15} strokeWidth={2} aria-hidden="true" />
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
        <List size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
