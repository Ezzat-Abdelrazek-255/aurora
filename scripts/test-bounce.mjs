// End-to-end bounce test. Drives a real Chromium, hovers a card, samples
// video.currentTime + paused over a window, and asserts that the playhead
// actually moves forward AND backward (i.e. the bounce works). Exits non-zero
// on failure so this can gate further work.

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/";
const HOVER_DURATION_MS = 8000;
const SAMPLE_INTERVAL_MS = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE:", msg.text());
});

console.log("→ navigating");
await page.goto(URL, { waitUntil: "networkidle" });

// Wait for at least one card video to mount.
console.log("→ waiting for video element");
await page.waitForSelector("video[src*='/clips/']", { timeout: 10_000 });

const videoHandle = await page.locator("video[src*='/clips/']").first();
const cardHandle = await page.locator('[role="button"]').first();
const src = await videoHandle.getAttribute("src");
console.log("  video src:", src);

// Wait for metadata so duration is known.
await page.waitForFunction(
  () => {
    const v = document.querySelector("video[src*='/clips/']");
    return v && v.readyState >= 1 && Number.isFinite(v.duration);
  },
  null,
  { timeout: 10_000 },
);

const duration = await videoHandle.evaluate((v) => v.duration);
console.log(`  duration: ${duration.toFixed(3)}s`);

console.log("→ hovering");
await cardHandle.hover();

const samples = [];
const startMs = Date.now();
while (Date.now() - startMs < HOVER_DURATION_MS) {
  const snap = await videoHandle.evaluate((v) => ({
    t: +v.currentTime.toFixed(3),
    p: v.paused,
    e: v.ended,
    rs: v.readyState,
  }));
  samples.push({ ms: Date.now() - startMs, ...snap });
  await sleep(SAMPLE_INTERVAL_MS);
}

console.log("→ unhovering");
await page.mouse.move(0, 0);
await sleep(200);

await browser.close();

// ---- analysis ----------------------------------------------------------
let directionChanges = 0;
let prev = samples[0]?.t ?? 0;
let dir = 0; // +1, -1, 0
let maxT = 0;
let minT = 1;
let goesAbove2_5 = false;
let goesBelow0_3AfterRise = false;

for (const s of samples) {
  if (s.t > maxT) maxT = s.t;
  if (s.t < minT) minT = s.t;
  if (s.t > 2.5) goesAbove2_5 = true;
  if (goesAbove2_5 && s.t < 0.3) goesBelow0_3AfterRise = true;
  const delta = s.t - prev;
  const newDir = Math.abs(delta) < 0.01 ? dir : delta > 0 ? 1 : -1;
  if (dir !== 0 && newDir !== 0 && newDir !== dir) directionChanges++;
  if (newDir !== 0) dir = newDir;
  prev = s.t;
}

console.log("\n--- samples (every 10th) ---");
samples.forEach((s, i) => {
  if (i % 10 === 0)
    console.log(
      `  +${String(s.ms).padStart(4)}ms  t=${s.t.toFixed(3)}  paused=${s.p}  ended=${s.e}`,
    );
});

console.log("\n--- summary ---");
console.log(`  samples: ${samples.length}`);
console.log(`  min t:  ${minT.toFixed(3)}`);
console.log(`  max t:  ${maxT.toFixed(3)}`);
console.log(`  direction changes: ${directionChanges}`);
console.log(`  reached t > 2.5: ${goesAbove2_5}`);
console.log(`  came back below 0.3 after rising: ${goesBelow0_3AfterRise}`);

const bounceWorks =
  goesAbove2_5 && goesBelow0_3AfterRise && directionChanges >= 2;
if (bounceWorks) {
  console.log("\n✓ BOUNCE OK — forward + reverse + at least one full cycle");
  process.exit(0);
} else {
  console.log("\n✗ BOUNCE BROKEN");
  process.exit(1);
}
