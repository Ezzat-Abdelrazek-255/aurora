"use client";

import { type ReactNode } from "react";
import { useView } from "./ViewProvider";

/**
 * Renders the active layout (grid or list) based on `useView()`. Pure
 * presentational — the toggle UI lives in `ViewToggle`.
 */
export function ActiveView({
  grid,
  list,
}: {
  grid: ReactNode;
  list: ReactNode;
}) {
  const { view } = useView();
  return view === "grid" ? <>{grid}</> : <>{list}</>;
}
