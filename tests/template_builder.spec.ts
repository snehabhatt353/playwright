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

// The Excel TestRail export "threatmodeler_7.x (9).xlsx" carries 100 cases
// (C16593-C18547) under the Template Builder suite. The cases split into
// two very different surfaces:
//
//   1. Template Builder list screen  — top-bar create, search, select,
//      department filter, delete, edit/preview. This is the surface we
//      cover here.
//   2. Template Builder canvas       — diagram-side drag-drop, groups,
//      protocols, components, undo/redo, security controls, context menu,
//      see more/less tag controls, etc. (C16616-C16686 / C16688-C18547).
//      These need real canvas interactions (svg drag-drop, right-click,
//      pixel-level positioning) and stable seeded data, so they're out
//      of scope for an automated regression pass — left as TODOs for a
//      dedicated canvas-interaction suite.
//
// Test grouping:
//   Test 1 → C16593 / C16594 (navigation)
//   Test 2 → C16595 / C16599 / C16600 (new-template dialog + Create
//            disabled until name typed)
//   Test 3 → C16601 (Create enables once name typed) — without actually
//            saving, so we don't leave per-run residue. The "Create
//            committed to list" portion of C16601 / C16603 belongs in a
//            cleanup-aware integration test.
//   Test 4 → C16604 / C16605 (search box accepts input and clears)
//   Test 5 → C16615 (Department Filter affordance present + clickable)

const TB = testdata.templateBuilder;
const TB_URL = new RegExp(URL_PATTERNS.templateBuilder, "i");
const TB_TITLE = new RegExp(TITLES.templateBuilder);

async function gotoTemplateBuilder(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  // The grid's tm-loader overlay can intercept the side-nav click on
  // first paint, mirroring the threat-models grid behaviour. Strip the
  // overlay before navigating, with a goto fallback if the nav anchor
  // is still occluded.
  await page.evaluate(() => {
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
  });
  const navLink = page.locator(TB.selectors.navLink).first();
  await navLink.click({ force: true }).catch(async () => {
    await page.goto(`${BASE_URL}${PATHS.templateBuilder}`);
  });
  await expect(page).toHaveURL(TB_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(TB_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
}

async function openNewTemplateDialog(page: Page): Promise<Locator> {
  // The top-bar Create menu surfaces several entity options as
  // tm-cn-report-dropdown-item buttons. Angular renders the dropdown
  // *twice* — once for the side-nav copy and once for the top-bar copy
  // — so 4 matching buttons live in the DOM (2 hidden + 2 visible after
  // open). `.first()` would land on a hidden one; we explicitly filter
  // to the visible Template entry.
  const trigger = page.locator(TB.selectors.createMenuTrigger);
  const templateOption = page
    .locator(`${TB.selectors.createMenuTemplateItem}:visible`)
    .filter({ hasText: /^\s*Template\s*$/ })
    .first();
  await expect
    .poll(
      async () => {
        if (await templateOption.isVisible().catch(() => false)) return "open";
        await trigger.click({ force: true }).catch(() => {});
        return (await templateOption.isVisible().catch(() => false)) ? "open" : "closed";
      },
      { timeout: TIMEOUTS.elementVisible, intervals: [500, 750, 1000, 1500] },
    )
    .toBe("open");
  await templateOption.click();
  const dialog = page.locator(TB.selectors.dialog);
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return dialog;
}

test.describe("Template Builder list screen", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C16593-C16594-Side-nav opens the Template Builder screen with heading, Search, Delete and Department Filter", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoTemplateBuilder(page);

    await expect(
      page.getByRole("heading", { name: TB.heading, exact: true, level: 1 }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // The list-screen top toolbar mounts three stable controls — these
    // are the C16604/C16608/C16615 entry points.
    await expect(page.locator(TB.selectors.searchInput)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(TB.selectors.searchInput)).toHaveAttribute(
      "placeholder",
      TB.searchPlaceholder,
    );
    await expect(page.locator(TB.selectors.deleteButton)).toBeVisible();
    await expect(page.locator(TB.selectors.departmentFilterButton)).toBeVisible();
  });

  test("C16595-C16599-C16600-New Template dialog opens with Create disabled and X (Close) dismisses it", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoTemplateBuilder(page);
    const dialog = await openNewTemplateDialog(page);

    // C16595 — dialog title.
    await expect(dialog).toContainText(TB.dialogTitle);

    // C16600 — Create stays disabled until the mandatory name is provided.
    await expect(page.locator(TB.selectors.createButton)).toBeDisabled({
      timeout: TIMEOUTS.elementVisible,
    });

    // C16599 — X (Close) collapses the dialog. The kendo wrapper toggles
    // visibility/aria; assert hidden after close.
    await page.locator(TB.selectors.closeButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });

  test("C16600-C16601-Typing a template name enables the Create button (Create not pressed to keep tenant clean)", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoTemplateBuilder(page);
    const dialog = await openNewTemplateDialog(page);

    const create = page.locator(TB.selectors.createButton);
    await expect(create).toBeDisabled({ timeout: TIMEOUTS.elementVisible });

    // C16601 — typing into Template Name flips Create to enabled. The
    // actual create flow is exercised here only up to the "ready to
    // submit" state to avoid tenant residue across reruns; the persisted
    // listing (C16603) belongs in a separate cleanup-aware test.
    const templateName = `${TB.namePrefix}-${Date.now()}`;
    await dialog.locator(TB.selectors.templateNameInput).fill(templateName);
    await expect(create).toBeEnabled({ timeout: TIMEOUTS.elementVisible });

    // Clearing the name re-disables Create (mandatory-field guard).
    await dialog.locator(TB.selectors.templateNameInput).fill("");
    await expect(create).toBeDisabled({ timeout: TIMEOUTS.elementVisible });

    // Tidy: close without saving.
    await page.locator(TB.selectors.closeButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });

  test("C16604-C16605-Search box accepts input and clears", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoTemplateBuilder(page);

    const search = page.locator(TB.selectors.searchInput);
    // Type a value — search input should hold it.
    await search.fill("zzz-no-such-template");
    await expect(search).toHaveValue("zzz-no-such-template", {
      timeout: TIMEOUTS.elementVisible,
    });
    // Clearing returns the input to empty.
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("C16615-Department Filter button opens the filter panel with at least one department checkbox", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoTemplateBuilder(page);

    // C16615 — clicking the filter affordance surfaces an inline panel
    // containing per-department checkboxes (id pattern
    // `templateBuilder-<dept>-checkbox`). The presence of those
    // checkboxes is the most stable signal that the panel mounted.
    const filterBtn = page.locator(TB.selectors.departmentFilterButton);
    await expect(filterBtn).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await filterBtn.click();
    await expect
      .poll(
        async () => page.locator(TB.selectors.departmentFilterCheckbox).count(),
        { timeout: TIMEOUTS.elementVisible },
      )
      .toBeGreaterThan(0);
  });
});
