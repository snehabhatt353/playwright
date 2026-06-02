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
  pickFirstRealOption,
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
    // and [1] Library (defaults to the current framework scope, e.g.
    // "Corporate"). Overwriting Library with an arbitrary first option can
    // break validation since the picked library must contain the picked
    // component — so we only pick Component and leave Library at its default.
    const componentDropdown = dialog.locator("kendo-dropdownlist").first();
    await componentDropdown.click();
    await pickFirstRealOption(page);

    const ruleValue = `${AR.namePrefix}-${Date.now()}`;
    await dialog.locator(SELECTORS.resourceTypeValueInput).fill(ruleValue);
    await snap(page, FOLDER, STEPS.formFilled);

    const createBtn = dialog.getByRole("button", { name: ROLES.buttons.create, exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await createBtn.click();

    // The dialog only closes on a successful create — validation errors keep
    // it open. The success toast auto-dismisses too quickly to assert against
    // reliably, so dialog-hidden is the success signal we rely on.
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await snap(page, FOLDER, STEPS.dialogClosed);
  });
});
