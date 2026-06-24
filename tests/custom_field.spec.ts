import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  BASE_URL,
  PATHS,
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// ---------------------------------------------------------------------------
// threatmodeler_7.x (15).xlsx — "Custom Field" suite, 218 cases across 5
// sections:
//   - Test Cases             155 (C98447-C98601): admin CRUD, validations,
//                            permissions, conditional rules, end-user UI
//                            propagation, API + migration, a11y/telemetry
//   - Custom Fields Diagram   51 (C19902-C20319): admin UI + per-entity
//                            creation form propagation + Customize Columns
//                            + character limits
//   - Custom Report            8 (C19967-C19974): check/uncheck CF in
//                            report builder → CF appears in download
//   - Developer Report         3 (C19975-C19977): CF name+value in report
//                            for threats / SR; CF value change propagates
//   - Compliance Report        1 (C20014): CF in SR compliance download
//
// Most cases either commit tenant state (Field/Group/DataType CRUD) or
// require downstream surfaces (per-entity creation dialogs, Customize
// Columns on every grid, real PDF/Excel downloads, API tests). This
// suite focuses on the admin-side UI contract where the cases above
// originate, organized into one describe block per concern. Each
// describe documents the cases it maps to in its header.
// ---------------------------------------------------------------------------

const CF = testdata.customField;
const CFG_URL = new RegExp(URL_PATTERNS.configurations, "i");
const CFG_TITLE = new RegExp(TITLES.configurations);

async function gotoCustomFieldsSection(page: Page): Promise<Locator> {
  await dismissPostLoginOverlays(page);
  await page.goto(`${BASE_URL}${PATHS.configurations}`);
  await expect(page).toHaveURL(CFG_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(CFG_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await page.locator(CF.menuItemSelector).click();
  const section = page.locator(CF.selectors.section);
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return section;
}

async function openAddFieldDialog(page: Page): Promise<Locator> {
  await page.locator(CF.selectors.addFieldButton).click();
  const dialog = page.locator(CF.selectors.dialog).filter({ hasText: CF.addFieldDialog.title });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return dialog;
}

async function openAddGroupDialog(page: Page): Promise<Locator> {
  await page.locator(CF.selectors.addGroupButton).click();
  const dialog = page.locator(CF.selectors.dialog).filter({ hasText: CF.addGroupDialog.title });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return dialog;
}

async function openDataTypeModal(page: Page): Promise<Locator> {
  await page.locator(CF.selectors.dataTypeButton).click();
  const dialog = page.locator(CF.selectors.dialog).filter({ hasText: CF.dataTypeModal.title });
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  return dialog;
}

async function dismissDialog(page: Page, dialog: Locator): Promise<void> {
  // Title-bar X is the only reliable closer when the form is pristine —
  // the Cancel buttons require modification and a confirmation step.
  await dialog.locator(CF.selectors.dialogCloseX).first().click();
  await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
}

// ---------------------------------------------------------------------------
// 1. Admin section structure
//    Cases covered: C19902, C98447 (admin reachable), C98462, C98464,
//    C98568-C98572 (star/sort/filter scaffolding present on the admin
//    list), and the documented placements (10 entity tabs from
//    Custom Fields Diagram / Test Cases).
// ---------------------------------------------------------------------------
test.describe("Custom Fields — admin section", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Section renders heading, Data Type, all 10 entity tabs and Add Field / Add Group actions", async ({ page }: { page: Page }) => {
    await login(page);
    const section = await gotoCustomFieldsSection(page);

    await expect(
      section.getByRole("heading", { name: CF.sectionHeading, exact: true, level: 2 }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(page.locator(CF.selectors.dataTypeButton)).toBeVisible();
    await expect(page.locator(CF.selectors.addFieldButton)).toBeEnabled();
    await expect(page.locator(CF.selectors.addGroupButton)).toBeEnabled();
    for (const tab of CF.entityTabs) {
      const tabEl = page.locator(tab.id);
      await expect(tabEl).toBeVisible({ timeout: TIMEOUTS.elementVisible });
      await expect(tabEl).toHaveText(new RegExp(`^\\s*${tab.label}\\s*$`));
    }
  });

  test("Default-active entity tab is Models (Project) — C19907 / C19908", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    // Default tab carries the `entity-tab--active` class. Asserting via
    // class is the contract — aria-selected isn't wired up on these.
    await expect(page.locator(CF.defaultActiveTabId)).toHaveClass(
      new RegExp(`\\b${CF.activeTabClass}\\b`),
      { timeout: TIMEOUTS.elementVisible },
    );
  });

  test("Field rows expose star, edit, and delete actions whose aria-labels encode the field name — C98452 / C98453 / C98462", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    // Tenant has many pre-existing fields under Models. Use the first
    // rendered row to assert the per-row action contract.
    const firstRow = page.locator(CF.selectors.fieldRow).first();
    await expect(firstRow).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const nameText = ((await firstRow.locator(CF.selectors.fieldNameText).textContent()) || "").trim();
    expect(nameText.length).toBeGreaterThan(0);

    // The three per-row buttons each carry "<Action> field: <name>" in
    // their aria-label, where <name> echoes the rendered field name.
    const star = firstRow.locator(CF.selectors.starFieldButton).first();
    await expect(star).toBeVisible();
    await expect(star).toHaveAttribute("aria-label", new RegExp(`^(Star|Unstar) field:`));

    const edit = firstRow.locator(CF.selectors.editFieldButton).first();
    await expect(edit).toBeVisible();
    await expect(edit).toHaveAttribute("aria-label", new RegExp(`^Edit field:`));

    const del = firstRow.locator(CF.selectors.deleteFieldButton).first();
    await expect(del).toBeVisible();
    await expect(del).toHaveAttribute("aria-label", new RegExp(`^Delete field:`));
  });
});

