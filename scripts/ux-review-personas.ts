/**
 * Persona-driven UX capture — tracks like a REAL user, not a happy-path clicker.
 * Reproduces the meal-prep journeys that the first feature-by-feature pass missed.
 * Output: tests/e2e/screenshots/ux-review/personas/NN-state.png
 *
 *   AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
 *   DATABASE_URL=…/nutritional_review npx tsx scripts/ux-review-personas.ts
 *
 * Persona: someone who meal-preps a batch, saves it as a meal, then through the
 * week eats fractional portions (half when not hungry) and sometimes the same
 * prepped meal twice in a day. Mutates only an empty demo date.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.UX_BASE ?? "http://localhost:3300";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_review";
const OUT = "tests/e2e/screenshots/ux-review/personas";
const DEMO_DATE = "2026-06-14"; // empty day, off real data
const MEAL = "Chicken, Edamame, Rice";

async function clearDay() {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    await sql`DELETE FROM food_entries WHERE entry_date = ${DEMO_DATE}`;
    await sql`DELETE FROM daily_summaries WHERE summary_date = ${DEMO_DATE}`;
    await sql`DELETE FROM daily_targets WHERE target_date = ${DEMO_DATE}`;
  } finally {
    await sql.end();
  }
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  await clearDay();

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(15_000);
  let n = 0;
  const shot = async (name: string, full = false) => {
    await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: full });
    console.log(`  personas/${name}`);
  };

  const addMeal = async (portions: string) => {
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill(MEAL);
    await page.locator(".combobox-option").filter({ hasText: "(recipe)" }).first().click();
    await page.getByTestId("amount-input").fill(portions);
    await page.waitForSelector(".nutrient-preview-card");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await page.waitForTimeout(500);
  };

  // --- Journey 1: meal-prepper eats HALF a prepped portion ---
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  // before submit: the entered 0.5 in the preview
  const search = page.getByTestId("food-search");
  await search.click();
  await search.fill(MEAL);
  await page.locator(".combobox-option").filter({ hasText: "(recipe)" }).first().click();
  await page.getByTestId("amount-input").fill("0.5");
  await page.waitForSelector(".nutrient-preview-card");
  await shot("entering-half-portion");
  await page.getByTestId("add-button").click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(500);
  await shot("after-add-half", true);

  // reload (what the user sees next time they open the day)
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("half-portion-after-reload-shows-1", true);
  // expand to show ingredient grams ARE halved while label says 1 portion
  await page.locator(".meal-entry-header").first().click();
  await page.waitForTimeout(400);
  await shot("expanded-grams-halved-but-label-1", true);

  // --- Journey 2: same prepped meal eaten twice in a day (lunch + dinner) ---
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await addMeal("1"); // lunch
  await addMeal("1"); // dinner
  await shot("same-meal-twice-before-reload", true);
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("same-meal-twice-after-reload-merged", true);

  // --- Journey 3: can the portions be corrected? (no affordance) ---
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await addMeal("2");
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await page.locator(".meal-entry-header").first().click();
  await page.waitForTimeout(400);
  await shot("two-portions-reset-no-edit-affordance", true);

  // --- Journey 4: cooked the recipe but was MISSING an ingredient ---
  // Real user logs the prepped meal, then removes the one thing they left out.
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await addMeal("1");
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await page.locator(".meal-entry-header").first().click();
  await page.waitForTimeout(400);
  await shot("missing-ingredient-before-remove", true);
  // remove a single ingredient (the one they didn't have)
  await page.locator(".meal-entry-ingredients .ingredient-item").last()
    .locator(".delete-icon").first().click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(500);
  await page.locator(".meal-entry-header").first().click();
  await page.waitForTimeout(300);
  await shot("missing-ingredient-after-remove", true);

  // reduce a meal down to a SINGLE ingredient → "1 ingredients" (plural bug)
  for (let i = 0; i < 4; i++) {
    await page.locator(".meal-entry-header").first().click().catch(() => {});
    await page.waitForTimeout(200);
    const del = page.locator(".meal-entry-ingredients .ingredient-item").first()
      .locator(".delete-icon").first();
    if (await del.count()) {
      await del.click();
      await page.waitForTimeout(450);
    }
  }
  await shot("meal-one-ingredient-plural-bug", true);

  // --- Journey 5: ate MORE than planned — blow past the calorie target ---
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await addMeal("4"); // ~4× the meal → well over any daily target
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await shot("over-target-hero-clamps-to-zero", true);

  // --- Journey 6: ate something NOT in the database (restaurant meal) ---
  // There is no quick "custom calories" path — search yields nothing actionable.
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  const s2 = page.getByTestId("food-search");
  await s2.click();
  await s2.fill("restaurant pad thai takeaway");
  await page.waitForTimeout(500);
  await shot("food-not-in-db-no-quick-add");

  // --- Journey 7: typo correction — inline-edit an amount to 0 ---
  await clearDay();
  await page.goto(`${BASE}/entry?date=${DEMO_DATE}`);
  await page.waitForSelector(".calories-remaining-number");
  await s2.click();
  await s2.fill("Chicken Breast");
  await page.locator(".combobox-option").filter({ hasText: "Chicken Breast" }).first().click();
  await page.getByTestId("amount-input").fill("150");
  await page.getByTestId("add-button").click();
  await page.waitForSelector(".toast");
  await page.waitForTimeout(500);
  const row = page.locator(".ingredients-list > .ingredient-item").filter({ hasText: "Chicken Breast" }).first();
  await row.locator(".ingredient-weight.editable").first().click();
  const input = row.locator(".inline-edit-input");
  await input.fill("0");
  await shot("inline-edit-to-zero-typed");
  await input.press("Enter");
  await page.waitForTimeout(500);
  await shot("inline-edit-to-zero-silently-ignored", true);

  await browser.close();
  await clearDay();
  console.log(`Done → ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
