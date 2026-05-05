/**
 * The "loop period" is the pixel distance between two consecutive
 * `[data-loop-section]` copies — i.e. how far you can scroll before the
 * page wraps back to a visually identical position.
 *
 * Used by both `SmoothScroll` (which feeds it to Lenis as the modulo-wrap
 * limit) and `ScrollIndicator` (which divides scrollY by it to drive the
 * thumb position). Keeping the calculation in one place ensures the two
 * stay in lockstep across layout changes.
 *
 * Returns 0 if there are no sections — callers should guard against that
 * (period 0 means "don't wrap, don't compute progress").
 */
export function getLoopPeriod(): number {
  if (typeof document === "undefined") return 0;
  const sections = document.querySelectorAll<HTMLElement>(
    "[data-loop-section]",
  );
  if (sections.length >= 2) {
    return sections[1].offsetTop - sections[0].offsetTop;
  }
  if (sections.length === 1) {
    return sections[0].offsetHeight;
  }
  return document.documentElement.scrollHeight - window.innerHeight;
}