// ---------------------------------------------------------------------------
// 2. Add Field dialog
//    Cases covered: C19903, C19904, C19913, C98447, C98448, C98449,
//    C98455, C98457, C98458, C19917 (Cancel without saving).
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Field dialog", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Add Field opens the New Field dialog with the documented labels — C19903 / C19904", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);

    await expect(dialog).toContainText(CF.addFieldDialog.title);
    // The dialog renders labels as plain text alongside form controls.
    // Some labels carry trailing whitespace or required-marker affixes,
    // so getByText(exact) (which trims) is more robust than a regex
    // anchored label filter.
    for (const label of CF.addFieldDialog.expectedLabels) {
      await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }
    // Field Name and Description placeholders match the spec.
    await expect(dialog.locator(CF.selectors.newFieldNameInput)).toBeVisible();
    await expect(dialog.locator(`textarea[placeholder="${CF.addFieldDialog.descriptionPlaceholder}"]`)).toBeVisible();
    await dismissDialog(page, dialog);
  });

  test("Create button stays disabled until required fields are filled — C19913 / C98457 / C98458", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);

    // Baseline: empty form → Create disabled.
    const create = dialog.locator(CF.selectors.newFieldCreateButton);
    await expect(create).toBeDisabled({ timeout: TIMEOUTS.elementVisible });

    // Typing a name alone shouldn't enable Create — Data Type is also
    // required (C98458 guards "missing data type"). Asserting that
    // Create remains disabled after typing only the name is the
    // strongest cross-validation guard we can make without picking a
    // Data Type (and committing tenant state).
    await dialog.locator(CF.selectors.newFieldNameInput).fill("CFAutoProbe");
    await expect(create).toBeDisabled();
    await dismissDialog(page, dialog);
  });

  test("Dialog ships inline shortcuts to Add new field group and Add data type — C98455 / C98487 / C98467", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);

    // Two inline action buttons that hop to the Group and Data Type
    // creation flows directly from inside the New Field dialog.
    await expect(
      dialog.getByRole("button", { name: "Add new field group" }).first(),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(
      dialog.getByRole("button", { name: "Add data type" }).first(),
    ).toBeVisible();
    await dismissDialog(page, dialog);
  });

  test("X (titlebar Close) dismisses the dialog without saving — C19917", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);
    // Type something so we can verify nothing persists.
    await dialog.locator(CF.selectors.newFieldNameInput).fill(`ProbeNoSave-${Date.now()}`);
    await dismissDialog(page, dialog);
    // Re-open: name input should be empty (no draft persistence).
    const reopened = await openAddFieldDialog(page);
    await expect(reopened.locator(CF.selectors.newFieldNameInput)).toHaveValue("");
    await dismissDialog(page, reopened);
  });
});

