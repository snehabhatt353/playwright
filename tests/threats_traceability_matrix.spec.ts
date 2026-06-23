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

// The Excel TestRail export "threatmodeler_7.x (4).xlsx" carries 19 cases
// in the "Threats Traceability Matrix" section of suite S125
// (C12743-C12760 + C16886). All target the Security Implementation Review
// card on the Overview Dashboard and the per-cell "Threats Traceability"
// kendo dialog. The cases split into:
//   - matrix structure / counts:      C12743 / C12748 / C12755
//   - threats inside the cell dialog: C12749 / C12750 / C12751-C12754,
//                                     C16886
//   - inner-SR / model navigation:    C12758 / C12759
//   - close affordance:               C12760
//   - cross-screen diagram edits:     C12744-C12747 / C12756 / C12757
//     (require seeded test data + diagram-side interaction; out of scope
//     here — covered structurally by counts being present and clickable)
//
// The matrix renders 5 Risk rows × 9 Status columns = up to 45 cells.
// Cells with a zero count omit the button — the dashboard surface is
// driven by tenant data so we assert on shape (a cell exists, count is a
// non-negative integer, the dialog opens with the matching risk/status
// header) rather than pinning to a particular number.

const TM = testdata.traceabilityMatrix;
const DASH = testdata.dashboard;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  await page.getByRole("button", { name: DASH.navButton, exact: true }).click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(page.locator(TM.selectors.card)).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
}

function cellAt(page: Page, row: number, col: number): Locator {
  return page.locator(
    TM.selectors.cellByCoords.replace("{row}", String(row)).replace("{col}", String(col)),
  );
}

// Returns the first cell (row, col, count) that exists in the matrix.
// Some risk/status intersections may have zero counts and omit the button,
// so we scan in row-major order until we hit a rendered cell. This avoids
// pinning to a specific (risk, status) pair that may go to zero between
// runs as data shifts.
async function firstRenderedCell(
  page: Page,
): Promise<{ row: number; col: number; count: number; cell: Locator }> {
  // Cell rendering is async — the matrix card paints before the
  // backend-driven counts populate. Wait for any cell to mount before
  // scanning, otherwise the row-major loop short-circuits to "none".
  await expect(page.locator(TM.selectors.anyCell).first()).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
  for (let row = 0; row < TM.risks.length; row++) {
    for (let col = 0; col < TM.statuses.length; col++) {
      const cell = cellAt(page, row, col);
      if (await cell.count()) {
        const text = ((await cell.textContent()) || "").trim();
        return { row, col, count: Number(text), cell };
      }
    }
  }
  throw new Error("No matrix cell rendered — tenant may have zero threats across all risk/status combinations");
}

