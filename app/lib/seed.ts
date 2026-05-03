// Deterministic PRNG so a given seed string always produces the same layout.

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a — fast string -> 32-bit hash.
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function randomSeed(): string {
  const n = Math.floor(Math.random() * 0xffffffff);
  return n.toString(36).padStart(7, "0").slice(-7);
}

export const DEFAULT_SEED = "03sfy2m";
