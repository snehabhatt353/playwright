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

// The Excel TestRail export "threatmodeler_7.x (10).xlsx" carries 36 cases
// (C15879-C15912 plus C15957 / C15958) in the "Solution Hub" section of
// the Solutions Hub suite. They target the /solutions-hub page:
//   - layout / UI                 C15879 / C15880 / C15886 / C15891 / C15906
//   - model list & selection      C15881 / C15882 / C15883 / C15885 / C15887
//   - related models              C15888 / C15889
//   - download flow + dialog      C15890-C15904
//   - label filter                C15905-C15911
//   - request / import flows      C15884 / C15912 / C15957 / C15958
//
// Most of the high-value automatable surface lives in three areas: the
// page chrome (heading, search, total count, Label Filter), model
// selection → preview pane + Download button, and the Download dialog
// open/dismiss. The actual download (C15893-C15904) commits tenant
// state and depends on cross-user permutations, so it's out of scope
// here. C15884 opens a community login in a new tab (would require
// browser-context handling) — also skipped.
//
// Test grouping:
//   Test 1 → C15879 / C15880 (page chrome + total-count)
//   Test 2 → C15881 / C15885 / C15886 (select model → preview + About +
//            Download as Threat Model affordance)
//   Test 3 → C15882 (search box)
//   Test 4 → C15890 / C15891 / C15892 / C15901 (Download dialog opens
//            with title + buttons; Cancel dismisses)
//   Test 5 → C15905 / C15906 / C15907 / C15908 / C15909 / C15910 (Label
//            Filter opens with checkboxes + Apply + Clear All)

const SH = testdata.solutionsHub;
const SH_URL = new RegExp(URL_PATTERNS.solutionsHub, "i");
const SH_TITLE = new RegExp(TITLES.solutionsHub);

async function gotoSolutionsHub(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  // Same loader-overlay churn as the Template Builder spec — strip it
  // so the side-nav link isn't intercepted.
  await page.evaluate(() => {
    document.querySelectorAll("tm-loader .overlay").forEach((el) => {
      const h = el as HTMLElement;
      h.style.display = "none";
      h.style.pointerEvents = "none";
    });
  });
  const nav = page.locator(SH.selectors.navLink).first();
  await nav.click({ force: true }).catch(async () => {
    await page.goto(`${BASE_URL}${PATHS.solutionsHub}`);
  });
  await expect(page).toHaveURL(SH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(SH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  // Wait for the model list to mount before any per-tile assertion.
  await expect(page.locator(SH.selectors.modelTab).first()).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
}

test.describe("Solutions Hub", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C15879-C15880-Page renders heading, search, total-count, Label Filter and a model list with ≥1 item", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoSolutionsHub(page);

    await expect(
      page.getByRole("heading", { name: SH.heading, exact: true, level: 1 }),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Search input + placeholder
    const search = page.locator(SH.selectors.searchInput);
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute("placeholder", SH.searchPlaceholder);

    // Total models count is a non-negative integer.
    const countText = ((await page.locator(SH.selectors.totalCount).first().textContent()) || "").trim();
    expect(Number(countText)).toBeGreaterThanOrEqual(0);

    // Label Filter button visible.
    await expect(page.locator(SH.selectors.filterButton)).toBeVisible();

    // Model list has at least one tile.
    const tiles = await page.locator(SH.selectors.modelTab).count();
    expect(tiles).toBeGreaterThan(0);
  });

  test("C15881-C15885-C15886-Selecting a model surfaces the preview pane with a Download as Threat Model button", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoSolutionsHub(page);

    // C15881 — click the first model tile.
    const firstTile = page.locator(SH.selectors.modelTab).first();
    const tileAria = (await firstTile.getAttribute("aria-label")) || "";
    // Tiles carry "Select threat model: <name>" — derive the model name.
    const modelName = tileAria.replace(/^Select threat model:\s*/i, "").trim();
    expect(modelName.length).toBeGreaterThan(0);
    await firstTile.click();
    // The tab role flips aria-selected="true" on selection.
    await expect(firstTile).toHaveAttribute("aria-selected", "true", {
      timeout: TIMEOUTS.elementVisible,
    });

    // C15885 — the preview pane mounts on the right with the Download
    // affordance. C15886 — the panel structure ships the Download button
    // with the documented accessible name.
    await expect(page.locator(SH.selectors.previewPanel)).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
    const download = page.locator(SH.selectors.downloadButton);
    await expect(download).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await expect(download).toHaveAttribute("aria-label", SH.downloadButtonAria);
  });

  test("C15882-Search box accepts input and clears", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoSolutionsHub(page);

    const search = page.locator(SH.selectors.searchInput);
    await search.fill("zzz-no-such-solution");
    await expect(search).toHaveValue("zzz-no-such-solution", {
      timeout: TIMEOUTS.elementVisible,
    });
    await search.fill("");
    await expect(search).toHaveValue("");
  });

  test("C15890-C15891-C15892-C15901-Download dialog opens with title and Cancel/X actions; Cancel dismisses", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoSolutionsHub(page);

    // Select first model to reveal Download button.
    await page.locator(SH.selectors.modelTab).first().click();
    const download = page.locator(SH.selectors.downloadButton);
    await expect(download).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // C15890 — click opens the dialog.
    await download.click();
    const dialog = page.locator(SH.selectors.downloadDialog);
    await expect(dialog).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // C15891 — dialog title matches.
    await expect(dialog).toContainText(SH.downloadDialogTitle);

    // C15901 — Cancel dismisses without downloading (the dialog is
    // hidden / detached). We never click "Download Model" itself to
    // avoid committing tenant state per C15893-C15904.
    await page.locator(SH.selectors.downloadDialogCancel).click();
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.dialogHidden });
  });

  test("C15905-C15906-C15907-C15908-C15909-C15910-Label Filter opens with checkboxes, Apply + Clear All", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoSolutionsHub(page);

    // C15905 — Label Filter button is clickable.
    const filter = page.locator(SH.selectors.filterButton);
    await expect(filter).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    await filter.click();

    // C15906 / C15907 — the panel mounts with many label checkboxes.
    await expect
      .poll(
        async () => page.locator(SH.selectors.filterCheckbox).count(),
        { timeout: TIMEOUTS.elementVisible },
      )
      .toBeGreaterThan(0);

    // C15908 / C15910 — Apply Filter button surfaces.
    await expect(page.locator(SH.selectors.filterApplyButton).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });

    // C15909 — Clear All Filter button surfaces.
    await expect(page.locator(SH.selectors.filterClearButton).first()).toBeVisible({
      timeout: TIMEOUTS.elementVisible,
    });
  });
});
