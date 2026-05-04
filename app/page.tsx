import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "./components/FilterBar";
import { FilteredCell } from "./components/FilteredCell";
import { FilterProvider } from "./components/FilterProvider";
import { JsonLd } from "./components/JsonLd";
import { ScrollIndicator } from "./components/ScrollIndicator";
import { SeedControls } from "./components/SeedControls";
import { SmoothScroll } from "./components/SmoothScroll";
import { VideoCard } from "./components/VideoCard";
import { ViewProvider, type ViewMode } from "./components/ViewProvider";
import { OnlyGridView, ViewSwitcher } from "./components/ViewSwitcher";
import { ViewToggle } from "./components/ViewToggle";
import { applyMoves, generateLayout, parseMoves, type Cell } from "./lib/grid";
import { DEFAULT_SEED } from "./lib/seed";
import { SITE } from "./lib/site";
import { listReadyVideos, type Category } from "./lib/videos";

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE.title,
    description: SITE.description,
    url: "/",
    type: "website",
  },
};

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
  category?: string | string[];
  q?: string | string[];
}>;

const VALID_CATEGORIES: Category[] = ["film-tv", "commercial", "music"];

function isCategory(v: string | undefined): v is Category {
  return !!v && (VALID_CATEGORIES as string[]).includes(v);
}

const DEFAULT_X = 80; // px
const DEFAULT_Y = 180; // percent
const X_MAX = 400;
const Y_MAX = 800;
const DEFAULT_MOVE = "";
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

  // Filter is server-seeded from the URL but applied client-side from here on
  // out — see FilterProvider. Server always renders the full set of cards so
  // typing in the search box is instant (no router.push, no remount).
  const rawCategory = pickFirst(sp.category);
  const initialCategory: Category | "all" = isCategory(rawCategory)
    ? rawCategory
    : "all";
  const initialQuery = (pickFirst(sp.q) ?? "").trim();

  const moveParam = pickFirst(sp.move);
  const moveStr =
    moveParam !== undefined
      ? moveParam
      : seed === DEFAULT_SEED
      ? DEFAULT_MOVE
      : "";
  const moves = parseMoves(moveStr);

  // Source of truth is now Supabase. listReadyVideos() returns each row with
  // resolved storage URLs (clipUrl / posterUrl) and the persisted aspect.
  const enriched = await listReadyVideos();
  const baseLayout = generateLayout(seed, enriched.length);
  const cols = applyMoves(baseLayout.cols, moves);

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
      <FilteredCell
        key={`${seed}-${copy}-${cell.index}`}
        video={{ name: v.name, role: v.role, category: v.category }}
        className={`${alignClass[cell.align]} max-md:w-full! max-md:mt-0!`}
        style={{
          width: `${cell.widthPct}%`,
          marginTop: `calc(var(--layout-y, 1) * ${cell.marginUnit * 0.25}rem)`,
        }}
      >
        <VideoCard
          id={v.id}
          hash={v.hash}
          name={v.name}
          role={v.role}
          clipUrl={v.clipUrl}
          posterUrl={v.posterUrl}
          aspect={v.aspect}
        />
      </FilteredCell>
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
          <div className="flex flex-col max-md:gap-y-8">{cols[0].map(renderCell(copy))}</div>
          <div className="flex flex-col max-md:gap-y-8 max-md:mt-8">{cols[1].map(renderCell(copy))}</div>
          <div className="flex flex-col max-md:gap-y-8 max-md:mt-8">{cols[2].map(renderCell(copy))}</div>
        </section>
      ))}
    </>
  );

  const listLayout = (
    <div className="list-shell-enter">
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
              <FilteredCell
                key={`${seed}-${copy}-list-${idx}`}
                video={{ name: v.name, role: v.role, category: v.category }}
              >
                <VideoCard
                  id={v.id}
                  hash={v.hash}
                  name={v.name}
                  role={v.role}
                  clipUrl={v.clipUrl}
                  posterUrl={v.posterUrl}
                  aspect={v.aspect}
                  variant="list"
                />
              </FilteredCell>
            );
          })}
        </section>
      ))}
    </div>
  );

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: SITE.name,
    url: SITE.url,
    jobTitle: "Filmmaker & Producer",
    description: SITE.description,
    worksFor: {
      "@type": "Organization",
      name: "Reforest Films",
      url: "https://www.reforestfilms.com/",
    },
    sameAs: [
      "https://www.instagram.com/auroraleonard/",
      "https://www.linkedin.com/in/aurora-leonard/",
      "https://www.facebook.com/AuroraLeonardReforestFilms/",
    ],
  };

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    inLanguage: "en",
    publisher: {
      "@type": "Person",
      name: SITE.name,
    },
  };

  return (
    <main className="relative bg-white text-[#040d08]">
      <JsonLd id="ld-person" data={personJsonLd} />
      <JsonLd id="ld-website" data={websiteJsonLd} />
      <style
        dangerouslySetInnerHTML={{
          __html: `:root { --layout-x: ${x}px; --layout-y: ${yScale}; }`,
        }}
      />

      <h1 className="sr-only">
        {SITE.name} — Filmmaker &amp; Producer · Selected Work
      </h1>

      <FilterProvider
        initial={{ category: initialCategory, query: initialQuery }}
      >
        <ViewProvider initialView={initialView}>
          <SmoothScroll infinite />
          <ViewToggle />
          <FilterBar />
          {process.env.VERCEL_ENV !== "production" && (
            <OnlyGridView>
              <SeedControls seed={seed} x={x} y={y} move={moveStr} />
            </OnlyGridView>
          )}
          <ScrollIndicator />

          <nav
            className="pointer-events-auto fixed left-4 top-6 z-40 font-serif text-[24px] leading-[1.2] md:left-6 md:top-8 md:text-[26px] lg:left-10"
            aria-label="Primary"
          >
            <p className="font-bold tracking-tight">Aurora Leonard</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/about"
                  className="transition-colors hover:italic hover:text-emerald-600"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>

          <ViewSwitcher grid={gridLayout} list={listLayout} />
        </ViewProvider>
      </FilterProvider>
    </main>
  );
}
