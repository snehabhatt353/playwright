// @ts-check
const { test, expect } = require("@playwright/test");
/** @typedef {import('@playwright/test').Page} Page */

const BASE_URL = "https://tmdev.threatmodeler.us";
const USERNAME = process.env.TM_USER || "sbhatt";
const PASSWORD = process.env.TM_PASS || "Sneha@123";

/** @param {Page} page */
async function login(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForURL(/(\/idsvr\/Account\/Login|\/threatmodels)/i, { timeout: 30_000 });
  if (/\/idsvr\/Account\/Login/i.test(page.url())) {
    const usernameField = page.getByRole("textbox", { name: "Username*" });
    const passwordField = page.getByRole("textbox", { name: "Password*" });
    await expect(usernameField).toBeVisible({ timeout: 15_000 });
    await usernameField.click();
    await usernameField.pressSequentially(USERNAME, { delay: 30 });
    await passwordField.click();
    await passwordField.pressSequentially(PASSWORD, { delay: 30 });
    await Promise.all([
      page.waitForURL(/\/threatmodels(\?|$|\/)/, { timeout: 30_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
  }
  await expect(page).toHaveTitle(/Threat Models \| ThreatModeler/);
}

/** @param {Page} page */
async function dismissOnboardingIfShown(page) {
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

/** @param {Page} page */
async function dismissPostLoginOverlays(page) {
  // Welcome modal ("Welcome aboard ...") + ngx-guided-tour mask + Kendo overlays
  // all block nav clicks on first login. Click Skip buttons opportunistically,
  // then forcibly remove any remaining blocking layers so the nav is clickable.
  for (let i = 0; i < 5; i++) {
    let actedOnUI = false;
    for (const name of ["Skip for Now", "Dismiss", "Skip"]) {
      const btn = page.getByRole("button", { name, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        actedOnUI = true;
      }
    }
    if (!actedOnUI) break;
    await page.waitForTimeout(300);
  }
  // Final cleanup: strip any leftover blocking layers and persist Do-Not-Show flags.
  await page.evaluate(() => {
    document
      .querySelectorAll(
        "ngx-guided-tour, .guided-tour-user-input-mask, .k-overlay, .tour-backdrop, tm-release-note",
      )
      .forEach((el) => el.remove());
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = /** @type {HTMLElement} */ (el);
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
    try {
      localStorage.setItem("threat-modeler-tour", "true");
    } catch {}
  });
}

/**
 * Captures a full-page screenshot, saves it to `screenshots/<folder>/<name>.png`,
 * AND attaches it to the running test so it shows up in the Playwright HTML report.
 *
 * @param {Page} page
 * @param {string} folder
 * @param {string} name
 */
async function snap(page, folder, name) {
  const path = `screenshots/${folder}/${name}.png`;
  const body = await page.screenshot({ path, fullPage: true });
  await test.info().attach(`${folder}/${name}`, { body, contentType: "image/png" });
}

/**
 * @param {Page} page
 * @param {number} [timeout]
 */
async function waitForLoaderIdle(page, timeout = 30_000) {
  await expect
    .poll(async () => await page.locator("tm-loader .overlay:visible").count(), { timeout })
    .toBe(0);
}

/**
 * Picks the first non-placeholder option from an open Kendo dropdown listbox.
 * Kendo renders the popup at document.body, so we scope to li[role="option"]
 * inside the most recently mounted listbox.
 *
 * @param {Page} page
 */
async function pickFirstRealOption(page) {
  const options = page.locator('li[role="option"]:visible');
  await options.first().waitFor({ state: "visible", timeout: 5_000 });
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const label = (await options.nth(i).textContent())?.trim() ?? "";
    if (label && label !== "-") {
      await options.nth(i).click();
      return;
    }
  }
}

/**
 * Returns labels that are marked required (have `*` via ::after) in the dialog.
 * The tenant can toggle which custom fields are required, so we detect rather
 * than hard-code.
 *
 * @param {Page} page
 */
async function getRequiredLabels(page) {
  return page.evaluate(() => {
    const dlg = document.querySelector("kendo-dialog");
    if (!dlg) return [];
    const labels = new Set();
    dlg.querySelectorAll("*").forEach((el) => {
      const after = window.getComputedStyle(el, "::after");
      if (after && after.content && after.content.includes("*")) {
        const txt = (el.textContent || "").trim();
        if (txt && txt.length < 40) labels.add(txt);
      }
    });
    return [...labels];
  });
}

/**
 * Fills required custom fields (marked with *) in the Create New Threat Model dialog.
 * The tenant config controls which fields are required. Each branch checks whether
 * its corresponding label appears in the required set; otherwise it leaves the field
 * untouched so optional fields don't accumulate test noise.
 *
 * @param {Page} page
 * @param {import('@playwright/test').Locator} dialog
 */
async function fillRequiredCustomFields(page, dialog) {
  const required = new Set(await getRequiredLabels(page));
  // Strip the optional values that are always required (Name/Type/Version/Status/Risk)
  // since the test already populates Name + Version and the rest have defaults.
  ["Name", "Model Type", "Version", "Project Status", "Risk"].forEach((s) => required.delete(s));
  if (required.size === 0) return; // No tenant-specific required fields — done.

  // Plain textboxes
  for (const [placeholder, value, label] of [
    ["Enter TM text1", "auto-text", "TM text1"],
    ["Enter TM - number", "42", "TM - number"],
  ]) {
    if (!required.has(label)) continue;
    const tb = dialog.locator(`input[placeholder="${placeholder}"]`).first();
    if (await tb.isVisible().catch(() => false)) {
      await tb.fill(value);
    }
  }

  // TM TextArea — Quill-style rich text. Click the editable area and type.
  if (required.has("TM TextArea")) {
    const editors = dialog.locator('[contenteditable="true"]');
    const n = await editors.count();
    for (let i = 0; i < n; i++) {
      const block = editors.nth(i);
      const txt = (await block.textContent())?.trim() ?? "";
      if (/Add TM TextArea/i.test(txt)) {
        await block.click();
        await page.keyboard.type("auto-text");
        break;
      }
    }
  }

  // TM Date — kendo-datepicker; type directly into its input.
  if (required.has("TM Date")) {
    const dateInput = dialog.locator("kendo-datepicker input").first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.click();
      await dateInput.fill("2026-05-18");
      await page.keyboard.press("Tab");
    }
  }

  // Single-select kendo-dropdownlists — aria-label has trailing spaces in some cases.
  for (const labelFragment of ["TM - User", "TM - Department", "TM - single select"]) {
    if (!required.has(labelFragment)) continue;
    const dd = dialog.locator(`kendo-dropdownlist[aria-label*="${labelFragment}"]`).first();
    if (await dd.isVisible().catch(() => false)) {
      await dd.click();
      await pickFirstRealOption(page);
    }
  }

  // Multi-select kendo-multiselect.
  if (required.has("TM - Multi select")) {
    const multi = dialog.locator('kendo-multiselect[aria-label*="TM - Multi select"]').first();
    if (await multi.isVisible().catch(() => false)) {
      await multi.click();
      await pickFirstRealOption(page);
      await page.keyboard.press("Escape");
    }
  }

  // TM - link — open popover, fill URL, save.
  if (required.has("TM - link")) {
    const linkEdit = dialog.getByRole("button", { name: "Edit TM - link" });
    if (await linkEdit.first().isVisible().catch(() => false)) {
      await linkEdit.first().click();
      const urlField = page
        .locator('input[placeholder*="URL"i], input[placeholder*="Link"i], input[name*="url"i]')
        .first();
      if (await urlField.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await urlField.fill("https://example.com");
        const save = page
          .getByRole("button", { name: /^(Save|Update|Apply|Done|OK)$/ })
          .first();
        if (await save.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await save.click();
        } else {
          await page.keyboard.press("Enter");
        }
      }
    }
  }
}

test.describe("Create Threat Model on tmdev.threatmodeler.us", () => {
  test.setTimeout(90_000);

  test("creates a new blank threat model with required fields", async ({ page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, "create", "01-after-login");

    await page.getByRole("button", { name: "Create new menu" }).click();
    await page.getByRole("menuitem", { name: /Threat Model/ }).click();

    const dialog = page.getByRole("dialog", { name: "Create New Threat Model" });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, "create", "02-dialog-open");

    const modelName = `AutoTM-${Date.now()}`;
    await dialog.getByRole("textbox", { name: "Enter Model Name" }).fill(modelName);
    await dialog.getByRole("textbox", { name: "Enter Version" }).fill("1.0");
    await fillRequiredCustomFields(page, dialog);
    await snap(page, "create", "03-form-filled");

    await expect(dialog.getByRole("tab", { name: "Blank" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const createBtn = page.getByRole("button", { name: "Create New Model" });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    await page.waitForURL(/\/threatmodeldiagram\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    await expect(page).toHaveTitle(/Threat Model Diagram \| ThreatModeler/);
    await snap(page, "create", "04-diagram-loaded");
  });

  test("edits an existing threat model's version and persists the change", async ({ page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, "edit", "01-after-login");

    // Create a fresh TM so the edit test is independent of pre-existing data.
    await page.getByRole("button", { name: "Create new menu" }).click();
    await page.getByRole("menuitem", { name: /Threat Model/ }).click();

    const dialog = page.getByRole("dialog", { name: "Create New Threat Model" });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `EditTM-${Date.now()}`;
    await dialog.getByRole("textbox", { name: "Enter Model Name" }).fill(modelName);
    await dialog.getByRole("textbox", { name: "Enter Version" }).fill("1.0");
    await fillRequiredCustomFields(page, dialog);
    await snap(page, "edit", "02-create-filled");
    await page.getByRole("button", { name: "Create New Model" }).click();
    await page.waitForURL(/\/threatmodeldiagram\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    await snap(page, "edit", "03-diagram-loaded");

    // Back to the list and locate the new row.
    await page.goto(`${BASE_URL}/threatmodels`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await snap(page, "edit", "04-list-with-row");

    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await row.getByRole("button", { name: "Expand Details" }).click();
    await snap(page, "edit", "05-inline-panel");

    // Edit the version inside the expanded inline panel.
    const versionField = page.getByRole("textbox", { name: "Version *" });
    await expect(versionField).toBeVisible();
    await versionField.fill("2.0");
    await snap(page, "edit", "06-version-changed");

    const saveBtn = page.getByRole("button", { name: "Save", exact: true });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // After save, the row header should reflect the new version.
    await expect(
      page.getByRole("row", { name: new RegExp(`${modelName}\\s+2\\.0`) }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await snap(page, "edit", "07-saved");
  });

  test("archives (deletes) a threat model and it appears in Archived", async ({ page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, "archive", "01-after-login");

    // Create a fresh TM so the delete test is independent of pre-existing data.
    await page.getByRole("button", { name: "Create new menu" }).click();
    await page.getByRole("menuitem", { name: /Threat Model/ }).click();

    const dialog = page.getByRole("dialog", { name: "Create New Threat Model" });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);

    const modelName = `DeleteTM-${Date.now()}`;
    await dialog.getByRole("textbox", { name: "Enter Model Name" }).fill(modelName);
    await dialog.getByRole("textbox", { name: "Enter Version" }).fill("1.0");
    await fillRequiredCustomFields(page, dialog);
    await snap(page, "archive", "02-create-filled");
    await page.getByRole("button", { name: "Create New Model" }).click();
    await page.waitForURL(/\/threatmodeldiagram\/[0-9a-f-]{36}/i, { timeout: 60_000 });
    await snap(page, "archive", "03-diagram-loaded");

    // Back to the list and select the new row.
    await page.goto(`${BASE_URL}/threatmodels`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const row = page.getByRole("row", { name: new RegExp(`\\b${modelName}\\b`) }).first();
    await row.getByRole("checkbox", { name: "Select Row" }).check();
    await snap(page, "archive", "04-row-selected");

    // Open the top-of-page Threat Model menu to reveal the Archive action.
    await page.getByRole("button", { name: "Threat Model menu" }).click();
    await snap(page, "archive", "05-menu-open");
    // The Archive icon button is intercepted by the page header; trigger it
    // via JS dispatch to bypass the overlap.
    await page.evaluate(() => {
      const btn = /** @type {HTMLElement|null} */ (
        document.querySelector('i[aria-label="Archive"]')
      );
      btn?.click();
    });

    // Confirm in the dialog.
    const confirm = page.getByRole("dialog", { name: "Archive threat model" });
    await expect(confirm).toBeVisible();
    await snap(page, "archive", "06-confirm-dialog");
    await confirm.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(confirm).toBeHidden({ timeout: 15_000 });

    // It should no longer appear in the main list.
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true })).toHaveCount(0);
    await snap(page, "archive", "07-removed-from-active-list");

    // ...and it should appear in the Archived list.
    await page.goto(`${BASE_URL}/threatmodels/archived`);
    await dismissPostLoginOverlays(page);
    await waitForLoaderIdle(page);
    await expect(page.getByRole("button", { name: modelName, exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveTitle(/Archived Threat Models \| ThreatModeler/);
    await snap(page, "archive", "08-archived-list");
  });

  test("Create New Model is disabled when Name is empty", async ({ page }) => {
    await login(page);
    await dismissPostLoginOverlays(page);
    await snap(page, "negative", "01-after-login");

    await page.getByRole("button", { name: "Create new menu" }).click();
    await page.getByRole("menuitem", { name: /Threat Model/ }).click();

    const dialog = page.getByRole("dialog", { name: "Create New Threat Model" });
    await expect(dialog).toBeVisible();
    await dismissOnboardingIfShown(page);
    await snap(page, "negative", "02-dialog-open");

    await dialog.getByRole("textbox", { name: "Enter Version" }).fill("1.0");
    await snap(page, "negative", "03-version-only");

    await expect(page.getByRole("button", { name: "Create New Model" })).toBeDisabled();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await snap(page, "negative", "04-dialog-closed");
  });
});
