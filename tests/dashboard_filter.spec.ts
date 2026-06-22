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

// The Excel TestRail export "threatmodeler_7.x (2).xlsx" (sheet "Dashboard
// Filter", suite S125) lists 26 cases (C12717-C12742) covering the Filter
// sidebar on the Overview Dashboard. They split into three groups:
//   - filter criteria + Clear/Apply: C12717-C12725
//   - saved-filter CRUD:              C12726-C12735
//   - panel button state / UI:        C12736-C12742
//
// Tests that pin to specific tenant data (C12719/C12720/C12721/C12722/C12723
// — "set X, verify all panels update") need stable seeded fixtures the dev
// tenant doesn't carry; the panels themselves are exercised in the Overview
// Dashboard suite. C12717/C12718 (date-picker auto-default & end-before-
// start validation) require driving the kendo-datepicker masked input —
// already covered by the threat-model spec's `fillRequiredCustomFields`
// helper, so we focus this file on the dashboard-filter-specific surfaces.
//
// The sbhatt tenant has zero saved filters, which makes the empty-state
// dropdown ("No filters available") a stable baseline, and lets the CRUD
// test create + delete its own filter without polluting state.

const DF = testdata.dashboardFilter;
const DASH = testdata.dashboard;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

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
  // Open the sidebar with a poll-click — the Angular (click) handler can lag
  // the first paint, so re-click until the sidebar is visible.
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

