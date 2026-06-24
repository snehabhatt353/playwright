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
// sections. This spec exercises the admin-side flows end-to-end for the
// Add Field and Add Group cases — actually creating + verifying +
// deleting each artifact rather than just asserting button presence.
//
// Test groups:
//   1. Admin section structure    — landing, tabs, per-row actions
//   2. Add Field dialog           — open / labels / Create disabled-state
//   3. Add Field CRUD end-to-end  — create → verify in list → delete →
//                                   verify gone (commits then cleans up)
//   4. Add Group dialog           — open / structure
//   5. Add Group CRUD end-to-end  — create → verify in list → delete via
//                                   confirmation → verify gone
//   6. Data Type management       — modal opens
//   7. Entity tab switching       — class flip across all 10 placements
//
// Each end-to-end test uses a unique timestamped name (AutoCF-<ts> /
// AutoGrp-<ts>) so parallel/repeat runs don't collide, and deletes its
// own artifact in the same test so the tenant stays clean.
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

async function dismissDialogWithX(page: Page, dialog: Locator): Promise<void> {
  await dialog.locator(CF.selectors.dialogCloseX).first().click();
  await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
}

// Field-row lookup: trims whitespace inside the rendered span (some
// tenant fields have trailing spaces baked into the name).
function fieldRowByName(page: Page, name: string): Locator {
  return page
    .locator(CF.selectors.fieldRow)
    .filter({
      has: page
        .locator(CF.selectors.fieldNameText)
        .filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }),
    })
    .first();
}

// Group-header lookup: the group header carries
// aria-label="Toggle group <name>" plus the inner span text.
function groupHeaderByName(page: Page, name: string): Locator {
  return page
    .locator(CF.selectors.fieldGroupHeader)
    .filter({ has: page.locator(CF.selectors.fieldGroupNameSpan).filter({ hasText: new RegExp(`^${name}$`) }) })
    .first();
}

// ---------------------------------------------------------------------------
// 1. Admin section structure
//    Cases covered: C19902, C98447 (admin reachable), C98462, C98464,
//    C98568-C98572 (star/sort/filter scaffolding present), 10 entity
//    tab placements.
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
    await expect(page.locator(CF.defaultActiveTabId)).toHaveClass(
      new RegExp(`\\b${CF.activeTabClass}\\b`),
      { timeout: TIMEOUTS.elementVisible },
    );
  });

  test("Field rows expose star, edit, and delete actions whose aria-labels encode the field name — C98452 / C98453 / C98462", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const firstRow = page.locator(CF.selectors.fieldRow).first();
    await expect(firstRow).toBeVisible({ timeout: TIMEOUTS.elementVisible });

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
// 2. Add Field dialog — structure + validation
//    Cases covered: C19903, C19904, C19913, C98447, C98448, C98449,
//    C98455, C98457, C98458, C19917 (close dismisses).
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Field dialog", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Add Field opens New Field dialog with the documented labels — C19903 / C19904", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);

    await expect(dialog).toContainText(CF.addFieldDialog.title);
    for (const label of CF.addFieldDialog.expectedLabels) {
      await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }
    await expect(dialog.locator(CF.selectors.newFieldNameInput)).toBeVisible();
    await expect(
      dialog.locator(`textarea[placeholder="${CF.addFieldDialog.descriptionPlaceholder}"]`),
    ).toBeVisible();
    await dismissDialogWithX(page, dialog);
  });

  test("Inline 'Add new field group' + 'Add data type' shortcuts render — C98455 / C98487 / C98467", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);
    await expect(dialog.getByRole("button", { name: "Add new field group" }).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(dialog.getByRole("button", { name: "Add data type" }).first()).toBeVisible();
    await dismissDialogWithX(page, dialog);
  });

  test("Create stays disabled with empty Field Name; enables once name typed — C19913 / C98457", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);

    const create = dialog.locator(CF.selectors.newFieldCreateButton);
    await expect(create).toBeDisabled({ timeout: TIMEOUTS.elementVisible });

    // Data Type defaults to "Text" so typing a Field Name is sufficient
    // to flip Create to enabled.
    await dialog.locator(CF.selectors.newFieldNameInput).fill("CFAutoProbe");
    await expect(create).toBeEnabled({ timeout: TIMEOUTS.elementVisible });

    // Clearing the name re-disables Create (mandatory-field guard).
    await dialog.locator(CF.selectors.newFieldNameInput).fill("");
    await expect(create).toBeDisabled();
    await dismissDialogWithX(page, dialog);
  });

  test("X (titlebar Close) dismisses the dialog without persisting a draft — C19917", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddFieldDialog(page);
    await dialog.locator(CF.selectors.newFieldNameInput).fill(`ProbeNoSave-${Date.now()}`);
    await dismissDialogWithX(page, dialog);
    const reopened = await openAddFieldDialog(page);
    await expect(reopened.locator(CF.selectors.newFieldNameInput)).toHaveValue("");
    await dismissDialogWithX(page, reopened);
  });
});

