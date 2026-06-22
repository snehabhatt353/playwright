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

// The Excel TestRail export "threatmodeler_7.x (1).xlsx" (sheet "Compliance
// Summary", suite S125) lists 26 cases (C12664-C12689) all targeting the
// Compliance Summary widget on the Overview Dashboard. They split into:
//   - widget UI            C12664 / C12671 (status legends + counts render)
//   - filter UI            C12665 (dialog opens with framework list + search)
//   - filter selection     C12666 / C12667 (single & multi-select then Apply)
//   - clear / search       C12668 / C12669
//   - portfolio drill-in   C12672-C12679, C12681 (click framework → SR list →
//                          model list; requires seeded compliance data the
//                          tenant doesn't carry for this user, so out of
//                          scope here)
//   - SR-status propagation C12680 / C12682-C12689 (change SR status in
//                          diagram, verify count updates back on dashboard;
//                          inherently cross-screen + tenant-data dependent)
//
// The tenant currently returns "No Data Available" for every framework
// available to this user (the sbhatt account has no models mapped to a
// compliance framework). So the suite verifies the dashboard-side contract:
// widget structure, filter dialog open/close, list of frameworks, search,
// checkbox toggling, Apply/Clear actions. The portfolio + SR-status
// propagation cases belong in a separate diagram-side suite once seeded data
// is available.

const CS = testdata.complianceSummary;
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

function complianceCard(page: Page): Locator {
  // The card has no unique id of its own; the heading id pins it.
  return page.locator(CS.selectors.heading).locator("xpath=ancestor::div[contains(@class,'tm-dashboard-card-bottom')][1]");
}

async function openFilter(page: Page): Promise<Locator> {
  // The filter button can sit below the fold on smaller viewports — and
  // even when in-viewport, an early-fire click can land before Angular wires
  // the (click) handler that toggles the `hidden` attribute. Scroll into
  // view, then poll-click until the dialog's `hidden` attr is removed.
  const button = page.locator(CS.selectors.filterButton).first();
  await button.scrollIntoViewIfNeeded();
  const dialog = page.locator(CS.selectors.filterDialog);
  await expect
    .poll(
      async () => {
        if ((await dialog.getAttribute("hidden")) === null) return "open";
        await button.click({ force: true }).catch(() => {});
        return (await dialog.getAttribute("hidden")) === null ? "open" : "closed";
      },
      { timeout: TIMEOUTS.elementVisible, intervals: [500, 750, 1000, 1500] },
    )
    .toBe("open");
  return dialog;
}