test.describe("Dashboard Filter sidebar", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12739-Filter sidebar renders heading, every criterion label, and Clear/Apply", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    const sidebar = await openSidebar(page);

    // The "Filter" heading pins the sidebar root.
    await expect(sidebar.getByRole("heading", { name: DF.sidebarHeading, exact: true })).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });

    // Every criterion label from the spec sheet is rendered as a `<label>`
    // inside the sidebar — this is the C12739 UI contract. The DOM wraps
    // some labels with leading/trailing whitespace (e.g. " Start Date "),
    // so `getByText(exact)` (which trims) is more robust than a regex
    // anchored hasText filter.
    for (const label of DF.fieldLabels) {
      await expect(sidebar.getByText(label, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }

    // Footer: Clear + Apply are always present in the baseline (non-edit)
    // sidebar state.
    await expect(page.locator(DF.selectors.clearButton)).toBeVisible();
    await expect(page.locator(DF.selectors.applyButton)).toBeVisible();
  });

  test("C12740-Edit and Delete Filter icons are disabled when no saved filter is selected", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);

    // The baseline dropdown reads "No filters available" (the sbhatt tenant
    // carries no saved filters), so Edit / Delete must be disabled. New
    // Filter (+) stays enabled — that's the entry-point button.
    await expect(page.locator(DF.selectors.newFilterButton)).toBeEnabled();
    await expect(page.locator(DF.selectors.editFilterButton)).toBeDisabled();
    await expect(page.locator(DF.selectors.deleteFilterButton)).toBeDisabled();
  });

  test("C12736-Clicking + New Filter disables Apply and surfaces Cancel + Save Filter buttons", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);

    await page.locator(DF.selectors.newFilterButton).click();

    // C12736 — Apply is disabled, two new buttons appear: Cancel + Save.
    await expect(page.locator(DF.selectors.applyButton)).toBeDisabled({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(DF.selectors.cancelButton)).toBeVisible();
    await expect(page.locator(DF.selectors.saveFilterButton)).toBeVisible();

    // The + New Filter button itself becomes disabled (already in new-filter
    // mode) — guards against double-clicks creating duplicate placeholders.
    await expect(page.locator(DF.selectors.newFilterButton)).toBeDisabled();
  });

  test("C12737-C12738-Save Filter button toggles disabled→enabled with the Type Filter Name input", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);
    await page.locator(DF.selectors.newFilterButton).click();

    // C12737 — Save Filter starts disabled with an empty Type Filter Name.
    const save = page.locator(DF.selectors.saveFilterButton);
    await expect(save).toBeDisabled({ timeout: TIMEOUTS.elementVisible });

    // C12738 — typing any character enables Save Filter.
    const nameInput = page.locator(DF.selectors.filterNameInput);
    await nameInput.fill("A");
    await expect(save).toBeEnabled({ timeout: TIMEOUTS.elementVisible });

    // Clearing the name re-disables Save (companion to C12737).
    await nameInput.fill("");
    await expect(save).toBeDisabled({ timeout: TIMEOUTS.elementVisible });
  });

  test("C12727-Cancel from new-filter mode discards the in-progress filter", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);
    await page.locator(DF.selectors.newFilterButton).click();

    // Fill the name + clicking Cancel reverts to baseline mode (no save).
    await page.locator(DF.selectors.filterNameInput).fill(`${DF.namePrefix}-${Date.now()}-cancelled`);
    await page.locator(DF.selectors.cancelButton).click();

    // Baseline restored: name input gone, Save/Cancel gone, Apply re-enabled,
    // + New Filter re-enabled.
    await expect(page.locator(DF.selectors.filterNameInput)).toHaveCount(0, {
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(DF.selectors.saveFilterButton)).toHaveCount(0);
    await expect(page.locator(DF.selectors.cancelButton)).toHaveCount(0);
    await expect(page.locator(DF.selectors.applyButton)).toBeEnabled();
    await expect(page.locator(DF.selectors.newFilterButton)).toBeEnabled();

    // And the saved-filter dropdown still reads its empty state — the
    // cancelled filter was not persisted.
    await page.locator(DF.selectors.savedDropdown).click();
    await expect(
      page.locator(DF.selectors.savedDropdownMenu).filter({ hasText: DF.emptyDropdownText }).first(),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  });

  test("C12728-C12733-C12735-C12740-Create a saved filter, then select → Edit/Delete enabled → delete via confirm", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);
    await openSidebar(page);

    // 1. C12728 — create a uniquely named filter (unique so reruns / parallel
    //    runs don't collide).
    const filterName = `${DF.namePrefix}-${Date.now()}`;
    await page.locator(DF.selectors.newFilterButton).click();
    await page.locator(DF.selectors.filterNameInput).fill(filterName);
    const save = page.locator(DF.selectors.saveFilterButton);
    await expect(save).toBeEnabled({ timeout: TIMEOUTS.elementVisible });
    await save.click();
    await waitForLoaderIdle(page).catch(() => {});

    // After Save the panel returns to baseline mode (no Cancel / Save
    // buttons) and the new filter becomes the active selection.
    await expect(page.locator(DF.selectors.saveFilterButton)).toHaveCount(0, {
      timeout: TIMEOUTS.elementVisible,
    });

    // 2. C12740 — with the new filter selected, Edit + Delete icons are
    //    enabled (the empty-state baseline kept them disabled).
    await expect(page.locator(DF.selectors.editFilterButton)).toBeEnabled({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(DF.selectors.deleteFilterButton)).toBeEnabled();

    // 3. C12733 — Delete icon surfaces a kendo "Delete Filter" confirmation
    //    dialog. The dialog's Delete button id includes a literal space
    //    ("confirmAction-Delete Filter-button") — selector escapes that via
    //    attribute matcher.
    await page.locator(DF.selectors.deleteFilterButton).click();
    const confirmDialog = page
      .locator(DF.selectors.confirmDialog)
      .filter({ hasText: DF.confirmDeleteTitle })
      .first();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // 4. C12735 — clicking the Delete Filter affordance actually removes
    //    the filter from the tenant.
    await page.locator(DF.selectors.confirmDeleteFilterButton).click();
    await waitForLoaderIdle(page).catch(() => {});

    // Dropdown empties back to "No filters available" + Edit/Delete are
    // disabled again.
    await page.locator(DF.selectors.savedDropdown).click();
    await expect(
      page.locator(DF.selectors.savedDropdownMenu).filter({ hasText: DF.emptyDropdownText }).first(),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    // Close dropdown so the disabled-state assertion targets the icons not
    // any popup-anchored variant.
    await page.locator(DF.selectors.savedDropdown).click();
    await expect(page.locator(DF.selectors.editFilterButton)).toBeDisabled({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(DF.selectors.deleteFilterButton)).toBeDisabled();
  });
});
