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

// The Excel TestRail export "threatmodeler_7.x (15).xlsx" carries 218
// cases under the "Custom Field" suite (Test Cases 155, Custom Fields
// Diagram 51, Custom Report 8, Developer Report 3, Compliance Report 1).
// Cases span field CRUD across data types, field groups, conditional
// rules, permissions (None / View / Edit), Rules Engine interactions,
// and how custom fields propagate into the diagram + reports.
//
// Most cases create / edit / delete fields or groups (C98447-C98534)
// which commits tenant state — not safe for an automated regression
// pass without isolated tenant fixtures. The downstream surfaces
// (Custom Fields Diagram, Reports, Conditional Rules) require seeded
// fields to be present and respond to specific values, which is
// brittle without a clean fixture.
//
// This suite covers the foundational Custom Fields admin contract on
// /configurations: section header, the 10 documented entity tabs +
// Data Type, and the Add Field / Add Group action buttons. The actual
// per-tab field grids, conditional-rule builders, and permission
// matrices are out of scope here.
//
// Test grouping:
//   Test 1 → Custom Fields admin section renders with heading + all
//            10 entity tabs + Data Type button
//   Test 2 → Section exposes Add Field + Add Group actions
//   Test 3 → At least one configured field renders with a star/unstar
//            affordance (the per-field admin grid is populated)

const CF = testdata.customField;
const CFG_URL = new RegExp(URL_PATTERNS.configurations, "i");
const CFG_TITLE = new RegExp(TITLES.configurations);

async function gotoCustomFieldsSection(page: Page): Promise<Locator> {
  await dismissPostLoginOverlays(page);
  await page.goto(`${BASE_URL}${PATHS.configurations}`);
  await expect(page).toHaveURL(CFG_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(CFG_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  // The Configurations page is a single scroll-view; the Custom Fields
  // menuitem scrolls to the section anchor. Click + wait for the
  // section to be visible in the viewport.
  await page.locator(CF.menuItemSelector).click();
  const section = page.locator(CF.selectors.section);
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return section;
}

test.describe("Configurations > Custom Fields", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Section renders heading, Data Type, and all 10 entity tabs", async ({ page }: { page: Page }) => {
    await login(page);
    const section = await gotoCustomFieldsSection(page);

    // C98447 / C98467 baseline — the admin section is reachable and
    // exposes its primary heading.
    await expect(
      section.getByRole("heading", { name: CF.sectionHeading, exact: true, level: 2 }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Data Type entry point — C98467-C98485 (custom data type CRUD) all
    // flow through this button.
    await expect(page.locator(CF.selectors.dataTypeButton)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });

    // C98527 / placements — every documented entity tab mounts.
    for (const tab of CF.entityTabs) {
      const tabEl = page.locator(tab.id);
      await expect(tabEl).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await expect(tabEl).toHaveText(new RegExp(`^\\s*${tab.label}\\s*$`));
    }
  });

  test("Section exposes Add Field and Add Group action buttons", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    // C98447 / C98448 entry points: the Add Field button opens the
    // field-creation dialog. C98487 entry point: Add Group opens the
    // field-group creation flow. We assert presence without clicking
    // (no save = no tenant residue).
    await expect(page.locator(CF.selectors.addFieldButton)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(CF.selectors.addFieldButton)).toBeEnabled();

    await expect(page.locator(CF.selectors.addGroupButton)).toBeVisible();
    await expect(page.locator(CF.selectors.addGroupButton)).toBeEnabled();
  });

  test("Configured fields render with a star/unstar affordance", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    // C98462 — fields can be starred from the admin list. The star
    // toggle uses a button id pattern `star-field-<uuid>` with aria-label
    // "Star field: <name>" or "Unstar field: <name>". Tenant has many
    // fields configured (per the threat-models testdata.threatModel.fields
    // block alone — TM - text1 / TM TextArea / etc.), so at least one
    // star button should render.
    const starButtons = page.locator(CF.selectors.starFieldButton);
    await expect(starButtons.first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    const count = await starButtons.count();
    expect(count).toBeGreaterThan(0);

    // Each star button's aria-label encodes the field name — the admin
    // contract per C98452 / C98462.
    const aria = (await starButtons.first().getAttribute("aria-label")) || "";
    expect(aria).toMatch(/(Star|Unstar) field:/);
  });
});
