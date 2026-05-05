"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { getLoopPeriod } from "../lib/scroll";

type Props = { infinite?: boolean };

export function SmoothScroll({ infinite = false }: Props) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      infinite,
    });

    if (infinite) {
      // Make Lenis's `infinite` modulo wrap at one grid copy's height instead
      // of the full document. Combined with two identical [data-loop-section]
      // copies in the DOM, content at scroll=0 and scroll=limit is pixel-for-
      // pixel identical — so the modulo reset is visually invisible.
      //
      // The getter runs every frame, so layout changes (list↔grid toggle,
      // viewport resize) are picked up automatically.
      Object.defineProperty(lenis.dimensions, "limit", {
        configurable: true,
        get(this: { scrollWidth: number; scrollHeight: number; width: number; height: number }) {
          const period = getLoopPeriod();
          return {
            x: this.scrollWidth - this.width,
            y: period > 0 ? period : this.scrollHeight - this.height,
          };
        },
      });
    }

    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [infinite]);

  return null;
}
