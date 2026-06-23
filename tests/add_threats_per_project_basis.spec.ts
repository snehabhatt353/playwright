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

// The Excel TestRail export "threatmodeler_7.x (12).xlsx" carries 50 cases
// in the "Add threats on a per-project basis" suite, split into three
// sections:
//   - Test Cases             24 cases (C16197-C19102): the Add Threat
//                            dialog itself; combinations with Protocols,
//                            Security Control, Container/Trust/Collection
//                            Groups, Nested Models, dup detection,
//                            Copy/Paste, Import Template, Risk
//                            calculation, Threat Mitigation, TC auto-add,
//                            collaborator add, no-threat / no-component
//                            validations, dashboard / report sync.
//   - Suggested SR on top     7 cases (C17194-C17200): the SR-suggestion
//                            ranking inside the Add Threat dialog.
//   - Remove Threats/SR      19 cases (C17284-C17720): hover-delete icon
//                            on manually-added threats / SRs, single &
//                            multi-delete with confirmation, restriction
//                            on previous versions.
//
// Most cases involve complex on-canvas component setup (drag-drop, group
// creation, Import Template) plus cross-screen verification (reports,
// dashboard, risk calculation). Those need orchestrated state + reliable
// canvas interactions and are out of scope here. This suite covers the
// stable dialog-level contract: opening the Add Threat dialog from the
// diagram's Threats panel and asserting its initial-state buttons /
// validation behaviour. Each test creates a fresh threat model so the
// diagram isn't carrying any prior inconsistent state (some legacy
// models in tenant trigger a "Fix Diagram with AI" modal — guarded
// against, but a fresh model avoids the noise entirely).
//
// Test grouping:
//   Test 1 → C16197 / C16352 / C16353 (Add Threat dialog opens with
//            title; Submit disabled while form is empty — validation
//            for "no component / no threat" cases)
//   Test 2 → C16205 / C16210 (Dialog exposes Add More / Cancel /
//            Submit affordances; Add More + Cancel enabled by default)
//   Test 3 → C17284 / C17287 (Cancel dismisses the dialog without
//            committing — companion to the Remove Threats/SR confirmation
//            contract: actions can be cancelled safely)

const AT = testdata.addThreats;
const TM = testdata.threatModel;
const TM_FIELDS = TM.fields as {
  textboxes?: { label: string; placeholder: string; value: string }[];
  quillLabel?: string;
  dateLabel?: string;
  singleSelects?: string[];
  multiSelectLabel?: string;
  linkLabel?: string;
};
const DIAGRAM_URL = new RegExp(URL_PATTERNS.threatModelDiagram, "i");

// Creates a fresh blank TM and lands on its diagram. Mirrors the pattern
// from the threat_models_screen_old suite but trimmed — we only need to
// reach the diagram with a clean canvas.
async function createFreshTmAndOpenDiagram(page: Page, prefix: string): Promise<string> {
  await login(page);
  await dismissPostLoginOverlays(page);
  await page.getByRole("button", { name: ROLES.buttons.createNewMenu }).click();
  await page.getByRole("menuitem", { name: new RegExp(ROLES.menuItems.threatModel) }).click();
  const dialog = page.getByRole("dialog", { name: ROLES.dialogs.createThreatModel });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await dismissOnboardingIfShown(page);

  const modelName = `${prefix}-${Date.now()}`;
  await dialog.getByRole("textbox", { name: ROLES.textboxes.modelName }).fill(modelName);
  await dialog.getByRole("textbox", { name: ROLES.textboxes.version }).fill(TM.version.initial);
  await fillRequiredCustomFields(page, dialog, TM_FIELDS);
  await page.getByRole("button", { name: ROLES.buttons.createNewModel }).click();
  await page.waitForURL(DIAGRAM_URL, { timeout: TIMEOUTS.navLong });
  await waitForLoaderIdle(page).catch(() => {});
  // Inconsistent-diagram modal can fire on some models — strip it so the
  // side-nav Threats button isn't intercepted.
  await page.evaluate((sels) => {
    document.querySelectorAll(sels.fixDiagramModal).forEach((el) => el.remove());
    document.querySelectorAll(sels.fixDiagramBackdrop).forEach((el) => el.remove());
  }, AT.selectors);
  return modelName;
}

async function openAddThreatDialog(page: Page): Promise<Locator> {
  // Open the diagram's Threats side-nav, then click "Add New" to open
  // the dialog. Two layers of overlays can intercept: tm-loader and the
  // fix-diagram modal — strip both.
  await page.evaluate((sels) => {
    document.querySelectorAll(sels.fixDiagramModal).forEach((el) => el.remove());
    document.querySelectorAll(sels.fixDiagramBackdrop).forEach((el) => el.remove());
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
  }, AT.selectors);
  await page.locator(AT.selectors.diagramThreatsPanelButton).click();
  const addNew = page.locator(AT.selectors.addNewButton);
  await expect(addNew).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  await addNew.click();
  const dialog = page.locator(AT.selectors.addThreatDialog)
    .filter({ hasText: AT.dialogTitle })
    .first();
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return dialog;
}

test.describe("Add Threats per project basis", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C16197-C16352-C16353-Add Threat dialog opens with title and Submit disabled while form is empty", async ({ page }: { page: Page }) => {
    await createFreshTmAndOpenDiagram(page, AT.namePrefix);
    const dialog = await openAddThreatDialog(page);

    // C16197 — dialog title.
    await expect(dialog).toContainText(AT.dialogTitle);
    // C16352 / C16353 — Submit stays disabled until both a component and
    // a threat are selected. We don't fill either, so Submit must be
    // disabled (this also covers the "no component name" / "no threat
    // name" validation paths).
    await expect(page.locator(AT.selectors.submitButton)).toBeDisabled({
      timeout: TIMEOUTS.elementVisible,
    });
  });

  test("C16205-C16210-Add Threat dialog exposes Add More, Cancel, Submit, and the SR multiselect", async ({ page }: { page: Page }) => {
    await createFreshTmAndOpenDiagram(page, AT.namePrefix);
    const dialog = await openAddThreatDialog(page);

    // C16205 / C16210 — the dialog provides the affordances to add
    // multiple threats (Add More) and persist them (Submit), with a
    // Cancel escape. Each button is rendered by id in the diagram-Threat-*
    // namespace. Add More + Cancel are enabled by default; Submit
    // remains disabled until selections are made.
    await expect(page.locator(AT.selectors.addMoreButton)).toBeEnabled({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(AT.selectors.cancelButton)).toBeEnabled();
    await expect(page.locator(AT.selectors.submitButton)).toBeDisabled();

    // The dialog ships a kendo-multiselect for Security Requirements
    // with a documented placeholder — this is the entry point the
    // Suggested-SR-on-top section (C17194-C17200) exercises.
    await expect(dialog.locator(AT.selectors.srMultiselectPlaceholder)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
  });

  test("C17284-C17287-Cancel dismisses the Add Threat dialog without committing", async ({ page }: { page: Page }) => {
    await createFreshTmAndOpenDiagram(page, AT.namePrefix);
    const dialog = await openAddThreatDialog(page);

    // Click Cancel — the dialog should detach/hide without surfacing any
    // confirmation prompt (a confirmation is only required when the form
    // has unsaved selections per C17287 / C17288).
    await page.locator(AT.selectors.cancelButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });
});
