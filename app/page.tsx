import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "./components/FilterBar";
import { FilteredCell } from "./components/FilteredCell";
import { FilterProvider } from "./components/FilterProvider";
import { JsonLd } from "./components/JsonLd";
import { PlayCard } from "./components/PlayCard";
import { ScrollIndicator } from "./components/ScrollIndicator";
import { SeedControls } from "./components/SeedControls";
import { SmoothScroll } from "./components/SmoothScroll";
import { VideoCard } from "./components/VideoCard";
import { ViewProvider, type ViewMode } from "./components/ViewProvider";
import { ActiveView } from "./components/ViewSwitcher";
import { ViewToggle } from "./components/ViewToggle";
import {
  applyMoves,
  applyNudges,
  generateLayout,
  parseMoves,
  parseNudges,
  type Cell,
} from "./lib/grid";
import type { Play } from "./lib/plays";
import { listReadyPlays } from "./lib/plays-server";
import { DEFAULT_SEED } from "./lib/seed";
import { SITE } from "./lib/site";
import { CATEGORY_VALUES, type Category, type Role } from "./lib/videos";
import type { Video } from "./lib/videos";
import { listReadyVideos } from "./lib/videos-server";

// Discriminated union the grid layout iterates over. Both kinds carry the
// fields FilteredCell needs (name/role/category) so a single FilterProvider
// can match against the merged set.
type GridItem =
  | ({ kind: "video" } & Video)
  | ({ kind: "play" } & Play);

const cellMeta = (item: GridItem): { name: string; role: Role; category: Category } => ({
  name: item.name,
  role: item.role,
  category: item.category,
});

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
  nudge?: string | string[];
  view?: string | string[];
  category?: string | string[];
  q?: string | string[];
}>;

function isCategory(v: string | undefined): v is Category {
  return CATEGORY_VALUES.includes(v as Category);
}

const DEFAULT_X = 80; // px
const DEFAULT_Y = 180; // percent
const X_MAX = 400;
const Y_MAX = 800;
const COPIES = [0, 1] as const;
// Seed whose column-0 widthPct/align/marginUnit values we overlay onto the
// main seed's column 0, picked for a varied left-edge look.
const COL0_STYLE_SEED = "0gliazk";
// Per-item style overrides baked into the deploy. Same format as the `nudge`
// URL param: "<itemId>|<align>[|<widthPct>]", comma-separated. URL nudges
// (when present) take precedence over these on a per-id basis.
const BAKED_NUDGES = "v:1185677642|center|80";

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

  const moveStr = pickFirst(sp.move) ?? "";
  const moves = parseMoves(moveStr);
  const nudgeStr = pickFirst(sp.nudge) ?? "";
  const urlNudges = parseNudges(nudgeStr);
  const bakedNudges = parseNudges(BAKED_NUDGES);
  // URL nudges win on a per-id basis so the dev SeedControls can override or
  // disable a baked nudge without editing code.
  const nudges = [
    ...bakedNudges.filter((b) => !urlNudges.some((u) => u.id === b.id)),
    ...urlNudges,
  ];

  // Source of truth is Supabase for both shapes. Plays are theatre still
  // galleries — they share the layout pipeline with videos via a single
  // discriminated `items` array so the filter / seeded layout / list view
  // treat them uniformly.
  const [videos, plays] = await Promise.all([listReadyVideos(), listReadyPlays()]);
  const items: GridItem[] = [
    ...videos.map((v): GridItem => ({ kind: "video", ...v })),
    ...plays.map((p): GridItem => ({ kind: "play", ...p })),
  ];
  // Namespaced id so a video id and a play slug can't collide on the layout
  // hash. Pairing it with the item's aspect lets generateLayout balance the
  // columns by projected card height (masonry) instead of just by count.
  const itemKey = (item: GridItem) =>
    item.kind === "video" ? `v:${item.id}` : `p:${item.slug}`;
  const layoutItems = items.map((item) => ({
    id: itemKey(item),
    aspect: item.aspect,
  }));
  const baseLayout = generateLayout(seed, layoutItems, {
    col0StyleSeed: COL0_STYLE_SEED,
  });
  const cols = applyNudges(
    applyMoves(baseLayout.cols, moves),
    nudges,
    layoutItems.map((it) => it.id),
  );

  const seededOrder: number[] = [];
  const maxLen = Math.max(...cols.map((c) => c.length));
  for (let row = 0; row < maxLen; row++) {
    for (const col of cols) {
      if (col[row]) seededOrder.push(col[row].index);
    }
  }

  const renderItem = (item: GridItem) => {
    if (item.kind === "video") {
      return (
        <VideoCard
          id={item.id}
          hash={item.hash}
          name={item.name}
          role={item.role}
          clipUrl={item.clipUrl}
          posterUrl={item.posterUrl}
          aspect={item.aspect}
        />
      );
    }
    return (
      <PlayCard
        slug={item.slug}
        name={item.name}
        role={item.role}
        coverUrl={item.coverUrl}
        gallery={item.galleryUrls}
        aspect={item.aspect}
      />
    );
  };

  const renderCell = (copy: number) => (cell: Cell) => {
    const item = items[cell.index];
    if (!item) return null;
    return (
      <FilteredCell
        key={`${seed}-${copy}-${cell.index}`}
        video={cellMeta(item)}
        className={`${alignClass[cell.align]} max-md:w-full! max-md:mt-0!`}
        style={{
          width: `${cell.widthPct}%`,
          marginTop: `calc(var(--layout-y, 1) * ${cell.marginUnit * 0.25}rem)`,
        }}
      >
        {renderItem(item)}
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
          <div className="flex flex-col max-md:gap-y-8 md:pt-24 lg:pt-28">{cols[0].map(renderCell(copy))}</div>
          <div className="flex flex-col max-md:gap-y-8 max-md:mt-8">{cols[1].map(renderCell(copy))}</div>
          <div className="flex flex-col max-md:gap-y-8 max-md:mt-8 md:pt-12 lg:pt-16">{cols[2].map(renderCell(copy))}</div>
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
            const item = items[idx];
            if (!item) return null;
            return (
              <FilteredCell
                key={`${seed}-${copy}-list-${idx}`}
                video={cellMeta(item)}
              >
                {item.kind === "video" ? (
                  <VideoCard
                    id={item.id}
                    hash={item.hash}
                    name={item.name}
                    role={item.role}
                    clipUrl={item.clipUrl}
                    posterUrl={item.posterUrl}
                    aspect={item.aspect}
                    variant="list"
                  />
                ) : (
                  <PlayCard
                    slug={item.slug}
                    name={item.name}
                    role={item.role}
                    coverUrl={item.coverUrl}
                    gallery={item.galleryUrls}
                    aspect={item.aspect}
                    variant="list"
                  />
                )}
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
    <main className="relative isolate bg-white text-[#040d08]">
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
            <SeedControls
              seed={seed}
              x={x}
              y={y}
              move={moveStr}
              nudge={nudgeStr}
            />
          )}
          <ScrollIndicator />

          <nav
            className="pointer-events-auto fixed left-4 top-6 z-40 font-serif text-[24px] leading-[1.2] mix-blend-difference text-white md:left-6 md:top-8 md:text-[26px] lg:left-10"
            aria-label="Primary"
          >
            <p className="font-bold tracking-tight">Aurora Leonard</p>
            <ul className="mt-2 space-y-1">
              <li>
                <Link
                  href="/about"
                  className="transition-colors hover:italic hover:text-emerald-400"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>

          <ActiveView grid={gridLayout} list={listLayout} />
        </ViewProvider>
      </FilterProvider>
    </main>
  );
}
