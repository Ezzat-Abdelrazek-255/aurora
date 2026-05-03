"use client";

import { useEffect, useState } from "react";

type ModalVideo = {
  id: string;
  hash: string;
  name: string;
  role: "Producer" | "Talent";
  thumb?: string | null;
};

type Props = {
  video: ModalVideo | null;
  onClose: () => void;
};

export function VideoModal({ video, onClose }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    if (!video) {
      setIframeLoaded(false);
      return;
    }
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

  // Reset the loaded flag every time a new video opens.
  useEffect(() => {
    setIframeLoaded(false);
  }, [video?.id]);

  if (!video) return null;

  const src = `https://player.vimeo.com/video/${video.id}?h=${video.hash}&autoplay=1&dnt=1&playsinline=1`;
  const label = video.name;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm md:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
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
        className="relative flex w-full max-w-[1400px] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative w-full overflow-hidden bg-neutral-900"
          style={{ aspectRatio: 16 / 9 }}
        >
          {video.thumb && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={video.thumb}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ease-out ${
                iframeLoaded ? "opacity-0" : "opacity-100"
              }`}
            />
          )}
          {!iframeLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
            </div>
          )}
          <iframe
            key={video.id}
            src={src}
            title={label}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onLoad={() => setIframeLoaded(true)}
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ease-out ${
              iframeLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>

        <div
          className="pointer-events-none mt-6 text-white/90 md:mt-8"
          style={{ fontFamily: "var(--font-roslindale-text)" }}
        >
          <h2 className="font-serif text-[18px] leading-tight md:text-[22px]">
            {video.name}
          </h2>
          <p className="mt-1 text-[11px] tracking-wide opacity-80">
            {video.role}
          </p>
        </div>
      </div>
    </div>
  );
}
