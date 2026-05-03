// E2E for the new dashboard edit + reorder. Generates a magic link via the
// admin SDK, extracts tokens from the URL fragment, calls supabase.auth.
// setSession() in the browser to persist cookies, then exercises:
//   • PATCH /api/videos/:id (rename Audi → Audi (edited))
//   • POST /api/videos/reorder (move first row down by one)
// and reverts both changes.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ALLOWED_ADMIN_EMAIL;
if (!url || !anon || !key || !email) {
  console.error("missing supabase env vars");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Generate magic link (implicit flow — tokens come back in the URL hash)
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${APP}/auth/callback?next=/dashboard` },
});
if (linkErr) {
  console.error("generateLink:", linkErr.message);
  process.exit(1);
}
console.log("→ magic link generated for", email);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

// 2) Visit the link. Supabase will redirect with tokens in the URL fragment.
//    Wait for any landing then read the fragment ourselves.
await page.goto(link.properties.action_link, { waitUntil: "domcontentloaded" });
await sleep(800); // let any client redirects settle
const finalUrl = page.url();
const hashIdx = finalUrl.indexOf("#");
if (hashIdx < 0) {
  console.error("no URL fragment on landing:", finalUrl);
  process.exit(1);
}
const fragment = new URLSearchParams(finalUrl.slice(hashIdx + 1));
const access_token = fragment.get("access_token");
const refresh_token = fragment.get("refresh_token");
if (!access_token || !refresh_token) {
  console.error("missing tokens in fragment");
  process.exit(1);
}
console.log("✓ extracted access + refresh tokens");

// 3) Use the browser Supabase client (loaded fresh on the page) to install
//    the session — this persists the sb-* cookies the proxy reads.
await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
await page.evaluate(
  async ({ url, anon, access_token, refresh_token }) => {
    const { createBrowserClient } = await import(
      "https://esm.sh/@supabase/ssr@0.10.2"
    );
    const supabase = createBrowserClient(url, anon);
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;
  },
  { url, anon, access_token, refresh_token },
);
await sleep(300);

// 4) Now /dashboard should load
await page.goto(`${APP}/dashboard`);
await page.waitForURL((u) => u.pathname === "/dashboard", { timeout: 10_000 });
await page.waitForSelector("h1:has-text('Manage videos')", { timeout: 10_000 });
console.log("✓ landed on /dashboard");

// Debug: snapshot structure once
const sample = await page.evaluate(() => {
  const li = document.querySelector('ul > li[class*="grid-cols"]');
  return li
    ? {
        outerLength: li.outerHTML.length,
        editButtons: Array.from(li.querySelectorAll("button"))
          .map((b) => b.textContent?.trim())
          .filter(Boolean),
      }
    : null;
});
console.log("  first-row buttons:", sample?.editButtons);

// 5) Edit Audi → Audi (edited). Find by exact vimeo_id text since names
// can repeat (multiple "Apple", "Nike" rows exist).
const audiRow = page
  .locator('ul > li[class*="grid-cols"]')
  .filter({ hasText: "1185678936" })
  .first();
await audiRow.waitFor({ timeout: 8000 });
await audiRow.locator('button', { hasText: /^Edit$/ }).click();
await audiRow.locator('input[type="text"]').waitFor({ timeout: 8000 });
await audiRow.locator('input[type="text"]').fill("Audi (edited)");
await audiRow.locator('button', { hasText: /^Save$/ }).click();
await page
  .locator('ul > li[class*="grid-cols"]')
  .filter({ hasText: "1185678936" })
  .filter({ hasText: "Audi (edited)" })
  .waitFor({ timeout: 8000 });
console.log("✓ PATCH succeeded — title now 'Audi (edited)'");

const readOrder = () =>
  page.evaluate(() =>
    Array.from(
      document.querySelectorAll('ul > li[class*="grid-cols"]'),
    ).map(
      (li) =>
        li.querySelector('.text-\\[11px\\].text-neutral-500')?.textContent?.trim(),
    ),
  );

const before = await readOrder();
console.log("  order before:", before.slice(0, 4).join(", "), "…");

const firstRow = page.locator('ul > li[class*="grid-cols"]').first();
await firstRow.locator('button[aria-label="Move down"]').click();
await sleep(800);
const after = await readOrder();
console.log("  order after: ", after.slice(0, 4).join(", "), "…");

const swapped = before[0] === after[1] && before[1] === after[0];
console.log(`${swapped ? "✓" : "✗"} reorder swap by 1 verified`);

// 6) Revert: rename back, swap back
const renamed = page
  .locator('ul > li[class*="grid-cols"]')
  .filter({ hasText: "1185678936" })
  .first();
await renamed.locator('button', { hasText: /^Edit$/ }).click();
await renamed.locator('input[type="text"]').waitFor({ timeout: 8000 });
await renamed.locator('input[type="text"]').fill("Audi");
await renamed.locator('button', { hasText: /^Save$/ }).click();
await page
  .locator('ul > li[class*="grid-cols"]')
  .filter({ hasText: "1185678936" })
  .filter({ hasText: /^[^A-Za-z]*Audi[^A-Za-z(]/ })
  .waitFor({ timeout: 8000 });

const movedRow = page.locator('ul > li[class*="grid-cols"]').nth(1);
await movedRow.locator('button[aria-label="Move up"]').click();
await sleep(500);
console.log("✓ reverted name + position");

await browser.close();

if (swapped) {
  console.log("\n✓ EDIT + REORDER OK");
  process.exit(0);
} else {
  console.log("\n✗ EDIT + REORDER FAILED");
  process.exit(1);
}
