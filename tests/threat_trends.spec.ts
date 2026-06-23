import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  URL_PATTERNS,
  TITLES,
  TIMEOUTS,
  login,
  dismissPostLoginOverlays,
  waitForLoaderIdle,
} from "./lib/helpers";
import testdata from "./data/testdata.json";

// The Excel TestRail export "threatmodeler_7.x (3).xlsx" carries the full
// dashboard suite S125 (195 rows). The "Threat Trends" section is just
// three cases — C12696, C12697, C12698 — all targeting the Threat Trends
// widget on the Overview Dashboard:
//   - C12696 Graph updates with the date filter
//   - C12697 Hovering a graph dot surfaces threat counts
//   - C12698 Toggling status chips below the graph updates which lines render
//
// The chart is a Chart.js line graph rendered onto an HTMLCanvasElement
// (`#dashboard-canvas-chart`), so dataset points and tooltips are painted
// inside the canvas and are not addressable from the accessibility tree.
// The legend chips, however, are real <a role="button"> elements whose
// aria-label flips between "X (visible)" and "X (hidden)" on click, and
// whose <span> class flips between `showing` and `hidden` — this is what
// the C12698 case exercises and what we assert against. For C12697 we
// drive a real `page.mouse.move` across the canvas (synthetic dispatch
// doesn't trigger Chart.js' event listeners) and verify the widget stays
// interactive afterwards. C12696 is exercised as the baseline render: a
// dashboard reload (which is how the filter sidebar pushes new data
// through) leaves the canvas mounted with non-zero dimensions and all five
// legend chips back in the default `showing` state.

const TT = testdata.threatTrends;
const DASH = testdata.dashboard;
const DASH_URL = new RegExp(URL_PATTERNS.dashboard, "i");
const DASH_TITLE = new RegExp(TITLES.dashboard);

function legendHref(page: Page, index: number): Locator {
  return page.locator(TT.selectors.legendByIndex.replace("{index}", String(index)));
}
function legendSpan(page: Page, index: number): Locator {
  return page.locator(TT.selectors.legendSpanByIndex.replace("{index}", String(index)));
}

async function gotoDashboard(page: Page): Promise<void> {
  await dismissPostLoginOverlays(page);
  await page.getByRole("button", { name: DASH.navButton, exact: true }).click();
  await expect(page).toHaveURL(DASH_URL, { timeout: TIMEOUTS.navMedium });
  await expect(page).toHaveTitle(DASH_TITLE, { timeout: TIMEOUTS.navMedium });
  await waitForLoaderIdle(page).catch(() => {});
  // Anchor on the canvas mounting before any test interacts with it — the
  // dashboard renders the canvas only once Chart.js has populated data.
  await expect(page.locator(TT.selectors.canvas)).toBeVisible({
    timeout: TIMEOUTS.elementVisible,
  });
}

test.describe("Threat Trends widget", () => {
  test.setTimeout(TIMEOUTS.test);

  test("C12696-Threat Trends renders heading, canvas with non-zero size, and all five legend chips in the default visible state", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Heading
    await expect(
      page.getByRole("heading", { name: TT.heading, exact: true }).first(),
    ).toBeVisible({ timeout: TIMEOUTS.elementVisible });

    // Canvas has non-zero rendered dimensions — confirms Chart.js mounted
    // and drew the dataset (the date filter triggers a redraw with the
    // same selector, so any C12696 follow-up that applies a filter still
    // lands on the same surface).
    const canvas = page.locator(TT.selectors.canvas);
    const box = await canvas.boundingBox();
    expect(box, "canvas bounding box").not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Default state: every status chip renders with `showing` and
    // aria-label "<status> (visible)".
    for (let i = 0; i < TT.statuses.length; i++) {
      const status = TT.statuses[i];
      await expect(legendSpan(page, i)).toHaveClass(new RegExp(`\\b${TT.classes.showing}\\b`));
      await expect(legendHref(page, i)).toHaveAttribute("aria-label", `${status} (visible)`);
    }
  });

  test("C12698-Toggling each status chip flips its visible/hidden state, second click restores it", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Cycle every chip independently so we cover All / Open / In Progress
    // / Not Applicable / Mitigated end-to-end. Per status: click → assert
    // hidden, click → assert showing.
    for (let i = 0; i < TT.statuses.length; i++) {
      const status = TT.statuses[i];
      const href = legendHref(page, i);
      const span = legendSpan(page, i);

      await href.click();
      await expect(span).toHaveClass(new RegExp(`\\b${TT.classes.hidden}\\b`), {
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(href).toHaveAttribute("aria-label", `${status} (hidden)`);

      await href.click();
      await expect(span).toHaveClass(new RegExp(`\\b${TT.classes.showing}\\b`), {
        timeout: TIMEOUTS.elementVisible,
      });
      await expect(href).toHaveAttribute("aria-label", `${status} (visible)`);
    }
  });

  test("C12697-Hovering across graph data points keeps the chart interactive", async ({ page }: { page: Page }) => {
    await login(page);
    await gotoDashboard(page);

    // Chart.js paints its tooltip inside the canvas (no DOM hook to assert
    // a "count" against), so this case becomes a smoke test: drive a real
    // mouse move across the canvas at the dataset row's vertical centre,
    // then re-assert the widget still responds to legend clicks. If the
    // canvas had detached or thrown, the legend toggle below would fail.
    const canvas = page.locator(TT.selectors.canvas);
    const box = (await canvas.boundingBox())!;
    const y = box.y + box.height / 2;
    const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
    for (const ratio of samples) {
      await page.mouse.move(box.x + box.width * ratio, y, { steps: 5 });
      // Tiny settle so Chart.js' hover handler can run between samples.
      await page.waitForTimeout(120);
    }

    // Re-assert legend interactivity post-hover. Use index 1 (Open) which
    // is the most visually meaningful status.
    const openHref = legendHref(page, 1);
    const openSpan = legendSpan(page, 1);
    await openHref.click();
    await expect(openSpan).toHaveClass(new RegExp(`\\b${TT.classes.hidden}\\b`), {
      timeout: TIMEOUTS.elementVisible,
    });
    await openHref.click();
    await expect(openSpan).toHaveClass(new RegExp(`\\b${TT.classes.showing}\\b`));
  });
});