test.describe("Compliance Summary widget", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12664-C12671-Compliance Summary card renders heading, status legends and a Filter button", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // C12664 — widget heading mounts at the bottom of the dashboard.
    await expect(page.locator(CS.selectors.heading)).toHaveText(CS.heading, {
      timeout: TIMEOUTS.elementVisible,
    });

    // C12671 — three status legends always render below the stacked bar
    // (the tenant uses a Cyrillic "С" in "Сompliant" — kept verbatim from
    // the DOM so the assertion is exact).
    for (const legendId of [
      CS.selectors.compliantLegend,
      CS.selectors.nonCompliantLegend,
      CS.selectors.partialLegend,
    ]) {
      await expect(page.locator(legendId)).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }
    await expect(page.locator(CS.selectors.compliantLegend)).toHaveText(CS.statusLegends.compliant);
    await expect(page.locator(CS.selectors.nonCompliantLegend)).toHaveText(CS.statusLegends.nonCompliant);
    await expect(page.locator(CS.selectors.partialLegend)).toHaveText(CS.statusLegends.partiallyCompliant);

    // The three numeric counts above the legends are always present and
    // render as non-negative integers (zero when no framework is active).
    for (const sel of [
      CS.selectors.compliantCount,
      CS.selectors.nonCompliantCount,
      CS.selectors.partialCount,
    ]) {
      const text = ((await page.locator(sel).textContent()) || "").trim();
      expect(Number(text)).toBeGreaterThanOrEqual(0);
    }

    // Filter affordance — the entry point for every C12665-C12669 case.
    await expect(page.locator(CS.selectors.filterButton).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
  });

  test("C12665-Compliance Framework filter dialog renders title, search, list and footer", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const dialog = await openFilter(page);

    // Title pin: aria-labelledby on the dialog points at this span.
    await expect(page.locator(CS.selectors.filterTitle)).toHaveText(CS.filterTitle, {
      timeout: TIMEOUTS.elementVisible,
    });
    // Search input
    await expect(dialog.locator(CS.selectors.filterSearch)).toBeVisible();
    // At least one framework checkbox renders — the list is tenant-populated
    // (we don't pin to a specific framework since the catalog changes).
    await expect(dialog.locator(CS.selectors.filterItem).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    const itemCount = await dialog.locator(CS.selectors.filterItem).count();
    expect(itemCount).toBeGreaterThan(0);

    // Apply + Clear footer.
    await expect(page.locator(CS.selectors.applyButton)).toBeVisible();
    await expect(page.locator(CS.selectors.clearButton)).toBeVisible();
  });

  test("C12669-Search in Compliance Framework filter narrows the list", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const dialog = await openFilter(page);

    const items = dialog.locator(CS.selectors.filterItem);
    const beforeCount = await items.count();
    expect(beforeCount).toBeGreaterThan(0);

    // The search field is a plain <input type="search"> that filters
    // client-side as the user types. pressSequentially fires per-char
    // keydown/input which the Angular component listens for.
    const search = dialog.locator(CS.selectors.filterSearch);
    await search.click();
    await search.pressSequentially(CS.searchSamples.partial, { delay: TIMEOUTS.typingDelayMedium });

    // Narrowed list still contains the search term in every visible label.
    await expect.poll(async () => {
      const labels = await dialog.locator(CS.selectors.filterItemLabel).allTextContents();
      if (labels.length === 0) return null;
      return labels.every((l) => l.toUpperCase().includes(CS.searchSamples.partial.toUpperCase()));
    }, { timeout: TIMEOUTS.elementVisible }).toBe(true);
    const afterCount = await items.count();
    expect(afterCount).toBeLessThanOrEqual(beforeCount);

    // Typing a string that matches no framework leaves the list empty —
    // confirms the search is actually applying.
    await search.fill("");
    await search.pressSequentially(CS.searchSamples.noMatch, { delay: TIMEOUTS.typingDelayMedium });
    await expect.poll(async () => items.count(), {
      timeout: TIMEOUTS.elementVisible,
    }).toBe(0);
  });

  test("C12666-C12667-Select one then multiple frameworks, then Apply closes the dialog", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const dialog = await openFilter(page);

    // C12666 — toggle first checkbox.
    const cb0 = dialog.locator(CS.selectors.filterItemCheckbox).nth(0);
    await cb0.check({ force: true });
    await expect(cb0).toBeChecked();

    // C12667 — second checkbox toggled too (multi-select).
    const cb1 = dialog.locator(CS.selectors.filterItemCheckbox).nth(1);
    await cb1.check({ force: true });
    await expect(cb1).toBeChecked();

    // Apply commits the selection and dismisses the dialog. The dialog
    // toggles via a `hidden` attribute rather than detaching — assert the
    // attribute is back.
    await page.locator(CS.selectors.applyButton).first().click();
    await expect(page.locator(CS.selectors.filterDialog)).toHaveAttribute("hidden", "", {
      timeout: TIMEOUTS.elementVisible,
    });
    await waitForLoaderIdle(page).catch(() => {});

    // After Apply, the card still renders — either with data or the
    // "No Data Available" placeholder (depends on tenant SR↔framework
    // mappings, which this account doesn't carry).
    await expect(complianceCard(page)).toBeVisible();
  });

  test("C12668-Clear button in Compliance Framework filter unchecks all selections", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const dialog = await openFilter(page);

    // Tick two boxes so Clear has something to undo.
    const cb0 = dialog.locator(CS.selectors.filterItemCheckbox).nth(0);
    const cb1 = dialog.locator(CS.selectors.filterItemCheckbox).nth(1);
    await cb0.check({ force: true });
    await cb1.check({ force: true });
    await expect(cb0).toBeChecked();
    await expect(cb1).toBeChecked();

    // Clear inside the filter resets the in-dialog selection.
    await page.locator(CS.selectors.clearButton).first().click();
    await expect(cb0).not.toBeChecked({ timeout: TIMEOUTS.elementVisible });
    await expect(cb1).not.toBeChecked();
  });
});
