"use client";

import { useEffect, useRef, useState } from "react";
import { useOpenVideo } from "./ModalProvider";

type Props = {
  id: string;
  hash: string;
  name: string;
  role: "Producer" | "Talent";
  thumb: string | null;
  aspect: number;
  variant?: "grid" | "list";
};

const REVERSE_RATE = 1; // 1× = real-time reverse

export function VideoCard({
  id,
  hash,
  name,
  role,
  thumb,
  aspect,
  variant = "grid",
}: Props) {
  const openVideo = useOpenVideo();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverRef = useRef(false);
  const reverseRafRef = useRef<number | null>(null);
  const reverseStartMsRef = useRef(0);
  const reverseStartTimeRef = useRef(0);
  const [mounted, setMounted] = useState(false);

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
  };

  const onLeave = () => {
    hoverRef.current = false;
    cancelReverse();
    const v = videoRef.current;
    if (v) {
      v.pause();
      // Snap back to frame 0 so the resting state is always the first frame.
      v.currentTime = 0;
    }
  };

  const onClick = () => {
    // Pass the local first-frame poster so the modal placeholder matches the
    // card while the Vimeo iframe is loading.
    openVideo({ id, hash, name, role, thumb: `/clips/${id}.jpg` });
  };

  // Local first-frame JPG (extracted from the clip itself, not Vimeo's
  // thumbnail). Rendered eagerly underneath as the resting visual, and also
  // used as the <video> poster — both layers show the same frame so there's
  // no visual swap as the video element mounts on top.
  const posterUrl = `/clips/${id}.jpg`;

  const preview = (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-neutral-200"
      style={{ aspectRatio: aspect }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={posterUrl}
        alt=""
        aria-hidden="true"
        loading="eager"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
      />
      {mounted && (
        <video
          ref={videoRef}
          src={`/clips/${id}.mp4`}
          poster={posterUrl}
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onEnded={onEnded}
          className="absolute inset-0 h-full w-full object-cover"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      )}
    </div>
  );

  const handlers = {
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    onFocus: onEnter,
    onBlur: onLeave,
    onClick,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
  };

  const captionFont = { fontFamily: "var(--font-roslindale-text)" };
  const labelClass = "text-[11px] tracking-wide text-[#0a1f15]";

  if (variant === "list") {
    return (
      <div
        {...handlers}
        role="button"
        tabIndex={0}
        className="group flex cursor-pointer select-none items-start gap-6"
      >
        <div className="w-[280px] shrink-0 md:w-[340px]">{preview}</div>
        <div className="min-w-0 pt-1">
          <h3 className="font-serif text-[24px] leading-[1.1] tracking-tight text-[#040d08] md:text-[28px]">
            {name}
          </h3>
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
      className="group cursor-pointer select-none"
    >
      {preview}
      <h3 className="font-serif mt-3 text-[26px] leading-[1.05] tracking-tight text-[#040d08] md:text-[28px]">
        {name}
      </h3>
      <p className={`mt-1 ${labelClass}`} style={captionFont}>
        {role}
      </p>
    </div>
  );
}
