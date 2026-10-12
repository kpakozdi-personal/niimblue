import { defineConfig } from "@playwright/test";

const PORT = 4173;
const preview = `npm run preview -- --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // Phase 2 adds a `react` project that sets E2E_ENTRY=/react.html.
  projects: [{ name: "svelte", use: { browserName: "chromium" } }],
  webServer: {
    // CI builds in the check job before this runs; locally build first.
    command: process.env.CI ? preview : `npm run build && ${preview}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
