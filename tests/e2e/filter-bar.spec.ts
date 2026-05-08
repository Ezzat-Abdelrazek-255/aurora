import { expect, test } from "@playwright/test";

// Filtering is now client-side: URL updates via history.replaceState, the DOM
// keeps every card mounted, and non-matching cards are hidden via display:none.
// Playwright's getByRole excludes display:none nodes by default, so toHaveCount
// reflects what the user actually sees.
//
// Reference data after the brands/originals/theatre recategorization (read
// from /api/videos at the time of writing — keep in sync if the dataset
// changes):
//   originals (7): "Reforest Films, A Dream Village" (Producer),
//                  "Reforest Films, Tending the Future" (Producer),
//                  "Aniwa and Wiwa, Plants" (Producer),
//                  "Aniwa and Wiwa, Humanity" (Producer),
//                  "NBC, New Amsterdam" (Talent),
//                  "FX, Fosse/Verdon" (Talent),
//                  "Marvel, Luke Cage" (Talent)
//   brands    (7): "Acuvue, On Stage", "L'OREAL PARIS, Serum",
//                  "AT&T, Big Screen Entertainment", "Clarins, Boost",
//                  "Bacardi, Gold", "Shiseido, Brightening", "Clinique, BB"
//   theatre   (0)

test.describe("FilterBar", () => {
  test("default state: only Filters and Search are visible", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("filter-bar")).toBeVisible();
    await expect(page.getByTestId("filters-button")).toBeVisible();
    await expect(page.getByTestId("search-toggle")).toBeVisible();

    await expect(page.getByTestId("filter-brands")).toHaveCount(0);
    await expect(page.getByTestId("filter-originals")).toHaveCount(0);
    await expect(page.getByTestId("filter-theatre")).toHaveCount(0);
    await expect(page.getByTestId("filter-all")).toHaveCount(0);
    await expect(page.getByTestId("search-input")).toHaveCount(0);
  });

  test("clicking Filters reveals categories with All active", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();

    await expect(page.getByTestId("filter-brands")).toBeVisible();
    await expect(page.getByTestId("filter-originals")).toBeVisible();
    await expect(page.getByTestId("filter-theatre")).toBeVisible();
    await expect(page.getByTestId("filter-all")).toBeVisible();
    await expect(page.getByTestId("filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Filters button toggles closed and resets to All", async ({ page }) => {
    await page.goto("/?category=originals");
    await expect(page.getByTestId("filter-originals")).toBeVisible();
    await expect(page.getByTestId("filter-originals")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("filters-button").click();
    await expect(page.getByTestId("filter-originals")).toHaveCount(0);
    await expect(page).not.toHaveURL(/category=/);
  });

  test("Originals filter shows originals entries, hides brands", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-originals").click();
    await expect(page).toHaveURL(/category=originals/);

    await expect(
      page.getByRole("heading", { name: "A Dream Village" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }).first(),
    ).toBeVisible();
    // Brands entries should be hidden.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Shiseido" })).toHaveCount(
      0,
    );
  });

  test("Brands filter hides originals entries", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-brands").click();

    await expect(
      page.getByRole("heading", { name: "Acuvue" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Bacardi" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }),
    ).toHaveCount(0);
  });

  test("Theatre filter hides every row (Theatre is empty)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-theatre").click();
    await expect(page).toHaveURL(/category=theatre/);

    // Sample a few names from each populated category — none should be
    // visible since Theatre has no entries yet.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);
  });

  test("search reveals input and filters by name immediately (no debounce)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    const input = page.getByTestId("search-input");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    await input.fill("acuvue");
    await expect(page).toHaveURL(/q=acuvue/);

    await expect(
      page.getByRole("heading", { name: "Acuvue" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Bacardi" })).toHaveCount(0);
  });

  test("search updates URL via replaceState (no history entries per keystroke)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    const input = page.getByTestId("search-input");
    await input.fill("acuvue");
    await expect(page).toHaveURL(/q=acuvue/);

    await page.goBack();
    await expect(page).toHaveURL(/^[^?]*\/?$/);
  });

  test("search closes and clears the query on second click", async ({
    page,
  }) => {
    await page.goto("/?q=acuvue");
    const input = page.getByTestId("search-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("acuvue");

    await page.getByTestId("search-toggle").click();
    await expect(page.getByTestId("search-input")).toHaveCount(0);
    await expect(page).not.toHaveURL(/q=/);
  });

  test("typing in search auto-switches grid → list, clearing restores grid", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/view=/);

    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("acuvue");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-input").fill("");
    await expect(page).not.toHaveURL(/view=list/);
  });

  test("if list was active before typing, search keeps list and stays on list after clearing", async ({
    page,
  }) => {
    await page.goto("/?view=list");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("acuvue");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-input").fill("");
    await expect(page).toHaveURL(/view=list/);
  });

  test("search by role: 'talent' matches Talent-role videos, 'producer' matches Producer-role videos", async ({
    page,
  }) => {
    // Talent role: all 7 brands rows + NBC/FX/Marvel originals.
    await page.goto("/?view=list&q=talent");
    await expect(
      page.getByRole("heading", { name: "Acuvue" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Shiseido" }).first(),
    ).toBeVisible();
    // Reforest A Dream Village is Producer — its haystack has no "talent".
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);

    // Producer role: 4 originals (Reforest x2, Aniwa x2).
    await page.goto("/?view=list&q=producer");
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Aniwa and Wiwa" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
  });

  test("search by category label: 'originals' matches every originals entry", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=originals");
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
  });

  test("multi-token AND: 'bacardi talent' matches Bacardi, hides others", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=bacardi talent");
    await expect(
      page.getByRole("heading", { name: "Bacardi" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);
  });

  test("multi-token AND: 'reforest originals' restricts to Reforest originals", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=reforest originals");
    // Two Reforest originals: A Dream Village + Tending the Future. Both
    // names contain "Reforest" and the originals category label matches the
    // second token.
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }),
    ).toHaveCount(1);
    // Aniwa entries are also originals but don't contain "Reforest".
    await expect(
      page.getByRole("heading", { name: "Aniwa and Wiwa" }),
    ).toHaveCount(0);
    // Brands entries hidden.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
  });

  test("URL state seeds both panels: ?category=brands&q=acuvue", async ({
    page,
  }) => {
    await page.goto("/?category=brands&q=acuvue");

    await expect(page.getByTestId("filter-brands")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("search-input")).toHaveValue("acuvue");

    // Exactly one Acuvue video; the second loop copy is aria-hidden so
    // accessibility queries only count one.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Bacardi" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);
  });
});