// ---------------------------------------------------------------------------
// 3. Add Field CRUD — END-TO-END (commit + verify + delete)
//    Cases covered: C19911 / C19912 (create persists + appears in list),
//    C98447 (create text field), C19925 / C19926 (delete confirmation +
//    confirmation removes), C19927 (delete cancel keeps the field),
//    C19944 (deleting from config removes the field).
//
//    Each test uses a timestamped name so parallel runs / reruns can't
//    collide. Cleanup runs inside the test so the tenant stays clean.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Field end-to-end CRUD", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Create field via dialog → row appears in list → delete via confirmation → row gone — C19911 / C19912 / C19925 / C19926 / C19944", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    const fieldName = `${CF.namePrefix}-${Date.now()}`;

    // 1. Open Add Field dialog
    const dialog = await openAddFieldDialog(page);

    // 2. Fill Field Name (Data Type defaults to "Text") and click Create
    await dialog.locator(CF.selectors.newFieldNameInput).fill(fieldName);
    const create = dialog.locator(CF.selectors.newFieldCreateButton);
    await expect(create).toBeEnabled({ timeout: TIMEOUTS.elementVisible });
    await create.click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page).catch(() => {});

    // 3. Verify the new field appears in the Models tab's field list
    //    (default tab) as a .field-row with the matching .field-name-text.
    const newRow = fieldRowByName(page, fieldName);
    await expect(newRow).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // 4. Hover/click the row's delete button → confirmation dialog
    const delBtn = newRow.locator(CF.selectors.deleteFieldButton).first();
    await delBtn.click();
    const confirmDialog = page
      .locator(CF.selectors.confirmDialog)
      .filter({ hasText: CF.confirmDeleteTitle })
      .first();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(confirmDialog).toContainText(fieldName);

    // 5. Confirm deletion via "Yes, Delete" (id contains a space — use
    //    attribute selector encoded in testdata)
    await page.locator(CF.selectors.deleteFieldConfirmButton).click();
    await waitForLoaderIdle(page).catch(() => {});

    // 6. Row no longer present
    await expect(newRow).toHaveCount(0, { timeout: TIMEOUTS.elementVisible });
  });

  test("Delete cancellation keeps the field in the list — C19927 / C98454", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    const fieldName = `${CF.namePrefix}-cancel-${Date.now()}`;

    // Create
    const dialog = await openAddFieldDialog(page);
    await dialog.locator(CF.selectors.newFieldNameInput).fill(fieldName);
    await dialog.locator(CF.selectors.newFieldCreateButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page).catch(() => {});

    const newRow = fieldRowByName(page, fieldName);
    await expect(newRow).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Trigger delete then cancel
    await newRow.locator(CF.selectors.deleteFieldButton).first().click();
    const confirmDialog = page
      .locator(CF.selectors.confirmDialog)
      .filter({ hasText: CF.confirmDeleteTitle })
      .first();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await page.locator(CF.selectors.deleteFieldCancelButton).click();
    await expect(confirmDialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });

    // Row should still be there
    await expect(newRow).toBeVisible();

    // Tidy up: actually delete it now
    await newRow.locator(CF.selectors.deleteFieldButton).first().click();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await page.locator(CF.selectors.deleteFieldConfirmButton).click();
    await waitForLoaderIdle(page).catch(() => {});
    await expect(newRow).toHaveCount(0, { timeout: TIMEOUTS.elementVisible });
  });
});

// ---------------------------------------------------------------------------
// 4. Add Group dialog — structure
//    Cases covered: C98487 (open dialog with name input + Cancel +
//    Create), C19917 / draft non-persistence.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Group dialog", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Add Group opens New Group dialog with name input + Cancel + Create — C98487", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openAddGroupDialog(page);
    await expect(dialog).toContainText(CF.addGroupDialog.title);
    await expect(dialog.locator(CF.selectors.newGroupNameInput)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    await expect(page.locator(CF.selectors.newGroupCreateButton)).toBeVisible();
    await expect(page.locator(CF.selectors.newGroupCancelButton)).toBeVisible();
    await dismissDialogWithX(page, dialog);
  });
});

