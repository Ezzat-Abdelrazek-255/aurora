import { defineConfig, devices } from "@playwright/test";

const ADMIN_STORAGE_STATE = "tests/e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    // Anonymous-context tests. The existing FilterBar suite lives here; we
    // exclude the admin/ folder so those don't try to hit /dashboard without
    // cookies.
    {
      name: "public",
      testIgnore: /admin\//,
      use: { ...devices["Desktop Chrome"] },
    },
    // One-shot login that writes storageState to disk. The `admin` project
    // depends on this, so Playwright runs it first and skips the rest of the
    // admin suite if login fails.
    {
      name: "setup-admin",
      testMatch: /admin\/auth\.setup\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts$/,
      dependencies: ["setup-admin"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: ADMIN_STORAGE_STATE,
      },
    },
  ],
});
