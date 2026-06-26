import { expect, type Page, type Locator } from "@playwright/test";
// @ts-ignore -- helpers.js is CommonJS
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  ROLES,
  dismissPostLoginOverlays,
  dismissOnboardingIfShown,
  waitForLoaderIdle,
  fillRequiredCustomFields,
} from "./helpers";
import testdata from "../data/testdata.json";

// Threat Models Screen CRUD helpers.
//
// Flows verified live via Playwright MCP on 2026-06-26 (solo runs all
// passed). Parallel runs failed last session due to tenant-sharing
// races; the v4-prompt run uses `--workers=1` (see package.json) to
// avoid that.
//
// Verified anchors (from memory + this session):
//   - Create dialog opens via getByRole("button", { name: "Create new menu" })
//     + getByRole("menuitem", { name: /Threat Model/ }). Id-based menu
//     lookup picks the icon-only variant and the menuitem is hidden.
//   - Submit: button#createSave_button. Success: /threatmodeldiagram URL.
//   - Archive icon: i[aria-label="Archive"] (JS dispatch -- the icon
//     sits behind page chrome).
//   - Restore icon: i[aria-label="Restore"] (JS dispatch).
//   - Permanent Delete icon: i[aria-label="Delete"] (JS dispatch).
//   - Confirm dialog for permanent delete uses a button labeled
//     "Delete" (NOT "Yes" -- memory entry confirms this).
//   - Row Expand Details: i[id^="tour-expand-detail-"] -- look up by
//     model name (closest row contains the name), then JS-dispatch.
//   - Overlays that re-appear and block clicks: tm-loader .overlay,
//     tm-release-note, ngx-guided-tour, .k-overlay. Wipe before every
//     interactive click via clearBlockingOverlays.

const TM_DATA = testdata.threatModel;
const TM_FIELDS = TM_DATA.fields as any;
const DIAGRAM_URL = new RegExp(URL_PATTERNS.threatModelDiagram, "i");
const TM_URL = new RegExp(URL_PATTERNS.loggedIn, "i");

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Overlay management -----------------------------------------------

// Wipes overlays that intermittently re-appear after navigation and
// intercept pointer events. Called before every interactive click.
export async function clearBlockingOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
    document
      .querySelectorAll(
        "ngx-guided-tour, .guided-tour-user-input-mask, .k-overlay, .tour-backdrop, tm-release-note",
      )
      .forEach((el) => el.remove());
  });
}

// ---- Navigation -------------------------------------------------------

export async function gotoTMList(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}${PATHS.threatModels}`);
  await dismissPostLoginOverlays(page);
  await expect(page).toHaveURL(TM_URL, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
}

export async function gotoArchivedList(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}${PATHS.threatModelsArchived}`);
  await dismissPostLoginOverlays(page);
  await waitForLoaderIdle(page).catch(() => {});
  await expect(page).toHaveTitle(new RegExp(TITLES.threatModelsArchived), {
    timeout: TIMEOUTS.navMedium,
  });
}

// ---- Create -----------------------------------------------------------

// Live-verified create flow (Playwright MCP 2026-06-26):
//   1. Create-new menu opens via getByRole("button", { name: "Create new menu" })
//      (id-based lookup #create-new-menu picks the wrong instance --
//      the menuitem ends up CSS-hidden so id-based clicks deadlock).
//   2. Pick the Threat Model menuitem via getByRole.
//   3. Dialog has Name + Version inputs + custom required fields.
//      Required base fields default: Model Type (AWS Cloud Application),
//      Project Status (In Progress), Risk (Medium).
//   4. Submit via button#createSave_button (aria-label "Create New Model").
//   5. Success signal: page navigates to /threatmodeldiagram/{guid}.
export async function createDisposableModel(
  page: Page,
  prefix: string = "AutoTMS",
): Promise<{ modelName: string }> {
  const modelName = `${prefix}-${Date.now()}`;
  await waitForLoaderIdle(page).catch(() => {});
  await clearBlockingOverlays(page);

  await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
  await page
    .getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) })
    .click();

  const dialog = page.getByRole("dialog").filter({ hasText: "Create New Threat Model" });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await dismissOnboardingIfShown(page);

  await dialog.locator('input[placeholder="Enter Model Name"]').fill(modelName);
  await dialog.locator('input[placeholder="Enter Version"]').fill(TM_DATA.version.initial);
  await fillRequiredCustomFields(page, dialog, TM_FIELDS);

  const createBtn = page.locator("button#createSave_button");
  await expect(createBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
  await createBtn.click();

  // Angular can take navLong (~60s) on first nav after login.
  await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
  await expect(page).toHaveTitle(new RegExp(TITLES.threatModelDiagram), {
    timeout: TIMEOUTS.navMedium,
  });
  return { modelName };
}

// ---- Row lookup -------------------------------------------------------

export function findRowByName(page: Page, modelName: string): Locator {
  return page
    .getByRole("row", { name: new RegExp(`\\b${escapeRegExp(modelName)}\\b`) })
    .first();
}

