import { defineConfig } from "@playwright/test";

// These E2E tests deliberately avoid depending on a real Supabase project
// or geocoding API key (none exist in this environment) -- they exercise
// page rendering, the DEMO flow's static content, and the proxy.ts
// auth-gate/redirect behavior, which is exactly what caught the
// /admin/login infinite-redirect bug fixed in src/proxy.ts. Anything that
// needs real designation/geocoding data is covered instead by the DB
// integration tests in tests/db/ (which run against a real
// PostgreSQL+PostGIS instance) and the unit tests in tests/unit/.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100",
    trace: "retain-on-failure",
    // This sandbox pre-installs one pinned Chromium revision at a fixed
    // path, which doesn't always match whatever revision the installed
    // @playwright/test version would try to download (and downloads are
    // blocked here anyway) -- point directly at the preinstalled binary
    // instead of letting Playwright resolve/download its expected one.
    launchOptions: {
      executablePath: process.env.BROWSER_EXECUTABLE,
    },
  },
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9999",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key-for-e2e-tests",
    },
  },
});
