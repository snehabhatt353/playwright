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

const SR = testdata.threatFramework.securityRequirement;
const SR_FIELDS: FieldConfig = SR.fields as FieldConfig;
const FOLDER = testdata.screenshotFolders.srCreate;
const STEPS = testdata.screenshotSteps;

test.describe("Create Security Requirement on Threat Framework (TypeScript)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("creates a new Security Requirement with required fields", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDER, STEPS.afterLogin);

    await gotoThreatFramework(page);
    await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.srCreate.frameworkPage);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("button", { name: ROLES.buttons.securityRequirement, exact: true }).click();

    const dialog: Locator = page
      .locator(SELECTORS.kendoDialog)
      .filter({ hasText: ROLES.dialogs.newSecurityRequirement });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, FOLDER, STEPS.srCreate.dialogOpen);

    const srName = `${SR.namePrefix}-${Date.now()}`;
    const nameInput = dialog.locator(SELECTORS.securityRequirementNameInput).first();
    await nameInput.fill(srName);

    await fillRequiredCustomFields(page, dialog, SR_FIELDS);

    // Description Quill, when present, is treated as required by Angular
    // even without a "*" marker.
    const description = dialog.locator(SELECTORS.descriptionEditor).first();
    if (await description.count()) {
      await description.click();
      await description.pressSequentially(SR.description, { delay: TIMEOUTS.typingDelayFast });
    }
    await snap(page, FOLDER, STEPS.srCreate.formFilled);

    // Switch WingMan off so the dialog exposes the deterministic "Create" button.
    // Gate on count() first — isChecked() would auto-wait the full test timeout
    // if the switch isn't rendered on this dialog variant.
    const wingmanSwitch = page.getByRole("switch", {
      name: new RegExp(ROLES.switches.wingmanPattern, "i"),
    });
    if ((await wingmanSwitch.count()) > 0) {
      if (await wingmanSwitch.isChecked().catch(() => false)) {
        await wingmanSwitch.click();
      }
    }
    await snap(page, FOLDER, STEPS.srCreate.wingmanOff);

    const createBtn = dialog.getByRole("button", { name: ROLES.buttons.create, exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await createBtn.click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.srCreate.dialogClosed);

    await selectEntity(page, testdata.entityTabs.securityRequirements);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(srName);
    await waitForLoaderIdle(page);
    await expect(page.getByText(srName, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, FOLDER, STEPS.srCreate.srListed);
  });
});