test.describe("Threats Traceability Matrix", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12743-C12755-Matrix renders heading, all 5 risk rows, all 9 status columns, and cell counts are non-negative integers", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Heading + subtitle (the SIR card is the matrix's container).
    await expect(
      page.getByRole("heading", { name: TM.heading, exact: true }).first(),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(page.locator(TM.selectors.card)).toContainText(TM.subtitle);

    // Header columns — one per status, exact text in document order.
    const headers = page.locator(TM.selectors.headerCol);
    await expect(headers).toHaveCount(TM.statuses.length, {
      timeout: TIMEOUTS.elementVisible,
    });
    for (let col = 0; col < TM.statuses.length; col++) {
      await expect(headers.nth(col)).toHaveText(new RegExp(`^\\s*${TM.statuses[col]}\\s*$`));
    }

    // Risk row labels — one per risk, exact text in document order.
    const rowHeaders = page.locator(TM.selectors.rowHeader);
    await expect(rowHeaders).toHaveCount(TM.risks.length);
    for (let row = 0; row < TM.risks.length; row++) {
      await expect(rowHeaders.nth(row)).toHaveText(new RegExp(`^\\s*${TM.risks[row]}\\s*$`));
    }

    // At least one cell renders; every rendered cell carries a count text
    // that's a non-negative integer. (Cells with a zero count are omitted
    // from the DOM — that's the tenant contract.)
    const cells = page.locator(TM.selectors.anyCell);
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(0);
    for (let i = 0; i < cellCount; i++) {
      const text = ((await cells.nth(i).textContent()) || "").trim();
      expect(Number(text)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(Number(text))).toBe(true);
    }
  });

  test("C12748-Cell aria-label embeds the same count as the rendered text and matches the Risk/Status header", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Every rendered cell carries aria-label "<Risk> - <Status>: <count>",
    // where Risk / Status match the row / column labels and count matches
    // the cell's text — that's the contract C12748 is verifying.
    const cells = page.locator(TM.selectors.anyCell);
    const total = await cells.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i++) {
      const cell = cells.nth(i);
      const id = (await cell.getAttribute("id")) || "";
      const match = id.match(/dashboard-traceabilityMatrix-(\d+)-(\d+)-div/);
      expect(match, `cell id "${id}" should expose row/col indices`).not.toBeNull();
      const [, rowStr, colStr] = match!;
      const expectedRisk = TM.risks[Number(rowStr)];
      const expectedStatus = TM.statuses[Number(colStr)];

      const text = ((await cell.textContent()) || "").trim();
      const aria = (await cell.getAttribute("aria-label")) || "";
      expect(aria).toBe(`${expectedRisk} - ${expectedStatus}: ${text}`);
    }
  });

  test("C12749-C12760-Clicking a cell opens the Threats Traceability dialog with matching Risk/Status header, then Close dismisses it", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Find the first rendered cell and open its dialog. The exact (row, col)
    // we land on depends on tenant data, but the contract (matching headers)
    // holds for any cell.
    const { row, col, cell } = await firstRenderedCell(page);
    const expectedRisk = TM.risks[row];
    const expectedStatus = TM.statuses[col];
    await cell.click();

    const dialog = page.locator(TM.selectors.dialog).first();
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Dialog header: "Threats Traceability" + "Risk level: <Risk>" +
    // "Status: <Status>". The Status span is right next to the label, so
    // we assert each piece on the dialog text content rather than DOM
    // structure (the kendo titlebar nests several wrapping elements).
    await expect(page.locator(TM.selectors.dialogHeadingId)).toHaveText(TM.dialogHeading);
    await expect(dialog).toContainText(`Risk level:`);
    await expect(dialog).toContainText(expectedRisk);
    await expect(dialog).toContainText(`Status:`);
    await expect(dialog).toContainText(expectedStatus);

    // C12760 — close button dismisses the dialog and the matrix stays
    // interactive (still rendered + clickable).
    await dialog.locator(TM.selectors.dialogCloseButton).first().click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await expect(page.locator(TM.selectors.card)).toBeVisible();
  });

  test("C12750-Threats inside the dialog render as accordion items whose label embeds a non-negative count", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    const { cell } = await firstRenderedCell(page);
    await cell.click();
    const dialog = page.locator(TM.selectors.dialog).first();
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Each threat in the cell is a ngb-accordion toggle whose text is
    // "<Threat Name>  <count>". This is the contract C12749 / C12750 share:
    // the threats listed match the cell's risk/status, and each one carries
    // a count to drill into mapped SRs.
    const firstToggle = dialog.locator(TM.selectors.dialogAccordionToggleByIndex.replace("{index}", "0"));
    await expect(firstToggle).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const label = ((await firstToggle.textContent()) || "").trim();
    // Expected format: "<name>  <integer>". Pull the trailing integer.
    const trailing = label.match(/(\d+)\s*$/);
    expect(trailing, `accordion label "${label}" should end with an integer count`).not.toBeNull();
    expect(Number(trailing![1])).toBeGreaterThanOrEqual(0);

    // Expanding the first item flips aria-expanded → true and reveals an
    // SR list (C12750). The exact SR rows are tenant-dependent; we assert
    // the toggle expands rather than pinning to a specific SR name.
    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute("aria-expanded", "true", {
      timeout: TIMEOUTS.elementVisible,
    });

    // Tidy up so subsequent test runs/parallel workers don't inherit an
    // open dialog.
    await dialog.locator(TM.selectors.dialogCloseButton).first().click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });
});
