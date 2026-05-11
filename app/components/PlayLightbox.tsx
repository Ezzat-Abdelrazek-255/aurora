"use client";

import { useCallback, useEffect, useState } from "react";
import type { ModalPlay } from "./ModalProvider";

type Props = {
  play: ModalPlay | null;
  onClose: () => void;
};

/**
 * Image gallery lightbox for plays. Mirrors VideoModal's layout: a centered
 * max-w-[1000px] column with the active image capped to roughly the same
 * viewport budget the video frame uses. Thumbnails sit below the caption so
 * the user can switch between gallery images, and arrow keys / on-screen
 * arrows do the same.
 */
export function PlayLightbox({ play, onClose }: Props) {
  const [index, setIndex] = useState(0);
  // Track which gallery URLs have already finished loading so we can fade in
  // each main image without flashing the previous frame's stretched form.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!play) return;
    setIndex(play.startIndex);
    setLoaded(new Set());
  }, [play]);

  const total = play?.gallery.length ?? 0;

  const goPrev = useCallback(() => {
    if (total <= 1) return;
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);

  const goNext = useCallback(() => {
    if (total <= 1) return;
    setIndex((i) => (i + 1) % total);
  }, [total]);

  useEffect(() => {
    if (!play) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [play, onClose, goPrev, goNext]);

  if (!play) return null;
  const current = play.gallery[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={play.name}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white md:right-6 md:top-6"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>

      <div
        className="relative flex w-full max-w-[1000px] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Active image. maxHeight matches VideoModal's video frame so the
            modal sits within the same viewport budget regardless of the
            current image's aspect ratio. object-contain keeps portrait /
            landscape stills inside the box without cropping. */}
        <div className="relative flex w-full items-center justify-center bg-neutral-900">
          <div
            className="relative flex w-full items-center justify-center"
            style={{ height: "80vh", maxHeight: "80vh" }}
          >
            {!loaded.has(index) && (
              <span
                className="absolute inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current}
              src={current}
              alt={`${play.name} — image ${index + 1}`}
              draggable={false}
              onLoad={() =>
                setLoaded((prev) => {
                  if (prev.has(index)) return prev;
                  const next = new Set(prev);
                  next.add(index);
                  return next;
                })
              }
              className={`block max-h-full max-w-full select-none object-contain transition-opacity duration-200 ease-out ${
                loaded.has(index) ? "opacity-100" : "opacity-0"
              }`}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          {total > 1 && (
            <>
              <ArrowButton
                direction="prev"
                onClick={(e) => {
                  e.stopPropagation();
                  goPrev();
                }}
              />
              <ArrowButton
                direction="next"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
              />
            </>
          )}
        </div>

        <div
          className="pointer-events-none mt-6 text-white/90 md:mt-8"
          style={{ fontFamily: "var(--font-roslindale-text)" }}
        >
          <h2 className="font-serif text-[18px] leading-tight md:text-[22px]">
            {play.name}
          </h2>
          <p className="mt-1 text-[11px] tracking-wide opacity-80">
            {play.role}
            {total > 1 && (
              <>
                {" · "}
                <span aria-live="polite">
                  {index + 1} / {total}
                </span>
              </>
            )}
          </p>
        </div>

        {total > 1 && (
          <nav
            aria-label="Gallery thumbnails"
            className="mt-4 -mx-1 overflow-x-auto py-1"
          >
            <ul className="flex gap-2 px-1 md:gap-3">
              {play.gallery.map((url, i) => {
                const isActive = i === index;
                return (
                  <li key={url} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Show image ${i + 1}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`relative block h-[54px] w-[80px] overflow-hidden rounded-sm transition md:h-[64px] md:w-[96px] ${
                        isActive
                          ? "ring-2 ring-white"
                          : "opacity-55 ring-1 ring-white/20 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

function ArrowButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: (e: React.MouseEvent) => void;
}) {
  const isPrev = direction === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isPrev ? "Previous image" : "Next image"}
      className={`absolute top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white/85 backdrop-blur-sm transition hover:bg-black/50 hover:text-white md:flex ${
        isPrev ? "left-2" : "right-2"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isPrev ? <path d="M15 6L9 12l6 6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
