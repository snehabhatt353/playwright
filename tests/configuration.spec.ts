import { test, expect, type Page } from "@playwright/test";
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

// The Excel TestRail export "threatmodeler_7.x (14).xlsx" carries the
// "Configuration" suite — 1255 cases across 40+ sections covering
// integration creation/edit/delete flows (Jira, ServiceNow, Azure
// Boards x3 each), SMTP, Authentication, Notifications, WingMan,
// Email Templates, Cloud accounts (GCP keyless/keybased), Diagram
// Defaults, Compliance, Custom Risk Calculation, etc.
//
// The vast majority depend on:
//   - external system credentials (live Jira/Azure/ServiceNow projects)
//   - cloud sandboxes (AWS/Azure/GCP service accounts)
//   - SMTP servers + reply-to email infrastructure
//   - long-running async notification delivery (annual/quarterly emails)
//   - permission orchestration across roles
//
// Those are out of scope for a stable automation pass. The foundational
// /configurations contract IS automatable: page chrome, the four
// content tabs, and the Integrations group structure (ALM Tools,
// Cloud Environments, LLM Models — each with a live count badge).
//
// Test grouping:
//   Test 1 → page chrome + 4 tabs render (Threat Models default-selected)
//   Test 2 → the documented settings sections all render
//   Test 3 → Integrations sub-section exposes the 3 documented groups
//            (ALM Tools / Cloud Environments / LLM Models) each with
//            a "(N)" count where N>0

const CFG = testdata.configurations;
const CFG_URL = new RegExp(URL_PATTERNS.configurations, "i");
const CFG_TITLE = new RegExp(TITLES.configurations);

async function gotoConfigurations(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  await page.goto(`${BASE_URL}${PATHS.configurations}`);
  await expect(page).toHaveURL(CFG_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(CFG_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(
    page.getByRole("heading", { name: CFG.heading, exact: true, level: 1 }),
  ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
}

test.describe("Configurations", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Page renders h1 and all four tabs (Threat Models default-selected)", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);

    // All four documented tabs render. Kendo's tabstrip ids are
    // session-generated, so we match by accessible name. The tabstrip
    // exposes its tabs through the accessibility tree but the
    // underlying DOM uses kendo wrappers — same caveat as the
    // Access Management spec; getByRole consults the a11y tree.
    for (const label of CFG.tabs) {
      const tab = page.getByRole("tab", { name: label, exact: true }).first();
      await expect(tab).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }

    // Threat Models is the default-selected tab — the page lands on it
    // after navigation.
    await expect(
      page.getByRole("tab", { name: CFG.tabs[0], exact: true }).first(),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("Configuration menu lists every documented section", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);

    // The page renders a left-side <menu aria-label="Configuration Menu">
    // whose menuitems are the official section-navigation primitives.
    // (In-section headings are noisier — e.g. "Authentication" is
    // actually rendered as "Authentication Authentication info"
    // because of an inline tooltip button.) Asserting on the menu
    // gives a clean per-section contract.
    const menu = page.getByRole("menu", { name: CFG.menuRole });
    await expect(menu).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    for (const section of CFG.expectedMenuItems) {
      await expect(
        menu.getByRole("menuitem", { name: section, exact: true }).first(),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }
  });

  test("Integrations section exposes ALM Tools / Cloud Environments / LLM Models groups with non-zero counts", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);

    // Each Integrations group header carries a "<name> (N)" label.
    // Patterns are tenant-stable; we match every documented one against
    // the rendered group headers.
    const headers = page.locator(CFG.selectors.integrationGroupHeader);
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThanOrEqual(CFG.integrationGroupPatterns.length);

    const headerTexts: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      headerTexts.push(((await headers.nth(i).textContent()) || "").trim());
    }

    for (const pattern of CFG.integrationGroupPatterns) {
      const re = new RegExp(pattern);
      const match = headerTexts.find((t) => re.test(t));
      expect(match, `expected an Integrations group matching /${pattern}/`).toBeTruthy();
      // The count inside () must be > 0 — guarantees the tenant has
      // populated entries to flow against per-integration tests.
      const countMatch = match!.match(/\((\d+)\)/);
      expect(countMatch).not.toBeNull();
      expect(Number(countMatch![1])).toBeGreaterThan(0);
    }
  });
});
