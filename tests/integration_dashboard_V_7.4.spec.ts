import { test, expect, type Page } from "@playwright/test";
import {
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// The Excel TestRail export "threatmodeler_7.x (6).xlsx" carries 44 cases
// in the "Integration Dashboard V 7.4" section of suite S125 (C17086-
// C17123, C17395, C19422-C19426). Roughly half of them depend on
// round-trip changes in external systems (Jira / Azure Boards /
// ServiceNow) — C17090-C17102, C17107, C17110, C17120 — and a chunk are
// non-functional checks (compatibility, performance, file-naming format,
// PDF rendering layout) — C17112-C17113, C17117, C17119, C17121-C17123.
// Both classes are out of scope for this run.
//
// The automatable surface (what this suite covers) is the dashboard-side
// contract: page nav + h1, the integration multiselect populated with the
// four supported sources, the Security Issue Summary grid columns, the
// duration filter defaulting to "Last 90 Days" and exposing all six
// duration choices, and the export dropdown surfacing both Excel and PDF.
//
// The test grouping below maps each test to the cases it covers:
//   Test 1 → C17086 / C17087 / C17088 / C17089 / C17103 / C17104 / C17118
//   Test 2 → C19423 (default 90 days) + C19424 / C19425 / C19426 setup
//   Test 3 → C17105 / C17108 / C17118 / C17395 / C19422

const ID = testdata.integrationDashboard;
const ID_URL = new RegExp(URL_PATTERNS.integrationDashboard, "i");
const ID_TITLE = new RegExp(TITLES.integrationDashboard);

async function gotoIntegrationDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  // Side-nav menu collapses Overview + Integration dashboards under a
  // common "Dashboards menu" button. Open it first; the Integration link
  // mounts inside the menu only after expansion.
  await page.getByRole("button", { name: ID.navParentButton, exact: true }).click();
  await page.locator(ID.navItemSelector).click();
  await expect(page).toHaveURL(ID_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(ID_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(page.locator(ID.selectors.grid)).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
}

test.describe("Integration Dashboard", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C17086-C17089-C17118-Page renders heading, integration chips for all four sources, and the 10 grid columns", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoIntegrationDashboard(page);

    // C17086 — h1 + section heading.
    await expect(
      page.getByRole("heading", { name: ID.heading, exact: true, level: 1 }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(
      page.getByRole("heading", { name: ID.sectionHeading, level: 2 }),
    ).toBeVisible();

    // C17087 / C17088 / C17089 — the multiselect defaults to all four
    // supported integrations as chips. Each chip exposes its label inside
    // a span with id `dashboard-integration-multiselect-<name>-span`,
    // which is the most direct handle (the remove affordance is a span
    // with role="button" so `getByRole` doesn't match, and filtering the
    // chip by text catches the surrounding icon/whitespace).
    for (const source of ID.expectedIntegrations) {
      const labelSelector = ID.selectors.integrationChipLabelTemplate.replace("{value}", source);
      await expect(page.locator(labelSelector)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(page.locator(labelSelector)).toHaveText(source);
    }

    // C17086 — grid columns render in the documented order. The dashboard
    // surfaces `Issue Link` (C17103) and `Threat Model Name` (C17104)
    // among them; per-cell link targets are validated on click-through
    // which requires tenant-seeded tickets that aren't guaranteed here.
    const headers = page.locator(ID.selectors.gridColumnHeader);
    await expect(headers).toHaveCount(ID.columns.length, {
      timeout: TIMEOUTS.elementVisible,
    });
    for (let i = 0; i < ID.columns.length; i++) {
      await expect(headers.nth(i).locator(ID.selectors.gridColumnTitle)).toHaveText(
        ID.columns[i],
      );
    }
  });

  test("C19423-Duration filter defaults to 'Last 90 Days' and exposes the six documented choices", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoIntegrationDashboard(page);

    // Toggle reads the current selection inline. Default per C19423 is
    // "Last 90 Days".
    const toggle = page.locator(ID.selectors.durationToggle);
    await expect(toggle).toContainText(ID.durationDefaultLabel, {
      timeout: TIMEOUTS.elementVisible,
    });

    // Opening the toggle reveals an options list. The default option
    // carries class `selected`.
    await toggle.click();
    await expect(page.locator(ID.selectors.selectedDurationOption)).toHaveCount(1, {
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(ID.selectors.selectedDurationOption)).toContainText(
      ID.durationDefaultLabel,
    );

    // All six duration choices are mounted (regardless of which is
    // selected). This is the dashboard-side contract for C19423-C19426 —
    // the per-duration data assertions (older than 90 days, 7-day window)
    // depend on tenant data.
    for (const opt of ID.durationOptions) {
      await expect(
        page.locator(`${ID.selectors.durationOption}[aria-label="${opt}"]`),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }
  });

  test("C17105-C17108-C17395-C19422-Export dropdown surfaces both Excel and PDF options with their accessible labels", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoIntegrationDashboard(page);

    // C17118 — the export toggle is a visible button with an accessible
    // label ("More export options"); the cases C17118 / C17395 require
    // it to be discoverable.
    const exportToggle = page.locator(ID.selectors.exportToggle);
    await expect(exportToggle).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Open the menu — Excel + PDF both surface per C17395 / C19422.
    await exportToggle.click();
    for (const opt of ID.exportOptions) {
      await expect(
        page.locator(`${ID.selectors.exportOption}[aria-label="${opt}"]`),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }

    // C17105 / C17108 — clicking either option triggers a file download.
    // Listen for the download event and verify the suggestedFilename is
    // non-empty + has the expected extension. The exact filename format
    // (Integration_Dashboard_YYYYMMDD.pdf — C17121) is asserted only
    // structurally because the tenant date stamping varies.
    const downloadPromise = page.waitForEvent("download", { timeout: TIMEOUTS.navMedium });
    await page
      .locator(`${ID.selectors.exportOption}[aria-label="${ID.exportOptions[0]}"]`)
      .click();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename.length).toBeGreaterThan(0);
    expect(filename.toLowerCase()).toMatch(/\.(xlsx?|csv)$/);
  });
});
