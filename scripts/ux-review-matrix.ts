/**
 * Scenario-matrix capture — the dimensions docs/UX-REVIEW-GUIDE.md requires that
 * the feature sweep and persona journeys didn't yet evidence: boundary values,
 * persistence round-trips, invalid-input feedback, precision, units sanity,
 * destructive aftermath, date edges, idempotency.
 * Output: tests/e2e/screenshots/ux-review/matrix/<area>/NN-state.png
 *
 *   AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
 *   DATABASE_URL=…/nutritional_review npx tsx scripts/ux-review-matrix.ts
 *
 * Mutates only "ZZ Matrix …" records + empty demo dates; cleans up at start.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.UX_BASE ?? "http://localhost:3300";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_review";
const OUT = "tests/e2e/screenshots/ux-review/matrix";
const DATE = "2026-06-13"; // empty day, off real data
const DATE2 = "2026-06-12";

async function cleanup() {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (const d of [DATE, DATE2]) {
      await sql`DELETE FROM food_entries WHERE entry_date = ${d}`;
      await sql`DELETE FROM daily_summaries WHERE summary_date = ${d}`;
      await sql`DELETE FROM daily_targets WHERE target_date = ${d}`;
    }
    await sql`DELETE FROM meals WHERE name LIKE 'ZZ Matrix%'`;
    await sql`DELETE FROM food_items WHERE name LIKE 'ZZ Matrix%'`;
  } finally {
    await sql.end();
  }
}

async function fillNutrient(page: Page, label: string, value: string) {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  await page.locator(".editor-grid .compact-input")
    .filter({ has: page.locator(".form-label-sm", { hasText: exact }) })
    .locator("input").fill(value);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  await cleanup();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(15_000);

  const counters: Record<string, number> = {};
  const shot = async (area: string, name: string, full = false) => {
    const dir = `${OUT}/${area}`;
    fs.mkdirSync(dir, { recursive: true });
    counters[area] = (counters[area] ?? 0) + 1;
    await page.screenshot({ path: `${dir}/${String(counters[area]).padStart(2, "0")}-${name}.png`, fullPage: full });
    console.log(`  matrix/${area}/${name}`);
  };
  const step = async (label: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { console.warn(`  SKIP ${label}: ${(e as Error).message.split("\n")[0]}`); }
  };
  const newFood = () => page.getByRole("button", { name: "+ New Food" }).click();
  const saveFood = () => page.getByRole("button", { name: /Save Food|Saving/ }).click();

  // ===== FOODS: boundary / invalid / persistence =====
  await step("foods.negative", async () => {
    await page.goto(`${BASE}/foods`);
    await page.waitForSelector(".master-list-item");
    await newFood();
    await page.getByPlaceholder("e.g. Porridge Oats").fill("ZZ Matrix Negative");
    await fillNutrient(page, "Calories (kcal)", "-50");
    await shot("foods", "negative-nutrient-entered");
    await saveFood();
    await page.waitForSelector(".toast");
    await shot("foods", "negative-nutrient-result");
  });
  await step("foods.blank-macros", async () => {
    await newFood();
    await page.getByPlaceholder("e.g. Porridge Oats").fill("ZZ Matrix CaloriesOnly");
    await fillNutrient(page, "Calories (kcal)", "200"); // leave all macros blank
    await shot("foods", "blank-macros-entered");
    await saveFood();
    await page.waitForSelector(".toast");
    // reopen to see what blank became
    await page.getByPlaceholder("Search foods...").fill("ZZ Matrix CaloriesOnly");
    await page.waitForTimeout(400);
    await page.locator(".master-list-item").filter({ hasText: "ZZ Matrix CaloriesOnly" }).first().click();
    await page.waitForSelector(".editor-grid");
    await shot("foods", "blank-macros-reopened-shows-zeros");
  });
  await step("foods.duplicate", async () => {
    await newFood();
    await page.getByPlaceholder("e.g. Porridge Oats").fill("Chicken Breast"); // already exists
    await fillNutrient(page, "Calories (kcal)", "100");
    await saveFood();
    await page.waitForSelector(".toast");
    await shot("foods", "duplicate-name-result");
  });
  await step("foods.per-item-roundtrip", async () => {
    await newFood();
    await page.getByPlaceholder("e.g. Porridge Oats").fill("ZZ Matrix Egg");
    await page.locator(".radio-label").filter({ hasText: "Per Item" }).locator("input").check();
    await page.getByPlaceholder("Required for per-item").fill("58");
    await fillNutrient(page, "Calories (kcal)", "78");
    await saveFood();
    await page.waitForSelector(".toast");
    // hard reload then reopen — does unit type + serving size round-trip?
    await page.goto(`${BASE}/foods`);
    await page.getByPlaceholder("Search foods...").fill("ZZ Matrix Egg");
    await page.waitForTimeout(400);
    await page.locator(".master-list-item").filter({ hasText: "ZZ Matrix Egg" }).first().click();
    await page.waitForSelector(".editor-grid");
    await shot("foods", "per-item-roundtrip-after-reload");
  });
  await step("foods.long-name", async () => {
    await newFood();
    await page.getByPlaceholder("e.g. Porridge Oats")
      .fill("ZZ Matrix Sainsbury's Taste the Difference Slow-Matured Aberdeen Angus Beef Lasagne 800g Serves Four");
    await fillNutrient(page, "Calories (kcal)", "120");
    await saveFood();
    await page.waitForSelector(".toast");
    await page.getByPlaceholder("Search foods...").fill("ZZ Matrix Sainsbury");
    await page.waitForTimeout(400);
    await shot("foods", "long-name-in-list", true);
  });

  // ===== MEALS: persistence round-trip + 1-ingredient plural =====
  await step("meals.roundtrip", async () => {
    await page.goto(`${BASE}/meals`);
    await page.waitForSelector(".saved-meals-list, .meal-card");
    await page.getByTestId("meal-name").fill("ZZ Matrix Mixed Meal");
    // per-100g ingredient
    let s = page.getByTestId("meal-food-search");
    await s.click(); await s.fill("Chicken Breast");
    await page.locator(".combobox-option").filter({ hasText: "Chicken Breast" }).first().click();
    await page.getByTestId("ingredient-amount").fill("150");
    await page.getByTestId("add-ingredient").click();
    // per-item ingredient (the egg created above)
    await s.click(); await s.fill("ZZ Matrix Egg");
    await page.locator(".combobox-option").filter({ hasText: "ZZ Matrix Egg" }).first().click();
    await page.getByTestId("ingredient-amount").fill("2");
    await page.getByTestId("add-ingredient").click();
    await shot("meals", "composer-before-save");
    await page.getByTestId("save-meal").click();
    await page.waitForSelector(".toast");
    // reload + reopen for edit — do "150 g" and "× 2" round-trip?
    await page.goto(`${BASE}/meals`);
    await page.waitForSelector(".meal-card");
    await page.locator(".meal-card").filter({ hasText: "ZZ Matrix Mixed Meal" }).first()
      .locator(".meal-card-header").click();
    await page.waitForTimeout(500);
    await shot("meals", "reopened-amounts-roundtrip", true);
  });

  // ===== ENTRY: precision, invalid edit, units, weight-only, idempotency, date edge =====
  await step("entry.fractional-quantity", async () => {
    // log the mixed meal at 1/3 portions → per-item egg qty 2 → 0.6666… ?
    await cleanupDate(DATE);
    await page.goto(`${BASE}/entry?date=${DATE}`);
    await page.waitForSelector(".calories-remaining-number");
    const s = page.getByTestId("food-search");
    await s.click(); await s.fill("ZZ Matrix Mixed Meal");
    await page.locator(".combobox-option").filter({ hasText: "(recipe)" }).first().click();
    await page.getByTestId("amount-input").fill("0.333");
    await page.waitForSelector(".nutrient-preview-card");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await page.goto(`${BASE}/entry?date=${DATE}`);
    await page.waitForSelector(".calories-remaining-number");
    await page.locator(".meal-entry-header").first().click();
    await page.waitForTimeout(400);
    await shot("entry", "fractional-quantity-raw-float", true);
  });
  await step("entry.invalid-edit", async () => {
    await cleanupDate(DATE);
    await page.goto(`${BASE}/entry?date=${DATE}`);
    await page.waitForSelector(".calories-remaining-number");
    const s = page.getByTestId("food-search");
    await s.click(); await s.fill("Chicken Breast");
    await page.locator(".combobox-option").filter({ hasText: "Chicken Breast" }).first().click();
    await page.getByTestId("amount-input").fill("150");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await page.waitForTimeout(400);
    const row = page.locator(".ingredients-list > .ingredient-item").filter({ hasText: "Chicken Breast" }).first();
    await row.locator(".ingredient-weight.editable").first().click();
    const inp = row.locator(".inline-edit-input");
    await inp.fill("-20");
    await shot("entry", "inline-edit-negative-typed");
    await inp.press("Enter");
    await page.waitForTimeout(400);
    await shot("entry", "inline-edit-negative-result");
    // letters
    await row.locator(".ingredient-weight.editable").first().click();
    const inp2 = row.locator(".inline-edit-input");
    await inp2.fill("abc");
    await shot("entry", "inline-edit-letters");
  });
  await step("entry.idempotency", async () => {
    await cleanupDate(DATE);
    await page.goto(`${BASE}/entry?date=${DATE}`);
    await page.waitForSelector(".calories-remaining-number");
    const s = page.getByTestId("food-search");
    await s.click(); await s.fill("Chicken Breast");
    await page.locator(".combobox-option").filter({ hasText: "Chicken Breast" }).first().click();
    await page.getByTestId("amount-input").fill("100");
    // rapid double click
    const add = page.getByTestId("add-button");
    await add.click();
    await add.click().catch(() => {});
    await page.waitForTimeout(900);
    await shot("entry", "rapid-double-add-result", true);
  });
  await step("entry.weight-plausible-wrong", async () => {
    await cleanupDate(DATE2);
    await page.goto(`${BASE}/entry?date=${DATE2}`);
    await page.waitForSelector(".calories-remaining-number");
    await page.getByTestId("weight-morning").fill("150"); // 150kg? likely a lb mix-up; accepted
    await page.getByTestId("weight-morning").blur();
    await page.waitForTimeout(500);
    await shot("entry", "weight-150-accepted-no-sanity-guard");
    // weight-only day persists with no food
    await page.goto(`${BASE}/entry?date=${DATE2}`);
    await page.waitForSelector(".calories-remaining-number");
    await shot("entry", "weight-only-day-after-reload", true);
  });
  await step("entry.over-limit-macro", async () => {
    await cleanupDate(DATE);
    await page.goto(`${BASE}/entry?date=${DATE}`);
    await page.waitForSelector(".calories-remaining-number");
    // sugar limit is 90g; add lots of a sugary food
    const s = page.getByTestId("food-search");
    await s.click(); await s.fill("7up");
    const opt = page.locator(".combobox-option").first();
    await opt.click();
    await page.getByTestId("amount-input").fill("2000");
    await page.getByTestId("add-button").click().catch(() => {});
    await page.waitForTimeout(700);
    await shot("entry", "over-limit-macro-indicators", true);
  });
  await step("entry.future-date", async () => {
    await page.goto(`${BASE}/entry`);
    await page.waitForSelector(".calories-remaining-number");
    await shot("entry", "today-next-day-disabled");
  });

  // ===== DASHBOARD: export validation =====
  await step("export.from-after-to", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector(".chart-svg path");
    await page.getByRole("button", { name: "Export" }).click();
    await page.waitForSelector(".modal");
    await page.waitForTimeout(400);
    const dates = page.locator(".modal input[type=date]");
    if (await dates.count() >= 2) {
      await dates.nth(0).fill("2026-06-10"); // from
      await dates.nth(1).fill("2026-06-01"); // to (before from)
      await page.waitForTimeout(300);
      await shot("export", "from-after-to");
    }
  });

  await browser.close();
  await cleanup();
  console.log(`Done → ${OUT}/`);

  async function cleanupDate(d: string) {
    const sql = postgres(DB_URL, { max: 1 });
    try {
      await sql`DELETE FROM food_entries WHERE entry_date = ${d}`;
      await sql`DELETE FROM daily_summaries WHERE summary_date = ${d}`;
    } finally { await sql.end(); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
