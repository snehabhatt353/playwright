import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// The Excel TestRail export "threatmodeler_7.x (11).xlsx" carries the
// "Access Management 7.0" suite (710 cases across many sections: Access
// Management, Groups, Departments, Users, Bulk add, Export Users, Access
// Management Permission, Contributor, Default group, etc).
//
// 700+ cases is well beyond the scope of a single automation file. The
// vast majority are role-permission matrices (Access Management
// Permission: 454 cases) and behaviour-under-different-roles cases that
// need orchestrated multi-user setup. This suite covers the foundational
// dashboard-side contract instead — the 4-tab Access Management screen
// — leaving entity CRUD, role-permission matrices, bulk operations,
// CSV import/export, and cross-screen propagation cases for dedicated
// follow-up suites.
//
// Test grouping:
//   Test 1 → C14216 / C14281 / C14370 / C98435-C98446 (page chrome +
//            heading + all four tabs present with counts + URL/title)
//   Test 2 → C14281 (Departments tab columns: Name / Users / Groups /
//            Licenses used)
//   Test 3 → C14216 (Users tab columns: Name / Status / Email /
//            Department / Group + page-title rotation)
//   Test 4 → C14370 (Groups tab columns: Name / Department / Users +
//            page-title rotation)
//   Test 5 → Roles & Permissions tab (Name / Description / Type +
//            page-title rotation)
//   Test 6 → C14282 / C14224 / C14370-search (search input accepts and
//            clears on Departments tab; the same search pattern applies
//            to all tabs since the input is shared at the page level)

const AM = testdata.accessManagement;
const AM_URL = new RegExp(URL_PATTERNS.accessManagement, "i");

async function gotoAccessManagement(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  // Same loader-overlay protection pattern as other side-nav specs.
  await page.evaluate(() => {
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
  });
  const navLink = page.locator(AM.selectors.navLink).first();
  await navLink.click({ force: true }).catch(async () => {
    await page.goto(`${BASE_URL}${PATHS.accessManagement}`);
  });
  await expect(page).toHaveURL(AM_URL, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(
    page.getByRole("heading", { name: AM.heading, exact: true, level: 1 }),
  ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
}

function tabByLabel(page: Page, pattern: string): Locator {
  // The kendo tabstrip exposes tabs through Playwright's accessibility
  // tree (`role="tab"`) but the underlying DOM uses kendo wrappers where
  // a CSS `[role="tab"]` query returns zero matches. getByRole consults
  // the a11y tree directly.
  return page.getByRole("tab", { name: new RegExp(pattern) }).first();
}

async function activateTab(page: Page, pattern: string): Promise<void> {
  const tab = tabByLabel(page, pattern);
  const selected = await tab.getAttribute("aria-selected");
  if (selected !== "true") {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: TIMEOUTS.elementVisible,
    });
  }
  await waitForLoaderIdle(page).catch(() => {});
}

async function assertColumnsExact(page: Page, columns: string[]): Promise<void> {
  // The grid's column headers render after the tab's data load — wait for
  // the first header before asserting all of them.
  await expect(
    page.locator(AM.selectors.columnHeader).first(),
  ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  const titles = await page
    .locator(`${AM.selectors.columnHeader} ${AM.selectors.columnTitle}`)
    .allTextContents();
  const trimmed = titles.map((t) => t.trim()).filter((t) => t.length > 0);
  // Tenant grids surface columns in document order — assert equal.
  expect(trimmed).toEqual(columns);
}

test.describe("Access Management", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Page renders heading and all four tabs with counts", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);

    // All four documented tabs render with a numeric count suffix. The
    // count itself varies per tenant; we assert the label pattern.
    for (const key of ["departments", "users", "groups", "rolesAndPermissions"] as const) {
      const cfg = AM.tabs[key];
      await expect(tabByLabel(page, cfg.labelPattern)).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }

    // Default selected tab is Departments.
    await expect(tabByLabel(page, AM.tabs.departments.labelPattern)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("Departments tab shows the documented columns", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);
    await activateTab(page, AM.tabs.departments.labelPattern);
    await assertColumnsExact(page, AM.tabs.departments.columns);
  });

  test("Users tab updates page title and shows the documented columns", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);
    await activateTab(page, AM.tabs.users.labelPattern);
    await expect(page).toHaveTitle(new RegExp(AM.tabs.users.titleRegex), {
      timeout: TIMEOUTS.navShort,
    });
    await assertColumnsExact(page, AM.tabs.users.columns);
  });

  test("Groups tab updates page title and shows the documented columns", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);
    await activateTab(page, AM.tabs.groups.labelPattern);
    await expect(page).toHaveTitle(new RegExp(AM.tabs.groups.titleRegex), {
      timeout: TIMEOUTS.navShort,
    });
    await assertColumnsExact(page, AM.tabs.groups.columns);
  });

  test("Roles & Permissions tab updates page title and shows the documented columns", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);
    await activateTab(page, AM.tabs.rolesAndPermissions.labelPattern);
    await expect(page).toHaveTitle(new RegExp(AM.tabs.rolesAndPermissions.titleRegex), {
      timeout: TIMEOUTS.navShort,
    });
    await assertColumnsExact(page, AM.tabs.rolesAndPermissions.columns);
  });

  test("Search input accepts text and clears", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoAccessManagement(page);

    const search = page.locator(AM.selectors.searchInput).first();
    await expect(search).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(search).toHaveAttribute("placeholder", AM.searchPlaceholder);

    await search.fill("zzz-no-such-entity");
    await expect(search).toHaveValue("zzz-no-such-entity", {
      timeout: TIMEOUTS.elementVisible,
    });
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
