import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TIMEOUTS,
  ROLES,
  login,
  dismissOnboardingIfShown,
  dismissPostLoginOverlays,
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
const DIAGRAM_URL = new RegExp(URL_PATTERNS.threatModelDiagram, "i");

// Target values for each editable detail visible on the home-screen grid.
// Defaults at creation: Risk = Medium, Status = In Progress, Version = 1.0.
const UPDATED = {
  nameSuffix: "-Updated",
  version: "2.0",
  risk: "High",
  status: "Review",
};

test.describe("Threat Models screen", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C13569-Edit threat model details and check all the details get updated or not", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);

    // 1. Create a fresh threat model with default values so we know exactly
    //    which row to edit and what the starting state is.
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const createDialog: Locator = page.getByRole("dialog", {
      name: ROLES.dialogs.createThreatModel,
    });
    await expect(createDialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const originalName = `EditAllTM-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(originalName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Back on the home grid, expand the row's inline detail panel.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    const row = page.getByRole("row", { name: new RegExp(`\\b${originalName}\\b`) }).first();
    await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    await row.getByRole("button", { name: ROLES.buttons.expandDetails }).click();

    // 3. Edit every detail surfaced on the home-grid columns: Name, Version,
    //    Risk, Status. The inline panel exposes each as a kendo input or
    //    dropdown.
    const updatedName = `${originalName}${UPDATED.nameSuffix}`;
    const nameInput = page.getByRole("textbox", { name: ROLES.textboxes.modelName }).first();
    await expect(nameInput).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await nameInput.fill(updatedName);

    const versionInput = page.getByRole("textbox", { name: ROLES.textboxes.versionField });
    await versionInput.fill(UPDATED.version);

    // kendo-dropdownlist isn't always exposed as role=combobox — target it
    // by aria-label and pick the option after the popup opens.
    await page.locator('kendo-dropdownlist[aria-label="Select Risk"]').first().click();
    await page.getByRole("option", { name: UPDATED.risk, exact: true }).first().click();

    await page.locator('kendo-dropdownlist[aria-label="Select Project Status"]').first().click();
    await page.getByRole("option", { name: UPDATED.status, exact: true }).first().click();

    // 4. Save and wait for the grid to settle.
    const saveBtn = page.getByRole("button", { name: ROLES.buttons.save, exact: true });
    await expect(saveBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
    await saveBtn.click();
    await waitForLoaderIdle(page);

    // 5. Verify every edited detail surfaces on the updated row.
    const updatedRow = page
      .getByRole("row", { name: new RegExp(`\\b${updatedName.replace(/-/g, "\\-")}\\b`) })
      .first();
    await expect(updatedRow).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    const cells = updatedRow.locator("td[role='gridcell']");
    await expect(cells.nth(1)).toContainText(updatedName);
    await expect(cells.nth(2)).toContainText(UPDATED.version);
    await expect(cells.nth(3)).toContainText(UPDATED.risk);
    await expect(cells.nth(4)).toContainText(UPDATED.status);
  });

  test("C13577-Do some changes on diagram and Check modified date get updated on home screen", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);

    // 1. Create a fresh threat model so we know exactly which row to assert on.
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const createDialog: Locator = page.getByRole("dialog", {
      name: ROLES.dialogs.createThreatModel,
    });
    await expect(createDialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `DiagramEditTM-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Snapshot the home-grid Modified text before the diagram edit.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    const initialRow = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await expect(initialRow).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    const initialModified = ((await initialRow.locator("td[role='gridcell']").nth(6).textContent()) || "").trim();
    expect(initialModified).toMatch(/Today/);

    // 3. Re-open the diagram by clicking the model name in the row.
    await initialRow.getByRole("button", { name: modelName, exact: true }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await waitForLoaderIdle(page);

    // 4. The diagram's project-name button opens the "Model Info" kendo
    //    dialog (portal-mounted). Updating Version + Save is a clean
    //    model-level diagram change.
    await page.locator(".project-name-btn").click();
    const modelInfo = page.getByRole("dialog", { name: "Model Info" });
    await expect(modelInfo).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const versionInput = modelInfo.locator('input[placeholder="Version"]').first();
    await expect(versionInput).toBeVisible();
    await versionInput.fill(TM.version.updated);

    await modelInfo.getByRole("button", { name: ROLES.buttons.save, exact: true }).click();
    await expect(modelInfo).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page);

    // 5. Back on the home grid, the row should show the new version, sit at
    //    the top of the Modified-DESC list, and have a "Today …" timestamp.
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

    const firstDataRowName = ((await page.getByRole("row").nth(1).locator("td[role='gridcell']").nth(1).textContent()) || "").trim();
    expect(firstDataRowName).toContain(modelName);
  });
});
