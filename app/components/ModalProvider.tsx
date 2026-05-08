"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Role } from "../lib/videos";
import { PlayLightbox } from "./PlayLightbox";
import { VideoModal } from "./VideoModal";

export type ModalVideo = {
  id: string;
  hash: string;
  name: string;
  role: Role;
  /** Aspect ratio (width / height) — drives the modal's video frame size. */
  aspect: number;
  thumb?: string | null;
};

export type ModalPlay = {
  slug: string;
  name: string;
  role: Role;
  /** Ordered gallery URLs — first entry is the cover. */
  gallery: string[];
  /** Index of the image to show first when the lightbox opens. */
  startIndex: number;
};

const VideoCtx = createContext<((v: ModalVideo) => void) | null>(null);
const PlayCtx = createContext<((p: ModalPlay) => void) | null>(null);

export function useOpenVideo() {
  const fn = useContext(VideoCtx);
  return fn ?? (() => undefined);
}

export function useOpenPlay() {
  const fn = useContext(PlayCtx);
  return fn ?? (() => undefined);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [video, setVideo] = useState<ModalVideo | null>(null);
  const [play, setPlay] = useState<ModalPlay | null>(null);
  const openVideo = useCallback((v: ModalVideo) => setVideo(v), []);
  const closeVideo = useCallback(() => setVideo(null), []);
  const openPlay = useCallback((p: ModalPlay) => setPlay(p), []);
  const closePlay = useCallback(() => setPlay(null), []);
  return (
    <VideoCtx.Provider value={openVideo}>
      <PlayCtx.Provider value={openPlay}>
        {children}
        <VideoModal video={video} onClose={closeVideo} />
        <PlayLightbox play={play} onClose={closePlay} />
      </PlayCtx.Provider>
    </VideoCtx.Provider>
  );
}
