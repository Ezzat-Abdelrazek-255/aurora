// Verify list view rows have a staggered slide-up entrance animation.
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "networkidle" });

console.log("→ click List toggle and sample animation early");
await page.locator('button[title="List view"]').click();

// Sample at multiple frames to catch the in-progress animation.
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 800) {
  const rows = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(".list-row-enter")).slice(0, 6);
    return els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        opacity: +cs.opacity,
        transform: cs.transform,
        animationDelay: cs.animationDelay,
        animationName: cs.animationName,
      };
    });
  });
  samples.push({ ms: Date.now() - t0, rows });
  await sleep(40);
}

await browser.close();

const first = samples[0]?.rows ?? [];
const middle = samples[Math.floor(samples.length / 2)]?.rows ?? [];
const last = samples[samples.length - 1]?.rows ?? [];

console.log("\n--- snapshot at t=0ms (first 4 rows) ---");
first.slice(0, 4).forEach((r, i) => {
  console.log(`  row ${i}: opacity=${r.opacity.toFixed(2)}  delay=${r.animationDelay}  anim=${r.animationName}`);
});
console.log("\n--- snapshot at mid-window ---");
middle.slice(0, 4).forEach((r, i) =>
  console.log(`  row ${i}: opacity=${r.opacity.toFixed(2)}  transform=${r.transform.slice(0, 60)}`),
);
console.log("\n--- snapshot at end-window ---");
last.slice(0, 4).forEach((r, i) =>
  console.log(`  row ${i}: opacity=${r.opacity.toFixed(2)}  transform=${r.transform.slice(0, 60)}`),
);

const animationApplied = first[0]?.animationName?.includes("list-row-in");
const isStaggered =
  first.length >= 4 &&
  first[0].animationDelay !== first[1].animationDelay &&
  first[1].animationDelay !== first[2].animationDelay;
const opacityFinishedAtEnd = last[0] && last[0].opacity > 0.95;
const wasInvisibleEarly = first.some((r) => r.opacity < 0.2);

console.log(`\n  animation applied: ${animationApplied}`);
console.log(`  staggered delays:  ${isStaggered}`);
console.log(`  opacity 0 early:   ${wasInvisibleEarly}`);
console.log(`  opacity ≈ 1 final: ${opacityFinishedAtEnd}`);

const ok = animationApplied && isStaggered && wasInvisibleEarly && opacityFinishedAtEnd;
if (ok) {
  console.log("\n✓ LIST ENTRANCE ANIMATION OK");
  process.exit(0);
} else {
  console.log("\n✗ LIST ENTRANCE FAIL");
  process.exit(1);
}
