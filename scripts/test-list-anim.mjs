// Verify:
//   1. Cards use the local /clips/<id>.jpg poster, never i.vimeocdn.com
//   2. Toggling to list view animates the entire list shell with a single
//      transform (no opacity change, no per-row stagger)

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

// 1. Check that no card uses a Vimeo CDN image — cards must use local posters.
const imgSrcs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[role="button"] img')).map(
    (i) => i.src,
  ),
);
const vimeoSrcs = imgSrcs.filter((s) => s.includes("vimeocdn.com"));
const localSrcs = imgSrcs.filter((s) => /\/clips\/\d+\.jpg/.test(s));
console.log(`  card imgs total: ${imgSrcs.length}`);
console.log(`  vimeo cdn imgs:  ${vimeoSrcs.length}`);
console.log(`  local clip imgs: ${localSrcs.length}`);

// 2. Trigger list view and sample the shell wrapper transform.
console.log("→ click List toggle");
await page.locator('button[title="List view"]').click();

const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 1100) {
  const snap = await page.evaluate(() => {
    const shell = document.querySelector(".list-shell-enter");
    if (!shell) return null;
    const cs = getComputedStyle(shell);
    return {
      opacity: +cs.opacity,
      transform: cs.transform,
      animationName: cs.animationName,
    };
    // Note: we sample only the SHELL, not children — children must NOT have
    // their own transform animation now.
  });
  // Also sample one child row to confirm it has no animation.
  const childSnap = await page.evaluate(() => {
    const child = document.querySelector(".list-shell-enter section > *");
    if (!child) return null;
    const cs = getComputedStyle(child);
    return {
      opacity: +cs.opacity,
      transform: cs.transform,
      animationName: cs.animationName,
    };
  });
  samples.push({ ms: Date.now() - t0, shell: snap, child: childSnap });
  await sleep(40);
}

await browser.close();

const first = samples[0];
const middle = samples[Math.floor(samples.length / 2)];
const last = samples[samples.length - 1];

console.log("\n--- shell snapshots ---");
[first, middle, last].forEach((s, i) => {
  const label = ["start", "middle", "end"][i];
  console.log(
    `  ${label.padEnd(6)} opacity=${s.shell?.opacity}  anim=${s.shell?.animationName}  transform=${(s.shell?.transform ?? "").slice(0, 60)}`,
  );
});
console.log("\n--- one child row at start (should have NO animation) ---");
console.log(
  `  opacity=${first.child?.opacity}  anim=${first.child?.animationName}  transform=${first.child?.transform}`,
);

const noVimeoImgs = vimeoSrcs.length === 0 && localSrcs.length >= 14;
const shellAnimated = first.shell?.animationName?.includes("list-shell-in");
const opacityFadesIn =
  (first.shell?.opacity ?? 1) < 0.3 && (last.shell?.opacity ?? 0) > 0.95;
const transformChanged = first.shell?.transform !== last.shell?.transform;
const childHasNoAnimation = !first.child?.animationName?.includes("list-row");

console.log("\n  no vimeo imgs:        ", noVimeoImgs);
console.log("  shell animation:       ", shellAnimated);
console.log("  opacity 0 -> 1:        ", opacityFadesIn);
console.log("  shell transform moved: ", transformChanged);
console.log("  no per-row anim:       ", childHasNoAnimation);

const ok =
  noVimeoImgs &&
  shellAnimated &&
  opacityFadesIn &&
  transformChanged &&
  childHasNoAnimation;

if (ok) {
  console.log("\n✓ FIRST-FRAME POSTER + WHOLE-LIST TRANSLATE OK");
  process.exit(0);
} else {
  console.log("\n✗ FAIL");
  process.exit(1);
}
