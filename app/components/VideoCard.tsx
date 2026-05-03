"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  hash: string;
  brand: string;
  title: string;
  thumb: string | null;
  aspect: number;
};

const VIMEO_ORIGIN = "https://player.vimeo.com";

export function VideoCard({ id, hash, brand, title, thumb, aspect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const hasFramesRef = useRef(false);
  const hoverRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasFrames, setHasFrames] = useState(false);

  // Mount the iframe well before the card scrolls into view so the first frame
  // is captured ahead of any hover and the static poster only flashes briefly.
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

  const send = useCallback((method: string, value?: unknown) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ method, value }), VIMEO_ORIGIN);
  }, []);

  // Receive Vimeo player events. The first "timeupdate" tells us a real frame
  // is on screen — that's our cue to capture it as the poster (then pause).
  useEffect(() => {
    if (!mounted) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      let data: unknown = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const evt =
        data && typeof data === "object"
          ? (data as { event?: string }).event
          : undefined;

      if (evt === "ready") {
        send("addEventListener", "play");
        send("addEventListener", "timeupdate");
        return;
      }

      if ((evt === "play" || evt === "timeupdate") && !hasFramesRef.current) {
        hasFramesRef.current = true;
        setHasFrames(true);
        // Hold playback long enough to pass intro fades-from-black, then
        // freeze on a meaningful frame unless the user is hovering.
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
          if (!hoverRef.current) send("pause");
        }, 1500);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, [mounted, send]);

  const onEnter = () => {
    hoverRef.current = true;
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (mounted) send("play");
  };

  const onLeave = () => {
    hoverRef.current = false;
    if (mounted && hasFramesRef.current) send("pause");
  };

  const src = `${VIMEO_ORIGIN}/video/${id}?h=${hash}&background=1&autoplay=1&loop=1&muted=1&autopause=0&dnt=1&playsinline=1&controls=0`;

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
          <iframe
            ref={iframeRef}
            src={src}
            title={`${brand} — ${title}`}
            allow="autoplay; fullscreen; picture-in-picture"
            loading="lazy"
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ease-out ${
              hasFrames ? "opacity-100" : "opacity-0"
            }`}
            style={{
              transform: "scale(1.01)",
              transformOrigin: "center",
              pointerEvents: "none",
              backgroundColor: "transparent",
            }}
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
