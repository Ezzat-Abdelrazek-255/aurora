import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test as setup } from "@playwright/test";

export const ADMIN_STORAGE_STATE = resolve(
  process.cwd(),
  "tests/e2e/.auth/admin.json",
);

// Mirror the .env.local loader the scripts/ helpers use, so a developer can
// run `npx playwright test` without manually exporting credentials.
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line
      .slice(i + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

setup("authenticate as admin", async ({ page }) => {
  loadEnvLocal();
  const email = process.env.PLAYWRIGHT_ADMIN_EMAIL;
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD " +
        "(in .env.local or the shell) before running admin tests. The " +
        "account must already exist in Supabase and be on " +
        "ALLOWED_ADMIN_EMAIL.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // The dashboard layout renders "Signed in as <email>" once cookies are set
  // and the proxy lets us through. Waiting on this is more reliable than
  // racing on URL changes — the LoginForm does router.refresh() then
  // router.push(), and either order can land first.
  await page.waitForURL(/\/dashboard(?:$|[/?])/);
  await expect(page.getByText(`Signed in as`)).toBeVisible();

  mkdirSync(dirname(ADMIN_STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
