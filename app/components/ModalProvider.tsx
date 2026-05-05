"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Role } from "../lib/videos";
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

const Ctx = createContext<((v: ModalVideo) => void) | null>(null);

export function useOpenVideo() {
  const fn = useContext(Ctx);
  return fn ?? (() => undefined);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [video, setVideo] = useState<ModalVideo | null>(null);
  const open = useCallback((v: ModalVideo) => setVideo(v), []);
  const close = useCallback(() => setVideo(null), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      <VideoModal video={video} onClose={close} />
    </Ctx.Provider>
  );
}
