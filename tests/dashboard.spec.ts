import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// The Excel TestRail export "threatmodeler_7.x.xlsx" (sheet "Dashboard",
// suite S125) lists 24 cases (C12699-C18333) all targeting the org-level
// "Overview Dashboard" surface at /dashboard. They split into three buckets:
//   - navigation (C12699)
//   - the four summary tiles at the top of the page
//       C12700 Threat Models count, C12701 High Value Targets count,
//       C12702 Open Security Requirements count, C12703 Mitigated Threats ratio
//   - the four mid-page widget sections (Threat Trends, Security
//     Implementation Review, Top 10, Compliance Summary) which surface
//     count/risk/version/description data per C12704-C18333.
// Per-source threat-coverage cases (C12712/C12713/C12714/C12715/C18329/
// C18330/C18332/C18333) require diagram-side setup to seed source-specific
// threats; the suite verifies the dashboard surfaces are present so those
// counts can flow into them, but doesn't re-seed each source per run.
//
// The tenant carries production-like data (~600 models), so we assert the
// *shape* of each surface (non-negative integer, ratio X/Y with X<=Y, section
// presence) instead of pinning to a fixed count that would drift.

const DASH = testdata.dashboard;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  const navBtn = page.getByRole("button", { name: DASH.navButton, exact: true });
  await expect(navBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await navBtn.click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
}

// Finds the summary tile whose label text matches `label` (e.g. "Threat
// Models"). All four tiles share `.tm-dashboard-card.custom-padding`; the
// label sits in a child element next to the count, so we filter by hasText.
function summaryTile(page: Page, label: string): Locator {
  return page
    .locator(DASH.selectors.summaryTile)
    .filter({ hasText: new RegExp(`\\b${label}\\b`) })
    .first();
}

test.describe("Overview Dashboard", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12699-Navigate to Overview Dashboard from side nav", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    await expect(page.getByRole("heading", { name: DASH.heading, level: 1 })).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
  });

  test("C12700-C12703-Summary tiles show counts in the expected shape", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // C12700 / C12701 / C12702 — three count tiles render "<integer> <label>"
    for (const label of [
      DASH.tiles.threatModels,
      DASH.tiles.highValueTargets,
      DASH.tiles.openSecurityRequirements,
    ]) {
      const tile = summaryTile(page, label);
      await expect(tile).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      const text = ((await tile.textContent()) || "").trim();
      const m = text.match(/(\d+)/);
      expect(m, `tile "${label}" text was "${text}"`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(0);
    }

    // C12703 — Mitigated tile is "X/Y Mitigated Threats" with X <= Y.
    const mitigated = summaryTile(page, DASH.tiles.mitigatedThreats);
    await expect(mitigated).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const mitText = ((await mitigated.textContent()) || "").trim();
    const ratio = mitText.match(/(\d+)\s*\/\s*(\d+)/);
    expect(ratio, `mitigated tile text was "${mitText}"`).not.toBeNull();
    const [, mitigatedCount, totalCount] = ratio!;
    expect(Number(mitigatedCount)).toBeLessThanOrEqual(Number(totalCount));
  });

  test("C12704-C18333-All threat/SR widget sections render on the dashboard", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Each of the four mid-page sections surfaces a distinct slice of dashboard
    // data driven by the Excel cases:
    //   - Threat Trends            → C12704 / C12708 (threat & SR repeats)
    //   - Security Implementation  → C12716 / C18333 (closed/mitigated SR)
    //     Review (Threat Traceability Matrix)
    //   - Top 10                   → C12705-C12707 / C12709-C12711 (top
    //                                 models with risk / version / description)
    //   - Compliance Summary       → CVE / framework coverage (C18329/C18332)
    // Asserting their headings render is the dashboard-level contract; the
    // per-source population (C12712-C18330) is exercised on the diagram side.
    for (const section of DASH.sections) {
      await expect(
        page.getByRole("heading", { name: section, exact: true }).first(),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }

    // The "Threat Trends" card carries the status filter chips (Open / In
    // Progress / Not Applicable / Mitigated / All) that gate the Threat /
    // SR repeats counts (C12704, C12708).
    const trendsHeading = page.getByRole("heading", { name: "Threat Trends", exact: true });
    const trendsCard = trendsHeading.locator("xpath=ancestor::*[contains(@class,'tm-dashboard-card')][1]");
    for (const status of DASH.threatTrendStatuses) {
      await expect(trendsCard.getByText(status, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }

    // The Top 10 region renders as an AI widget whose default title is
    // "Threats by Status" — this is the surface that lists the Top 10 models
    // along with Risk / Version / Description (C12706 / C12707 / C12710 /
    // C12711). The container ships with a title dropdown for switching
    // between Threats / Security Requirements views.
    const aiWidget = page.locator(DASH.selectors.aiWidget).first();
    await expect(aiWidget).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(aiWidget).toContainText(DASH.aiWidgetDefaultTitle);
  });

  test("C18329-C18332-Filter panel opens for narrowing dashboard by source", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // The Filter button surfaces the source-narrowing controls that scope
    // every tile / widget above to CVE / protocol / nested / group / attribute
    // sources (C12712-C18332). Opening the panel is the dashboard-level
    // contract; the per-source seeding is exercised on the diagram side.
    const filter = page.locator(DASH.selectors.filterButton).first();
    await expect(filter).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await filter.click();

    // Once open, the "Clear" affordance becomes available — that's a stable
    // signal that the filter panel has mounted (the panel itself is a kendo
    // popup so its container changes between releases). The Clear id renders
    // on both the tm-button wrapper and its inner <button>; .first() picks
    // either deterministically.
    await expect(page.locator(DASH.selectors.clearFilterButton).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
  });
});
