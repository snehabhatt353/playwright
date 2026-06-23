import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// The Excel TestRail export "threatmodeler_7.x (5).xlsx" carries 10 cases
// in the "Top 10" section of suite S125 (C12690-C12695 + C19495-C19498).
// All target the Top 10 widget at the bottom of the Overview Dashboard:
//   - Top Ten Threats:           C12692 / C12694 (counts) / C12695 (risk)
//                                 + C12693 (Open status — see notes below)
//   - Top Ten Security Reqs:     C12690 / C12691
//   - Top Ten Components:        C19495 / C19496
//                                 + C19497 / C19498 (drill-in details)
//
// The widget is a 3-tab list (`Threats` / `Security Requirements` /
// `Components`) rendered as a ngb-nav. Each panel mounts a `ul.list-group`
// with exactly 10 `li.list-group-item` rows sorted DESC by count. Threat
// rows additionally carry a risk pill; SR / Component rows surface only
// name + count (model-side risk / version / description live on a drill-
// in portfolio that isn't currently linked from this panel — C19497 /
// C19498 / C12693 noted but out of scope here).

const TT = testdata.topTen;
const DASH = testdata.dashboard;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  await page.getByRole("button", { name: DASH.navButton, exact: true }).click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(
    page.getByRole("heading", { name: TT.heading, exact: true }).first(),
  ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
}

// Switches to the named tab and waits for its panel to mount. The Threats
// tab is active by default; switching SR / Components fires a fresh data
// fetch which can take a moment to settle.
async function activateTab(
  page: Page,
  tab: { tabId: string; panelId: string; label: string },
): Promise<Locator> {
  // Skip the click if already active — saves a fetch and avoids racing the
  // ngb-nav state machine.
  const tabEl = page.locator(tab.tabId);
  const selected = await tabEl.getAttribute("aria-selected");
  if (selected !== "true") {
    await tabEl.click();
    await expect(tabEl).toHaveAttribute("aria-selected", "true", {
      timeout: TIMEOUTS.elementVisible,
    });
  }
  const panel = page.locator(tab.panelId);
  await expect(panel).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  // First list-item must mount before we read rows — the panel paints its
  // shell before the backend list lands.
  await expect(panel.locator(TT.selectors.listItem).first()).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
  return panel;
}

// Returns the counts (as numbers) of every row in the panel, in document
// order. Top 10 is ranked DESC by count, so callers assert non-increasing.
async function rowCounts(panel: Locator): Promise<number[]> {
  const texts = await panel.locator(TT.selectors.rowCount).allTextContents();
  return texts.map((t) => Number(t.trim()));
}

test.describe("Top 10 widget", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12692-C12694-C12695-Top 10 Threats lists 10 rows with name + risk + descending counts", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const panel = await activateTab(page, TT.tabs.threats);

    // C12692 — exactly 10 rows render in the Threats panel.
    const rows = panel.locator(TT.selectors.listItem);
    await expect(rows).toHaveCount(TT.expectedRowCount, {
      timeout: TIMEOUTS.elementVisible,
    });

    // C12692 / C12694 — every row carries a non-empty name and a numeric
    // count, and counts are ranked DESC (Top 10 sort contract).
    const counts = await rowCounts(panel);
    expect(counts).toHaveLength(TT.expectedRowCount);
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c)).toBe(true);
    }
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }

    // C12695 — every threat row's risk pill text is one of the documented
    // five Risk levels. Risk pill is unique to the Threats panel; SR /
    // Component panels don't render it.
    const riskTexts = await panel.locator(TT.selectors.rowRiskPill).allTextContents();
    expect(riskTexts).toHaveLength(TT.expectedRowCount);
    for (const r of riskTexts) {
      expect(TT.validRisks).toContain(r.trim());
    }

    // Names exist and are non-empty.
    const names = await panel.locator(TT.selectors.rowName).allTextContents();
    expect(names).toHaveLength(TT.expectedRowCount);
    for (const n of names) {
      expect(n.trim().length).toBeGreaterThan(0);
    }
  });

  test("C12690-C12691-Top 10 Security Requirements lists 10 rows with name + descending counts", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const panel = await activateTab(page, TT.tabs.securityRequirements);

    const rows = panel.locator(TT.selectors.listItem);
    await expect(rows).toHaveCount(TT.expectedRowCount, {
      timeout: TIMEOUTS.elementVisible,
    });

    // C12691 — every row carries a numeric count, ranked DESC.
    const counts = await rowCounts(panel);
    expect(counts).toHaveLength(TT.expectedRowCount);
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c)).toBe(true);
    }
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }

    // C12690 — names are present and non-empty.
    const names = await panel.locator(TT.selectors.rowName).allTextContents();
    expect(names).toHaveLength(TT.expectedRowCount);
    for (const n of names) {
      expect(n.trim().length).toBeGreaterThan(0);
    }

    // SR panel doesn't carry the risk pill — guard against accidental copy
    // from the Threats panel.
    expect(await panel.locator(TT.selectors.rowRiskPill).count()).toBe(0);
  });

  test("C19495-C19496-Top 10 Components lists 10 rows with name + descending counts", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const panel = await activateTab(page, TT.tabs.components);

    const rows = panel.locator(TT.selectors.listItem);
    await expect(rows).toHaveCount(TT.expectedRowCount, {
      timeout: TIMEOUTS.elementVisible,
    });

    // C19495 / C19496 — Total Component Repeats (the count) is correct in
    // shape: non-negative integer per row, list ranked DESC.
    const counts = await rowCounts(panel);
    expect(counts).toHaveLength(TT.expectedRowCount);
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c)).toBe(true);
    }
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }

    const names = await panel.locator(TT.selectors.rowName).allTextContents();
    expect(names).toHaveLength(TT.expectedRowCount);
    for (const n of names) {
      expect(n.trim().length).toBeGreaterThan(0);
    }

    expect(await panel.locator(TT.selectors.rowRiskPill).count()).toBe(0);
  });
});
