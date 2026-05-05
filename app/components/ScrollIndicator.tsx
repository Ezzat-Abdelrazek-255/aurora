"use client";

import { useEffect, useRef } from "react";
import { getLoopPeriod } from "../lib/scroll";

const TRACK_HEIGHT = 96; // px
const THUMB_HEIGHT = 28; // px

export function ScrollIndicator() {
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let period = 0;
    let observed: HTMLElement[] = [];
    const resizeObs = new ResizeObserver(() => measure());

    const measure = () => {
      period = getLoopPeriod();
      // Re-target the ResizeObserver if the section nodes changed
      // (e.g. switching between list and grid layouts unmounts/remounts them).
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>("[data-loop-section]"),
      );
      if (
        sections.length !== observed.length ||
        sections.some((el, i) => el !== observed[i])
      ) {
        resizeObs.disconnect();
        sections.forEach((el) => resizeObs.observe(el));
        observed = sections;
      }
    };
    measure();

    const mo = new MutationObserver(measure);
    mo.observe(document.body, { childList: true, subtree: true });

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
      // Numeric label updates less often than per-frame to avoid layout thrash
      const pct = Math.round(p * 100);
      if (pct !== lastTextProgress && numRef.current) {
        numRef.current.textContent = String(pct).padStart(2, "0");
        lastTextProgress = pct;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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
