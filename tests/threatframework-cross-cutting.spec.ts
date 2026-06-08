import { test, expect, type Page } from "@playwright/test";
import {
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  SELECTORS,
  ROLES,
  login,
  dismissPostLoginOverlays,
  snap,
  waitForLoaderIdle,
  selectEntity,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

const TABS = testdata.entityTabs;
const FOLDER = "tf-cross-cutting-ts";
const COMPONENT_ROWS = "[id^='threatframework-item-'][id$='-checkbox']";
const ROW_CONTAINER = "[id^='threatframework-item-']:not([id$='-checkbox'])";

async function gotoThreatFramework(page: Page): Promise<void> {
  await login(page);
  await dismissPostLoginOverlays(page);
  await page.locator(SELECTORS.threatFrameworkLink).click();
  await page.waitForURL(new RegExp(URL_PATTERNS.threatFramework, "i"), {
    timeout: TIMEOUTS.navMedium,
  });
  await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
  await dismissPostLoginOverlays(page);
  await waitForLoaderIdle(page);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

test.describe("Threat Framework cross-cutting flows", () => {
  test.setTimeout(TIMEOUTS.test);

  test("TC-CC-01: cycles through every entity tab and the list renders rows", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    const tabs = [
      TABS.components,
      TABS.threats,
      TABS.securityRequirements,
      TABS.testCases,
      TABS.attributes,
    ];
    for (const tab of tabs) {
      await selectEntity(page, tab);
      await expect(page.getByRole("heading", { level: 2, name: tab }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
      await expect
        .poll(() => page.locator(COMPONENT_ROWS).count(), { timeout: TIMEOUTS.rowVisible })
        .toBeGreaterThan(0);
      await snap(page, FOLDER, `tab-${slug(tab)}`);
    }
  });

  test("TC-CC-02: search narrows the list and clearing it restores the rows", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    await selectEntity(page, TABS.components);
    await expect
      .poll(() => page.locator(COMPONENT_ROWS).count(), { timeout: TIMEOUTS.rowVisible })
      .toBeGreaterThan(0);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    const sentinel = `__no_such_component_${Date.now()}__`;
    await search.fill(sentinel);
    await waitForLoaderIdle(page);
    await expect(page.locator(COMPONENT_ROWS)).toHaveCount(0, { timeout: TIMEOUTS.rowVisible });
    await snap(page, FOLDER, "search-no-match");

    await search.fill("");
    await waitForLoaderIdle(page);
    await expect
      .poll(() => page.locator(COMPONENT_ROWS).count(), { timeout: TIMEOUTS.rowVisible })
      .toBeGreaterThan(0);
    await snap(page, FOLDER, "search-cleared");
  });

  test("TC-CC-03: visibility filter toggles between Visible and Hidden", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    await selectEntity(page, TABS.components);

    await page.getByRole("button", { name: ROLES.buttons.visibleFilter, exact: true }).click();
    await page.locator(SELECTORS.componentVisibilityHiddenOption).click();
    await waitForLoaderIdle(page);
    await expect(
      page.getByRole("button", { name: ROLES.buttons.hiddenFilter, exact: true }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDER, "filter-hidden");

    await page.getByRole("button", { name: ROLES.buttons.hiddenFilter, exact: true }).click();
    await page.locator(SELECTORS.componentVisibilityVisibleOption).click();
    await waitForLoaderIdle(page);
    await expect(
      page.getByRole("button", { name: ROLES.buttons.visibleFilter, exact: true }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  });

  test("TC-CC-04: Select All toggles the bulk-action toolbar enabled state", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    await selectEntity(page, TABS.components);

    const selectAll = page.getByRole("checkbox", { name: ROLES.buttons.selectAll, exact: true });
    // Kendo styles the checkbox input as zero-sized — dispatch a JS click on
    // the actual input so the Angular binding fires.
    await selectAll.evaluate((el: HTMLInputElement) => el.click());
    await expect(
      page.getByRole("button", { name: ROLES.buttons.edit, exact: true }),
    ).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await snap(page, FOLDER, "select-all-on");

    await selectAll.evaluate((el: HTMLInputElement) => el.click());
    // After deselect the Edit button either disables or is removed; tolerate both.
    await expect(async () => {
      const editBtn = page.getByRole("button", { name: ROLES.buttons.edit, exact: true });
      if (!(await editBtn.isVisible().catch(() => false))) return;
      await expect(editBtn).toBeDisabled({ timeout: TIMEOUTS.buttonEnabled });
    }).toPass({ timeout: TIMEOUTS.buttonEnabled });
  });

  test("TC-CC-05: right-pane tabs activate for the selected entity", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    await selectEntity(page, TABS.components);

    // Click the first visible row container to load it into the right pane.
    // Falls back to clicking the row's last child (the name span) if the
    // container itself doesn't open the detail view.
    const firstRow = page.locator(ROW_CONTAINER).first();
    await expect(firstRow).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await firstRow.click({ force: true });
    await waitForLoaderIdle(page);
    const tablist = page.getByRole("tablist").first();
    if (!(await tablist.isVisible().catch(() => false))) {
      await firstRow.locator(":scope > *").last().click({ force: true });
      await waitForLoaderIdle(page);
    }
    await expect(tablist).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    const tabNames = ["Threats", "Security Req.", "Attributes", "Info", "Custom field"];
    for (const name of tabNames) {
      const tab = tablist.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", {
        timeout: TIMEOUTS.elementVisible,
      });
      await snap(page, FOLDER, `right-tab-${slug(name)}`);
    }
  });

  test("TC-CC-06: switching the Library updates the combobox label", async ({ page }: { page: Page }) => {
    await gotoThreatFramework(page);
    await selectEntity(page, TABS.components);

    const libraryCombo = page.getByRole("combobox", { name: "Library" });
    const initialLabel = ((await libraryCombo.textContent()) || "").trim();
    expect(initialLabel.length).toBeGreaterThan(0);

    await libraryCombo.click();
    const options = page.getByRole("option");
    await options.first().waitFor({ state: "visible", timeout: TIMEOUTS.optionsVisible });
    const count = await options.count();
    let switched = false;
    for (let i = 0; i < count; i++) {
      const text = ((await options.nth(i).textContent()) || "").trim();
      if (text && !initialLabel.includes(text)) {
        await options.nth(i).click();
        switched = true;
        break;
      }
    }
    test.skip(!switched, "Only one library is available in this tenant");
    await waitForLoaderIdle(page);
    const newLabel = ((await libraryCombo.textContent()) || "").trim();
    expect(newLabel).not.toBe(initialLabel);
    await snap(page, FOLDER, "library-switched");
  });
});
