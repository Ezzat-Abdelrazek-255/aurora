"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";
import type { Role } from "../lib/videos";
import { useOpenPlay } from "./ModalProvider";

type Props = {
  slug: string;
  name: string;
  role: Role;
  /** First-frame image (also gallery[0]) used for the card thumbnail. */
  coverUrl: string;
  /** Full ordered gallery shown in the lightbox. Includes the cover. */
  gallery: string[];
  /** Aspect ratio of the cover image (width / height). */
  aspect: number;
  variant?: "grid" | "list";
};

/**
 * Image-only sibling of VideoCard. Same parallax + hover-scale chrome, no
 * <video> element. Click opens the PlayLightbox with the full gallery.
 */
export function PlayCard({
  slug,
  name,
  role,
  coverUrl,
  gallery,
  aspect,
  variant = "grid",
}: Props) {
  const openPlay = useOpenPlay();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  // Mirror VideoCard's parallax — see VideoCard for the rationale (Lenis
  // infinite mode breaks ScrollTrigger; yPercent is set directly per rAF as a
  // pure function of viewport position so the modulo wrap swaps twin cards
  // seamlessly — any tween lag or gated stale value would show as a slide
  // inside the frame at the seam).
  useEffect(() => {
    const container = containerRef.current;
    const inner = parallaxRef.current;
    if (!container || !inner) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const MAX_TRAVEL = 18;
    let rafId: number;
    let lastTarget: number | null = null;

    const tick = () => {
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = (vh + rect.height) / 2;
      const distance = rect.top + rect.height / 2 - vh / 2;
      const progress = Math.max(-1, Math.min(1, distance / range));
      const target = -progress * MAX_TRAVEL;
      if (lastTarget === null || Math.abs(target - lastTarget) > 0.01) {
        gsap.set(inner, { yPercent: target });
        lastTarget = target;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      gsap.set(inner, { yPercent: 0 });
    };
  }, []);

  const onClick = () => {
    openPlay({ slug, name, role, gallery, startIndex: 0 });
  };

  const handlers = {
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };

  const preview = (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-neutral-200"
      style={{ aspectRatio: aspect }}
    >
      <div
        ref={parallaxRef}
        className="absolute inset-x-0"
        style={{ top: "-30%", height: "160%", willChange: "transform" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt=""
          aria-hidden="true"
          loading="eager"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    </div>
  );

  const captionFont = { fontFamily: "var(--font-roslindale-text)" };
  const labelClass =
    "text-[11px] tracking-wide text-[#0a1f15] transition-colors group-hover:text-emerald-600";

  // Mirror VideoCard: split "Theatre+Stills, Title" into a small prefix and a
  // larger main title. Plays usually have just the title, in which case the
  // whole string becomes the main heading.
  const commaIdx = name.indexOf(",");
  const titlePrefix = commaIdx >= 0 ? name.slice(0, commaIdx).trim() : null;
  const titleMain = commaIdx >= 0 ? name.slice(commaIdx + 1).trim() : name;

  const titleSizes =
    variant === "list"
      ? { prefix: "text-[14px] md:text-[15px]", main: "text-[26px] md:text-[32px]" }
      : { prefix: "text-[13px] md:text-[14px]", main: "text-[26px] md:text-[30px]" };

  const titleNode = (
    <h3 className="font-serif tracking-tight text-[#040d08] transition-colors group-hover:text-emerald-600">
      {titlePrefix && (
        <span className={`block leading-[1.15] ${titleSizes.prefix}`}>
          {titlePrefix}
        </span>
      )}
      <span className={`mt-1 block leading-[1.05] ${titleSizes.main}`}>
        {titleMain}
      </span>
    </h3>
  );

  if (variant === "list") {
    return (
      <div
        {...handlers}
        role="button"
        tabIndex={0}
        className="group flex cursor-pointer select-none flex-col items-stretch gap-3 transition-transform duration-300 ease-out hover:scale-[1.05] md:flex-row md:items-start md:gap-6"
      >
        <div className="w-full shrink-0 md:w-[340px]">{preview}</div>
        <div className="min-w-0 pt-1">
          {titleNode}
          <p className={`mt-1 ${labelClass}`} style={captionFont}>
            {role}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      {...handlers}
      role="button"
      tabIndex={0}
      className="group cursor-pointer select-none transition-transform duration-300 ease-out hover:scale-[1.05]"
    >
      {preview}
      <div className="mt-3">
        {titleNode}
        <p className={`mt-1 ${labelClass}`} style={captionFont}>
          {role}
        </p>
      </div>
    </div>
  );
}
