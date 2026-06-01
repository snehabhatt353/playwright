// @ts-check
const { test, expect } = require("@playwright/test");
const testdata = require("../data/testdata.json");
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

const BASE_URL = process.env.TM_BASE_URL || testdata.baseUrl;
const USERNAME = process.env.TM_USER || testdata.credentials.username;
const PASSWORD = process.env.TM_PASS || testdata.credentials.password;

const PATHS = testdata.paths;
const URL_PATTERNS = testdata.urlPatterns;
const TITLES = testdata.titles;
const TIMEOUTS = testdata.timeouts;
const SELECTORS = testdata.selectors;
const SELECTOR_TEMPLATES = testdata.selectorTemplates;
const ROLES = testdata.roles;
const DEFAULTS = testdata.customFieldDefaults;
const DISMISS_BUTTONS = testdata.dismissButtonNames;
const PROMO_MARKERS = testdata.promoTextMarkers;
const ALWAYS_HANDLED_LABELS = testdata.alwaysHandledLabels;
const LOCAL_STORAGE_KEYS = testdata.localStorageKeys;
const BLANK_PNG_BASE64 = testdata.blankPngBase64;

/** @param {string} tmpl @param {string} value */
function applyTemplate(tmpl, value) {
  return tmpl.replace("{value}", value);
}

/** @param {Page} page */
async function login(page) {
  await page.goto(`${BASE_URL}${PATHS.root}`);
  // tmdev's root sometimes hangs without redirecting; if it doesn't bounce
  // to the login page or the app within 10s, force-navigate to /threatmodels
  // and let the auth gate kick in.
  const loginOrApp = new RegExp(URL_PATTERNS.loginOrApp, "i");
  try {
    await page.waitForURL(loginOrApp, { timeout: TIMEOUTS.navShort });
  } catch {
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await page.waitForURL(loginOrApp, { timeout: TIMEOUTS.navMedium });
  }
  if (new RegExp(PATHS.login.replace(/\//g, "\\/"), "i").test(page.url())) {
    const usernameField = page.getByRole("textbox", { name: ROLES.textboxes.username });
    const passwordField = page.getByRole("textbox", { name: ROLES.textboxes.password });
    await expect(usernameField).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await usernameField.click();
    await usernameField.pressSequentially(USERNAME, { delay: TIMEOUTS.typingDelaySlow });
    await passwordField.click();
    await passwordField.pressSequentially(PASSWORD, { delay: TIMEOUTS.typingDelaySlow });
    await Promise.all([
      page.waitForURL(new RegExp(URL_PATTERNS.loggedIn), { timeout: TIMEOUTS.navMedium }),
      page.getByRole("button", { name: ROLES.buttons.signIn }).click(),
    ]);
  }
  // Angular sometimes doesn't bootstrap on the post-login landing — if the
  // title is still the bare "ThreatModeler", re-navigate to force it.
  try {
    await expect(page).toHaveTitle(new RegExp(TITLES.threatModels), {
      timeout: TIMEOUTS.navShort,
    });
  } catch {
    await page.goto(`${BASE_URL}${PATHS.threatModels}`);
    await expect(page).toHaveTitle(new RegExp(TITLES.threatModels), {
      timeout: TIMEOUTS.navMedium,
    });
  }
}

/** @param {Page} page */
async function dismissOnboardingIfShown(page) {
  const skip = page.getByRole("button", { name: ROLES.buttons.skip, exact: true });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
}

/** @param {Page} page */
async function dismissPostLoginOverlays(page) {
  for (let i = 0; i < 5; i++) {
    let actedOnUI = false;
    for (const name of DISMISS_BUTTONS) {
      const btn = page.getByRole("button", { name, exact: true }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        actedOnUI = true;
      }
    }
    if (!actedOnUI) break;
    await page.waitForTimeout(TIMEOUTS.dismissOverlayPause);
  }
  await page.evaluate(
    ({ overlays, popups, loaderAll, promoMarkers, tourKey }) => {
      document.querySelectorAll(overlays).forEach((el) => el.remove());
      document.querySelectorAll(loaderAll).forEach((el) => {
        const h = /** @type {HTMLElement} */ (el);
        h.style.display = "none";
        h.style.pointerEvents = "none";
      });
      // The Report Agent promo card hijacks the threat models list. Walk
      // visible cards and remove only those whose text identifies the promo,
      // so we don't strip legitimate grid chrome.
      document.querySelectorAll(popups).forEach((el) => {
        const txt = (el.textContent || "").toLowerCase();
        if (promoMarkers.some((m) => txt.includes(m))) {
          /** @type {HTMLElement} */ (el).remove();
        }
      });
      try {
        localStorage.setItem(tourKey, "true");
      } catch {}
    },
    {
      overlays: SELECTORS.overlaysToRemove,
      popups: SELECTORS.promoPopups,
      loaderAll: SELECTORS.loaderOverlayAll,
      promoMarkers: PROMO_MARKERS,
      tourKey: LOCAL_STORAGE_KEYS.guidedTour,
    },
  );
}

/**
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
async function waitForLoaderIdle(page, timeout = TIMEOUTS.loaderIdle) {
  await expect
    .poll(async () => await page.locator(SELECTORS.loaderOverlayVisible).count(), { timeout })
    .toBe(0);
}

/**
 * Switches the Threat Framework entity selector to the named tab
 * (Components / Security Requirements / Test Cases / Threats). The selector
 * button's accessible name is the *current* entity (which changes), so we
 * locate it structurally: the only button inside `main` whose child is a
 * level-2 heading.
 *
 * @param {Page} page
 * @param {string} entityName
 */
async function selectEntity(page, entityName) {
  const entityBtn = page
    .locator("main")
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { level: 2 }) })
    .first();
  await entityBtn.waitFor({ state: "visible", timeout: TIMEOUTS.elementVisible });
  // If we're already on the requested entity, nothing to do.
  const current = ((await entityBtn.textContent()) || "").trim();
  if (current === entityName) {
    await waitForLoaderIdle(page);
    return;
  }
  await entityBtn.click();
  // Kendo popups expose options as role=option; fall back to plain text.
  const option = page.getByRole("option", { name: entityName, exact: true }).first();
  if (await option.isVisible({ timeout: TIMEOUTS.optionsVisible }).catch(() => false)) {
    await option.click();
  } else {
    await page.getByText(entityName, { exact: true }).first().click();
  }
  await waitForLoaderIdle(page);
}

