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

// The Excel TestRail export "threatmodeler_7.x (7).xlsx" carries 21 cases
// in the "Convert Dashboard Filter Dropdown's to Kendo" section of suite
// S125 (C17444-C17464). The set re-asserts the dashboard Filter sidebar
// — already mapped by tests/dashboard_filter.spec.ts — but specifically
// against the kendo-multiselect contract: each filter (Department, Model
// Status, Model Type, Tags, Threat Models) is now a kendo-multiselect
// with placeholder "All", an inner search input, click-to-open popup,
// click-outside-to-close, and chip-based multi-select.
//
// Test grouping:
//   Test 1 (C17444 / C17458 / C17462 / C17464):
//     - Confirms each of the five filters is a kendo-multiselect with
//       placeholder "All" (Tags is "Select Tags" per tenant convention),
//       confirming the kendo conversion and the "default to All" contract.
//   Test 2 (C17445 / C17446 / C17447 / C17463):
//     - Opens Model Status, asserts options list mounts (C17462), typing
//       narrows the list (C17445), selecting two items emits chips
//       (C17446 / C17459), chip remove restores baseline (C17447), and
//       clicking outside closes the popup (C17463).
//   Test 3 (C17457):
//     - Model Status enumerates a broad option set; assert the documented
//       core statuses are all present.
//
// Out of scope (rationale in spec header):
//   - C17449-C17456 / C17459 dashboard panel updates with each filter
//     change (cross-screen, tenant-data dependent — covered structurally
//     by tests/dashboard_filter.spec.ts).
//   - C17450 performance.
//   - C17451 / C17452 date-picker behaviour (already covered by the
//     create-dialog date helper in tests/threat_models_screen.spec.ts).
//   - C17460 / C17461 saved-filter CRUD (covered end-to-end in
//     tests/dashboard_filter.spec.ts).

const DF = testdata.dashboardFilter;
const DASH = testdata.dashboard;
const KENDO = DF.kendo;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

// Selector-template helpers — the kendo block stores templates that take
// the host element id (e.g. `#dashboard-filterStatusList-multiselect`).
function inputFor(idSelector: string): string {
  return KENDO.selectors.multiselectInput.replace("{id}", idSelector);
}
function chipFor(idSelector: string): string {
  return KENDO.selectors.selectedChip.replace("{id}", idSelector);
}

async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  await page.getByRole("button", { name: DASH.navButton, exact: true }).click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
}

async function openSidebar(page: Page): Promise<Locator> {
  const button = page.locator(DF.selectors.openButton).first();
  await button.scrollIntoViewIfNeeded();
  const sidebar = page.locator(DF.selectors.sidebar);
  await expect
    .poll(
      async () => {
        if (await sidebar.isVisible().catch(() => false)) return "open";
        await button.click({ force: true }).catch(() => {});
        return (await sidebar.isVisible().catch(() => false)) ? "open" : "closed";
      },
      { timeout: TIMEOUTS.elementVisible, intervals: [500, 750, 1000, 1500] },
    )
    .toBe("open");
  return sidebar;
}

