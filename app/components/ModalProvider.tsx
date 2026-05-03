"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { VideoModal } from "./VideoModal";

type ModalVideo = {
  id: string;
  hash: string;
  title: string;
  brand: string;
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
