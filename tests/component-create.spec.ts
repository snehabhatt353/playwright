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
const PREFIXES = COMPONENT.namePrefixes;
const FOLDERS = testdata.screenshotFolders;
const TF_FOLDER = FOLDERS.tfCreate;
const STEPS = testdata.screenshotSteps;
const COMP_STEPS = STEPS.compAction;
const COMPONENT_ROWS = "[id^='threatframework-item-'][id$='-checkbox']";

async function gotoThreatFramework(page: Page): Promise<void> {
  await login(page);
  await dismissPostLoginOverlays(page);
  await page.locator(SELECTORS.threatFrameworkLink).click();
  await page.waitForURL(new RegExp(URL_PATTERNS.threatFramework, "i"), {
    timeout: TIMEOUTS.navMedium,
  });
  await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
  await dismissPostLoginOverlays(page);
  await waitForLoaderIdle(page);
}

async function createComponent(page: Page, namePrefix: string): Promise<string> {
  await gotoThreatFramework(page);

  await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
  const componentMenuItem = page.getByRole("button", { name: ROLES.buttons.component, exact: true });
  await componentMenuItem.waitFor({ state: "visible", timeout: TIMEOUTS.optionsVisible });
  await componentMenuItem.click();

  const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.newComponent });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await dismissOnboardingIfShown(page);

  const componentName = `${namePrefix}-${Date.now()}`;
  await dialog.locator(SELECTORS.componentNameInput).fill(componentName);
  await fillRequiredCustomFields(page, dialog, COMPONENT_FIELDS);

  const description = dialog.locator(SELECTORS.descriptionEditor).first();
  await description.click();
  await description.pressSequentially(COMPONENT.description, {
    delay: TIMEOUTS.typingDelayFast,
  });

  const wingmanSwitch = page.getByRole("switch", {
    name: new RegExp(ROLES.switches.wingmanPattern, "i"),
  });
  if (await wingmanSwitch.isChecked().catch(() => false)) {
    await wingmanSwitch.click();
  }

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
  await selectEntity(page, testdata.entityTabs.components);
  return componentName;
}

async function searchAndSelectFirstRow(page: Page, name: string): Promise<void> {
  const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
  await search.fill(name);
  await waitForLoaderIdle(page);
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
  // The kendo row checkbox is a zero-sized hidden input — Playwright's click()
  // against it succeeds but doesn't toggle Angular's selection state. Walk up
  // from the visible name to the row container and dispatch a JS click on the
  // checkbox input directly.
  const row = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::*[starts-with(@id, 'threatframework-item-')][1]")
    .first();
  await row.evaluate((el) => {
    const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    cb?.click();
  });
  // Sanity-check selection took effect: the toolbar Edit button becomes
  // enabled only when at least one row is selected. Different toolbar buttons
  // have inconsistent DOM ids, so locate by accessible name.
  await expect(
    page.getByRole("button", { name: ROLES.buttons.edit, exact: true }),
  ).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
}

