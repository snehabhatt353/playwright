import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  SELECTORS,
  ROLES,
  login,
  dismissOnboardingIfShown,
  dismissPostLoginOverlays,
  snap,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

const AR = testdata.threatFramework.assistRule;
const FOLDER = testdata.screenshotFolders.arCreate;
const STEPS = testdata.screenshotSteps.arCreate;

test.describe("Create Assist Rule on Threat Framework (TypeScript)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("creates a new Assist Rule (Resource Type Value) with required fields", async ({
    page,
  }: {
    page: Page;
  }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDER, testdata.screenshotSteps.afterLogin);

    await page.locator(SELECTORS.threatFrameworkLink).click();
    await page.waitForURL(new RegExp(URL_PATTERNS.threatFramework, "i"), {
      timeout: TIMEOUTS.navMedium,
    });
    await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.frameworkPage);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("button", { name: ROLES.buttons.assistRule, exact: true }).click();

    // The Add Resource Type Value dialog doesn't expose a unique accessible
    // name on the dialog itself — filter the kendo-dialog by visible heading.
    const dialog: Locator = page
      .locator(SELECTORS.kendoDialog)
      .filter({ hasText: ROLES.dialogs.addResourceTypeValue });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, FOLDER, STEPS.dialogOpen);

    // The dialog has two kendo-dropdownlists: [0] Component (required, empty)
    // and [1] Library (defaults to the current framework scope). Some
    // components silently reject new rules (no validation error, dialog just
    // stays open) — and which components do this is tenant- and time-
    // dependent. Try the first visible options in turn until Create actually
    // closes the dialog, capping retries so a real bug still surfaces.
    const componentDropdown = dialog.locator("kendo-dropdownlist").first();
    const ruleValue = `${AR.namePrefix}-${Date.now()}`;
    const createBtn = dialog.getByRole("button", { name: ROLES.buttons.create, exact: true });
    const MAX_ATTEMPTS = 5;
    const QUICK_CLOSE_TIMEOUT = 5_000;
    let created = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !created; attempt++) {
      await componentDropdown.click();
      const options = page.locator(SELECTORS.visibleOptions);
      await options.first().waitFor({ state: "visible", timeout: TIMEOUTS.optionsVisible });
      const total = await options.count();
      let picked = false;
      for (let i = 0; i < total; i++) {
        const label = ((await options.nth(i).textContent()) || "").trim();
        if (label && label !== "-") {
          // On each retry attempt skip the components that have already
          // failed by picking deeper into the list.
          if (i < attempt) continue;
          await options.nth(i).click();
          picked = true;
          break;
        }
      }
      if (!picked) break;

      await dialog.locator(SELECTORS.resourceTypeValueInput).fill(ruleValue);
      if (attempt === 0) await snap(page, FOLDER, STEPS.formFilled);

      await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
      await createBtn.click();
      try {
        await expect(dialog).toBeHidden({ timeout: QUICK_CLOSE_TIMEOUT });
        created = true;
      } catch {
        // Silent backend reject — the dialog is still open. Continue and
        // try the next option.
      }
    }

    expect(created, "Create button never closed the dialog after retries").toBe(true);
    await snap(page, FOLDER, STEPS.dialogClosed);
  });
});
