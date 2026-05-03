"use client";

import { useEffect, useRef, useState } from "react";
import { useOpenVideo } from "./ModalProvider";

type Props = {
  id: string;
  hash: string;
  brand: string;
  title: string;
  thumb: string | null;
  aspect: number;
};

const REVERSE_RATE = 1; // 1× = real-time reverse

export function VideoCard({
  id,
  hash,
  brand,
  title,
  thumb,
  aspect,
}: Props) {
  const openVideo = useOpenVideo();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverRef = useRef(false);
  const reverseRafRef = useRef<number | null>(null);
  const reverseStartMsRef = useRef(0);
  const reverseStartTimeRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);

  // Lazy-mount the <video> element so we don't ship 14 preloads at once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            obs.disconnect();
            break;
          }
        }
      },
      { rootMargin: "1200px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cancelReverse = () => {
    if (reverseRafRef.current !== null) {
      cancelAnimationFrame(reverseRafRef.current);
      reverseRafRef.current = null;
    }
  };

  // Drive currentTime backwards each frame. Local mp4 seeks are instant so
  // this is smooth at 60Hz.
  const startReverse = (fromTime: number) => {
    cancelReverse();
    reverseStartMsRef.current = performance.now();
    reverseStartTimeRef.current = fromTime;

    const step = (now: number) => {
      if (!hoverRef.current) {
        reverseRafRef.current = null;
        return;
      }
      const v = videoRef.current;
      if (!v) {
        reverseRafRef.current = null;
        return;
      }
      const elapsed = (now - reverseStartMsRef.current) / 1000;
      const t = reverseStartTimeRef.current - elapsed * REVERSE_RATE;

      if (t <= 0) {
        reverseRafRef.current = null;
        v.currentTime = 0;
        // Restart forward — the next `ended` event will bring us back here.
        v.play().catch(() => {});
        return;
      }
      v.currentTime = t;
      reverseRafRef.current = requestAnimationFrame(step);
    };
    reverseRafRef.current = requestAnimationFrame(step);
  };

  // Forward boundary: the clip ran out. Switch to reverse from wherever the
  // video stopped (≈ duration). We rely on the native `ended` event because
  // polling `currentTime` against a 2.0s clip is racy.
  const onEnded = () => {
    if (!hoverRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    const from = v.currentTime || v.duration || 3;
    startReverse(from);
  };

  const onEnter = () => {
    hoverRef.current = true;
    if (!mounted) return;
    const v = videoRef.current;
    if (!v) return;
    cancelReverse();
    v.currentTime = 0;
    v.play().catch(() => {});
    setActive(true);
  };

  const onLeave = () => {
    hoverRef.current = false;
    cancelReverse();
    const v = videoRef.current;
    if (v) v.pause();
    setActive(false);
  };

  const onClick = () => {
    openVideo({ id, hash, title, brand, thumb });
  };

  return (
    <div className="group cursor-pointer select-none">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden bg-neutral-200"
        style={{ aspectRatio: aspect }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        role="button"
        tabIndex={0}
      >
        {thumb && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumb}
            alt=""
            aria-hidden="true"
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
        {mounted && (
          <video
            ref={videoRef}
            src={`/clips/${id}.mp4`}
            muted
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onEnded={onEnded}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ease-out ${
              active ? "opacity-100" : "opacity-0"
            }`}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
        )}
      </div>
      <p
        className="mt-3 text-[11px] tracking-wide text-neutral-700"
        style={{ fontFamily: "var(--font-roslindale-text)" }}
      >
        {brand}
      </p>
      <h3 className="font-serif mt-1 text-[26px] leading-[1.05] tracking-tight text-neutral-900 md:text-[28px]">
        {title}
      </h3>
    </div>
  );
}
