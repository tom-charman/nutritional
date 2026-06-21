/**
 * Design-review captures: high-DPI (2x) screenshots of key app states,
 * full pages AND zoomed crops, for critical visual review.
 * Requires the e2e dev server (port 3100) and nutritional_test DB.
 *
 *   npx tsx scripts/design-review.ts
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "tests/e2e/screenshots/design-review";
const BASE = "http://localhost:3100";

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const shot = (name: string, clip?: { x: number; y: number; width: number; height: number }) =>
    page.screenshot({ path: `${OUT}/${name}.png`, clip });

  // ---- Dashboard ----
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".chart-svg path");
  await shot("01-dashboard-full");
  await shot("02-dashboard-navbar-crop", { x: 0, y: 0, width: 1440, height: 120 });
  await shot("03-dashboard-chart-detail", { x: 60, y: 120, width: 700, height: 420 });

  // ---- Entry page with data (E2E tracking date has entries after a test run) ----
  await page.goto(`${BASE}/entry?date=2024-01-10`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("04-entry-full");
  await shot("05-entry-header-crop", { x: 0, y: 60, width: 1440, height: 110 });
  await shot("06-entry-col1-crop", { x: 24, y: 170, width: 520, height: 500 });
  await shot("07-entry-summary-crop", { x: 560, y: 170, width: 520, height: 700 });
  await shot("08-entry-weights-crop", { x: 1090, y: 170, width: 330, height: 300 });

  // live preview state
  const search = page.getByTestId("food-search");
  await search.click();
  await search.fill("chicken");
  await shot("09-entry-combobox-open", { x: 24, y: 170, width: 520, height: 500 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByTestId("amount-input").fill("150");
  await page.waitForSelector(".nutrient-preview-card");
  await shot("10-entry-preview-state", { x: 24, y: 170, width: 520, height: 620 });

  // ---- Targets modal ----
  await page.getByRole("button", { name: "Edit Targets" }).click();
  await page.waitForSelector(".modal");
  await shot("11-targets-modal-full");
  await shot("12-targets-cell-detail", { x: 360, y: 220, width: 720, height: 300 });
  await page.keyboard.press("Escape");

  // ---- Foods ----
  await page.goto(`${BASE}/foods`);
  await page.waitForSelector(".master-list-item");
  await shot("13-foods-full");
  await page.locator(".master-list-item").first().click();
  await page.waitForSelector(".editor-grid");
  await shot("14-foods-editor-detail", { x: 600, y: 140, width: 820, height: 620 });

  // ---- Meals ----
  await page.goto(`${BASE}/meals`);
  await page.waitForSelector(".saved-meals-list");
  await shot("15-meals-full");
  await shot("16-meals-saved-card-detail", { x: 720, y: 220, width: 560, height: 420 });

  // ---- Mobile ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/entry?date=2024-01-10`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("17-mobile-entry-top");
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".chart-svg path");
  await shot("18-mobile-dashboard");

  // ---- Weekly Planner (brand crops) ----
  // NB: needs planner data in nutritional_test (migration 002 + seeded plan items);
  // otherwise these capture the empty-week frame. Populated brand review uses the
  // seeded planner shots from scripts/ux-review.ts.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/planner?week=2026-06-15`);
  await page.waitForSelector(".planner-week");
  await shot("19-planner-week-full");
  try {
    await page.waitForSelector(".planner-week-summary", { timeout: 2000 });
    await shot("20-planner-summary-crop", { x: 0, y: 120, width: 1440, height: 380 });
  } catch {}
  try {
    await page.locator(".planner-pva").scrollIntoViewIfNeeded();
    await shot("21-planner-pva-crop", { x: 0, y: 0, width: 920, height: 760 });
  } catch {}
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/planner?week=2026-06-15`);
  await page.waitForSelector(".planner-week");
  await shot("22-mobile-planner");

  await browser.close();
  console.log(`Captured to ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
