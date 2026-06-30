// TestRail Case: C13562
// Section: Threat Models Screen
// Title: Login to the System and Check if it navigates to Threat Model Summary
//
// Live-verified via Playwright MCP on 2026-06-30:
//   1. Navigate to /threatmodels -> redirects to /idsvr/Account/Login
//   2. Fill Username + Password, click Sign in
//   3. After SSO callback, page lands on /threatmodels with
//      title "Threat Models | ThreatModeler Nexus", h1 "Threat Models",
//      and the grid root #threat-models mounts with column headers
//      Version / Risk / Status / Author / Modified.

import { test, expect, type Page } from "@playwright/test";
// @ts-ignore -- helpers.js is CommonJS
import { TIMEOUTS, login, dismissPostLoginOverlays, waitForLoaderIdle } from "../lib/helpers";
import testdata from "../data/testdata.json";

const TM = testdata.threatModelsScreen;

test.describe("Threat Models Screen", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C13562 - Login to the System and Check if it navigates to Threat Model Summary", async ({ page }: { page: Page }) => {
    // Step 1: Sign in (covers the "Login to the System" precondition).
    await login(page);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page).catch(() => {});

    // Step 2: assert the post-login landing is the Threat Models screen.
    await expect(page).toHaveURL(/\/threatmodels(\?|$|\/)/, {
      timeout: TIMEOUTS.navMedium,
    });
    await expect(page).toHaveTitle(/Threat Models \| ThreatModeler/, {
      timeout: TIMEOUTS.navMedium,
    });
    await expect(page.getByRole("heading", { level: 1, name: "Threat Models" })).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });

    // Step 3: the grid root mounts (Threat Models Summary).
    await expect(page.locator(TM.selectors.gridRoot)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });

    // Step 4: documented column headers render (Name has no .k-column-title
    // span on this tenant, so we assert the other documented columns).
    const titles = await page.locator(TM.selectors.columnTitle).allTextContents();
    const unique: string[] = [];
    for (const t of titles.map((s) => s.trim()).filter(Boolean)) {
      if (unique[unique.length - 1] !== t) unique.push(t);
    }
    for (const col of TM.expectedColumns.filter((c: string) => c !== "Name")) {
      expect(unique).toContain(col);
    }
  });
});
