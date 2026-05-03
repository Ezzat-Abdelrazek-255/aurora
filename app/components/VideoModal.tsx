"use client";

import { useEffect } from "react";

type ModalVideo = {
  id: string;
  hash: string;
  title: string;
  brand: string;
};

type Props = {
  video: ModalVideo | null;
  onClose: () => void;
};

export function VideoModal({ video, onClose }: Props) {
  useEffect(() => {
    if (!video) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [video, onClose]);

  if (!video) return null;

  const src = `https://player.vimeo.com/video/${video.id}?h=${video.hash}&autoplay=1&dnt=1&playsinline=1`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm md:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${video.brand} — ${video.title}`}
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
        className="relative w-full max-w-[1400px]"
        style={{ aspectRatio: 16 / 9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={src}
          title={`${video.brand} — ${video.title}`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
        <div
          className="pointer-events-none absolute -bottom-10 left-0 right-0 text-white/90"
          style={{ fontFamily: "var(--font-roslindale-text)" }}
        >
          <p className="text-[11px] tracking-wide opacity-80">{video.brand}</p>
          <h2 className="font-serif text-[18px] leading-tight md:text-[20px]">
            {video.title}
          </h2>
        </div>
      </div>
    </div>
  );
}