test.describe("Dashboard Filter — kendo dropdown conversion", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C17444-C17458-C17462-C17464-Each filter is a kendo-multiselect with placeholder \"All\" (Tags uses its own label)", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);

    // C17444 — the five filters are kendo-multiselect controls (the
    // <kendo-multiselect> element exists for each). C17458 — every one
    // except Tags defaults to placeholder "All"; Tags uses "Select Tags".
    const fields: { id: string; placeholder: string }[] = [
      { id: DF.selectors.departmentMultiselect, placeholder: KENDO.defaultPlaceholder },
      { id: DF.selectors.statusMultiselect, placeholder: KENDO.defaultPlaceholder },
      { id: DF.selectors.modelTypeMultiselect, placeholder: KENDO.defaultPlaceholder },
      { id: DF.selectors.tagsMultiselect, placeholder: KENDO.tagsPlaceholder },
      { id: DF.selectors.threatModelsMultiselect, placeholder: KENDO.defaultPlaceholder },
    ];
    for (const { id, placeholder } of fields) {
      // C17464 — accessibility: the kendo wrapper exposes aria-label
      // matching the placeholder text.
      const kendo = page.locator(`kendo-multiselect${id}`);
      await expect(kendo).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await expect(kendo).toHaveAttribute("aria-label", placeholder);
      // Inner search input is the click target that opens the popup
      // (C17462). The same input exposes the placeholder text.
      const input = page.locator(inputFor(id)).first();
      await expect(input).toHaveAttribute("placeholder", placeholder);
    }
  });

  test("C17445-C17446-C17447-C17463-Model Status dropdown opens, supports typing-to-search, multi-select chips, chip removal, and outside-click close", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const sidebar = await openSidebar(page);

    const statusId = DF.selectors.statusMultiselect;
    const input = page.locator(inputFor(statusId)).first();

    // C17462 — clicking the input opens the popup. The popup list is a
    // sibling kendo-popup with k-list-item options.
    await input.click();
    const options = page.locator(KENDO.selectors.popupOption);
    await expect(options.first()).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const totalOptions = await options.count();
    expect(totalOptions).toBeGreaterThanOrEqual(KENDO.modelStatusMinOptions);

    // C17445 — typing narrows the list. "In" appears in "In Progress" (an
    // always-present status).
    await input.fill("");
    await input.pressSequentially("In", { delay: TIMEOUTS.typingDelayMedium });
    await expect
      .poll(async () => {
        const labels = await page.locator(KENDO.selectors.popupOption).allTextContents();
        if (!labels.length) return null;
        return labels.every((l) => /In/i.test(l));
      }, { timeout: TIMEOUTS.elementVisible })
      .toBe(true);
    const narrowed = await page.locator(KENDO.selectors.popupOption).count();
    expect(narrowed).toBeLessThanOrEqual(totalOptions);

    // C17446 — multi-select: pick "In Progress" + "Review", chips appear.
    // Reset the filter so both options are reachable.
    await input.fill("");
    await page.locator(KENDO.selectors.popupOption).filter({ hasText: /^\s*In Progress\s*$/ }).first().click();
    await input.click();
    await page.locator(KENDO.selectors.popupOption).filter({ hasText: /^\s*Review\s*$/ }).first().click();
    const chips = page.locator(chipFor(statusId));
    await expect(chips).toHaveCount(2, { timeout: TIMEOUTS.elementVisible });
    await expect(chips.filter({ hasText: "In Progress" })).toHaveCount(1);
    await expect(chips.filter({ hasText: "Review" })).toHaveCount(1);

    // C17447 — remove one chip via its remove action. Kendo renders this
    // as `span.k-chip-remove-action` inside the chip.
    await chips.filter({ hasText: "Review" }).locator(".k-chip-remove-action").click();
    await expect(chips).toHaveCount(1, { timeout: TIMEOUTS.elementVisible });
    await expect(chips.filter({ hasText: "In Progress" })).toHaveCount(1);

    // C17463 — clicking outside the popup closes it. Sidebar's Filter
    // heading is a stable click target inside the sidebar (so we don't
    // accidentally toggle the sidebar shut).
    await input.click();
    await expect(page.locator(KENDO.selectors.popupOption).first()).toBeVisible();
    await sidebar.getByRole("heading", { name: DF.sidebarHeading, exact: true }).click();
    await expect(page.locator(KENDO.selectors.popupOption).first()).toBeHidden({
      timeout: TIMEOUTS.elementVisible,
    });

    // Tidy up: clear the remaining chip so we don't leave the dashboard
    // pre-filtered for any rerun in the same session.
    await page.locator(chipFor(statusId)).first().locator(".k-chip-remove-action").click({ force: true });
    await expect(chips).toHaveCount(0, { timeout: TIMEOUTS.elementVisible });
  });

  test("C17457-Model Status dropdown enumerates the documented core statuses", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);

    const input = page.locator(inputFor(DF.selectors.statusMultiselect)).first();
    await input.click();

    // C17457 — option list contains every documented core status (the
    // tenant adds custom statuses on top of these, so we assert a subset
    // rather than full equality).
    const labels = await page.locator(KENDO.selectors.popupOption).allTextContents();
    const trimmed = labels.map((l) => l.trim());
    for (const status of KENDO.expectedStatusOptions) {
      expect(trimmed, `expected option "${status}" in Model Status dropdown`).toContain(status);
    }
  });
});
