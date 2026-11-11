import { defineConfig, devices } from "@playwright/test";

// Expects the dev server on :3100 (`npm run dev`). Uses the local D1 database in .wrangler/state.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", ...devices["Desktop Chrome"] },
});
