import Link from "next/link";
import { ScrollIndicator } from "./components/ScrollIndicator";
import { SeedControls } from "./components/SeedControls";
import { SmoothScroll } from "./components/SmoothScroll";
import { VideoCard } from "./components/VideoCard";
import { ViewProvider, type ViewMode } from "./components/ViewProvider";
import { OnlyGridView, ViewSwitcher } from "./components/ViewSwitcher";
import { ViewToggle } from "./components/ViewToggle";
import { applyMoves, generateLayout, parseMoves, type Cell } from "./lib/grid";
import { DEFAULT_SEED } from "./lib/seed";
import { getVimeoMeta, videos } from "./lib/videos";

const alignClass: Record<Cell["align"], string> = {
  start: "self-start",
  center: "self-center",
  end: "self-end",
};

const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

type SearchParams = Promise<{
  seed?: string | string[];
  x?: string | string[];
  y?: string | string[];
  move?: string | string[];
  view?: string | string[];
}>;

const DEFAULT_X = 80; // px
const DEFAULT_Y = 180; // percent
const X_MAX = 400;
const Y_MAX = 800;
const DEFAULT_MOVE = "1.4>0";
const COPIES = [0, 1] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const pickFirst = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const rawSeed = pickFirst(sp.seed);
  const seed = (rawSeed ?? DEFAULT_SEED).trim() || DEFAULT_SEED;
  const x = clamp(Number(pickFirst(sp.x) ?? DEFAULT_X), 0, X_MAX);
  const y = clamp(Number(pickFirst(sp.y) ?? DEFAULT_Y), 20, Y_MAX);
  const yScale = y / 100;
  const initialView: ViewMode =
    pickFirst(sp.view) === "list" ? "list" : "grid";

  const moveParam = pickFirst(sp.move);
  const moveStr =
    moveParam !== undefined
      ? moveParam
      : seed === DEFAULT_SEED
      ? DEFAULT_MOVE
      : "";
  const moves = parseMoves(moveStr);

  const baseLayout = generateLayout(seed, videos.length);
  const cols = applyMoves(baseLayout.cols, moves);

  const metas = await Promise.all(
    videos.map((v) => getVimeoMeta(v.id, v.hash))
  );
  const enriched = videos.map((v, i) => {
    const m = metas[i];
    const aspect =
      m?.width && m?.height
        ? m.width / m.height
        : m?.thumbnail_width && m?.thumbnail_height
        ? m.thumbnail_width / m.thumbnail_height
        : 16 / 9;
    return { ...v, thumb: m?.thumbnail_url ?? null, aspect };
  });

  // Walk the seeded grid columns row-by-row to derive a deterministic list
  // ordering from the same seed.
  const seededOrder: number[] = [];
  const maxLen = Math.max(...cols.map((c) => c.length));
  for (let row = 0; row < maxLen; row++) {
    for (const col of cols) {
      if (col[row]) seededOrder.push(col[row].index);
    }
  }

  const renderCell = (copy: number) => (cell: Cell) => {
    const v = enriched[cell.index];
    if (!v) return null;
    return (
      <div
        key={`${seed}-${copy}-${cell.index}`}
        className={alignClass[cell.align]}
        style={{
          width: `${cell.widthPct}%`,
          marginTop: `calc(var(--layout-y, 1) * ${cell.marginUnit * 0.25}rem)`,
        }}
      >
        <VideoCard
          id={v.id}
          hash={v.hash}
          brand={v.brand}
          title={v.title}
          thumb={v.thumb}
          aspect={v.aspect}
        />
      </div>
    );
  };

  const gridLayout = (
    <>
      {COPIES.map((copy) => (
        <section
          key={`grid-${copy}`}
          data-loop-section
          aria-hidden={copy === 1 ? true : undefined}
          className="grid grid-cols-1 px-4 pb-8 pt-8 md:grid-cols-3 md:px-6 lg:px-10"
          style={{ columnGap: "var(--layout-x, 16px)" }}
        >
          <div className="flex flex-col">{cols[0].map(renderCell(copy))}</div>
          <div className="flex flex-col">{cols[1].map(renderCell(copy))}</div>
          <div className="flex flex-col">{cols[2].map(renderCell(copy))}</div>
        </section>
      ))}
    </>
  );

  const listLayout = (
    <>
      {COPIES.map((copy) => (
        <section
          key={`list-${copy}`}
          data-loop-section
          aria-hidden={copy === 1 ? true : undefined}
          className="flex flex-col gap-y-8 py-8 pl-4 pr-4 md:gap-y-10 md:pl-[260px] md:pr-8 lg:pl-[300px]"
        >
          {seededOrder.map((idx) => {
            const v = enriched[idx];
            if (!v) return null;
            return (
              <VideoCard
                key={`${seed}-${copy}-list-${idx}`}
                id={v.id}
                hash={v.hash}
                brand={v.brand}
                title={v.title}
                thumb={v.thumb}
                aspect={v.aspect}
                variant="list"
              />
            );
          })}
        </section>
      ))}
    </>
  );

  return (
    <main className="relative bg-white text-neutral-900">
      <style
        dangerouslySetInnerHTML={{
          __html: `:root { --layout-x: ${x}px; --layout-y: ${yScale}; }`,
        }}
      />

      <ViewProvider initialView={initialView}>
        <SmoothScroll infinite />
        <ViewToggle />
        <OnlyGridView>
          <SeedControls seed={seed} x={x} y={y} move={moveStr} />
        </OnlyGridView>
        <ScrollIndicator />

        <nav
          className="pointer-events-auto fixed left-4 top-6 z-40 font-serif text-[24px] leading-[1.2] md:left-6 md:top-8 md:text-[26px] lg:left-10"
          aria-label="Primary"
        >
          <p className="font-bold tracking-tight">Aurora Leonard</p>
          <ul className="mt-2 space-y-1">
            <li>
              <Link href="/about" className="hover:italic">
                About
              </Link>
            </li>
          </ul>
        </nav>

        <ViewSwitcher grid={gridLayout} list={listLayout} />
      </ViewProvider>
    </main>
  );
}
