import { expect, test } from "@playwright/test";

// Filtering is now client-side: URL updates via history.replaceState, the DOM
// keeps every card mounted, and non-matching cards are hidden via display:none.
// Playwright's getByRole excludes display:none nodes by default, so toHaveCount
// reflects what the user actually sees.
//
// Reference data (read from /api/videos at the time of writing — keep in sync
// if the dataset changes):
//   film-tv     (2): "Reforest Films, A Dream Village" (Producer),
//                    "Shiseido" (Talent)
//   music       (1): "Like Sugar" (Talent)
//   commercial (11): "Acuvue", "Bacardi", "Clarins", "Clinique",
//                    "FX, Fosse/Verdon", "Luke Cage", "L'OREAL PARIS",
//                    "AT&T, Talent", "NBC, New Amsterdam Scene 1",
//                    "Reforest Films, Tending the Future" (Producer),
//                    "Reforest Films, Aniwa and Wiwa - Plants" (Producer)

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
    // Commercial / film-tv names should be hidden.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Shiseido" })).toHaveCount(
      0,
    );
  });

  test("Film/TV filter shows the film/tv entries", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filter-film-tv").click();

    // Two film/tv entries: "Shiseido" and "Reforest Films, A Dream Village".
    await expect(
      page.getByRole("heading", { name: "Shiseido" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
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
      page.getByRole("heading", { name: "Acuvue" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("heading", { name: "Shiseido" })).toHaveCount(
      0,
    );
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

    // Acuvue card visible, Bacardi hidden.
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

    // One keystroke = at most one history entry. Going back should leave the
    // /-with-no-q state, not an intermediate "q=a" or "q=ac".
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
    // Default is grid (no view param).
    await expect(page).not.toHaveURL(/view=/);

    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("acuvue");
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
    await page.getByTestId("search-input").fill("acuvue");
    await expect(page).toHaveURL(/view=list/);

    await page.getByTestId("search-input").fill("");
    // Still list — we only auto-restore when the snapshot was grid.
    await expect(page).toHaveURL(/view=list/);
  });

  test("search by role: 'talent' matches Talent-role videos, 'producer' matches Producer-role videos", async ({
    page,
  }) => {
    // Talent role is the majority. Sample a couple of Talent-only names.
    await page.goto("/?view=list&q=talent");
    await expect(
      page.getByRole("heading", { name: "Acuvue" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Shiseido" }).first(),
    ).toBeVisible();
    // The film-tv Producer entry has no "talent" anywhere in its haystack
    // (name + role + category-label) — hidden.
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);

    // Three Reforest entries are Producer-role; "producer" should match those.
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
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
  });

  test("search by category label: 'music' matches the music entry", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=music");
    await expect(
      page.getByRole("heading", { name: "Like Sugar" }).first(),
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
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
  });

  test("multi-token AND: 'reforest commercial' restricts to Reforest commercials", async ({
    page,
  }) => {
    await page.goto("/?view=list&q=reforest commercial");
    // Two Reforest commercials match; the Reforest film-tv entry is excluded
    // because its category label is "Film/TV", not "Commercials".
    await expect(
      page.getByRole("heading", { name: "Tending the Future" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Aniwa and Wiwa" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "A Dream Village" }),
    ).toHaveCount(0);
    // Unrelated commercial brand should also be hidden.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(0);
  });

  test("URL state seeds both panels: ?category=commercial&q=acuvue", async ({
    page,
  }) => {
    await page.goto("/?category=commercial&q=acuvue");

    await expect(page.getByTestId("filter-commercial")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("search-input")).toHaveValue("acuvue");

    // Exactly one Acuvue video; the second loop copy is aria-hidden so
    // accessibility queries only count one.
    await expect(page.getByRole("heading", { name: "Acuvue" })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Bacardi" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Like Sugar" })).toHaveCount(
      0,
    );
  });
});
