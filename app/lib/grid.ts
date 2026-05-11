import { seedFromString } from "./seed";

export type Cell = {
  index: number;
  widthPct: number;
  align: "start" | "center" | "end";
  /** Tailwind-style spacing stop. Multiply by 0.25rem (and the global Y scale) to get the actual margin. */
  marginUnit: number;
};

export type GeneratedLayout = {
  seed: string;
  cols: [Cell[], Cell[], Cell[]];
};

const SMALL = [75, 78, 80, 82];
const MEDIUM = [84, 87, 90, 93];
const LARGE = [96, 100];
const ALIGNS = ["start", "center", "end"] as const;
const MARGINS = [8, 10, 12, 14, 16, 20, 24];

/**
 * Each item's slot is derived from a stable hash of (seed, salt, item id), so
 * adding or removing one item doesn't perturb the others — only the new item
 * picks up a slot. The seed still scrambles everything globally, which keeps
 * the Randomize button doing what it always did.
 */
function hashFor(seed: string, salt: string, id: string): number {
  return seedFromString(`${seed}|${salt}|${id}`);
}

function pickFromHash<T>(
  seed: string,
  salt: string,
  id: string,
  arr: readonly T[],
): T {
  return arr[hashFor(seed, salt, id) % arr.length];
}

export type ItemStyle = {
  widthPct: number;
  align: "start" | "center" | "end";
  marginUnit: number;
};

/**
 * Per-item visual styling. Independent salts per attribute keep them from
 * correlating (e.g. wide cards happening to always be left-aligned).
 */
export function styleForItem(seed: string, id: string): ItemStyle {
  const r = hashFor(seed, "bucket", id) / 4294967296;
  const bucket = r < 0.45 ? SMALL : r < 0.85 ? MEDIUM : LARGE;
  return {
    widthPct: pickFromHash(seed, "w", id, bucket),
    align: pickFromHash(seed, "a", id, ALIGNS),
    marginUnit: pickFromHash(seed, "m", id, MARGINS),
  };
}

export type LayoutItem = {
  id: string;
  /** width / height. Drives the rendered card height and the column-balance math. */
  aspect: number;
};

/**
 * Height of a styled card in units of column-width. Card height is
 * widthPct/100 / aspect (cards are widthPct% of the column wide); the margin
 * above each card is added in roughly comparable units. Used only for
 * column-balance comparison, so the exact margin scale doesn't matter — only
 * its rough magnitude relative to card height.
 */
function cellUnits(style: ItemStyle, aspect: number): number {
  const cardH = style.widthPct / 100 / Math.max(0.2, aspect);
  const gap = style.marginUnit * 0.04;
  return cardH + gap;
}

export function generateLayout(
  seed: string,
  items: readonly LayoutItem[],
  options?: { col0StyleSeed?: string },
): GeneratedLayout {
  const cols: [Cell[], Cell[], Cell[]] = [[], [], []];
  const heights: [number, number, number] = [0, 0, 0];
  const col0Seed = options?.col0StyleSeed ?? seed;

  // Greedy "shortest column wins" — classic masonry. Process items in input
  // order (DB position). For each item, compute its rendered height in each
  // candidate column (col 0 may use an overlay seed for styling so its width
  // differs) and place it where the post-placement column total is smallest.
  // Earlier items see only earlier prior state, so adding a new item at the
  // end never disturbs an existing item's column.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const aspect = Number.isFinite(item.aspect) && item.aspect > 0 ? item.aspect : 1;

    const mainStyle = styleForItem(seed, item.id);
    const col0Style = options?.col0StyleSeed
      ? styleForItem(col0Seed, item.id)
      : mainStyle;

    const candidates: { col: number; style: ItemStyle; total: number }[] = [
      { col: 0, style: col0Style, total: heights[0] + cellUnits(col0Style, aspect) },
      { col: 1, style: mainStyle, total: heights[1] + cellUnits(mainStyle, aspect) },
      { col: 2, style: mainStyle, total: heights[2] + cellUnits(mainStyle, aspect) },
    ];
    // Stable tie-break: lowest column index when totals are equal.
    let best = candidates[0];
    for (let c = 1; c < candidates.length; c++) {
      if (candidates[c].total < best.total) best = candidates[c];
    }

    cols[best.col].push({ index: i, ...best.style });
    heights[best.col] = best.total;
  }

  return { seed, cols };
}

