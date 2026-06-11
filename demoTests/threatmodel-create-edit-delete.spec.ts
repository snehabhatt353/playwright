import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  ROLES,
  login,
  dismissOnboardingIfShown,
  dismissPostLoginOverlays,
  snap,
  waitForLoaderIdle,
  fillRequiredCustomFields,
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

const TM = testdata.threatModel;
const TM_FIELDS: FieldConfig = TM.fields as FieldConfig;
const FOLDERS = testdata.screenshotFolders;
const STEPS = testdata.screenshotSteps;
const DIAGRAM_URL = new RegExp(URL_PATTERNS.threatModelDiagram, "i");

test.describe("Threat Model", () => {
  test.setTimeout(TIMEOUTS.test);

  test("TC-01: creates a new blank threat model", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDERS.tmCreate, STEPS.afterLogin);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();

    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.createThreatModel });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, FOLDERS.tmCreate, STEPS.tmCreate.dialogOpen);

    const modelName = `${TM.namePrefixes.create}-${Date.now()}`;
    await dialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await dialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, dialog, TM_FIELDS);
    await snap(page, FOLDERS.tmCreate, STEPS.tmCreate.formFilled);

    await expect(dialog.getByRole("tab", { name: "Blank" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const createBtn = page.getByRole("button", { name: ROLES.buttons.createNewModel });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await expect(page).toHaveTitle(new RegExp(TITLES.threatModelDiagram));
    await snap(page, FOLDERS.tmCreate, STEPS.tmCreate.diagramLoaded);
  });

  test("TC-02: edits an existing threat model's version and persists the change", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDERS.tmEdit, STEPS.afterLogin);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();

    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.createThreatModel });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.edit}-${Date.now()}`;
    await dialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await dialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, dialog, TM_FIELDS);
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.createFilled);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.diagramLoaded);

    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toBeVisible({
      timeout: TIMEOUTS.rowVisible,
    });
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.listWithRow);

    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await row.getByRole("button", { name: ROLES.buttons.expandDetails }).click();
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.inlinePanel);

    const versionField = page.getByRole("textbox", { name: ROLES.textboxes.versionField });
    await expect(versionField).toBeVisible();
    await versionField.fill(TM.version.updated);
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.versionChanged);

    const saveBtn = page.getByRole("button", { name: ROLES.buttons.save, exact: true });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(
      page
        .getByRole("row", {
          name: new RegExp(`${modelName}\\s+${TM.version.updated.replace(".", "\\.")}`),
        })
        .first(),
    ).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    await snap(page, FOLDERS.tmEdit, STEPS.tmEdit.saved);
  });

  test("TC-03: archives a threat model and it appears in Archived", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDERS.tmArchive, STEPS.afterLogin);

    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();

    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.createThreatModel });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.archive}-${Date.now()}`;
    await dialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await dialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, dialog, TM_FIELDS);
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.createFilled);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.diagramLoaded);

    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toBeVisible({
      timeout: TIMEOUTS.rowVisible,
    });

    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await row.getByRole("checkbox", { name: ROLES.buttons.selectRow }).check();
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.rowSelected);

    await page.getByRole("button", { name: ROLES.buttons.threatModelMenu }).click();
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.menuOpen);
    // The Archive icon button is intercepted by the page header chrome;
    // dispatch the click via JS to bypass the overlap.
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLElement | null;
      btn?.click();
    }, testdata.selectors.archiveIcon);

    const confirm = page.getByRole("dialog", { name: ROLES.dialogs.archiveThreatModel });
    await expect(confirm).toBeVisible();
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.confirmDialog);
    await confirm.getByRole("button", { name: ROLES.buttons.archive, exact: true }).click();
    await expect(confirm).toBeHidden({ timeout: TIMEOUTS.saveConfirm });

    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toHaveCount(0);
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.removedFromActive);

    await page.goto(`${BASE_URL}${PATHS.threatModelsArchived}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true }).first()).toBeVisible({
      timeout: TIMEOUTS.rowVisible,
    });
    await expect(page).toHaveTitle(new RegExp(TITLES.threatModelsArchived));
    await snap(page, FOLDERS.tmArchive, STEPS.tmArchive.archivedList);
  });

  test("TC-04: diagram change updates the Modified date on the home screen", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, FOLDERS.tmModify, STEPS.afterLogin);

    // Create a fresh model so we know exactly which row to assert on.
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const dialog: Locator = page.getByRole("dialog", { name: ROLES.dialogs.createThreatModel });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.modify}-${Date.now()}`;
    await dialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await dialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, dialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await snap(page, FOLDERS.tmModify, STEPS.tmModify.created);

    // Snapshot the initial state on the home screen before the edit.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    const initialRow = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await expect(initialRow).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    const initialModified = ((await initialRow.locator("td[role='gridcell']").nth(6).textContent()) || "").trim();
    expect(initialModified).toMatch(/Today/);
    await snap(page, FOLDERS.tmModify, STEPS.tmModify.initialList);

    // Re-open the diagram by clicking the model name in the row.
    await initialRow.getByRole("button", { name: modelName, exact: true }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await waitForLoaderIdle(page);

    // The diagram's project-name button opens the "Model Info" kendo dialog
    // (portal-mounted, not inside <tm-diagram-model-info>). It exposes the
    // same Name / Version fields as the create dialog; updating Version +
    // Save is a clean model-level change.
    await page.locator(".project-name-btn").click();
    const modelInfo = page.getByRole("dialog", { name: "Model Info" });
    await expect(modelInfo).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await snap(page, FOLDERS.tmModify, STEPS.tmModify.modelInfoOpen);

    const versionInput = modelInfo.locator('input[placeholder="Version"]').first();
    await expect(versionInput).toBeVisible();
    await versionInput.fill(TM.version.updated);
    await snap(page, FOLDERS.tmModify, STEPS.tmModify.versionChanged);

    await modelInfo.getByRole("button", { name: ROLES.buttons.save, exact: true }).click();
    await expect(modelInfo).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);
    await snap(page, FOLDERS.tmModify, STEPS.tmModify.saved);

    // Back on the home screen, the row should show the new version, sit at
    // the top of the (Modified-DESC) list, and have a "Today …" timestamp.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);

    const updatedRow = page
      .getByRole("row", {
        name: new RegExp(`${modelName}\\s+${TM.version.updated.replace(".", "\\.")}`),
      })
      .first();
    await expect(updatedRow).toBeVisible({ timeout: TIMEOUTS.rowVisible });

    const updatedModified = ((await updatedRow.locator("td[role='gridcell']").nth(6).textContent()) || "").trim();
    expect(updatedModified).toMatch(/Today/);

    // The first data row in the Modified-DESC grid should be ours.
    const firstDataRowName = ((await page.getByRole("row").nth(1).locator("td[role='gridcell']").nth(1).textContent()) || "").trim();
    expect(firstDataRowName).toContain(modelName);

    await snap(page, FOLDERS.tmModify, STEPS.tmModify.listUpdated);
  });
});