// ---------------------------------------------------------------------------
// 5. Add Group CRUD — END-TO-END
//    Cases covered: C98487 (create), C98489 (rename via Edit — not
//    exercised here, deferred), C98490 (delete empty group), C98491
//    confirmation flow, C98493 cancel deletion.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Add Group end-to-end CRUD", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Create group via dialog → header appears with action buttons → delete via confirmation → header gone — C98487 / C98490", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    const groupName = `${CF.groupPrefix}-${Date.now()}`;

    // 1. Open Add Group dialog
    const dialog = await openAddGroupDialog(page);

    // 2. Fill name and click Create
    await dialog.locator(CF.selectors.newGroupNameInput).fill(groupName);
    await page.locator(CF.selectors.newGroupCreateButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page).catch(() => {});

    // 3. Group header appears with the documented action buttons (Add
    //    field / conditions / edit / delete) carrying name-encoded
    //    aria-labels
    const header = groupHeaderByName(page, groupName);
    await expect(header).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(header).toHaveAttribute("aria-label", `Toggle group ${groupName}`);
    await expect(
      header.getByRole("button", { name: `Add new field to group ${groupName}` }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: `Edit group ${groupName}` }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: `Delete group ${groupName}` }),
    ).toBeVisible();

    // 4. Click delete → confirmation dialog
    await header.getByRole("button", { name: `Delete group ${groupName}` }).click();
    const confirmDialog = page
      .locator(CF.selectors.confirmDialog)
      .filter({ hasText: CF.confirmDeleteTitle })
      .first();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // 5. Confirm via "Yes, Delete"
    await page.locator(CF.selectors.deleteGroupConfirmButton).click();
    await waitForLoaderIdle(page).catch(() => {});

    // 6. Group header removed
    await expect(header).toHaveCount(0, { timeout: TIMEOUTS.elementVisible });
  });

  test("Group delete cancellation keeps the group — C98493", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    const groupName = `${CF.groupPrefix}-cancel-${Date.now()}`;

    const dialog = await openAddGroupDialog(page);
    await dialog.locator(CF.selectors.newGroupNameInput).fill(groupName);
    await page.locator(CF.selectors.newGroupCreateButton).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
    await waitForLoaderIdle(page).catch(() => {});

    const header = groupHeaderByName(page, groupName);
    await expect(header).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Trigger delete → cancel
    await header.getByRole("button", { name: `Delete group ${groupName}` }).click();
    const confirmDialog = page
      .locator(CF.selectors.confirmDialog)
      .filter({ hasText: CF.confirmDeleteTitle })
      .first();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await page.locator(CF.selectors.deleteGroupCancelButton).click();
    await expect(confirmDialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });

    // Header still visible
    await expect(header).toBeVisible();

    // Tidy: actually delete now
    await header.getByRole("button", { name: `Delete group ${groupName}` }).click();
    await expect(confirmDialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await page.locator(CF.selectors.deleteGroupConfirmButton).click();
    await waitForLoaderIdle(page).catch(() => {});
    await expect(header).toHaveCount(0, { timeout: TIMEOUTS.elementVisible });
  });
});

// ---------------------------------------------------------------------------
// 6. Data Type modal
//    Cases covered: C98467, C98470 (modal opens with management
//    affordances).
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Data Type management", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Data Type button opens the Data Type modal with Add Data Type action and Name/Description/Actions columns — C98467 / C98470", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);
    const dialog = await openDataTypeModal(page);
    await expect(dialog).toContainText(CF.dataTypeModal.title);
    await expect(dialog.locator(CF.selectors.dataTypeAddButton)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    for (const col of CF.dataTypeModal.expectedColumns) {
      await expect(dialog.getByText(col, { exact: true }).first()).toBeVisible({
        timeout: TIMEOUTS.elementVisible,
      });
    }
    await dismissDialogWithX(page, dialog);
  });
});

// ---------------------------------------------------------------------------
// 7. Entity tab switching
//    Cases covered: C19907 / C19908, C98527 (placements), C98561-C98567.
// ---------------------------------------------------------------------------
test.describe("Custom Fields — Entity tab switching", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Clicking each entity tab flips active state to that tab — C19907 / C19908", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoCustomFieldsSection(page);

    for (const tab of CF.entityTabs) {
      const tabEl = page.locator(tab.id);
      await tabEl.click();
      await expect(tabEl).toHaveClass(new RegExp(`\\b${CF.activeTabClass}\\b`), {
        timeout: TIMEOUTS.elementVisible,
      });
    }
    // Return to the default tab.
    await page.locator(CF.defaultActiveTabId).click();
    await expect(page.locator(CF.defaultActiveTabId)).toHaveClass(
      new RegExp(`\\b${CF.activeTabClass}\\b`),
    );
  });
});
