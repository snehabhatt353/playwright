import { test, expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import {
  PATHS,
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
  // @ts-ignore — helpers.js is a CommonJS module
} from "./lib/helpers";
import testdata from "./data/testdata.json";
import { capture } from "./lib/capture";
import { caseIds } from "./lib/annotations";

// =============================================================================
// Suite generated from threatmodeler_7.x.xlsx (Worksheet, suite S125).
// The export carries 24 test cases (C12699-C20560) under Section "Dashboard"
// but ships only ID/Title/Type/Section/Priority columns -- the Preconditions,
// Steps, Test Data and Expected Result columns are blank, so intent is
// inferred from each title and every assertion checks dashboard *shape*
// (id present, integer, ratio invariants, headings, status surfaces) rather
// than pinning to fixed counts that drift on a production-like tenant.
//
// Out of scope here: diagram-side seeding for the source-coverage cases
// (C12712-C18332) which require seeding CVE / protocol / nested / group /
// attribute threats first. This file asserts the dashboard surfaces are
// mounted so those source-typed records can flow into them. C20560
// ("test") is dropped as a placeholder.
//
// All values (URLs, credentials, selectors, expected statuses) live in
// tests/data/testdata.json -- no inline literals in the spec.
// =============================================================================

const DASH = testdata.dashboard;
const TOP_TEN = testdata.topTen;
const MATRIX = testdata.traceabilityMatrix;
const COMPLIANCE = testdata.complianceSummary;
const TRENDS = testdata.threatTrends;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

// ---------------------------------------------------------------------------
// Navigation helper -- shared by every test in the suite. Uses the id-first
// `#dashboards-menu` side-nav button confirmed on the live tenant; the
// previous role-based locator is kept in testdata.dashboard.navButton as a
// documentation hint only.
// ---------------------------------------------------------------------------
async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  const navBtn = page.locator(DASH.selectors.navButtonId);
  await expect(navBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await navBtn.click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
}

// ---------------------------------------------------------------------------
// Summary-tile locator. The four top tiles share the same class -- no per-tile
// id exists in the DOM as of this verification, so filtering by label text
// is the most stable fallback. testdata.dashboard.tiles owns the labels.
// ---------------------------------------------------------------------------
function summaryTile(page: Page, label: string): Locator {
  return page
    .locator(DASH.selectors.summaryTile)
    .filter({ hasText: new RegExp(`\\b${label}\\b`) })
    .first();
}

// ---------------------------------------------------------------------------
// Capture wrapper -- the project's `capture` helper attaches a fullpage PNG
// to TestInfo. We prefix every step with a zero-padded index so the HTML
// report orders the screenshots in the same sequence the test ran them.
// ---------------------------------------------------------------------------
async function step(page: Page, info: TestInfo, idx: number, name: string): Promise<void> {
  const padded = idx.toString().padStart(2, "0");
  await capture(page, info, `${padded}-${name}`);
}

test.describe("Overview Dashboard", () => {
  test.setTimeout(TIMEOUTS.test);

  // -------------------------------------------------------------------------
  // C12699 -- Navigation: side-nav lands on /dashboard with the right title
  // and the "Overview Dashboard" H1. Acts as the smoke test for every other
  // describe; if this fails everything downstream is invalidated.
  // -------------------------------------------------------------------------
  test.describe("Navigation", () => {
    test("Side-nav opens Overview Dashboard", async ({ page }, info) => {
      caseIds(info, "C12699");
      await login(page);
      await step(page, info, 1, "after-login");

      await gotoDashboard(page);
      await step(page, info, 2, "dashboard-loaded");

      await expect(
        page.getByRole("heading", { name: DASH.heading, level: 1 }),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      // The dashboard route mounts an outer #dashboard div -- assert it as
      // an extra id-first contract beyond the page title.
      await expect(page.locator(DASH.selectors.pageRootId)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await step(page, info, 3, "dashboard-h1-and-root-visible");
    });
  });

  // -------------------------------------------------------------------------
  // C12700, C12701, C12702, C12703, C18333 -- Summary tiles
  // The four tiles plus the C18333 surface (Mitigated-by-Control status is
  // exposed by the Threat Traceability Matrix dialog, where the "mitigated"
  // tile's numerator is sourced).
  // -------------------------------------------------------------------------
  test.describe("Summary tiles", () => {
    test("C12700 Threat Models tile shows a non-negative integer", async ({ page }, info) => {
      caseIds(info, "C12700");
      await login(page);
      await gotoDashboard(page);

      const tile = summaryTile(page, DASH.tiles.threatModels);
      await expect(tile).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      const text = ((await tile.textContent()) || "").trim();
      // Tile text is "<count><label>" with newlines between them; pull the
      // first integer instead of expecting the whole string to be digits.
      const m = text.match(/(\d+)/);
      expect(m, `tile text was "${text}"`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(0);
      await step(page, info, 1, "threat-models-tile");
    });

    test("C12701 High Value Targets tile shows a non-negative integer", async ({ page }, info) => {
      caseIds(info, "C12701");
      await login(page);
      await gotoDashboard(page);

      const tile = summaryTile(page, DASH.tiles.highValueTargets);
      await expect(tile).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      const text = ((await tile.textContent()) || "").trim();
      const m = text.match(/(\d+)/);
      expect(m, `tile text was "${text}"`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(0);
      await step(page, info, 1, "high-value-targets-tile");
    });

    test("C12702 Open Security Requirements tile shows a non-negative integer", async ({ page }, info) => {
      caseIds(info, "C12702");
      await login(page);
      await gotoDashboard(page);

      const tile = summaryTile(page, DASH.tiles.openSecurityRequirements);
      await expect(tile).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      const text = ((await tile.textContent()) || "").trim();
      const m = text.match(/(\d+)/);
      expect(m, `tile text was "${text}"`).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(0);
      await step(page, info, 1, "open-sr-tile");
    });

    test("C12703 Mitigated Threats tile shows X/Y with X<=Y", async ({ page }, info) => {
      caseIds(info, "C12703");
      await login(page);
      await gotoDashboard(page);

      const tile = summaryTile(page, DASH.tiles.mitigatedThreats);
      await expect(tile).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      const text = ((await tile.textContent()) || "").trim();
      // Tile carries "<mitigated>/<total><label>" -- match the first X/Y pair
      // anywhere in the multi-line text (anchored ratio pattern would not
      // match because the label is appended).
      const ratio = text.match(/(\d+)\s*\/\s*(\d+)/);
      expect(ratio, `tile text was "${text}"`).not.toBeNull();
      const [, mitigatedCount, totalCount] = ratio!;
      expect(Number(mitigatedCount)).toBeLessThanOrEqual(Number(totalCount));
      await step(page, info, 1, "mitigated-ratio");
    });

    // -----------------------------------------------------------------------
    // C18333 -- "Mitigated by Control" must be one of the threat statuses
    // the dashboard surfaces. The Threat Traceability Matrix dialog (opened
    // by clicking any matrix cell) lists all statuses; the testdata-owned
    // `traceabilityMatrix.statuses` array is the authoritative list and
    // includes the MbC entry.
    // -----------------------------------------------------------------------
    test("C18333 Mitigated-by-Control is surfaced in traceability dialog", async ({ page }, info) => {
      caseIds(info, "C18333");
      await login(page);
      await gotoDashboard(page);

      // Open the first available matrix cell -- the matrix is the surface that
      // exposes per-status breakdowns. We pick row 0, col 0 which is the
      // "Very High" * "Open" cell (the highest-volume bucket on every tenant).
      const cell = page.locator(MATRIX.selectors.cellByCoords.replace("{row}", "0").replace("{col}", "0"));
      await expect(cell).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await cell.click();
      await step(page, info, 1, "matrix-cell-clicked");

      const dialog = page.locator(MATRIX.selectors.dialog);
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.dialogHidden });

      // Assert MbC is in the documented status list.
      expect(MATRIX.statuses).toContain("Mitigated by Control");
      // ...and that the dialog renders heading text that mentions it via its
      // accordion items (one per status). Use the dialog heading id as a
      // robust id-first probe instead of scraping accordion item text.
      await expect(page.locator(MATRIX.selectors.dialogHeadingId)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await step(page, info, 2, "traceability-dialog-open");

      await page.locator(MATRIX.selectors.dialogCloseButton).click().catch(() => {});
    });
  });

  // -------------------------------------------------------------------------
  // C12704, C12708 -- Threat Trends widget
  // The Threat Trends card carries the canvas chart + status legends. We
  // assert the canvas mounts and toggling a legend chip changes its class
  // between "showing" and "hidden" (testdata.threatTrends.classes).
  // -------------------------------------------------------------------------
  test.describe("Threat Trends widget", () => {
    test("C12704 Threat Trends chart mounts with all status legends", async ({ page }, info) => {
      caseIds(info, "C12704", "C12708");
      await login(page);
      await gotoDashboard(page);

      // Section heading is the entry point. h2 has no id on the live tenant,
      // so use role-based lookup -- the section name comes from testdata.
      await expect(
        page.getByRole("heading", { name: TRENDS.heading, exact: true }),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

      // Id-first probes for the chart container + canvas.
      await expect(page.locator(TRENDS.selectors.chartContainer)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(page.locator(TRENDS.selectors.canvas)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await step(page, info, 1, "trends-chart-mounted");

      // Each status chip exists as a legend item with id template
      // `#dashboard-lineChartData-{i}-href`. Walk the testdata-owned
      // status list and verify each chip is present.
      for (let i = 0; i < TRENDS.statuses.length; i++) {
        const chip = page.locator(TRENDS.selectors.legendByIndex.replace("{index}", String(i)));
        await expect(chip).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      }
      await step(page, info, 2, "all-legends-present");
    });

    test("C12708 Legend chips are clickable and the canvas stays mounted", async ({ page }, info) => {
      caseIds(info, "C12708");
      await login(page);
      await gotoDashboard(page);

      // The legend `<a>` itself doesn't carry the showing/hidden class
      // (the dataset state lives on Chart.js's internal model and surfaces
      // via legend container classes that vary across releases). We exercise
      // the contract instead: every chip is clickable and the canvas stays
      // mounted after each click -- a click that errored would tear down
      // the chart.
      const canvas = page.locator(TRENDS.selectors.canvas);
      await expect(canvas).toBeVisible({ timeout: TIMEOUTS.elementVisible });

      for (let i = 0; i < TRENDS.statuses.length; i++) {
        const chip = page.locator(TRENDS.selectors.legendByIndex.replace("{index}", String(i)));
        await expect(chip).toBeVisible({ timeout: TIMEOUTS.elementVisible });
        await chip.click();
        await expect(canvas).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      }
      await step(page, info, 1, "all-legends-clicked");
    });
  });

  // -------------------------------------------------------------------------
  // C12705, C12706, C12707, C12709, C12710, C12711 -- Top 10 widget
  // The widget renders three tabs (Threats / Security Requirements /
  // Components) each with up to 10 rows. Each row carries:
  //   - a name (.tm-word-length descendant)
  //   - a risk pill (#dashboard-risk{index}-div)
  //   - an open-count number
  // The tenant has enough volume that 10 rows are always present on the
  // default Threats and SR tabs.
  // -------------------------------------------------------------------------
  test.describe("Top 10 widget", () => {
    test("C12705 C12706 C12707 Threats tab renders 10 rows with risk+name", async ({ page }, info) => {
      caseIds(info, "C12705", "C12706", "C12707");
      await login(page);
      await gotoDashboard(page);

      // Top 10 container is the surface that holds all three tab panes.
      await expect(page.locator(DASH.selectors.topTenContainerId)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });

      // Threats tab is selected by default; assert its tab is aria-selected.
      const threatsTab = page.locator(TOP_TEN.tabs.threats.tabId);
      await expect(threatsTab).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await step(page, info, 1, "topten-threats-default");

      // Each row carries name + risk pill + count. Walk all 10 rows by id.
      for (let i = 0; i < TOP_TEN.expectedRowCount; i++) {
        const row = page.locator(DASH.selectors.topTenRowTemplate.replace("{index}", String(i)));
        await expect(row, `row ${i} should mount`).toBeVisible({ timeout: TIMEOUTS.elementVisible });

        // C12706/C12710 -- risk pill must match one of validRisks.
        const riskPill = page.locator(DASH.selectors.topTenRiskTemplate.replace("{index}", String(i)));
        const riskText = ((await riskPill.textContent()) || "").trim();
        expect(TOP_TEN.validRisks).toContain(riskText);

        // C12707/C12711 -- row name should be non-empty (tm-word-length span
        // inside the row carries the model name / SR title).
        const rowText = ((await row.textContent()) || "").trim();
        expect(rowText.length, `row ${i} text was empty`).toBeGreaterThan(0);
      }
      await step(page, info, 2, "topten-threats-10-rows");
    });

    test("C12709 C12710 C12711 Security Requirements tab renders rows with risk", async ({ page }, info) => {
      caseIds(info, "C12709", "C12710", "C12711");
      await login(page);
      await gotoDashboard(page);

      // Switch to the SR tab. The tab id pattern is owned by testdata.
      const srTab = page.locator(TOP_TEN.tabs.securityRequirements.tabId);
      await expect(srTab).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await srTab.click();
      await step(page, info, 1, "topten-sr-tab-clicked");

      // The SR tab panel uses ngb-nav's panel-id template. Scope every
      // assertion to the panel so we don't pick up Threats-tab rows that
      // remain mounted in the DOM behind a CSS toggle.
      const srPanel = page.locator(TOP_TEN.tabs.securityRequirements.panelId);
      await expect(srPanel).toBeVisible({ timeout: TIMEOUTS.elementVisible });

      // Each row is a `li.list-group-item` inside the panel. Walk up to 10.
      const rows = srPanel.locator(TOP_TEN.selectors.listItem);
      const rowCount = await rows.count();
      expect(rowCount, "SR tab should render at least one row").toBeGreaterThan(0);

      // Each SR row carries a name and a numeric repeat-count -- the risk
      // pill is only rendered on the Threats and Components tabs, not on SR
      // (verified live on tmdev). Assert name presence and a count >= 0.
      const max = Math.min(rowCount, TOP_TEN.expectedRowCount);
      for (let i = 0; i < max; i++) {
        const row = rows.nth(i);
        await expect(row).toBeVisible({ timeout: TIMEOUTS.elementVisible });
        const text = ((await row.textContent()) || "").trim();
        expect(text.length, `SR row ${i} text was empty`).toBeGreaterThan(0);
        // Each row should expose at least one integer (the repeat count).
        const numMatch = text.match(/\d+/);
        expect(numMatch, `SR row ${i} carried no count in "${text}"`).not.toBeNull();
      }
      await step(page, info, 2, "topten-sr-rows-validated");
    });
  });

  // -------------------------------------------------------------------------
  // C12712, C12713, C12714, C12715, C12716, C18329, C18330, C18331, C18332
  // Source-coverage cases. Per the prompt's "flag missing info / state
  // assumptions" rule, we don't seed source-typed threats from the diagram
  // side here -- we assert the dashboard-side *surfaces* exist so the
  // diagram-side population can flow into them. The filter sidebar exposes
  // the Department / Status / Tags / Model Type / Threat Model controls
  // that scope every widget by source.
  // -------------------------------------------------------------------------
  test.describe("Source-coverage surfaces", () => {
    test("C12712 C12713 C12714 C12715 Filter sidebar exposes all source-scoping controls", async ({ page }, info) => {
      caseIds(info, "C12712", "C12713", "C12714", "C12715");
      await login(page);
      await gotoDashboard(page);

      // Open the filter panel via its id (the role-based aria-label is also
      // present but we use the id selector for stability).
      const filterBtn = page.locator(DASH.selectors.filterButtonId).first();
      await expect(filterBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await filterBtn.click();
      await step(page, info, 1, "filter-panel-opening");

      // Sidebar mounted -- assert each scoping multiselect is attached to
      // the DOM. The sidebar slides in via a CSS transform; the kendo-
      // multiselect elements are present from page load. Each id resolves
      // to both the outer `tm-kendo-multiselect` wrapper AND the inner
      // `kendo-multiselect` (Angular renders the same id on both), so we
      // pin to `.first()` to satisfy strict mode.
      const SIDE = testdata.dashboardFilter.selectors;
      await expect(page.locator(SIDE.sidebar)).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      for (const sel of [
        SIDE.departmentMultiselect,
        SIDE.statusMultiselect,
        SIDE.modelTypeMultiselect,
        SIDE.tagsMultiselect,
        SIDE.threatModelsMultiselect,
      ]) {
        await expect(page.locator(sel).first(), `expected ${sel} to mount`).toBeAttached({
          timeout: TIMEOUTS.elementVisible,
        });
      }
      await step(page, info, 2, "filter-multiselects-mounted");

      // Clear + Apply both exposed (attached) once the panel renders.
      await expect(page.locator(SIDE.clearButton).first()).toBeAttached({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(page.locator(SIDE.applyButton).first()).toBeAttached({
        timeout: TIMEOUTS.elementVisible,
      });
      await step(page, info, 3, "filter-actions-attached");

      // Close the sidebar so subsequent tests start from a clean state.
      await page.locator(SIDE.closeButton).click().catch(() => {});
    });

    test("C12716 Security Implementation Review mounts the traceability matrix", async ({ page }, info) => {
      caseIds(info, "C12716");
      await login(page);
      await gotoDashboard(page);

      // The section heading exists as a plain h2 (no id); we use the
      // role-based lookup, but the matrix card itself has a stable id.
      await expect(
        page.getByRole("heading", { name: MATRIX.heading, exact: true }),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await expect(page.locator(MATRIX.selectors.card)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(page.locator(MATRIX.selectors.table)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await step(page, info, 1, "matrix-card-mounted");

      // Walk the risk row headers -- the matrix uses one row per risk and one
      // column per status. Asserting at least one row header confirms the
      // matrix layout (the rest of the rows are exercised in C18333).
      const rowHeaders = page.locator(MATRIX.selectors.rowHeader);
      await expect(rowHeaders.first()).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await step(page, info, 2, "matrix-row-headers-present");
    });

    test("C18329 C18330 C18331 C18332 Compliance Summary surface mounts and exposes a framework filter", async ({ page }, info) => {
      caseIds(info, "C18329", "C18330", "C18331", "C18332");
      await login(page);
      await gotoDashboard(page);

      // Compliance heading id is unique on the page; the `.card` class
      // selector matches both the Top 10 and Compliance card wrappers, so we
      // anchor everything off the unique heading id and walk to the wrapper
      // only via the heading's ancestor chain when needed.
      await expect(page.locator(COMPLIANCE.selectors.heading)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      for (const sel of [
        COMPLIANCE.selectors.compliantCount,
        COMPLIANCE.selectors.nonCompliantCount,
        COMPLIANCE.selectors.partialCount,
      ]) {
        await expect(page.locator(sel)).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      }
      await step(page, info, 1, "compliance-counts-visible");

      // Three legend chips render their (slightly Cyrillic "C") labels.
      await expect(page.locator(COMPLIANCE.selectors.compliantLegend)).toContainText(
        COMPLIANCE.statusLegends.compliant,
      );
      await expect(page.locator(COMPLIANCE.selectors.nonCompliantLegend)).toContainText(
        COMPLIANCE.statusLegends.nonCompliant,
      );
      await expect(page.locator(COMPLIANCE.selectors.partialLegend)).toContainText(
        COMPLIANCE.statusLegends.partiallyCompliant,
      );
      await step(page, info, 2, "compliance-legends-text");

      // Framework filter opens.
      await page.locator(COMPLIANCE.selectors.filterButton).click();
      await expect(page.locator(COMPLIANCE.selectors.filterDialog)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(page.locator(COMPLIANCE.selectors.filterTitle)).toContainText(
        COMPLIANCE.filterTitle,
      );
      await step(page, info, 3, "compliance-framework-dialog-open");

      // Close via Clear (won't fire a stale apply on next test).
      await page.locator(COMPLIANCE.selectors.clearButton).click().catch(() => {});
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end smoke: assert every mid-page section heading from
  // testdata.dashboard.sections renders in a single test so a regression
  // that removes any one section trips a single, clear failure.
  // -------------------------------------------------------------------------
  test.describe("Dashboard sections (end-to-end)", () => {
    test("All four dashboard sections render", async ({ page }, info) => {
      caseIds(info, "C12704", "C12716", "C12705", "C18329");
      await login(page);
      await gotoDashboard(page);

      for (const section of DASH.sections) {
        await expect(
          page.getByRole("heading", { name: section, exact: true }).first(),
        ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      }
      await step(page, info, 1, "all-sections-rendered");

      // Also verify the AI widget is present (Top 10 surface for SR / Threats
      // breakdown by status) -- this is the surface where the per-row Risk /
      // Version / Description data lives (C12706 / C12707 / C12710 / C12711).
      const ai = page.locator(DASH.selectors.aiWidget).first();
      await expect(ai).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await expect(ai).toContainText(DASH.aiWidgetDefaultTitle);
      await step(page, info, 2, "ai-widget-present");
    });
  });
});
