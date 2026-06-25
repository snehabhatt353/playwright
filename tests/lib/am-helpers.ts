import { expect, type Page, type Locator } from "@playwright/test";
// @ts-ignore -- helpers.js is CommonJS
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TIMEOUTS,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./helpers";
import testdata from "../data/testdata.json";

// Shared Access Management helpers used by every am-* spec file.
//
// gotoAccessManagement: clicks the side-nav link, falls back to direct
// nav if the link isn't mounted, and asserts URL + h1.
//
// activateAccessManagementTab: switches to the requested tab using the
// kendo-tabstrip dynamic-id template, then confirms aria-selected="true"
// via role-based lookup (the role-based locator is stable across tab
// re-renders; the dynamic id changes on tab activation).

const AM = testdata.accessManagement;
const AM_URL = new RegExp(URL_PATTERNS.accessManagement, "i");

export async function gotoAccessManagement(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
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

function tabByIndex(page: Page, index: number): Locator {
  return page
    .locator(AM.selectors.tabByIndexTemplate.replace("{index}", String(index)))
    .first();
}

function tabByLabel(page: Page, pattern: string): Locator {
  return page.getByRole("tab", { name: new RegExp(pattern) }).first();
}

export async function activateAccessManagementTab(
  page: Page,
  index: number,
  labelPattern: string,
): Promise<void> {
  const tab = tabByIndex(page, index);
  await expect(tab).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  const selected = await tab.getAttribute("aria-selected");
  if (selected !== "true") {
    await tab.click();
    await expect(tabByLabel(page, labelPattern)).toHaveAttribute("aria-selected", "true", {
      timeout: TIMEOUTS.elementVisible,
    });
  }
  await waitForLoaderIdle(page).catch(() => {});
}
