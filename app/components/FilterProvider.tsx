"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CATEGORIES, type Category, type Role } from "../lib/videos";

export type FilterState = {
  category: Category | "all";
  query: string;
};

export type SearchableVideo = {
  name: string;
  role: Role;
  category: Category;
};

type Ctx = {
  filter: FilterState;
  setFilter: (next: Partial<FilterState>) => void;
  matches: (video: SearchableVideo) => boolean;
};

const FilterContext = createContext<Ctx | null>(null);

// Lookup table so the user can type "music" or "commercials" and hit those
// videos via the visible category label, not just the slug.
const CATEGORY_LABEL: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
) as Record<Category, string>;

function buildHaystack(v: SearchableVideo): string {
  // Replace `/` so a query like "film tv" matches "film/tv" and so on.
  const label = CATEGORY_LABEL[v.category].replace(/\//g, " ");
  return `${v.name} ${v.role} ${label}`.toLowerCase();
}

function tokenize(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function syncUrl(next: FilterState) {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (next.category === "all") sp.delete("category");
  else sp.set("category", next.category);
  if (!next.query) sp.delete("q");
  else sp.set("q", next.query);
  const qs = sp.toString();
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", url);
}

export function FilterProvider({
  initial,
  children,
}: {
  initial: FilterState;
  children: ReactNode;
}) {
  const [filter, setFilterState] = useState<FilterState>(initial);
  const isFirstRun = useRef(true);

  // history.replaceState is intercepted by Next's Router and triggers a
  // Router setState. If we call it from inside a useState updater it runs
  // during render — React 19 / Next 16 throws "Cannot update a component
  // while rendering a different component". Sync URL in an effect instead.
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return; // URL already matches `initial` on mount.
    }
    syncUrl(filter);
  }, [filter]);

  const setFilter = useCallback((next: Partial<FilterState>) => {
    setFilterState((prev) => ({ ...prev, ...next }));
  }, []);

  const value = useMemo<Ctx>(() => {
    const tokens = tokenize(filter.query);
    return {
      filter,
      setFilter,
      // Multi-token AND across name + role + category label. Each whitespace-
      // separated token must appear somewhere in the haystack (substring,
      // case-insensitive). Examples:
      //   "nike"         → all Nike videos
      //   "nike talent"  → Nike videos with Talent role
      //   "music"        → music-category videos (matches the label)
      //   "apple comm"   → Apple commercials (token2 hits "Commercials")
      matches: (v) => {
        if (filter.category !== "all" && v.category !== filter.category) {
          return false;
        }
        if (tokens.length === 0) return true;
        const haystack = buildHaystack(v);
        return tokens.every((t) => haystack.includes(t));
      },
    };
  }, [filter, setFilter]);

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilter(): Ctx {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilter must be used inside <FilterProvider>");
  return ctx;
}
