"use client";

import type { CSSProperties, ReactNode } from "react";
import type { SearchableVideo } from "./FilterProvider";
import { useFilter } from "./FilterProvider";

type Props = {
  video: SearchableVideo;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

// Wraps a server-rendered cell so we can hide non-matching videos client-side
// without any server roundtrip. `display: none` also drops the item from flex
// gap calculations, so the list view collapses cleanly with no orphan spacing.
export function FilteredCell({ video, className, style, children }: Props) {
  const { matches } = useFilter();
  const visible = matches(video);
  return (
    <div
      className={className}
      style={{ ...style, display: visible ? undefined : "none" }}
    >
      {children}
    </div>
  );
}
