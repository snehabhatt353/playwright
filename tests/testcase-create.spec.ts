import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  TITLES,
  TIMEOUTS,
  SELECTORS,
  ROLES,
  login,
  dismissOnboardingIfShown,
  dismissPostLoginOverlays,
  snap,
  waitForLoaderIdle,
  gotoThreatFramework,
  fillRequiredCustomFields,
  selectEntity,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

type FieldConfig = {
  textboxes?: { label: string; placeholder: string; value: string }[];
  quillLabel?: string;
  dateLabel?: string;
  singleSelects?: string[];
  multiSelectLabel?: string;
  linkLabel?: string;
  fileUploadLabel?: string;
};

const TC = testdata.threatFramework.testCase;
const TC_FIELDS: FieldConfig = TC.fields as FieldConfig;
const FOLDER = testdata.screenshotFolders.tcCreate;
const STEPS = testdata.screenshotSteps;

test.describe("Create Test Case on Threat Framework (TypeScript)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("creates a new Test Case with required fields", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDER, STEPS.afterLogin);

    await gotoThreatFramework(page);
    await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.tcCreate.frameworkPage);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("button", { name: ROLES.buttons.testCase, exact: true }).click();

    const dialog: Locator = page
      .locator(SELECTORS.kendoDialog)
      .filter({ hasText: ROLES.dialogs.newTestCase });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, FOLDER, STEPS.tcCreate.dialogOpen);

    const testCaseName = `${TC.namePrefix}-${Date.now()}`;
    const nameInput = dialog.locator(SELECTORS.testCaseNameInput).first();
    await nameInput.fill(testCaseName);

    await fillRequiredCustomFields(page, dialog, TC_FIELDS);

    // Description Quill, when present, is treated as required by Angular
    // even without a "*" marker.
    const description = dialog.locator(SELECTORS.descriptionEditor).first();
    if (await description.count()) {
      await description.click();
      await description.pressSequentially(TC.description, { delay: TIMEOUTS.typingDelayFast });
    }
    await snap(page, FOLDER, STEPS.tcCreate.formFilled);

    const createBtn = dialog.getByRole("button", { name: ROLES.buttons.create, exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await createBtn.click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.tcCreate.dialogClosed);

    await selectEntity(page, testdata.entityTabs.testCases);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(testCaseName);
    await waitForLoaderIdle(page);
    await expect(page.getByText(testCaseName, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, FOLDER, STEPS.tcCreate.testCaseListed);
  });
});
