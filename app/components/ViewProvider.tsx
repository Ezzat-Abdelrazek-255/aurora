"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ViewMode = "grid" | "list";

const Ctx = createContext<{
  view: ViewMode;
  setView: (v: ViewMode) => void;
} | null>(null);

export function useView() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useView must be used inside <ViewProvider>");
  return ctx;
}

export function ViewProvider({
  initialView,
  children,
}: {
  initialView: ViewMode;
  children: ReactNode;
}) {
  const [view, setViewState] = useState<ViewMode>(initialView);

  const setView = useCallback((next: ViewMode) => {
    setViewState(next);
    // Update the URL without triggering a Next.js navigation/SSR.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "grid") url.searchParams.delete("view");
      else url.searchParams.set("view", next);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);

  // If the URL changes externally (e.g. user pastes a link or browser back),
  // re-read the view from search params.
  useEffect(() => {
    const sync = () => {
      const v = new URLSearchParams(window.location.search).get("view");
      setViewState(v === "list" ? "list" : "grid");
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return <Ctx.Provider value={{ view, setView }}>{children}</Ctx.Provider>;
}
