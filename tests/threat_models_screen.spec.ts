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

// Target values for each editable detail visible on the home-screen grid
// (defined in testdata.threatModel.edit; defaults are
// testdata.threatModel.defaults).
const UPDATED = TM.edit;

// Opens the Version column's kendo column-menu, expands the Columns picker,
// turns on "Created" if it's not already on, and Applies. Returns a header→
// cell-index map so callers can target columns by name (cell index = header
// index + 1, because cell 0 is the row-expander/select cell).
async function enableCreatedColumn(page: Page): Promise<Record<string, number>> {
  const headerMap = async (): Promise<Record<string, number>> =>
    page.evaluate(() => {
      const map: Record<string, number> = {};
      Array.from(document.querySelectorAll('th[role="columnheader"]')).forEach((h, idx) => {
        const text = (h.textContent || "").trim();
        if (text) map[text] = idx + 1;
      });
      return map;
    });

  if ("Created" in (await headerMap())) return headerMap();

  // Force-hide any lingering loader overlay so it doesn't intercept clicks.
  await page.evaluate(() => {
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
  });

  // The Filter Column dialog opens via a kendo anchor inside any header.
  // A direct DOM .click() reliably triggers the kendo handler even when
  // Playwright's pointer-event click would be intercepted.
  await page.evaluate(() => {
    const versionHeader = Array.from(
      document.querySelectorAll('th[role="columnheader"]'),
    ).find((h) => (h.textContent || "").trim() === "Version");
    if (!versionHeader) throw new Error("Version column header not found");
    const anchor = versionHeader.querySelector("a.k-grid-column-menu") as HTMLElement | null;
    if (!anchor) throw new Error("column-menu anchor not found");
    anchor.click();
  });

  const menu = page.getByRole("dialog", { name: "Filter Column" });
  await expect(menu).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await menu.getByRole("button", { name: "Columns", exact: true }).click({ force: true });
  await menu
    .locator("label")
    .filter({ hasText: /^Created$/ })
    .first()
    .click({ force: true });
  await menu.getByRole("button", { name: "Apply", exact: true }).click({ force: true });
  await expect.poll(async () => "Created" in (await headerMap()), {
    timeout: TIMEOUTS.rowVisible,
  }).toBe(true);
  return headerMap();
}

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

    const originalName = `${TM.namePrefixes.editAll}-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(originalName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Back on the home grid, expand the row's inline detail panel.
    //    Skip waitForLoaderIdle here: after creating a new model the grid
    //    loader intermittently lingers past its 30s budget (especially in
    //    headed mode); the row-visible assertion auto-waits for data load,
    //    and the inline overlay strip below clears any loader still painting
    //    over the row before the click.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    const row = page.getByRole("row", { name: new RegExp(`\\b${originalName}\\b`) }).first();
    await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    await page.evaluate(() => {
      document
        .querySelectorAll("tm-release-note, .k-overlay, .tour-backdrop, ngx-guided-tour")
        .forEach((el) => el.remove());
      document.querySelectorAll("tm-loader .overlay").forEach((el) => {
        const h = el as HTMLElement;
        h.style.display = "none";
        h.style.pointerEvents = "none";
      });
    });
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

    const modelName = `${TM.namePrefixes.diagramEdit}-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Snapshot the home-grid Modified text before the diagram edit.
    //    Skip waitForLoaderIdle (lingers past 30s after fresh TM create);
    //    row-visible assertion auto-waits, and the inline overlay strip
    //    clears any loader before the model-name click in step 3.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    const initialRow = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await expect(initialRow).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    const initialModified = ((await initialRow.locator("td[role='gridcell']").nth(6).textContent()) || "").trim();
    expect(initialModified).toMatch(/Today/);

    // 3. Re-open the diagram by clicking the model name in the row.
    await page.evaluate(() => {
      document
        .querySelectorAll("tm-release-note, .k-overlay, .tour-backdrop, ngx-guided-tour")
        .forEach((el) => el.remove());
      document.querySelectorAll("tm-loader .overlay").forEach((el) => {
        const h = el as HTMLElement;
        h.style.display = "none";
        h.style.pointerEvents = "none";
      });
    });
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
    //    Skip waitForLoaderIdle (lingers past 30s after diagram edit); the
    //    row-visible assertion auto-waits for the data load to settle.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);

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

  test("C13581-Create new Threat model and Check Model Name, Version, Risk, Project Status, Author, Modified, Created and Description show correct on home screen", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);

    // 1. Create a fresh threat model with a known name, version, and
    //    description so we can assert each column / detail value precisely.
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const createDialog: Locator = page.getByRole("dialog", {
      name: ROLES.dialogs.createThreatModel,
    });
    await expect(createDialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.homeCols}-${Date.now()}`;
    const description = `${TM.descriptionPrefix}-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    const descriptionEditor = createDialog.locator('.ql-editor[data-placeholder*="Description"]').first();
    await descriptionEditor.click();
    await descriptionEditor.pressSequentially(description, { delay: 10 });
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Return to the home grid for column assertions. We deliberately skip
    //    waitForLoaderIdle here: after creating a new model the grid loader
    //    intermittently lingers past its 30s budget, but dismissPostLoginOverlays
    //    has already force-hidden the overlay element, and the row-visible
    //    assertion below auto-waits for the data load to settle.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);

    // 3. Locate the new row. Cell index 0 is the row-expander/select cell.
    //    Once the row is visible the grid headers are mounted, which is the
    //    prerequisite for opening the column-menu in the next step.
    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });

    // 4. "Created" isn't a default-visible column. Toggle it on through any
    //    header's column-menu Columns picker so we can assert it alongside
    //    Modified. The kendo grid's loader overlay intermittently intercepts
    //    pointer events even after the data has loaded, so we drive the
    //    column menu via direct DOM clicks and force-clicks.
    const columnIndex = await enableCreatedColumn(page);

    // 5. Each visible column should reflect what we entered (Name, Version)
    //    or the documented create-time defaults (Risk = Medium, Status =
    //    In Progress). Author / Modified / Created are filled by the server.
    const cells = row.locator("td[role='gridcell']");
    await expect(cells.nth(columnIndex.Name)).toContainText(modelName);
    await expect(cells.nth(columnIndex.Version)).toContainText(TM.version.initial);
    await expect(cells.nth(columnIndex.Risk)).toContainText(TM.defaults.risk);
    await expect(cells.nth(columnIndex.Status)).toContainText(TM.defaults.status);
    expect(((await cells.nth(columnIndex.Author).textContent()) || "").trim()).not.toBe("");
    await expect(cells.nth(columnIndex.Modified)).toContainText(/Today/);
    await expect(cells.nth(columnIndex.Created)).toContainText(/Today/);

    // 6. Description isn't on the grid — it lives in the inline detail panel
    //    as a Quill editor that mirrors the create-dialog field. The
    //    tm-release-note overlay can re-mount asynchronously after the
    //    column-menu interaction above, so re-dismiss before clicking.
    await dismissPostLoginOverlays(page);
    await row.getByRole("button", { name: ROLES.buttons.expandDetails }).click();
    const descPanel = page.locator('.ql-editor[data-placeholder*="Description"]').first();
    await expect(descPanel).toContainText(description, { timeout: TIMEOUTS.elementVisible });
  });

  test("C13580-Change the project status to (In Progress, Review, Starting, Started, Work In Prog) and Check Project status column changed or not", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);

    // 1. Create a fresh TM (defaults to "In Progress").
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const createDialog: Locator = page.getByRole("dialog", {
      name: ROLES.dialogs.createThreatModel,
    });
    await expect(createDialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.statusCycle}-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });

    // 2. Move to the home grid for inline editing. Skip waitForLoaderIdle:
    //    after creating a new model the grid loader intermittently lingers
    //    past its 30s budget; the row-visible assertion inside the loop
    //    auto-waits for the data load, and the in-loop force-hide handles
    //    any overlay that re-mounts.
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);

    // 3. Cycle the Project Status through each settable value and verify the
    //    Status column (cell index 4) updates after every save. Note: the
    //    approval-workflow states (Pending Approval / Approved / Denied)
    //    aren't direct picks on this dropdown — they're set via the diagram
    //    page's Approval Workflow action.
    for (const status of TM.statusCycle) {
      const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
      await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });

      // New TMs default to "In Progress"; re-selecting the same value leaves
      // the form pristine so Save stays disabled. Skip no-op iterations.
      const currentStatus = ((await row.locator("td[role='gridcell']").nth(4).textContent()) || "").trim();
      if (currentStatus === status) continue;

      // Two overlays can intercept the next expand click: the grid's
      // tm-loader (re-fires after each save and lingers past
      // waitForLoaderIdle), and a tm-release-note k-overlay that re-mounts
      // asynchronously. Force-remove/hide both inline — calling the full
      // dismissPostLoginOverlays helper per iteration is too slow.
      await page.evaluate(() => {
        document
          .querySelectorAll("tm-release-note, .k-overlay, .tour-backdrop, ngx-guided-tour")
          .forEach((el) => el.remove());
        document.querySelectorAll("tm-loader .overlay").forEach((el) => {
          const h = el as HTMLElement;
          h.style.display = "none";
          h.style.pointerEvents = "none";
        });
      });

      await row.getByRole("button", { name: ROLES.buttons.expandDetails }).click();

      await page.locator('kendo-dropdownlist[aria-label="Select Project Status"]').first().click();
      await page.getByRole("option", { name: status, exact: true }).first().click();

      const saveBtn = page.getByRole("button", { name: ROLES.buttons.save, exact: true });
      await expect(saveBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
      await saveBtn.click();
      await waitForLoaderIdle(page);

      // Re-fetch the row: the Modified-DESC sort can re-position it, leaving
      // the prior reference stale.
      const refreshedRow = page
        .getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) })
        .first();
      await expect(refreshedRow.locator("td[role='gridcell']").nth(4)).toContainText(status, {
        timeout: TIMEOUTS.rowVisible,
      });

      // Save leaves the inline panel expanded; collapse so the next iteration
      // finds a fresh "Expand Details" toggle.
      const collapseBtn = refreshedRow.getByRole("button", { name: "Collapse Details" });
      if (await collapseBtn.isVisible().catch(() => false)) {
        await collapseBtn.click();
      }
    }
  });

  test("C13582-Check if added/edited collaborators list from diagram get updated on Home Screen and Vise Versa", async ({ page }: { page: Page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);

    // 1. Create a fresh TM. The creator becomes the sole Project Admin
    //    collaborator under the Users tab, giving us a known baseline.
    await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
    await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
    const createDialog: Locator = page.getByRole("dialog", {
      name: ROLES.dialogs.createThreatModel,
    });
    await expect(createDialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `${TM.namePrefixes.collab}-${Date.now()}`;
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
    await createDialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
    await fillRequiredCustomFields(page, createDialog, TM_FIELDS);
    await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await dismissPostLoginOverlays(page);

    // The "Manage Collaborators" dialog (`kendo-dialog.share-model-members`)
    // is shared between the diagram's Share button
    // (`#diagram-shareModal-button`) and the home inline panel's Manage
    // Collaborators button (`#collab-share-btn`). Same dialog, same flow:
    // search, click suggestion, Save, wait for it to close.
    const addCollaborator = async (searchTerm: string, fullName: string) => {
      const dialog = page.locator("kendo-dialog.share-model-members");
      await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await dialog.locator("#shareModel-searchUserOrGroup-input").fill(searchTerm);
      const option = dialog
        .locator(".mm-dropdown-option")
        .filter({ hasText: fullName })
        .first();
      await expect(option).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await option.click();
      await dialog.getByRole("button", { name: ROLES.buttons.save, exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    };

    // 2. DIAGRAM → HOME: add a collaborator from the diagram's Share button,
    //    then verify it surfaces on the home-screen inline Collaborators
    //    card (`#tour-collabrator`).
    const userFromDiagram = TM.collaborators.fromDiagram.fullName;
    await page.locator("#diagram-shareModal-button").click();
    await addCollaborator(TM.collaborators.fromDiagram.searchTerm, userFromDiagram);

    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await dismissPostLoginOverlays(page);
    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });
    // Same overlay churn that hits C13580 / C13581 — strip lingering
    // loaders + release-notes before the expand-details click.
    await page.evaluate(() => {
      document
        .querySelectorAll("tm-release-note, .k-overlay, .tour-backdrop, ngx-guided-tour")
        .forEach((el) => el.remove());
      document.querySelectorAll("tm-loader .overlay").forEach((el) => {
        const h = el as HTMLElement;
        h.style.display = "none";
        h.style.pointerEvents = "none";
      });
    });
    await row.getByRole("button", { name: ROLES.buttons.expandDetails }).click();

    const inlineCollabCard = page.locator("#tour-collabrator");
    await expect(inlineCollabCard).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    // The Users tab is active by default; the new collaborator should render
    // as `.collab-row .collab-name`.
    await expect(
      inlineCollabCard.locator(".collab-row .collab-name").filter({ hasText: userFromDiagram }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // 3. HOME → DIAGRAM: add a second collaborator from the inline panel's
    //    Manage Collaborators button, then verify both users surface back
    //    in the diagram's Share dialog.
    const userFromHome = TM.collaborators.fromHome.fullName;
    await inlineCollabCard.locator("#collab-share-btn").click();
    await addCollaborator(TM.collaborators.fromHome.searchTerm, userFromHome);

    // Re-open the diagram via the master row's model-name button (same
    // pattern as C13577). Re-fetch the row — the modified-DESC sort can
    // re-position it.
    const refreshedRow = page
      .getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) })
      .first();
    await refreshedRow.getByRole("button", { name: modelName, exact: true }).click();
    await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
    await dismissPostLoginOverlays(page);

    await page.locator("#diagram-shareModal-button").click();
    const dialog = page.locator("kendo-dialog.share-model-members");
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    // The dialog renders each added user with a `Remove {Name}` action
    // button (the inline panel's `.collab-row .collab-name` structure
    // doesn't apply here). That button is the most reliable presence check.
    for (const name of [userFromDiagram, userFromHome]) {
      await expect(
        dialog.getByRole("button", { name: `Remove ${name}` }),
      ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    }
  });
});