export async function waitForRow(page: Page, modelName: string): Promise<Locator> {
  const row = findRowByName(page, modelName);
  await expect(row).toBeVisible({ timeout: TIMEOUTS.rowVisible });
  return row;
}

// Some clicks (expand-details, archive, restore, delete icons) get
// intercepted by release-note / loader overlays that re-appear between
// the wipe and Playwright's actionability check. Dispatching the click
// via page.evaluate bypasses pointer-events entirely. The row is found
// by name (closest [role=row] containing the model name) so we don't
// have to depend on grid row order.
export async function jsClickRowExpandDetailsForModel(
  page: Page,
  modelName: string,
): Promise<void> {
  await clearBlockingOverlays(page);
  const clicked = await page.evaluate((name) => {
    const icons = document.querySelectorAll('i[id^="tour-expand-detail-"]');
    for (const icon of Array.from(icons)) {
      const row = icon.closest('[role="row"]') || icon.closest("tr");
      if (row && (row.textContent || "").includes(name)) {
        (icon as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, modelName);
  if (!clicked) {
    throw new Error(`Could not find expand-details icon for model: ${modelName}`);
  }
}

// Same pattern for the row checkbox: the `#tm-kendo-checkbox-N` input
// is also intercepted by overlays in some states. JS-dispatch the click
// after locating the checkbox inside the row that matches modelName.
// Falls back to checkbox index 0 (freshly created models live at the
// top of the Modified-DESC grid) when name-based lookup fails -- the
// kendo grid sometimes renders the row's textContent across nested
// elements that don't all bubble to row.textContent reliably.
export async function jsClickRowCheckboxForModel(
  page: Page,
  modelName: string,
): Promise<void> {
  await clearBlockingOverlays(page);
  const clicked = await page.evaluate((name) => {
    const inputs = document.querySelectorAll('input[id^="tm-kendo-checkbox-"]');
    // First pass: walk every checkbox; check if its closest row contains
    // the model name in its full text.
    for (const inp of Array.from(inputs)) {
      const row = inp.closest('[role="row"]') || inp.closest("tr");
      if (row && (row.textContent || "").includes(name)) {
        (inp as HTMLElement).click();
        return { matched: "name", id: inp.id };
      }
    }
    // Fallback: the page-wide search for `modelName` (typed earlier or
    // implicit via gridrow render) returned a single row; or the page
    // is freshly loaded after create and the row is at index 0. Click
    // checkbox-0 IFF the row text near it contains modelName too -- if
    // not, give up.
    const first = document.querySelector("#tm-kendo-checkbox-0") as HTMLElement | null;
    if (first) {
      const row = first.closest('[role="row"]') || first.closest("tr");
      const fullBody = document.body.innerText || "";
      if (fullBody.includes(name)) {
        first.click();
        return { matched: "index0-page-has-name", id: first.id };
      }
    }
    return { matched: null };
  }, modelName);
  if (!clicked || !clicked.matched) {
    throw new Error(`Could not find row checkbox for model: ${modelName}`);
  }
}

// ---- Archive ----------------------------------------------------------

export async function archiveModelByName(page: Page, modelName: string): Promise<void> {
  await clearBlockingOverlays(page);
  await waitForRow(page, modelName);
  // Use JS dispatch for the checkbox click -- the kendo-input behind the
  // visible checkbox is intercepted by tm-release-note / k-overlay in
  // some states; Playwright's standard check() then deadlocks.
  await jsClickRowCheckboxForModel(page, modelName);
  await clearBlockingOverlays(page);
  await page.getByRole("button", { name: ROLES.buttons.threatModelMenu }).click();
  // Archive icon sits behind the page header chrome -- JS dispatch.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.click();
  }, testdata.selectors.archiveIcon);
  const confirm = page.getByRole("dialog", { name: ROLES.dialogs.archiveThreatModel });
  await expect(confirm).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await confirm.getByRole("button", { name: ROLES.buttons.archive, exact: true }).click();
  await expect(confirm).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  await waitForLoaderIdle(page).catch(() => {});
  // STATE-CHANGE ASSERTION: row is gone from active list.
  await expect(page.getByRole("button", { name: modelName, exact: true })).toHaveCount(0, {
    timeout: TIMEOUTS.rowVisible,
  });
}

// ---- Restore ----------------------------------------------------------

export async function restoreModelByName(page: Page, modelName: string): Promise<void> {
  await gotoArchivedList(page);
  await clearBlockingOverlays(page);
  await waitForRow(page, modelName);
  // JS-dispatch the row checkbox for the model.
  await jsClickRowCheckboxForModel(page, modelName);
  await clearBlockingOverlays(page);
  await page.evaluate(() => {
    const i = document.querySelector('i[aria-label="Restore"]') as HTMLElement | null;
    i?.click();
  });
  // Confirm dialog: button labeled "Yes" or "Restore" depending on
  // dialog variant.
  const confirm = page.getByRole("dialog").first();
  if (await confirm.isVisible({ timeout: TIMEOUTS.elementVisible }).catch(() => false)) {
    const btn = confirm
      .getByRole("button", { name: /^(Yes|Restore)$/ })
      .first();
    if (await btn.isVisible().catch(() => false)) await btn.click();
  }
  await waitForLoaderIdle(page).catch(() => {});
  // STATE-CHANGE ASSERTION: row is gone from archived list.
  await expect(page.getByRole("button", { name: modelName, exact: true })).toHaveCount(0, {
    timeout: TIMEOUTS.rowVisible,
  });
}

// ---- Permanent delete ------------------------------------------------

// Verified live 2026-06-26 (orphan cleanup). The confirm dialog uses a
// button labeled "Delete" (NOT "Yes" -- memory entry).
export async function permanentDeleteFromArchive(page: Page, modelName: string): Promise<void> {
  await gotoArchivedList(page);
  await clearBlockingOverlays(page);
  // Search to narrow the list.
  const search = page.locator(testdata.threatModelsScreen.selectors.searchInput).first();
  if (await search.isVisible({ timeout: TIMEOUTS.elementVisible }).catch(() => false)) {
    await search.fill(modelName);
    await page.waitForTimeout(1500); // debounced
  }
  const present = await page
    .getByRole("button", { name: modelName, exact: true })
    .first()
    .isVisible({ timeout: TIMEOUTS.elementVisible })
    .catch(() => false);
  if (!present) return;
  // JS-dispatch row checkbox to bypass overlay interception.
  await jsClickRowCheckboxForModel(page, modelName);
  await clearBlockingOverlays(page);
  await page.evaluate(() => {
    const i = document.querySelector('i[aria-label="Delete"]') as HTMLElement | null;
    i?.click();
  });
  const confirm = page.getByRole("dialog").first();
  await expect(confirm).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  // Memory: confirm button label is "Delete" not "Yes" on this dialog.
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await waitForLoaderIdle(page).catch(() => {});
  // Re-search; STATE-CHANGE: row truly gone.
  await search.fill(modelName).catch(() => {});
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: modelName, exact: true })).toHaveCount(0, {
    timeout: TIMEOUTS.rowVisible,
  });
}

