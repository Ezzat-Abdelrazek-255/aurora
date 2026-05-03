"use client";

import { type ReactNode } from "react";
import { useView } from "./ViewProvider";

export function ViewSwitcher({
  grid,
  list,
}: {
  grid: ReactNode;
  list: ReactNode;
}) {
  const { view } = useView();
  return view === "grid" ? <>{grid}</> : <>{list}</>;
}

export function OnlyGridView({ children }: { children: ReactNode }) {
  const { view } = useView();
  if (view !== "grid") return null;
  return <>{children}</>;
}
