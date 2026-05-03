"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { randomSeed } from "../lib/seed";

type Props = {
  seed: string;
  x: number;
  y: number;
  move: string;
};

const setVars = (xPx: number, yPct: number) => {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--layout-x", `${xPx}px`);
  document.documentElement.style.setProperty("--layout-y", `${yPct / 100}`);
};

export function SeedControls({ seed, x, y, move }: Props) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(seed);
  const [localX, setLocalX] = useState(x);
  const [localY, setLocalY] = useState(y);

  // Mirror props -> local state when URL navigation lands.
  useEffect(() => setDraft(seed), [seed]);
  useEffect(() => {
    setLocalX(x);
    setVars(x, localY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x]);
  useEffect(() => {
    setLocalY(y);
    setVars(localX, y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y]);

  const push = (params: {
    seed?: string;
    x?: number;
    y?: number;
    move?: string;
  }) => {
    const sp = new URLSearchParams(currentParams.toString());
    sp.set("seed", params.seed ?? seed);
    sp.set("x", String(params.x ?? localX));
    sp.set("y", String(params.y ?? localY));
    const nextMove = params.move ?? move;
    if (nextMove) sp.set("move", nextMove);
    startTransition(() => {
      router.push(`/?${sp.toString()}`, { scroll: false });
    });
  };

  // Randomizing should not carry over a tweak that was hand-tuned for a
  // different seed — clear `move` whenever the seed changes.
  const onRandomize = () => push({ seed: randomSeed(), move: "" });

  const onCopy = async () => {
    try {
      const params = new URLSearchParams();
      params.set("seed", seed);
      params.set("x", String(localX));
      params.set("y", String(localY));
      if (move) params.set("move", move);
      const url = `${window.location.origin}/?${params.toString()}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignored
    }
  };

  return (
    <div
      className="fixed right-4 top-16 z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white/85 px-2 py-1.5 text-[12px] shadow-sm backdrop-blur"
      style={{ fontFamily: "var(--font-roslindale-text)" }}
    >
      <button
        type="button"
        onClick={onRandomize}
        disabled={pending}
        className="rounded-full bg-neutral-900 px-3 py-1.5 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
      >
        {pending ? "…" : "Randomize"}
      </button>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) push({ seed: draft.trim() });
        }}
        spellCheck={false}
        aria-label="Layout seed"
        className="w-24 rounded-full bg-neutral-100 px-3 py-1 font-mono text-[12px] text-neutral-900 outline-none focus:bg-white focus:ring-1 focus:ring-neutral-300"
      />

      <button
        type="button"
        onClick={onCopy}
        className="rounded-full px-2 py-1 text-neutral-700 transition hover:bg-neutral-100"
        aria-label="Copy URL"
        title="Copy URL"
      >
        {copied ? "Copied" : "Copy URL"}
      </button>

      <div className="mx-1 h-5 w-px bg-neutral-200" />

      <Slider
        label="X"
        min={0}
        max={400}
        value={localX}
        format={(v) => `${v}px`}
        onInput={(v) => {
          setLocalX(v);
          setVars(v, localY);
        }}
        onCommit={(v) => push({ x: v })}
      />

      <Slider
        label="Y"
        min={20}
        max={800}
        value={localY}
        format={(v) => `${(v / 100).toFixed(2)}×`}
        onInput={(v) => {
          setLocalY(v);
          setVars(localX, v);
        }}
        onCommit={(v) => push({ y: v })}
      />
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  format,
  onInput,
  onCommit,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-neutral-700">
      <span className="font-medium">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onInput(Number(e.target.value))}
        onMouseUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onTouchEnd={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        className="h-1 w-28 cursor-pointer accent-neutral-900"
      />
      <span className="w-14 text-right font-mono tabular-nums text-neutral-500">
        {format(value)}
      </span>
    </label>
  );
}
