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

const COMPONENT = testdata.threatFramework.component;
const COMPONENT_FIELDS: FieldConfig = COMPONENT.fields as FieldConfig;
const FOLDER = testdata.screenshotFolders.tfCreate;
const STEPS = testdata.screenshotSteps;

test.describe("Create entity on Threat Framework (TypeScript)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("creates a new Component with required fields", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDER, STEPS.afterLogin);

    await page.locator(SELECTORS.threatFrameworkLink).click();
    await page.waitForURL(new RegExp(URL_PATTERNS.threatFramework, "i"), {
      timeout: TIMEOUTS.navMedium,
    });
    await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.tfCreate.frameworkPage);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("button", { name: ROLES.buttons.component, exact: true }).click();

    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.newComponent });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, FOLDER, STEPS.tfCreate.dialogOpen);

    const componentName = `${COMPONENT.namePrefix}-${Date.now()}`;
    await dialog.locator(SELECTORS.componentNameInput).fill(componentName);
    await fillRequiredCustomFields(page, dialog, COMPONENT_FIELDS);

    // Description is a separate Quill editor (not flagged with "*") that
    // Angular still considers required. Fill it to satisfy validation.
    const description = dialog.locator(SELECTORS.descriptionEditor).first();
    await description.click();
    await description.pressSequentially(COMPONENT.description, {
      delay: TIMEOUTS.typingDelayFast,
    });

    await snap(page, FOLDER, STEPS.tfCreate.formFilled);

    // Switch WingMan off so the dialog exposes the deterministic "Create"
    // button instead of "Generate with WingMan".
    const wingmanSwitch = page.getByRole("switch", {
      name: new RegExp(ROLES.switches.wingmanPattern, "i"),
    });
    if (await wingmanSwitch.isChecked().catch(() => false)) {
      await wingmanSwitch.click();
    }
    await snap(page, FOLDER, STEPS.tfCreate.wingmanOff);

    // "Test group" isn't rendered with the `*` marker our helper detects
    // but is required by Angular validation once WingMan is off.
    const testGroup = dialog.locator(SELECTORS.testGroupInput).first();
    if (await testGroup.count()) {
      await testGroup.scrollIntoViewIfNeeded();
      await testGroup.fill(COMPONENT.testGroup);
    }

    const createBtn = page.getByRole("button", { name: ROLES.buttons.create, exact: true });
    await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await createBtn.click();

    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDER, STEPS.tfCreate.dialogClosed);

    await selectEntity(page, testdata.entityTabs.components);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(componentName);
    await waitForLoaderIdle(page);
    await expect(page.getByText(componentName, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, FOLDER, STEPS.tfCreate.componentListed);
  });
});
