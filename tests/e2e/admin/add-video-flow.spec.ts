import { expect, test } from "@playwright/test";

// Exercises the full add-video workflow through the dashboard UI:
//   1. Fill the form with a unique (fake) Vimeo URL.
//   2. Submit and verify the row appears in the dashboard table.
//   3. Delete via the table's row action, accepting the confirm dialog.
//   4. Verify the row is gone.
//
// Uses a fake URL whose id+hash format passes the API's regex but doesn't
// resolve to a real Vimeo video, so the trigger task will fail processing.
// That's fine — we only care that the row was inserted, became visible in
// the table, and could be deleted again.

const TEST_NAME_PREFIX = "playwright-add-flow ";

function randomVimeoId() {
  // 999_000_000 + 10-digit suffix keeps us well clear of real Vimeo IDs.
  return `999${Date.now().toString().slice(-7)}`;
}

function randomHash() {
  return Math.random().toString(16).slice(2, 12);
}

test.describe("admin — add video flow", () => {
  let createdVimeoId: string | null = null;

  test.afterEach(async ({ request }) => {
    // Belt-and-braces cleanup. The happy-path test deletes via UI, but if
    // anything before that step throws we still want the row gone.
    if (createdVimeoId) {
      await request.delete(`/api/videos/${createdVimeoId}`).catch(() => {});
      createdVimeoId = null;
    }
  });

  test("create → row appears → delete → row gone", async ({ page }) => {
    const vimeoId = randomVimeoId();
    const hash = randomHash();
    const name = `${TEST_NAME_PREFIX}${vimeoId}`;
    createdVimeoId = vimeoId;

    await page.goto("/dashboard");
    await expect(page.getByText("Signed in as")).toBeVisible();

    await page
      .getByLabel("Vimeo URL")
      .fill(`https://vimeo.com/${vimeoId}/${hash}`);
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Category").selectOption("commercial");
    await page.getByLabel("Role").selectOption("Producer");

    await page.getByRole("button", { name: /^add video$/i }).click();

    // Row by accessible text — `name` is unique per run.
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Status starts pending or processing; the trigger task will eventually
    // mark it failed since the URL is fake. Any of those is acceptable —
    // we just want to confirm the row landed.
    await expect(
      row.getByText(/^(pending|processing|failed|ready)$/i),
    ).toBeVisible();

    // Delete via the row's action button. The handler uses window.confirm,
    // so accept the dialog before the click resolves.
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: /^delete$/i }).click();

    await expect(row).toHaveCount(0, { timeout: 10_000 });
    createdVimeoId = null; // afterEach cleanup is now a no-op.
  });

  test("malformed URL surfaces a validation error without inserting", async ({
    page,
    request,
  }) => {
    const name = `${TEST_NAME_PREFIX}invalid-url-${Date.now()}`;

    await page.goto("/dashboard");
    await expect(page.getByText("Signed in as")).toBeVisible();

    // `type="url"` accepts the format, but the server's Zod refine rejects
    // it (must match the vimeo.com/<id>/<hash> pattern).
    await page
      .getByLabel("Vimeo URL")
      .fill("https://example.com/not-a-vimeo");
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /^add video$/i }).click();

    await expect(page.getByText(/invalid_body/i)).toBeVisible({
      timeout: 5_000,
    });

    // Confirm no row was inserted server-side either.
    const list = await request.get("/api/videos");
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { videos: { name: string }[] };
    expect(body.videos.find((v) => v.name === name)).toBeUndefined();
  });
});
