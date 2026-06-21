import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness — runs the dev server against the nutritional_test database
 * (a template clone of the prod copy) with auth bypassed.
 *
 * Single worker, no parallelism: journeys share one database and mutate
 * reserved E2E dates/records.
 */
const TEST_DATABASE_URL =
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "**/setup/**",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // both projects share one DB — wipe E2E residue before the mobile pass
      // (solo mobile runs: use --project=mobile --no-deps after a manual reset,
      // or just let the dependency chain run desktop first)
      name: "reset-between-projects",
      testMatch: "**/setup/reset.setup.ts",
      dependencies: ["desktop"],
    },
    {
      name: "mobile",
      testIgnore: "**/setup/**",
      dependencies: ["reset-between-projects"],
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100/foods",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_DISABLED: "true",
      AUTH_SECRET: "e2e-only-secret-0123456789",
      AUTH_GOOGLE_ID: "dummy",
      AUTH_GOOGLE_SECRET: "dummy",
      AUTH_URL: "http://localhost:3100",
      AUTH_TRUST_HOST: "true",
      AUTHORIZED_EMAILS: "e2e@example.com",
      // The user the AUTH_DISABLED bypass resolves to (and shows in the account menu).
      TEST_USER_EMAIL: "e2e@example.com",
    },
  },
});
