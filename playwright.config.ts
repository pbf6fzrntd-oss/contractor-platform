import { defineConfig, devices } from "@playwright/test";

/**
 * Click-through tests: a real browser driving the real app.
 * Needs the app running with a database (see README → "Click-through tests").
 *   E2E_BASE_URL   where the app runs (default http://localhost:3000)
 *   CHROMIUM_PATH  optional: an already-installed Chromium to use
 * The app must have DEMO_MODE=on (the tests start their own demo businesses).
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
});