/**
 * A small post-generation tweak: move a cell from one column to the end of
 * another. Lets a user lock in a layout from a seed and then nudge a single
 * card without losing reproducibility — the move is encoded in the URL.
 *
 * String form: "fromCol.fromIdx>toCol", multiple comma-separated.
 *   e.g. "1.4>0" — move column 1 index 4 to the end of column 0.
 */
export type Move = { fromCol: number; fromIdx: number; toCol: number };

export function parseMoves(s: string | undefined | null): Move[] {
  if (!s) return [];
  const out: Move[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)\.(\d+)>(\d+)$/.exec(part.trim());
    if (!m) continue;
    out.push({ fromCol: +m[1], fromIdx: +m[2], toCol: +m[3] });
  }
  return out;
}

/**
 * Per-item alignment override. Lets you nudge a single card left/center/right
 * inside its column without touching the seed (which would reshuffle every
 * card). String form: "<itemId>|<align>", comma-separated. Width may also be
 * overridden with "<itemId>|<align>|<widthPct>" to combine resize + nudge —
 * e.g. shifting a 90%-wide card all the way right only gives a 10% drift,
 * narrowing it to 70% lets you push it ~30% right.
 *   e.g. "v:1185677642|end|70".
 *
 * Note: item IDs themselves contain a colon (`v:<vimeoId>` / `p:<slug>`) so
 * the field separator inside one nudge is `|`, not `:`.
 */
export type Nudge = {
  id: string;
  align?: "start" | "center" | "end";
  widthPct?: number;
};

export function parseNudges(s: string | undefined | null): Nudge[] {
  if (!s) return [];
  const out: Nudge[] = [];
  for (const part of s.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const segs = trimmed.split("|");
    if (segs.length < 2) continue;
    const id = segs[0];
    const align = segs[1] as "start" | "center" | "end";
    if (align !== "start" && align !== "center" && align !== "end") continue;
    const widthPct =
      segs[2] != null ? Number(segs[2]) : undefined;
    out.push({
      id,
      align,
      widthPct:
        widthPct != null && Number.isFinite(widthPct) && widthPct > 0
          ? Math.min(100, widthPct)
          : undefined,
    });
  }
  return out;
}

export function applyNudges(
  cols: [Cell[], Cell[], Cell[]],
  nudges: Nudge[],
  itemIds: readonly string[],
): [Cell[], Cell[], Cell[]] {
  if (nudges.length === 0) return cols;
  const byId = new Map(nudges.map((n) => [n.id, n]));
  return cols.map((col) =>
    col.map((cell) => {
      const id = itemIds[cell.index];
      const n = id ? byId.get(id) : undefined;
      if (!n) return cell;
      return {
        ...cell,
        align: n.align ?? cell.align,
        widthPct: n.widthPct ?? cell.widthPct,
      };
    }),
  ) as [Cell[], Cell[], Cell[]];
}

export function applyMoves(
  cols: [Cell[], Cell[], Cell[]],
  moves: Move[]
): [Cell[], Cell[], Cell[]] {
  const out: [Cell[], Cell[], Cell[]] = [
    [...cols[0]],
    [...cols[1]],
    [...cols[2]],
  ];
  for (const m of moves) {
    if (m.fromCol < 0 || m.fromCol > 2 || m.toCol < 0 || m.toCol > 2) continue;
    if (m.fromCol === m.toCol) continue;
    const src = out[m.fromCol];
    if (m.fromIdx < 0 || m.fromIdx >= src.length) continue;
    const [cell] = src.splice(m.fromIdx, 1);
    out[m.toCol].push(cell);
  }
  return out;
}
