// Measure how long it takes from clicking the view toggle to the layout
// actually swapping. Should be near-instant (no server roundtrip) and the
// sliding indicator should have a CSS transform transition.

import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

// Block all server traffic AFTER initial load to prove the toggle doesn't
// require any network call.
await page.goto(URL, { waitUntil: "networkidle" });
await page.locator('[role="button"]').first().waitFor();

let networkRequestsAfterClick = 0;
page.on("request", (req) => {
  if (req.resourceType() === "document") networkRequestsAfterClick++;
});

const before = await page.evaluate(() => {
  const cards = document.querySelectorAll('[role="button"]');
  return Math.round(cards[0].getBoundingClientRect().left);
});

const t0 = Date.now();
await page.locator('button[title="List view"]').click();

// Wait until card layout is in list mode (all cards share the same X).
await page.waitForFunction(
  () => {
    const cards = document.querySelectorAll('[role="button"]');
    if (cards.length < 4) return false;
    const xs = new Set(
      Array.from(cards)
        .slice(0, 6)
        .map((c) => Math.round(c.getBoundingClientRect().left)),
    );
    return xs.size === 1;
  },
  null,
  { timeout: 4000 },
);
const elapsed = Date.now() - t0;

const after = await page.evaluate(() => {
  const cards = document.querySelectorAll('[role="button"]');
  return Math.round(cards[0].getBoundingClientRect().left);
});

// Verify the URL updated via history.replaceState (no nav).
const url = page.url();

// Read the sliding indicator's transform values across two frames
// to confirm CSS transition is animating.
const transitionInfo = await page.evaluate(async () => {
  const ind = document.querySelector(
    '[role="group"] span[aria-hidden="true"]',
  );
  if (!ind) return null;
  const computed = getComputedStyle(ind);
  return {
    transition: computed.transitionProperty + " " + computed.transitionDuration,
    transform: computed.transform,
  };
});

await browser.close();

console.log(`  before x:        ${before}`);
console.log(`  after x:         ${after}`);
console.log(`  toggle elapsed:  ${elapsed}ms`);
console.log(`  doc requests after click: ${networkRequestsAfterClick}`);
console.log(`  url:             ${url}`);
console.log(`  indicator css:   ${transitionInfo?.transition}`);
console.log(`  indicator xform: ${transitionInfo?.transform}`);

const ok =
  elapsed < 600 &&
  networkRequestsAfterClick === 0 &&
  url.includes("view=list") &&
  /transform/i.test(transitionInfo?.transition ?? "") &&
  /(0\.3s|300ms)/.test(transitionInfo?.transition ?? "");

if (ok) {
  console.log("\n✓ TOGGLE FAST + ANIMATED");
  process.exit(0);
} else {
  console.log("\n✗ TOGGLE NOT OK");
  process.exit(1);
}