/** @param {Page} page */
async function pickFirstRealOption(page) {
  const options = page.locator(SELECTORS.visibleOptions);
  await options.first().waitFor({ state: "visible", timeout: TIMEOUTS.optionsVisible });
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
 * Returns labels that the tenant marks required (rendered via a CSS `::after`
 * containing `*`). The tenant config controls which fields are required so we
 * detect rather than hard-code.
 *
 * @param {Page} page
 */
async function getRequiredLabels(page) {
  return page.evaluate((dialogSel) => {
    const dlg = document.querySelector(dialogSel);
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
  }, SELECTORS.kendoDialog);
}

/**
 * @typedef {Object} FieldConfig
 * @property {{ label: string, placeholder: string, value: string }[]} [textboxes]
 * @property {string} [quillLabel]
 * @property {string} [dateLabel]
 * @property {string[]} [singleSelects]
 * @property {string} [multiSelectLabel]
 * @property {string} [linkLabel]
 * @property {string} [fileUploadLabel]
 */

/**
 * Fills required custom fields (marked with `*`) in an entity-create dialog.
 * The `fields` map describes which label belongs to which control type — the
 * same set of dialog primitives (textbox/Quill/date/dropdown/multiselect/link/
 * file) appears for Threat Models, Components, etc. with different labels.
 *
 * @param {Page} page
 * @param {Locator} dialog
 * @param {FieldConfig} fields
 */
async function fillRequiredCustomFields(page, dialog, fields) {
  const required = new Set(await getRequiredLabels(page));
  ALWAYS_HANDLED_LABELS.forEach((s) => required.delete(s));
  if (required.size === 0) return;

  for (const { label, placeholder, value } of fields.textboxes ?? []) {
    if (!required.has(label)) continue;
    const tb = dialog.locator(applyTemplate(SELECTOR_TEMPLATES.textboxByPlaceholder, placeholder)).first();
    if (await tb.isVisible().catch(() => false)) {
      await tb.fill(value);
    }
  }

  if (fields.quillLabel && required.has(fields.quillLabel)) {
    const editor = dialog
      .locator(applyTemplate(SELECTOR_TEMPLATES.quillByPlaceholder, fields.quillLabel))
      .first();
    if (await editor.count()) {
      await editor.click();
      await editor.pressSequentially(DEFAULTS.textValue, { delay: TIMEOUTS.typingDelayMedium });
    }
  }

  if (fields.dateLabel && required.has(fields.dateLabel)) {
    // kendo-datepicker uses a masked input that rejects bulk fill — type
    // digits one at a time so the mask consumes each char.
    const dateInput = dialog.locator(SELECTORS.kendoDatepickerInput).first();
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Delete");
      await dateInput.pressSequentially(DEFAULTS.date, { delay: TIMEOUTS.typingDelaySlow });
      await page.keyboard.press("Tab");
    }
  }

  for (const labelFragment of fields.singleSelects ?? []) {
    if (!required.has(labelFragment)) continue;
    const dd = dialog.locator(applyTemplate(SELECTOR_TEMPLATES.dropdownByAriaLabel, labelFragment)).first();
    if (await dd.isVisible().catch(() => false)) {
      await dd.click();
      await pickFirstRealOption(page);
    }
  }

  if (fields.multiSelectLabel && required.has(fields.multiSelectLabel)) {
    const multi = dialog
      .locator(applyTemplate(SELECTOR_TEMPLATES.multiselectByAriaLabel, fields.multiSelectLabel))
      .first();
    if (await multi.count()) {
      await page.keyboard.press("Escape");
      await multi.scrollIntoViewIfNeeded();
      // The actual search input is .k-input-inner; using a generic `input`
      // selector can match a non-interactive child and silently no-op.
      await multi.locator(SELECTORS.kendoMultiselectInput).first().click();
      await pickFirstRealOption(page);
      await page.keyboard.press("Escape");
    }
  }

  if (fields.linkLabel && required.has(fields.linkLabel)) {
    const linkEdit = dialog.getByRole("button", { name: `Edit ${fields.linkLabel}` });
    if (await linkEdit.first().isVisible().catch(() => false)) {
      await linkEdit.first().click();
      // The inline link editor exposes both a "Link Text" input and a "URL"
      // input; the link commits on input (no Save button), but both must be
      // populated for the link to register.
      const textField = dialog.locator(SELECTORS.linkTextInput).first();
      const urlField = dialog.locator(SELECTORS.linkUrlInput).first();
      if (await urlField.isVisible({ timeout: TIMEOUTS.linkEditorVisible }).catch(() => false)) {
        if (await textField.isVisible().catch(() => false)) {
          await textField.fill(DEFAULTS.link.text);
        }
        await urlField.fill(DEFAULTS.link.url);
        await urlField.press("Tab");
      }
    }
  }

  if (fields.fileUploadLabel && required.has(fields.fileUploadLabel)) {
    // The dialog may have multiple file inputs (e.g. an entity icon picker
    // plus the required custom field). Setting the same blank PNG on each
    // input keeps the test robust without needing to identify which is which.
    const inputs = dialog.locator(SELECTORS.fileInput);
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      await inputs.nth(i).setInputFiles({
        name: DEFAULTS.uploadFileName,
        mimeType: DEFAULTS.uploadMimeType,
        buffer: Buffer.from(BLANK_PNG_BASE64, "base64"),
      });
    }
  }

}

module.exports = {
  BASE_URL,
  USERNAME,
  PASSWORD,
  PATHS,
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
  pickFirstRealOption,
  getRequiredLabels,
  fillRequiredCustomFields,
  selectEntity,
};
