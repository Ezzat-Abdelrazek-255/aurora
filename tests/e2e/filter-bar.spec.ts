import { expect, test } from "@playwright/test";

// Filtering is now client-side: URL updates via history.replaceState, the DOM
// keeps every card mounted, and non-matching cards are hidden via display:none.
// Playwright's getByRole excludes display:none nodes by default, so toHaveCount
// reflects what the user actually sees.

test.describe("FilterBar", () => {
  test("default state: only Filters and Search are visible", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("filter-bar")).toBeVisible();
    await expect(page.getByTestId("filters-button")).toBeVisible();
    await expect(page.getByTestId("search-toggle")).toBeVisible();

    await expect(page.getByTestId("filter-film-tv")).toHaveCount(0);
    await expect(page.getByTestId("filter-commercial")).toHaveCount(0);
    await expect(page.getByTestId("filter-music")).toHaveCount(0);
    await expect(page.getByTestId("filter-all")).toHaveCount(0);
    await expect(page.getByTestId("search-input")).toHaveCount(0);
  });

  test("clicking Filters reveals categories with All active", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();

    await expect(page.getByTestId("filter-film-tv")).toBeVisible();
    await expect(page.getByTestId("filter-commercial")).toBeVisible();
    await expect(page.getByTestId("filter-music")).toBeVisible();
    await expect(page.getByTestId("filter-all")).toBeVisible();
    await expect(page.getByTestId("filter-all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Filters button toggles closed and resets to All", async ({ page }) => {
    await page.goto("/?category=music");
    await expect(page.getByTestId("filter-music")).toBeVisible();
    await expect(page.getByTestId("filter-music")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("filters-button").click();
    await expect(page.getByTestId("filter-music")).toHaveCount(0);
    await expect(page).not.toHaveURL(/category=/);
  });

  test("Music filter shows only the music entry, hides commercials", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-music").click();
    await expect(page).toHaveURL(/category=music/);

    // The only music entry is "Like Sugar".
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }).first(),
    ).toBeVisible();
    // Commercial-only names should be hidden.
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Nike" })).toHaveCount(0);
  });

  test("Film/TV filter shows only Tokyo Olympics", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-film-tv").click();

    await expect(
      page.getByRole("heading", { name: "Tokyo Olympics" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
  });

  test("Commercials filter hides music and film/tv entries", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-commercial").click();

    await expect(
      page.getByRole("heading", { name: "Apple" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", { name: "Tokyo Olympics" }),
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

    await input.fill("nike");
    await expect(page).toHaveURL(/q=nike/);

    // Apple cards are hidden, Nike cards visible.
    await expect(
      page.getByRole("heading", { name: "Nike" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
  });

  test("search updates URL via replaceState (no history entries per keystroke)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("search-toggle").click();
    const input = page.getByTestId("search-input");
    await input.fill("nike");
    await expect(page).toHaveURL(/q=nike/);

    // One keystroke = at most one history entry. Going back should leave the
    // /-with-no-q state, not an intermediate "q=n" or "q=ni".
    await page.goBack();
    await expect(page).toHaveURL(/^[^?]*\/?$/);
  });

  test("search closes and clears the query on second click", async ({
    page,
  }) => {
    await page.goto("/?q=nike");
    const input = page.getByTestId("search-input");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("nike");

    await page.getByTestId("search-toggle").click();
    await expect(page.getByTestId("search-input")).toHaveCount(0);
    await expect(page).not.toHaveURL(/q=/);
  });

  test("typing in search auto-switches grid → list, clearing restores grid", async ({
    page,
  }) => {
    await page.goto("/");
    // Default is grid (no view param).
    await expect(page).not.toHaveURL(/view=/);

    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("nike");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-input").fill("");
    // Cleared but search input still open. URL view param should drop.
    await expect(page).not.toHaveURL(/view=list/);
  });

  test("if list was active before typing, search keeps list and stays on list after clearing", async ({
    page,
  }) => {
    await page.goto("/?view=list");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("nike");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-input").fill("");
    // Still list — we only auto-restore when the snapshot was grid.
    await expect(page).toHaveURL(/view=list/);
  });

  test("search by role: 'talent' matches every video, 'producer' matches none", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=talent");
    // All 14 videos are role:Talent — every name should be present.
    await expect(
      page.getByRole("heading", { name: "Apple" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tokyo Olympics" }).first(),
    ).toBeVisible();

    // No producer entries in the dataset.
    await page.goto("/?view=list&q=producer");
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Nike" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }),
    ).toHaveCount(0);
  });

  test("search by category label: 'music' matches the music entry", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=music");
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
  });

  test("multi-token AND: 'nike talent' matches Nike, hides Apple", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=nike talent");
    await expect(
      page.getByRole("heading", { name: "Nike" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }),
    ).toHaveCount(0);
  });

  test("multi-token AND: 'apple commercial' restricts to Apple commercials", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=apple commercial");
    // 3 Apple commercial entries, all with name "Apple".
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(3);
    // Different brand commercials shouldn't show even though they're commercials.
    await expect(page.getByRole("heading", { name: "Nike" })).toHaveCount(0);
  });

  test("URL state seeds both panels: ?category=commercial&q=apple", async ({
    page,
  }) => {
    await page.goto("/?category=commercial&q=apple");

    await expect(page.getByTestId("filter-commercial")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("search-input")).toHaveValue("apple");

    // The grid renders two copies for seamless wrap; the second is
    // aria-hidden, so accessibility queries only see one. 3 Apple commercials.
    await expect(page.getByRole("heading", { name: "Apple" })).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "Nike" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
  });
});
