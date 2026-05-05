import { expect, test } from "@playwright/test";

// Proves the admin storageState is wired into the page context: navigating
// straight to /dashboard succeeds without going through /login. If the
// fixture breaks, this test fails first and the rest of the admin suite is
// skipped automatically by the dependency on setup-admin.
test.describe("admin fixture — UI", () => {
  test("dashboard loads as a signed-in admin", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard(?:$|[/?])/);
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /dashboard/i, level: 1 }),
    ).toBeVisible();
  });

  test("about editor loads", async ({ page }) => {
    await page.goto("/dashboard/about");
    await expect(page).toHaveURL(/\/dashboard\/about/);
  });
});