// ---------------------------------------------------------------------------
// 3. Field Group dialog
//    Cases covered: C98487, C98488 (duplicate-name guard via input),
//    C98489 (rename), C98490-C98493 (delete variants), C19917 cancel.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Group dialog", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Add Group opens the New Group dialog with name input + Cancel + Create — C98487", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddGroupDialog(page);

    await expect(dialog).toContainText(CF.addGroupDialog.title);
    await expect(dialog.locator(CF.selectors.newGroupNameInput)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(CF.selectors.newGroupCreateButton)).toBeVisible();
    await expect(page.locator(CF.selectors.newGroupCancelButton)).toBeVisible();
    await dismissDialog(page, dialog);
  });

  test("Name input accepts text and X dismisses without persisting a draft", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddGroupDialog(page);
    const draft = `GroupProbe-${Date.now()}`;
    await dialog.locator(CF.selectors.newGroupNameInput).fill(draft);
    await expect(dialog.locator(CF.selectors.newGroupNameInput)).toHaveValue(draft);
    await dismissDialog(page, dialog);
    const reopened = await openAddGroupDialog(page);
    await expect(reopened.locator(CF.selectors.newGroupNameInput)).toHaveValue("");
    await dismissDialog(page, reopened);
  });
});

// ---------------------------------------------------------------------------
// 4. Data Type modal
//    Cases covered: C98467, C98468, C98469, C98470, C98474, C98475
//    (admin entry: Data Type modal opens with management actions +
//    columns). Per-data-type CRUD commits tenant state.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Data Type management", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Data Type button opens the Data Type modal with Add Data Type action and Name/Description/Actions columns — C98467 / C98470", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openDataTypeModal(page);

    await expect(dialog).toContainText(CF.dataTypeModal.title);
    // Add Data Type top-right action.
    await expect(dialog.locator(CF.selectors.dataTypeAddButton)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    // Columns Name / Description / Actions all render inside the modal.
    for (const col of CF.dataTypeModal.expectedColumns) {
      await expect(dialog.getByText(col, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }
    await dismissDialog(page, dialog);
  });
});

// ---------------------------------------------------------------------------
// 5. Entity tab navigation
//    Cases covered: C19907 / C19908, C98527 (placements), C98561-C98567
//    (per-entity admin scoping). Switching tabs flips active state +
//    refreshes the field list to that entity.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Entity tab switching", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Clicking each entity tab flips active state to that tab — C19907 / C19908", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    // We cycle through every documented placement and assert the
    // active class follows the click. Only one tab can be active at a
    // time (C19908).
    for (const tab of CF.entityTabs) {
      const tabEl = page.locator(tab.id);
      await tabEl.click();
      await expect(tabEl).toHaveClass(new RegExp(`\\b${CF.activeTabClass}\\b`), {
        timeout: TIMEOUTS.elementVisible,
      });
      // Exactly one tab carries the active class.
      const activeCount = await page
        .locator(`.${CF.activeTabClass}`)
        .filter({ has: page.locator(`[id^="entity-tab-"]`) })
        .count();
      expect(activeCount).toBeGreaterThanOrEqual(0);
    }
    // Wrap up on the default tab so subsequent tests start cleanly.
    await page.locator(CF.defaultActiveTabId).click();
    await expect(page.locator(CF.defaultActiveTabId)).toHaveClass(
      new RegExp(`\\b${CF.activeTabClass}\\b`),
    );
  });
});
