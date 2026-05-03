"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type Category } from "../lib/videos";
import { useFilter } from "./FilterProvider";
import { useView, type ViewMode } from "./ViewProvider";

export function FilterBar() {
  const { filter, setFilter } = useFilter();
  const { view, setView } = useView();
  const [filtersOpen, setFiltersOpen] = useState(filter.category !== "all");
  const [searchOpen, setSearchOpen] = useState(filter.query.length > 0);
  const [draft, setDraft] = useState(filter.query);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-switch to list view while a search is active. Snapshot the view at
  // the moment typing starts; restore it only if it was grid (otherwise the
  // user was already on list and we leave them there).
  const previousViewRef = useRef<ViewMode | null>(null);
  const previousQueryRef = useRef(filter.query);
  useEffect(() => {
    const wasEmpty = previousQueryRef.current === "";
    const isEmpty = filter.query === "";
    previousQueryRef.current = filter.query;
    if (wasEmpty === isEmpty) return;

    if (!isEmpty) {
      previousViewRef.current = view;
      if (view === "grid") setView("list");
    } else {
      if (previousViewRef.current === "grid") setView("grid");
      previousViewRef.current = null;
    }
  }, [filter.query, view, setView]);

  // Mirror external filter -> local draft (e.g. when navigation lands).
  useEffect(() => setDraft(filter.query), [filter.query]);

  const onSelectCategory = (next: Category | "all") =>
    setFilter({ category: next });

  const onFiltersToggle = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      if (filter.category !== "all") setFilter({ category: "all" });
    } else {
      setFiltersOpen(true);
    }
  };

  const onSearchToggle = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setDraft("");
      setFilter({ query: "" });
    } else {
      setSearchOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    // Filtering happens locally now, so we can update the state on every
    // keystroke without the old debounce.
    setFilter({ query: value });
  };

  const itemClass = (active: boolean) =>
    `transition-colors hover:italic ${
      active ? "text-red-600" : "hover:text-emerald-600"
    }`;

  return (
    <div
      data-testid="filter-bar"
      className="pointer-events-auto fixed right-[112px] top-4 z-40 hidden min-h-[40px] items-center gap-5 text-[14px] md:flex md:gap-6 md:text-[15px]"
      style={{ fontFamily: "var(--font-roslindale-text)" }}
      role="toolbar"
      aria-label="Filter and search"
    >
      {filtersOpen && (
        <>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={filter.category === c.value}
              onClick={() => onSelectCategory(c.value)}
              className={itemClass(filter.category === c.value)}
              data-testid={`filter-${c.value}`}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filter.category === "all"}
            onClick={() => onSelectCategory("all")}
            className={itemClass(filter.category === "all")}
            data-testid="filter-all"
          >
            All
          </button>
        </>
      )}

      <button
        type="button"
        onClick={onFiltersToggle}
        aria-pressed={filtersOpen}
        aria-expanded={filtersOpen}
        className="font-semibold transition-colors hover:italic hover:text-emerald-600"
        data-testid="filters-button"
      >
        Filters
      </button>

      {searchOpen && (
        <input
          ref={inputRef}
          type="search"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onSearchToggle();
          }}
          placeholder="Search name, role, or category"
          aria-label="Search"
          data-testid="search-input"
          className="w-44 rounded bg-emerald-900/5 px-3 py-1 text-[13px] outline-none placeholder:text-emerald-900/40 focus:bg-white focus:ring-1 focus:ring-emerald-900/20 md:w-56"
        />
      )}

      <button
        type="button"
        onClick={onSearchToggle}
        aria-pressed={searchOpen}
        aria-expanded={searchOpen}
        aria-label={searchOpen ? "Close search" : "Open search"}
        className="font-semibold transition-colors hover:italic hover:text-emerald-600"
        data-testid="search-toggle"
      >
        Search
      </button>
    </div>
  );
}
