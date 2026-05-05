import { expect, test } from "@playwright/test";

// Proves the admin storageState is also inherited by the `request` fixture,
// which is what the items-3 / item-5 API tests need (z.enum coverage,
// shared requireAdmin() error contracts).
test.describe("admin fixture — API", () => {
  test("GET /api/videos returns the dashboard list", async ({ request }) => {
    const res = await request.get("/api/videos");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { videos: unknown[] };
    expect(Array.isArray(body.videos)).toBe(true);
  });

  test("POST /api/videos with a malformed body returns 400", async ({
    request,
  }) => {
    // Authed, but the schema rejects this. Confirms requireAdmin() let us
    // through and Zod is what's gating the body — not auth.
    const res = await request.post("/api/videos", {
      data: { url: "not-a-url", name: "", category: "music", role: "Talent" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_body");
  });
});
