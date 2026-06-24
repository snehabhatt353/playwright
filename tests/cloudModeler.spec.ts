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

// The Excel TestRail export "threatmodeler_7.x (13).xlsx" carries the
// "CloudModeler" suite (193 cases across 5 sections: Test Cases (138),
// CloudModeler V7.4 (19), Cloudmodeler -> Azure (12), Cloudmodeler ->
// AWS (12), Cloudmodeler -> GCP (12)). The bulk of these need:
//   - real cloud credentials (AWS keys, GCP key/keyless auth, Azure
//     service principals)
//   - cloud-account sync + drift detection against live cloud state
//   - diagram-side RW/RO mode transitions tied to the sync lifecycle
//   - cross-screen reports (Compliance, Developer, Audit) against
//     auto-discovered cloud resources
//
// The tenant doesn't carry live cloud sandboxes for this user, so the
// end-to-end CloudModeler flow can't be exercised reliably. The
// foundational surface that IS automatable lives on /configurations
// under the "Cloud Environments" section: the section header carries a
// count badge, each cloud account renders with a sync icon and an
// "Actions for <accountName>" button. That's what this suite asserts.
//
// Specifically covers:
//   Test 1 → C13310 / C18770-C18784 setup (Cloud Environments section
//            renders on Configurations with a non-zero account count)
//   Test 2 → C18780 / C18782 (cloud accounts list mounts; each entry
//            exposes a sync icon + Actions affordance)
//   Test 3 → Cloudmodeler -> AWS / Azure / GCP coverage (the existing
//            accounts list includes entries from each documented
//            provider — derived from the account aria-labels)
//
// Out of scope (documented above): account creation forms (C18771-
// C18777), keyless/keybased edit (C18774 / C18891-C18894), Drift sync
// (C13333 / C13338 / C13355-C13357), RW/RO mode (C13349-C13352, C13382),
// canvas-edit cases (C13370-C13378), report verification (C13367-
// C13369), and provider-specific resource-detail panels (C18778-C18783).

const CM = testdata.cloudModeler;
const CONF_URL = new RegExp(URL_PATTERNS.configurations, "i");
const CONF_TITLE = new RegExp(TITLES.configurations);

async function gotoConfigurations(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  // /configurations isn't always linked from the top-bar — drive direct.
  await page.goto(`${BASE_URL}${PATHS.configurations}`);
  await expect(page).toHaveURL(CONF_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(CONF_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  await expect(
    page.getByRole("heading", { name: CM.configurationsHeading, exact: true, level: 1 }),
  ).toBeVisible({ timeout: TIMEOUTS.elementVisible });
}

async function expandCloudEnvironments(page: Page): Promise<Locator> {
  const header = page.locator(CM.selectors.cloudEnvironmentsHeader);
  await expect(header).toBeVisible({ timeout: TIMEOUTS.elementVisible });
  // Header label embeds the live count: "Cloud Environments (N)". Click
  // to expand the group if it's not already showing accounts.
  const accountsBefore = await page.locator(CM.selectors.cloudAccountActions).count();
  if (accountsBefore === 0) {
    await header.click({ force: true });
  }
  await expect
    .poll(
      async () => page.locator(CM.selectors.cloudAccountActions).count(),
      { timeout: TIMEOUTS.elementVisible },
    )
    .toBeGreaterThan(0);
  return header;
}

test.describe("CloudModeler (Cloud Environments configuration)", () => {
  test.setTimeout(TIMEOUTS.test);

  test("Configurations page exposes a Cloud Environments section with a non-zero account count", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);

    // The Cloud Environments section header text matches "Cloud
    // Environments (N)" where N is the live account count. Assert the
    // pattern so we don't pin to a stale number.
    const header = page.locator(CM.selectors.cloudEnvironmentsHeader);
    await expect(header).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const text = ((await header.textContent()) || "").trim();
    expect(text).toMatch(new RegExp(CM.cloudEnvironmentsLabelPattern));

    // Extract the count and confirm it's positive — the tenant carries
    // 81 cloud accounts at the time this spec was written; we only
    // assert "> 0" to keep this stable as the catalog changes.
    const countMatch = text.match(/\((\d+)\)/);
    expect(countMatch).not.toBeNull();
    expect(Number(countMatch![1])).toBeGreaterThan(0);
  });

  test("Each cloud account row renders a sync icon and an Actions button", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);
    await expandCloudEnvironments(page);

    // Every cloud-account row carries an Actions button whose aria-label
    // is "Actions for <accountName>". The first row exposes both the
    // sync icon and the actions button — assert the shape.
    const firstActions = page.locator(CM.selectors.cloudAccountActions).first();
    await expect(firstActions).toBeVisible({ timeout: TIMEOUTS.elementVisible });
    const aria = (await firstActions.getAttribute("aria-label")) || "";
    expect(aria).toMatch(/^Actions for .+/);

    // Sync icon is present at least once (the icon is repeated per row
    // and may share an id, so we just assert ≥1).
    const syncCount = await page.locator(CM.selectors.syncIcon).count();
    expect(syncCount).toBeGreaterThan(0);
  });

  test("Cloud Environments list includes accounts from multiple cloud providers", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoConfigurations(page);
    await expandCloudEnvironments(page);

    // The tenant ships cloud accounts whose names embed the provider —
    // GCP*, AWS*, Azure*. We assert ≥1 entry mentions each documented
    // provider so the Cloudmodeler->{AWS,Azure,GCP} sections (C13327-
    // C13328 etc.) have data to flow against.
    const labels = await page.locator(CM.selectors.cloudAccountActions).evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label") || ""),
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const provider of CM.expectedProviderPatterns) {
      const re = new RegExp(provider, "i");
      const hit = labels.find((l) => re.test(l));
      expect(hit, `expected at least one cloud account matching "${provider}"`).toBeTruthy();
    }
  });
});
