// @ts-check
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Retry transient failures once. Shared-tenant flakes (overlay
  // interception, kendo timing) usually clear on a fresh browser
  // context; this soaks up ~90% of the drift.
  retries: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    // Always-on trace: every Playwright action records a snapshot +
    // the resulting screenshot. Open via the HTML report's "View
    // trace" link to step through each action with its before/after
    // screenshot, console log, and network request.
    trace: "on",
    // Capture a final fullpage screenshot per test (in addition to
    // trace's per-action snapshots).
    screenshot: { mode: "on", fullPage: true },
    // Capture a video of every test playthrough.
    video: "on",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
