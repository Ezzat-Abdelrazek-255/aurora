"use client";

import gsap from "gsap";
import { useEffect, useRef, useState } from "react";
import { useOpenVideo } from "./ModalProvider";

type Props = {
  id: string;
  hash: string;
  name: string;
  role: "Producer" | "Talent";
  /** Absolute URL for the 3s preview MP4 (Supabase Storage). */
  clipUrl: string;
  /** Absolute URL for the first-frame JPG poster (Supabase Storage). */
  posterUrl: string;
  aspect: number;
  variant?: "grid" | "list";
};

const REVERSE_RATE = 1; // 1× = real-time reverse

export function VideoCard({
  id,
  hash,
  name,
  role,
  clipUrl,
  posterUrl,
  aspect,
  variant = "grid",
}: Props) {
  const openVideo = useOpenVideo();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const parallaxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reverseRafRef = useRef<number | null>(null);
  const reverseStartMsRef = useRef(0);
  const reverseStartTimeRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Mirror `hovered` into a ref so the rAF reverse-loop sees the current
  // value without re-binding (state reads in rAF closures go stale).
  const hoveredRef = useRef(false);
  hoveredRef.current = hovered;

  // Image parallax: translate the inner wrapper (which is 140% of container
  // height with a -20% top bleed) as the card moves through the viewport. We
  // read getBoundingClientRect() per rAF instead of using ScrollTrigger
  // because the home page runs Lenis in `infinite` mode and its modulo wrap
  // breaks ScrollTrigger's cached absolute positions. gsap.quickTo smooths
  // the per-frame target into a tween so it doesn't jitter.
  useEffect(() => {
    const container = containerRef.current;
    const inner = parallaxRef.current;
    if (!container || !inner) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const MAX_TRAVEL = 14; // yPercent on inner; inner is 140% tall so 14% ≈ 19.6% of container
    const setY = gsap.quickTo(inner, "yPercent", {
      duration: 0.5,
      ease: "power2.out",
    });

    let active = false;
    let rafId: number | null = null;
    let primed = false;
    let lastTarget = 0;

    const tick = () => {
      rafId = null;
      if (!active) return;
      const rect = container.getBoundingClientRect();
      const vh = window.innerHeight;
      const range = (vh + rect.height) / 2;
      const distance = rect.top + rect.height / 2 - vh / 2;
      const progress = Math.max(-1, Math.min(1, distance / range));
      // progress > 0 → card is below center → image shifts up (showing top)
      const target = -progress * MAX_TRAVEL;
      if (!primed) {
        // Snap to the target on the first frame so the page doesn't render an
        // initial 0 → target tween (perceived as a brief "scale-in" on every
        // card at load).
        primed = true;
        gsap.set(inner, { yPercent: target });
        lastTarget = target;
      } else if (Math.abs(target - lastTarget) > 0.01) {
        // Skip the quickTo call when the scroll-derived target hasn't moved.
        // Avoids waking GSAP's tween machinery 60×/sec per card while idle.
        setY(target);
        lastTarget = target;
      }
      rafId = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!active) {
              active = true;
              if (rafId === null) rafId = requestAnimationFrame(tick);
            }
          } else {
            active = false;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(container);

    return () => {
      io.disconnect();
      active = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      gsap.set(inner, { yPercent: 0 });
    };
  }, []);

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
      if (!hoveredRef.current) {
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
    if (!hoveredRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    const from = v.currentTime || v.duration || 3;
    startReverse(from);
  };

  const onEnter = () => {
    setHovered(true);
    if (!mounted) return;
    const v = videoRef.current;
    if (!v) return;
    cancelReverse();
    v.currentTime = 0;
    v.play().catch(() => {});
  };

  const onLeave = () => {
    setHovered(false);
    cancelReverse();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  const onClick = () => {
    openVideo({ id, hash, name, role, aspect, thumb: posterUrl });
  };

  const preview = (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-neutral-200"
      style={{ aspectRatio: aspect }}
    >
      {/* Parallax wrapper: 140% tall with -20% top bleed so its yPercent can
          travel ±~14 without exposing the container edges. */}
      <div
        ref={parallaxRef}
        className="absolute inset-x-0"
        style={{ top: "-20%", height: "140%", willChange: "transform" }}
      >
        {/* First-frame JPG (Supabase Storage). Rendered eagerly underneath as
            the resting visual; the <video> below uses the same URL as its
            poster so there's no visual swap when it mounts on top. */}
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
            src={clipUrl}
            poster={posterUrl}
            muted
            playsInline
            preload="metadata"
            disablePictureInPicture
            controlsList="nodownload nofullscreen noremoteplayback"
            onEnded={onEnded}
            // Hidden by default so the poster <img> behind shows through at
            // rest. This matters when the poster came from Vimeo's thumbnail
            // (frame 0 of the clip is black for those — pausing on it would
            // cover the real poster). Faded in on hover; faded out on leave.
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ease-out ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
            onContextMenu={(e) => e.preventDefault()}
            draggable={false}
          />
        )}
      </div>
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
  const labelClass =
    "text-[11px] tracking-wide text-[#0a1f15] transition-colors group-hover:text-emerald-600";

  // Split "Brand, Work Title" into a small prefix (the brand/series) and a
  // larger title (the specific work). Both stay inside the same <h3> so the
  // heading's accessible name remains the full, comma-joined string.
  const commaIdx = name.indexOf(",");
  const titlePrefix = commaIdx >= 0 ? name.slice(0, commaIdx + 1).trim() : null;
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
      <span className={`block leading-[1.05] ${titleSizes.main}`}>
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
