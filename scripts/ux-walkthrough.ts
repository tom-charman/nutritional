/**
 * UX walkthrough against REAL prod data (local nutritional_db copy).
 * Behaves like the actual user: morning check-in, logging breakfast,
 * reviewing yesterday, browsing foods/meals, checking trends.
 * High-DPI captures to tests/e2e/screenshots/ux-walkthrough/.
 *
 * Run a dev server on :3200 against nutritional_db first (see README), then:
 *   npx tsx scripts/ux-walkthrough.ts
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = "tests/e2e/screenshots/ux-walkthrough";
const BASE = "http://localhost:3200";

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const shot = (name: string) =>
    page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  const fullShot = (name: string) =>
    page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  // ---- 1. Morning check-in: open the app. "How am I doing?" ----
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".chart-svg path");
  await shot("01-morning-dashboard");
  await page.getByRole("tab", { name: "Macronutrient Breakdown" }).click();
  await shot("02-macros-tab");
  await page.getByRole("tab", { name: "Nutrients vs RDI" }).click();
  await shot("03-rdi-tab");

  // ---- 2. Log breakfast (today): the usual overnight-oats meal ----
  await page.goto(`${BASE}/entry`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("04-today-before-logging");

  const search = page.getByTestId("food-search");
  await search.click();
  await search.fill("overnight");
  await shot("05-meal-search-results");
  await page
    .locator(".combobox-option")
    .filter({ hasText: "Overnight Oats, Chia Seeds, Protein Powder, Honey (meal)" })
    .first()
    .click();
  await page.getByTestId("amount-input").fill("1");
  await page.waitForSelector(".nutrient-preview-card");
  await shot("06-meal-preview");
  await page.getByTestId("add-button").click();
  await page.waitForSelector(".toast");
  await shot("07-after-breakfast-logged");

  // ---- 3. Morning weight ----
  await page.getByTestId("weight-morning").fill("68.4");
  await page.getByTestId("weight-morning").blur();
  await page.waitForTimeout(800);

  // ---- 4. Add a single food with a LONG name (search "sausage") ----
  await search.click();
  await search.fill("sausage");
  await shot("08-long-names-in-combobox");
  await page.locator(".combobox-option").first().click();
  await page.getByTestId("amount-input").fill("130");
  await shot("09-long-name-selected-chip");
  await page.getByTestId("add-button").click();
  await page.waitForTimeout(600);
  await shot("10-today-with-entries");

  // ---- 5. "What did I eat yesterday?" — a real 14-entry day ----
  await page.getByTestId("prev-day").click();
  await page.waitForTimeout(1200);
  await fullShot("11-yesterday-real-day-full");

  // expand a meal if present
  const mealHeader = page.locator(".meal-entry-header").first();
  if (await mealHeader.count()) {
    await mealHeader.click();
    await shot("12-yesterday-meal-expanded");
  }

  // ---- 6. Foods: find and inspect a long-named item ----
  await page.goto(`${BASE}/foods`);
  await page.waitForSelector(".master-list-item");
  await fullShot("13-foods-list-real");
  await page.getByPlaceholder("Search foods...").fill("sicilian");
  await page.locator(".master-list-item").first().click();
  await page.waitForSelector(".editor-grid");
  await shot("14-foods-long-name-editor");

  // ---- 7. Meals: real templates ----
  await page.goto(`${BASE}/meals`);
  await page.waitForSelector(".meal-card");
  await fullShot("15-meals-real");
  await page.locator(".meal-card .meal-card-header").first().click();
  await page.waitForSelector(".ingredients-list");
  await fullShot("16-meal-loaded-for-edit");

  // ---- 8. Mobile: the on-the-go logging experience ----
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/entry`);
  await page.waitForSelector(".calories-remaining-number");
  await fullShot("17-mobile-today-full");
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".chart-svg path");
  await shot("18-mobile-dashboard");

  await browser.close();
  console.log(`Captured to ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
