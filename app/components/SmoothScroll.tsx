"use client";

import Lenis from "lenis";
import { useEffect } from "react";

export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      infinite: true,
    });

    // Make Lenis's `infinite` modulo wrap at one grid copy's height instead of
    // the full document. Combined with two identical [data-loop-section]
    // copies in the DOM, content at scroll=0 and scroll=limit is pixel-for-
    // pixel identical — so the modulo reset is visually invisible.
    Object.defineProperty(lenis.dimensions, "limit", {
      configurable: true,
      get(this: { scrollWidth: number; scrollHeight: number; width: number; height: number }) {
        const sections = document.querySelectorAll<HTMLElement>(
          "[data-loop-section]"
        );
        let y = this.scrollHeight - this.height;
        if (sections.length >= 2) {
          // Period = distance from start of one copy to start of the next.
          y = sections[1].offsetTop - sections[0].offsetTop;
        } else if (sections.length === 1) {
          y = sections[0].offsetHeight;
        }
        return {
          x: this.scrollWidth - this.width,
          y,
        };
      },
    });

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
  }, []);

  return null;
}