// The "More Actions" popup can collapse before its items are clickable; retry
// opening it until the requested item is visible.
async function clickMoreActionsItem(page: Page, itemSelector: string): Promise<void> {
  const moreActions = page.getByRole("button", {
    name: ROLES.buttons.moreActions,
    exact: true,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    await moreActions.click();
    const item = page.locator(itemSelector);
    if (await item.isVisible({ timeout: TIMEOUTS.optionsVisible }).catch(() => false)) {
      await item.click();
      return;
    }
  }
  throw new Error(`More Actions item ${itemSelector} did not become visible`);
}

test.describe("Component CRUD on Threat Framework (TypeScript)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("TC-01: creates a new Component with required fields", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, TF_FOLDER, STEPS.afterLogin);

    await page.locator(SELECTORS.threatFrameworkLink).click();
    await page.waitForURL(new RegExp(URL_PATTERNS.threatFramework, "i"), {
      timeout: TIMEOUTS.navMedium,
    });
    await expect(page).toHaveTitle(new RegExp(TITLES.threatFramework));
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await snap(page, TF_FOLDER, STEPS.tfCreate.frameworkPage);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("button", { name: ROLES.buttons.component, exact: true }).click();

    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.newComponent });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, TF_FOLDER, STEPS.tfCreate.dialogOpen);

    const componentName = `${PREFIXES.create}-${Date.now()}`;
    await dialog.locator(SELECTORS.componentNameInput).fill(componentName);
    await fillRequiredCustomFields(page, dialog, COMPONENT_FIELDS);

    const description = dialog.locator(SELECTORS.descriptionEditor).first();
    await description.click();
    await description.pressSequentially(COMPONENT.description, {
      delay: TIMEOUTS.typingDelayFast,
    });

    await snap(page, TF_FOLDER, STEPS.tfCreate.formFilled);

    const wingmanSwitch = page.getByRole("switch", {
      name: new RegExp(ROLES.switches.wingmanPattern, "i"),
    });
    if (await wingmanSwitch.isChecked().catch(() => false)) {
      await wingmanSwitch.click();
    }
    await snap(page, TF_FOLDER, STEPS.tfCreate.wingmanOff);

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
    await snap(page, TF_FOLDER, STEPS.tfCreate.dialogClosed);

    await selectEntity(page, testdata.entityTabs.components);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(componentName);
    await waitForLoaderIdle(page);
    await expect(page.getByText(componentName, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, TF_FOLDER, STEPS.tfCreate.componentListed);
  });

  test("TC-02: edits an existing Component's name and persists the change", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.edit);
    await snap(page, FOLDERS.compEdit, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compEdit, COMP_STEPS.rowSelected);

    await page.getByRole("button", { name: ROLES.buttons.edit, exact: true }).click();
    // The edit dialog title concatenates "Edit Component" with the library
    // name (e.g. "Edit ComponentIn Corporate"), so match by prefix.
    const editDialog = page.getByRole("dialog", { name: new RegExp(ROLES.dialogs.editComponent) });
    await expect(editDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compEdit, COMP_STEPS.dialogOpen);

    const editedName = `${name}${COMPONENT.editedSuffix}`;
    await editDialog.locator(SELECTORS.componentNameInput).fill(editedName);
    await editDialog.getByRole("button", { name: ROLES.buttons.save, exact: true }).click();
    await expect(editDialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDERS.compEdit, COMP_STEPS.actionApplied);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(editedName);
    await waitForLoaderIdle(page);
    await expect(page.getByText(editedName, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, FOLDERS.compEdit, COMP_STEPS.verified);
  });

  test("TC-03: copies a Component and the duplicate appears in the list", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.copy);
    await snap(page, FOLDERS.compCopy, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compCopy, COMP_STEPS.rowSelected);

    await page.getByRole("button", { name: ROLES.buttons.copy, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: ROLES.dialogs.copyComponents });
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compCopy, COMP_STEPS.dialogOpen);

    await dialog.getByRole("button", { name: ROLES.buttons.copy, exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDERS.compCopy, COMP_STEPS.actionApplied);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(name);
    await waitForLoaderIdle(page);
    // After Copy: original + duplicate ⇒ search returns ≥ 2 rows.
    await expect
      .poll(() => page.locator(COMPONENT_ROWS).count(), { timeout: TIMEOUTS.rowVisible })
      .toBeGreaterThanOrEqual(2);
    await snap(page, FOLDERS.compCopy, COMP_STEPS.verified);
  });

  test("TC-04: deep-copies a Component and the duplicate appears in the list", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.deepCopy);
    await snap(page, FOLDERS.compDeepCopy, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compDeepCopy, COMP_STEPS.rowSelected);

    await page.getByRole("button", { name: ROLES.buttons.deepCopy, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: ROLES.dialogs.copyComponents });
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compDeepCopy, COMP_STEPS.dialogOpen);

    await dialog.getByRole("button", { name: ROLES.buttons.copy, exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDERS.compDeepCopy, COMP_STEPS.actionApplied);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(name);
    await waitForLoaderIdle(page);
    await expect
      .poll(() => page.locator(COMPONENT_ROWS).count(), { timeout: TIMEOUTS.rowVisible })
      .toBeGreaterThanOrEqual(2);
    await snap(page, FOLDERS.compDeepCopy, COMP_STEPS.verified);
  });

  test("TC-05: hides a Component and it moves to the Hidden list", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.hide);
    await snap(page, FOLDERS.compHide, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compHide, COMP_STEPS.rowSelected);

    await page.getByRole("button", { name: ROLES.buttons.hide, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: ROLES.dialogs.hideRecord });
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compHide, COMP_STEPS.dialogOpen);

    await dialog.getByRole("button", { name: ROLES.buttons.hide, exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(name);
    await waitForLoaderIdle(page);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await snap(page, FOLDERS.compHide, COMP_STEPS.actionApplied);

    // The visibility filter trigger's accessible name is the current state
    // ("Visible" by default).
    await page.getByRole("button", { name: ROLES.buttons.visibleFilter, exact: true }).click();
    await page.locator(SELECTORS.componentVisibilityHiddenOption).click();
    await waitForLoaderIdle(page);
    await search.fill(name);
    await waitForLoaderIdle(page);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await snap(page, FOLDERS.compHide, COMP_STEPS.verified);
  });

  test("TC-06: adds a tag to a Component via More Actions", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.tag);
    await snap(page, FOLDERS.compTag, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compTag, COMP_STEPS.rowSelected);

    await clickMoreActionsItem(page, SELECTORS.componentMoreActionsTag);
    const dialog = page.getByRole("dialog", { name: ROLES.dialogs.addTags });
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compTag, COMP_STEPS.dialogOpen);

    const tagInput = dialog.locator(SELECTORS.kendoMultiselectInput).first();
    await tagInput.click();
    await tagInput.pressSequentially(COMPONENT.tagValue, { delay: TIMEOUTS.typingDelayFast });
    // Commit the chip — kendo-multiselect only accepts the entered text once
    // Enter is pressed.
    await page.keyboard.press("Enter");
    // Close the kendo-popup "no data" suggestions panel that lingers below the
    // chip input and intercepts pointer events on the Submit button.
    await page.keyboard.press("Escape");

    await dialog.getByRole("button", { name: ROLES.buttons.submit, exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDERS.compTag, COMP_STEPS.verified);
  });

  test("TC-07: deletes a Component and it disappears from the list", async ({ page }: { page: Page }) => {
    const name = await createComponent(page, PREFIXES.delete);
    await snap(page, FOLDERS.compDelete, COMP_STEPS.created);

    await searchAndSelectFirstRow(page, name);
    await snap(page, FOLDERS.compDelete, COMP_STEPS.rowSelected);

    await clickMoreActionsItem(page, SELECTORS.componentMoreActionsDelete);
    const dialog = page.getByRole("dialog", { name: ROLES.dialogs.deleteComponents });
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.compDelete, COMP_STEPS.dialogOpen);

    await page.locator(SELECTORS.deleteConfirmButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);

    const search = page.getByRole("searchbox", { name: ROLES.searchbox }).first();
    await search.fill(name);
    await waitForLoaderIdle(page);
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    await snap(page, FOLDERS.compDelete, COMP_STEPS.verified);
  });
});
