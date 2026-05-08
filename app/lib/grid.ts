import { mulberry32, seedFromString } from "./seed";

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
const FIRST_MARGINS = [0, 2, 6, 10];
const MARGINS = [8, 10, 12, 14, 16, 20, 24];

const TOTAL_VIDEOS = 14;

/**
 * 3-column splits whose sum equals `total`. Each column gets either
 * floor(total/3) or floor(total/3)+1 cards so the layout stays balanced
 * regardless of the item count (videos + plays + future kinds).
 */
function distributionsFor(total: number): Array<[number, number, number]> {
  const base = Math.floor(total / 3);
  const extra = total - base * 3; // 0, 1, or 2
  if (extra === 0) return [[base, base, base]];
  if (extra === 1) {
    return [
      [base + 1, base, base],
      [base, base + 1, base],
      [base, base, base + 1],
    ];
  }
  return [
    [base + 1, base + 1, base],
    [base + 1, base, base + 1],
    [base, base + 1, base + 1],
  ];
}

export function generateLayout(seed: string, total = TOTAL_VIDEOS): GeneratedLayout {
  const rand = mulberry32(seedFromString(seed));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const distribution = pick(distributionsFor(total));
  const cols: [Cell[], Cell[], Cell[]] = [[], [], []];
  let cursor = 0;

  for (let c = 0; c < 3; c++) {
    const count = distribution[c];
    let usedLarge = false;

    for (let i = 0; i < count; i++) {
      const cardIdx = indices[cursor++];
      const remaining = count - i;

      let bucket: number[];
      if (!usedLarge && (i === 0 || rand() < 1 / remaining)) {
        bucket = LARGE;
        usedLarge = true;
      } else {
        const r = rand();
        bucket = r < 0.45 ? SMALL : r < 0.85 ? MEDIUM : LARGE;
      }

      cols[c].push({
        index: cardIdx,
        widthPct: pick(bucket),
        align: pick(ALIGNS),
        marginUnit: i === 0 ? pick(FIRST_MARGINS) : pick(MARGINS),
      });
    }
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

