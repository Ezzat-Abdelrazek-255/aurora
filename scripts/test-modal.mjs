// Verify the modal opens with a poster image visible and the iframe loads.
import { chromium } from "playwright";

const URL = process.env.URL ?? "http://localhost:3000/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector('[role="button"]');

console.log("→ click first card");
await page.locator('[role="button"]').first().click();

// Modal should appear immediately
const dialog = page.locator('[role="dialog"]');
await dialog.waitFor({ state: "visible", timeout: 2000 });
console.log("✓ modal visible");

// Poster image should be visible while iframe loads
const posterVisible = await dialog.locator("img").isVisible().catch(() => false);
console.log(`  poster img present: ${posterVisible}`);

// Capture iframe load event timing
const iframeReadyMs = await page.evaluate(async () => {
  const start = performance.now();
  const iframe = document.querySelector('[role="dialog"] iframe');
  if (!iframe) return -1;
  if (iframe.classList.contains("opacity-100")) return performance.now() - start;
  await new Promise((r) => {
    const id = setInterval(() => {
      if (iframe.classList.contains("opacity-100")) {
        clearInterval(id);
        r();
      }
    }, 100);
    setTimeout(() => { clearInterval(id); r(); }, 8000);
  });
  return performance.now() - start;
});
console.log(`  iframe became visible after ${Math.round(iframeReadyMs)}ms`);

// Verify modal title block is BELOW the video, not overlapping
const layout = await page.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return null;
  const iframe = dialog.querySelector("iframe");
  const titleBlock = dialog.querySelector("h2")?.parentElement;
  if (!iframe || !titleBlock) return null;
  const iRect = iframe.getBoundingClientRect();
  const tRect = titleBlock.getBoundingClientRect();
  return {
    iframeBottom: Math.round(iRect.bottom),
    titleTop: Math.round(tRect.top),
    gap: Math.round(tRect.top - iRect.bottom),
  };
});
console.log(`  layout: iframe.bottom=${layout?.iframeBottom}  title.top=${layout?.titleTop}  gap=${layout?.gap}px`);

const ok =
  posterVisible &&
  iframeReadyMs > 0 &&
  iframeReadyMs < 8000 &&
  (layout?.gap ?? -1) >= 16;

await browser.close();

if (ok) {
  console.log("\n✓ MODAL OK");
  process.exit(0);
} else {
  console.log("\n✗ MODAL FAIL");
  process.exit(1);
}
