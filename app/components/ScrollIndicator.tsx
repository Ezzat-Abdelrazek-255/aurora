"use client";

import { useEffect, useRef } from "react";
import { getLoopPeriod } from "../lib/scroll";
import { useView } from "./ViewProvider";

const TRACK_HEIGHT = 96; // px
const THUMB_HEIGHT = 28; // px

export function ScrollIndicator() {
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);
  const { view } = useView();

  useEffect(() => {
    // ActiveView remounts the [data-loop-section] nodes on view change, so
    // we re-target the ResizeObserver each time `view` flips.
    let period = getLoopPeriod();
    const resizeObs = new ResizeObserver(() => {
      period = getLoopPeriod();
    });
    document
      .querySelectorAll<HTMLElement>("[data-loop-section]")
      .forEach((el) => resizeObs.observe(el));

    let lastTextProgress = -1;
    let raf = 0;
    const tick = () => {
      const y = window.scrollY;
      const p = period > 0 ? (((y % period) + period) % period) / period : 0;
      const top = p * (TRACK_HEIGHT - THUMB_HEIGHT);
      const thumb = thumbRef.current;
      if (thumb) {
        thumb.style.transform = `translate3d(0, ${top}px, 0)`;
      }
      const pct = Math.round(p * 100);
      if (pct !== lastTextProgress && numRef.current) {
        numRef.current.textContent = String(pct).padStart(2, "0");
        lastTextProgress = pct;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
    };
  }, [view]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2 md:bottom-8 md:right-8"
    >
      <span
        ref={numRef}
        className="font-mono text-[10px] tabular-nums text-neutral-500"
        style={{ fontFamily: "var(--font-roslindale-text)" }}
      >
        00
      </span>
      <div
        className="relative w-[2px] overflow-hidden bg-neutral-300/70"
        style={{ height: TRACK_HEIGHT }}
      >
        <div
          ref={thumbRef}
          className="absolute left-0 right-0 bg-neutral-900 will-change-transform"
          style={{ height: THUMB_HEIGHT, top: 0 }}
        />
      </div>
    </div>
  );
}
