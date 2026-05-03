// Verify the grid <-> list toggle actually swaps the layout and the list view
// renders horizontal rows of (thumbnail, text), with bounce still functional.

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(URL, { waitUntil: "networkidle" });
console.log("→ default view loaded");

// Default should be grid with 3 columns. Check layout.
const gridGeom = await page.evaluate(() => {
  const cards = document.querySelectorAll('[role="button"]');
  if (cards.length < 6) return null;
  const xs = Array.from(cards)
    .slice(0, 9)
    .map((c) => Math.round(c.getBoundingClientRect().left));
  const unique = Array.from(new Set(xs)).sort((a, b) => a - b);
  return { count: cards.length, distinctXs: unique.length };
});
console.log("  grid cards:", gridGeom);

// Click List in toggle.
console.log("→ click List toggle");
await page.locator('button[title="List view"]').click();
await page.waitForFunction(
  () => new URL(window.location.href).searchParams.get("view") === "list",
  null,
  { timeout: 4000 },
);
await page.waitForLoadState("networkidle");
await sleep(300);

const listGeom = await page.evaluate(() => {
  const cards = document.querySelectorAll('[role="button"]');
  if (cards.length === 0) return null;
  const xs = Array.from(cards)
    .slice(0, 8)
    .map((c) => Math.round(c.getBoundingClientRect().left));
  const unique = Array.from(new Set(xs)).sort((a, b) => a - b);
  // In list view every card should start at the same X.
  const first = cards[0];
  // Check that first card's preview thumbnail is to the LEFT of its title h3.
  const preview = first.querySelector("img, video");
  const h3 = first.querySelector("h3");
  const pRect = preview?.getBoundingClientRect();
  const hRect = h3?.getBoundingClientRect();
  return {
    count: cards.length,
    distinctXs: unique.length,
    firstX: xs[0],
    previewLeftOfTitle:
      pRect && hRect ? Math.round(hRect.left) > Math.round(pRect.right) : null,
    previewWidth: pRect ? Math.round(pRect.width) : null,
  };
});
console.log("  list cards:", listGeom);

// Verify list bounce still works.
console.log("→ hover first list card");
await page.locator('[role="button"]').first().hover();
const samples = [];
const startMs = Date.now();
while (Date.now() - startMs < 4500) {
  const t = await page.evaluate(() => {
    const v = document.querySelector("video[src*='/clips/']");
    return v ? +v.currentTime.toFixed(3) : null;
  });
  samples.push(t);
  await sleep(50);
}
const min = Math.min(...samples.filter((s) => s != null));
const max = Math.max(...samples.filter((s) => s != null));
console.log(`  bounce samples: min=${min}, max=${max}`);

// Toggle back to grid.
console.log("→ click Grid toggle");
await page.locator('button[title="Grid view"]').click();
await page.waitForFunction(
  () => new URL(window.location.href).searchParams.get("view") === null,
  null,
  { timeout: 4000 },
);

await browser.close();

const ok =
  gridGeom?.distinctXs >= 3 &&
  listGeom?.distinctXs === 1 &&
  listGeom?.previewLeftOfTitle === true &&
  max > 2.0 &&
  min < 0.5;

if (ok) {
  console.log("\n✓ VIEW TOGGLE OK");
  process.exit(0);
} else {
  console.log("\n✗ VIEW TOGGLE FAIL");
  process.exit(1);
}
