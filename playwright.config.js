// @ts-check
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    screenshot: { mode: "on", fullPage: true },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