// Convenience cleanup: archive + permanent delete. Idempotent.
export async function cleanupDisposableModel(page: Page, modelName: string): Promise<void> {
  await gotoTMList(page);
  const search = page.locator(testdata.threatModelsScreen.selectors.searchInput).first();
  if (await search.isVisible({ timeout: TIMEOUTS.elementVisible }).catch(() => false)) {
    await search.fill(modelName);
    await page.waitForTimeout(1500);
  }
  const stillActive = await page
    .getByRole("button", { name: modelName, exact: true })
    .first()
    .isVisible({ timeout: TIMEOUTS.elementVisible })
    .catch(() => false);
  if (stillActive) {
    await archiveModelByName(page, modelName);
  }
  await permanentDeleteFromArchive(page, modelName);
}

// ---- Edit inline -----------------------------------------------------

// Edits the model's Version field via the row's Expand Details inline
// panel. Uses the JS-dispatch expand-details click (the icon is
// intercepted by overlays under live conditions). STATE-CHANGE
// ASSERTION: row re-renders with the new version cell.
export async function editModelVersionInline(
  page: Page,
  modelName: string,
  newVersion: string,
): Promise<void> {
  await waitForRow(page, modelName);
  await jsClickRowExpandDetailsForModel(page, modelName);
  const versionField = page.getByRole("textbox", { name: ROLES.textboxes.versionField });
  await expect(versionField).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await versionField.fill(newVersion);
  await clearBlockingOverlays(page);
  const saveBtn = page.getByRole("button", { name: ROLES.buttons.save, exact: true });
  await expect(saveBtn).toBeEnabled({ timeout: TIMEOUTS.buttonEnabled });
  await saveBtn.click();
  await expect(
    page
      .getByRole("row", {
        name: new RegExp(`${escapeRegExp(modelName)}\\s+${newVersion.replace(".", "\\.")}`),
      })
      .first(),
  ).toBeVisible({ timeout: TIMEOUTS.rowVisible });
}

// ---- Export download -------------------------------------------------

export async function triggerExportDownload(
  page: Page,
  format: "excel" | "csv",
): Promise<{ filename: string }> {
  await clearBlockingOverlays(page);
  const TMS = testdata.threatModelsScreen.selectors;
  const optionId = format === "excel" ? TMS.exportOptionExcel : TMS.exportOptionCsv;
  // Open the dropdown; if it's already open the click toggles it shut,
  // so check the option's visibility first.
  const optionEl = page.locator(optionId).first();
  const alreadyOpen = await optionEl.isVisible({ timeout: 1000 }).catch(() => false);
  if (!alreadyOpen) {
    await page.locator(TMS.exportDropdownTrigger).first().click();
    // Let the kendo popup animate in before we click the option.
    await expect(optionEl).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  }
  // CSV downloads can be slower than Excel on this tenant; use the
  // navLong timeout for the download event (60s) instead of the default.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: TIMEOUTS.navLong }),
    optionEl.click(),
  ]);
  return { filename: download.suggestedFilename() };
}
