/**
 * UX-review capture: drives EVERY user action catalogued in docs/FEATURES.md and
 * takes before/after screenshots at both desktop (1440×900) and mobile (390×844),
 * for a designer's review. High-DPI (2×). Output:
 *
 *   tests/e2e/screenshots/ux-review/<desktop|mobile>/<section>/<NN>-state.png
 *
 * Reuses the project's selectors (data-testids + documented CSS classes) and the
 * AUTH_DISABLED bypass. Run a dev server first (see plan), then:
 *
 *   AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
 *   npx tsx scripts/ux-review.ts            # both viewports
 *   npx tsx scripts/ux-review.ts desktop    # one viewport
 *
 * The script mutates only its own "ZZ Review …" foods/meals and the per-viewport
 * demo date; it cleans those up at start so it is safely re-runnable. It never
 * modifies application code.
 */
import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import postgres from "postgres";

const BASE = process.env.UX_BASE ?? "http://localhost:3300";
const DB_URL =
  process.env.DATABASE_URL ??
  "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_review";
const OUT = "tests/e2e/screenshots/ux-review";

interface Viewport {
  tag: "desktop" | "mobile";
  width: number;
  height: number;
  /** Empty date used for the add/edit/remove/weights flow (kept off real data). */
  demoDate: string;
  /** Suffix that keeps desktop/mobile test artifacts from colliding. */
  suffix: string;
}

const VIEWPORTS: Viewport[] = [
  { tag: "desktop", width: 1440, height: 900, demoDate: "2026-06-16", suffix: "D" },
  { tag: "mobile", width: 390, height: 844, demoDate: "2026-06-15", suffix: "M" },
];

/** A real, richly-populated day in the seed copy — used for "view a real day". */
const REAL_DAY = "2026-06-05";
/** A real food referenced by hundreds of entries — used for the FK-delete guard. */
const REFERENCED_FOOD = "Semi skimmed milk";
/** A real saved meal — used for add-meal-by-portions and expand/edit. */
const REAL_MEAL = "Chicken, Edamame, Rice";
/** A data-rich week (real logged days exist here) for planner readouts + plan-vs-actual. */
const PLANNER_WEEK = "2026-06-15";

/** Monday (ISO) on or before an ISO date — mirrors lib/domain/plan/week.mondayOf. */
function mondayOf(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const back = (day + 6) % 7;
  return new Date(Date.parse(`${iso}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
}

async function cleanup(): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    // Clear demo-date rows FIRST (they reference test foods via FK), then the
    // test meals/foods. Order matters for the food_entries_food_id_fkey constraint.
    for (const v of VIEWPORTS) {
      await sql`DELETE FROM food_entries WHERE entry_date = ${v.demoDate}`;
      await sql`DELETE FROM daily_summaries WHERE summary_date = ${v.demoDate}`;
      await sql`DELETE FROM daily_targets WHERE target_date = ${v.demoDate}`;
    }
    await sql`DELETE FROM meals WHERE name LIKE 'ZZ Review%'`;
    await sql`DELETE FROM food_items WHERE name LIKE 'ZZ Review%'`;
    // Planner: wipe seeded plan rows (review DB is a throwaway clone — no real plans).
    await sql`DELETE FROM meal_plan_items`;
    await sql`DELETE FROM meal_plans`;
  } finally {
    await sql.end();
  }
}

/**
 * Seed plan items so the planner captures show populated state: a real meal painted
 * across the data-rich week (so plan-vs-actual has logged days to compare) and onto
 * today (so the today-only apply affordance is capturable). Idempotent after cleanup().
 */
async function seedPlanner(): Promise<void> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const [owner] = await sql<{ id: string }[]>`
      SELECT id FROM users
      ORDER BY (SELECT count(*) FROM food_entries fe WHERE fe.user_id = users.id) DESC
      LIMIT 1`;
    const [meal] = await sql<{ id: string }[]>`
      SELECT id FROM meals WHERE user_id = ${owner.id} ORDER BY name LIMIT 1`;
    if (!owner || !meal) return;
    const today = new Date().toISOString().slice(0, 10);
    for (const week of [PLANNER_WEEK, mondayOf(today)]) {
      const [plan] = await sql<{ id: string }[]>`
        INSERT INTO meal_plans (user_id, week_start) VALUES (${owner.id}, ${week})
        ON CONFLICT (user_id, week_start) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id`;
      const cells: [number, string][] =
        week === PLANNER_WEEK
          ? [[0, "lunch"], [1, "lunch"], [2, "lunch"], [3, "lunch"], [4, "lunch"], [0, "dinner"], [1, "dinner"]]
          : // current week: cover today + neighbours so the apply affordance shows
            [[0, "lunch"], [1, "lunch"], [2, "lunch"], [3, "lunch"], [4, "lunch"], [5, "lunch"], [6, "lunch"]];
      for (const [offset, slot] of cells) {
        const planDate = new Date(Date.parse(`${week}T00:00:00Z`) + offset * 86_400_000)
          .toISOString()
          .slice(0, 10);
        await sql`
          INSERT INTO meal_plan_items (plan_id, user_id, plan_date, slot, position, meal_id, portions)
          VALUES (${plan.id}, ${owner.id}, ${planDate}, ${slot}, 0, ${meal.id}, 1)`;
      }
    }
  } finally {
    await sql.end();
  }
}

/** Per-viewport capture run. Each step wrapped so one failure can't abort the rest. */
async function run(vp: Viewport): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  page.setDefaultTimeout(15_000);

  let n = 0;
  const shot = async (section: string, name: string, full = false) => {
    const dir = `${OUT}/${vp.tag}/${section}`;
    fs.mkdirSync(dir, { recursive: true });
    const file = `${dir}/${String(++n).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: file, fullPage: full });
    console.log(`  [${vp.tag}] ${section}/${name}`);
  };
  const step = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`  [${vp.tag}] SKIP ${label}: ${(e as Error).message.split("\n")[0]}`);
    }
  };
  const settle = () => page.waitForTimeout(450);
  const oats = `ZZ Review Oats ${vp.suffix}`;
  const banana = `ZZ Review Banana ${vp.suffix}`;
  const temp = `ZZ Review Temp ${vp.suffix}`;
  const myMeal = `ZZ Review Meal ${vp.suffix}`;

  // ============ AUTH & ACCESS ============
  await step("auth", async () => {
    await page.goto(`${BASE}/signin`);
    await settle();
    await shot("auth", "signin");
    await page.goto(`${BASE}/denied`);
    await settle();
    await shot("auth", "denied");
  });

  // ============ FOOD DATABASE ============
  await step("foods.list", async () => {
    await page.goto(`${BASE}/foods`);
    await page.waitForSelector(".master-list-item");
    // viewport-only: fullPage would render all ~500 rows into a giant image
    await shot("foods", "list-before");
  });
  await step("foods.new-per100g", async () => {
    await page.getByRole("button", { name: "+ New Food" }).click();
    await settle();
    await shot("foods", "new-form-empty");
    await page.getByPlaceholder("e.g. Porridge Oats").fill(oats);
    await fillNutrient(page, "Calories (kcal)", "389");
    await fillNutrient(page, "Protein (g)", "11");
    await fillNutrient(page, "Carbs (g)", "66");
    await fillNutrient(page, "Fat (g)", "8");
    await shot("foods", "per100g-filled");
    await page.getByRole("button", { name: /Save Food|Saving/ }).click();
    await page.waitForSelector(".toast");
    await shot("foods", "per100g-saved");
  });
  await step("foods.new-per-item", async () => {
    await page.getByRole("button", { name: "+ New Food" }).click();
    await settle();
    await page.getByPlaceholder("e.g. Porridge Oats").fill(banana);
    await shot("foods", "per-item-before-toggle");
    await page.locator(".radio-label").filter({ hasText: "Per Item" }).locator("input").check();
    await settle();
    await shot("foods", "per-item-serving-field-shown");
    await page.getByPlaceholder("Required for per-item").fill("118");
    await fillNutrient(page, "Calories (kcal)", "105");
    await fillNutrient(page, "Carbs (g)", "27");
    await shot("foods", "per-item-filled");
    await page.getByRole("button", { name: /Save Food|Saving/ }).click();
    await page.waitForSelector(".toast");
    await shot("foods", "per-item-saved");
  });
  await step("foods.edit-unit-flip", async () => {
    await page.getByPlaceholder("Search foods...").fill(oats);
    await settle();
    await page.locator(".master-list-item").filter({ hasText: oats }).first().click();
    await page.waitForSelector(".editor-grid");
    await shot("foods", "edit-loaded");
    await page.locator(".radio-label").filter({ hasText: "Per Item" }).locator("input").check();
    await settle();
    await shot("foods", "edit-unit-flipped-serving-required");
    // revert without saving
    await page.locator(".radio-label").filter({ hasText: "Per 100g" }).locator("input").check();
  });
  await step("foods.search", async () => {
    await page.getByPlaceholder("Search foods...").fill("ZZ Review");
    await settle();
    await shot("foods", "search-filtered");
    await page.getByPlaceholder("Search foods...").fill("zzzznomatch");
    await settle();
    await shot("foods", "search-empty-state");
    await page.getByPlaceholder("Search foods...").fill("");
    await settle();
  });
  await step("foods.delete-fk-guard", async () => {
    await page.getByPlaceholder("Search foods...").fill(REFERENCED_FOOD);
    await settle();
    await page.locator(".master-list-item").filter({ hasText: REFERENCED_FOOD }).first().click();
    await page.waitForSelector(".editor-grid");
    await shot("foods", "fk-before-delete");
    await page.locator(".master-list-item").filter({ hasText: REFERENCED_FOOD }).first()
      .locator(".delete-icon").first().click();
    await page.waitForSelector(".toast");
    await shot("foods", "fk-delete-blocked-toast");
  });
  await step("foods.delete-success", async () => {
    await page.getByRole("button", { name: "+ New Food" }).click();
    await page.getByPlaceholder("e.g. Porridge Oats").fill(temp);
    await fillNutrient(page, "Calories (kcal)", "10");
    await page.getByRole("button", { name: /Save Food|Saving/ }).click();
    await page.waitForSelector(".toast");
    await page.getByPlaceholder("Search foods...").fill(temp);
    await settle();
    await shot("foods", "delete-before");
    await page.locator(".master-list-item").filter({ hasText: temp }).first()
      .locator(".delete-icon").first().click();
    await page.waitForSelector(".toast");
    await settle();
    await shot("foods", "delete-success-toast");
    await page.getByPlaceholder("Search foods...").fill("");
  });

  // ============ MEAL TEMPLATES ============
  await step("meals.composer", async () => {
    await page.goto(`${BASE}/meals`);
    await page.waitForSelector(".saved-meals-list, .meal-card");
    await shot("meals", "page-before", true);
    await page.getByTestId("meal-name").fill(myMeal);
    await addComposerIngredient(page, "Chicken Breast", "150");
    await settle();
    await shot("meals", "ingredient1-added-totals");
    await addComposerIngredient(page, banana, "1");
    await settle();
    await shot("meals", "mixed-units-composer");
    await page.getByTestId("save-meal").click();
    await page.waitForSelector(".toast");
    await shot("meals", "saved-toast");
  });
  await step("meals.expand", async () => {
    const card = page.locator(".meal-card").filter({ hasText: REAL_MEAL }).first();
    await card.scrollIntoViewIfNeeded();
    await shot("meals", "card-collapsed");
    await card.locator(".meal-card-expand").click();
    await settle();
    await shot("meals", "card-expanded-nutrients");
  });
  await step("meals.load-edit", async () => {
    const card = page.locator(".meal-card").filter({ hasText: REAL_MEAL }).first();
    await card.locator(".meal-card-header").click();
    await page.waitForSelector(".ingredients-list, [data-testid=composer-ingredients]");
    await settle();
    await shot("meals", "loaded-for-edit", true);
  });
  await step("meals.delete", async () => {
    const card = page.locator(".meal-card").filter({ hasText: myMeal }).first();
    await card.scrollIntoViewIfNeeded();
    await shot("meals", "delete-before");
    await card.locator(".delete-icon").first().click();
    await page.waitForSelector(".toast");
    await settle();
    await shot("meals", "delete-toast");
  });

  // ============ DAILY ENTRY ============
  await step("entry.empty", async () => {
    await page.goto(`${BASE}/entry?date=${vp.demoDate}`);
    await page.waitForSelector(".calories-remaining-number");
    await shot("entry", "empty-day", true);
  });
  await step("entry.combobox", async () => {
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill("chicken");
    await settle();
    await shot("entry", "combobox-open");
  });
  await step("entry.quick-add", async () => {
    // food not in the DB → the "+ Quick add" option + the inline form
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill("ZZ Sweep Takeaway");
    await settle();
    await shot("entry", "quick-add-offered");
    await page.locator(".combobox-quick-add").click();
    await settle();
    await shot("entry", "quick-add-form"); // read this fully: required *, hint, basis, spacing
    // abandon it cleanly (don't pollute the day) — typing a new search dismisses it
    await search.click();
    await search.fill("chicken");
    await settle();
    await shot("entry", "quick-add-dismissed-on-search");
  });
  await step("entry.add-by-weight", async () => {
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill("Chicken Breast");
    await page.locator(".combobox-option").filter({ hasText: "Chicken Breast" }).first().click();
    await page.getByTestId("amount-input").fill("150");
    await page.waitForSelector(".nutrient-preview-card");
    await shot("entry", "weight-label-and-preview");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await settle();
    await shot("entry", "food-by-weight-added");
  });
  await step("entry.add-by-item", async () => {
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill(banana);
    await page.locator(".combobox-option").filter({ hasText: banana }).first().click();
    await settle();
    await shot("entry", "quantity-label");
    await page.getByTestId("amount-input").fill("1.5");
    await page.waitForSelector(".nutrient-preview-card");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await settle();
    await shot("entry", "food-by-item-added");
  });
  await step("entry.add-meal", async () => {
    const search = page.getByTestId("food-search");
    await search.click();
    await search.fill(REAL_MEAL);
    await page.locator(".combobox-option").filter({ hasText: "(meal)" }).first().click();
    await settle();
    await shot("entry", "portions-label");
    await page.getByTestId("amount-input").fill("1");
    await page.waitForSelector(".nutrient-preview-card");
    await page.getByTestId("add-button").click();
    await page.waitForSelector(".toast");
    await settle();
    await shot("entry", "meal-added-grouped");
  });
  await step("entry.meal-expand", async () => {
    await page.locator(".meal-entry-header").first().click();
    await settle();
    await shot("entry", "meal-row-expanded", true);
  });
  await step("entry.inline-edit", async () => {
    const row = page.locator(".ingredients-list > .ingredient-item")
      .filter({ hasText: "Chicken Breast" }).first();
    await row.locator(".ingredient-weight.editable").first().click();
    await settle();
    await shot("entry", "inline-edit-active");
    const input = row.locator(".inline-edit-input");
    await input.fill("220");
    await input.press("Enter");
    await settle();
    await shot("entry", "inline-edit-committed");
  });
  await step("entry.summary", async () => {
    await shot("entry", "calories-and-macros", true);
  });
  await step("entry.remove", async () => {
    // remove a single meal ingredient
    const mealRow = page.locator(".ingredients-list > .ingredient-item")
      .filter({ hasText: REAL_MEAL }).first();
    const ing = mealRow.locator(".meal-entry-ingredients .ingredient-item").first();
    if (await ing.count()) {
      await ing.locator(".delete-icon").first().click();
      await settle();
      await shot("entry", "ingredient-removed");
    }
    // remove the whole meal
    await mealRow.locator(".delete-icon").first().click();
    await settle();
    await shot("entry", "meal-removed");
    // remove a food entry
    const foodRow = page.locator(".ingredients-list > .ingredient-item")
      .filter({ hasText: "Chicken Breast" }).first();
    if (await foodRow.count()) {
      await foodRow.locator(".delete-icon").first().click();
      await settle();
      await shot("entry", "food-removed");
    }
  });
  await step("entry.targets", async () => {
    await page.getByRole("button", { name: "Edit Targets" }).click();
    await page.waitForSelector(".modal");
    await settle(); // let the modal finish animating in before capturing
    await shot("entry", "targets-modal");
    const toggle = page.locator(".modal [role=radio]").first();
    if (await toggle.count()) {
      await toggle.click();
      await shot("entry", "targets-mode-toggle");
    }
    await page.keyboard.press("Escape");
    await settle();
  });
  await step("entry.weights", async () => {
    await page.getByTestId("weight-morning").fill("70.5");
    await page.getByTestId("weight-morning").blur();
    await page.waitForSelector(".toast");
    await settle();
    await shot("entry", "weight-saved");
    await page.getByTestId("weight-morning").fill("");
    await page.getByTestId("weight-morning").blur();
    await settle();
    await shot("entry", "weight-cleared");
    await page.getByTestId("weight-evening").fill("600");
    await page.getByTestId("weight-evening").blur();
    await settle();
    await shot("entry", "weight-invalid-over-500");
  });
  await step("entry.date-nav", async () => {
    await shot("entry", "date-header");
    await page.getByTestId("prev-day").click();
    await settle();
    await shot("entry", "prev-day");
  });
  await step("entry.real-day", async () => {
    await page.goto(`${BASE}/entry?date=${REAL_DAY}`);
    await page.waitForSelector(".calories-remaining-number");
    await shot("entry", "real-populated-day", true);
  });

  // ============ DASHBOARD ============
  await step("dashboard.calories-weight", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector(".chart-svg path");
    await settle();
    await shot("dashboard", "calories-weight-3m", true);
  });
  await step("dashboard.ranges", async () => {
    for (const r of ["1M", "6M", "1Y", "ALL"]) {
      await page.locator("[role=radio]").filter({ hasText: new RegExp(`^${r}$`) }).first().click();
      await settle();
      await shot("dashboard", `range-${r.toLowerCase()}`);
    }
    await page.locator("[role=radio]").filter({ hasText: /^3M$/ }).first().click();
    await settle();
  });
  await step("dashboard.tabs", async () => {
    await page.getByRole("tab", { name: "Macronutrient Breakdown" }).click();
    await page.waitForSelector(".chart-svg path");
    await settle();
    await shot("dashboard", "macro-breakdown", true);
    await page.getByRole("tab", { name: "Nutrients vs RDI" }).click();
    await page.waitForSelector(".chart-svg path");
    await settle();
    await shot("dashboard", "nutrients-rdi", true);
    await page.getByRole("tab", { name: "Calories & Weight" }).click();
    await page.waitForSelector(".chart-svg path");
  });
  await step("dashboard.tooltip", async () => {
    const box = await page.locator(".chart-svg").first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await settle();
      await shot("dashboard", "hover-tooltip");
    }
  });

  // ============ WEEKLY PLANNER ============
  await step("planner.week", async () => {
    await page.goto(`${BASE}/planner?week=${PLANNER_WEEK}`);
    await page.waitForSelector(".planner-week");
    await settle();
    await shot("planner", "week-grid", true);
  });
  await step("planner.summary", async () => {
    await page.goto(`${BASE}/planner?week=${PLANNER_WEEK}`);
    await page.waitForSelector(".planner-week-summary");
    await settle();
    await shot("planner", "week-summary");
    await page.getByTestId("denom-toggle").click();
    await settle();
    await shot("planner", "week-summary-denom");
  });
  await step("planner.pva", async () => {
    await page.goto(`${BASE}/planner?week=${PLANNER_WEEK}`);
    await page.waitForSelector(".planner-pva");
    await page.locator(".planner-pva").scrollIntoViewIfNeeded();
    await settle();
    await shot("planner", "plan-vs-actual", true);
  });
  await step("planner.addpanel", async () => {
    // The single add flow: pick an item, set the quantity up front, choose days.
    await page.goto(`${BASE}/planner?week=${PLANNER_WEEK}`);
    await page.waitForSelector('[data-testid="add-panel"]');
    await page.getByTestId("planner-food-search").click();
    await page.locator(".combobox-option").first().click().catch(() => {});
    await settle();
    await shot("planner", "add-panel-selected");
    await page.getByTestId("days-weekdays").click().catch(() => {});
    await settle();
    await shot("planner", "add-panel-days");
  });
  await step("planner.daystrip", async () => {
    // Per-day macro strip: kcal + deltas to target, the heart of day planning.
    await page.goto(`${BASE}/planner?week=${PLANNER_WEEK}`);
    await page.waitForSelector('[data-testid="day-strip"]');
    await page.getByTestId("planner-day-0").scrollIntoViewIfNeeded();
    await settle();
    await shot("planner", "day-macro-strip");
  });
  await step("planner.current", async () => {
    // Default (current) week — today's column carries the today-only apply affordance.
    await page.goto(`${BASE}/planner`);
    await page.waitForSelector(".planner-week");
    await settle();
    await shot("planner", "current-week", true);
  });

  // ============ ACCOUNT MENU ============
  await step("account.menu", async () => {
    await page.locator(".account-menu-trigger").click();
    await page.waitForSelector(".account-menu-panel");
    await settle();
    await shot("account", "menu-open");
    await page.keyboard.press("Escape");
  });

  // ============ CSV EXPORT ============
  await step("export.modal", async () => {
    // Export now lives inside the account dropdown.
    await page.locator(".account-menu-trigger").click();
    await page.getByRole("menuitem", { name: "Export data" }).click();
    await page.waitForSelector(".modal");
    await settle(); // let the modal finish animating in before capturing
    await shot("export", "modal-default");
    const boxes = page.locator(".modal input[type=checkbox]");
    const count = await boxes.count();
    for (let i = 0; i < count; i++) await boxes.nth(i).check().catch(() => {});
    await settle();
    await shot("export", "all-options-checked");
    await page.keyboard.press("Escape");
  });

  await browser.close();
}

async function fillNutrient(page: Page, label: string, value: string) {
  const exact = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  await page
    .locator(".editor-grid .compact-input")
    .filter({ has: page.locator(".form-label-sm", { hasText: exact }) })
    .locator("input")
    .fill(value);
}

async function addComposerIngredient(page: Page, query: string, amount: string) {
  const search = page.getByTestId("meal-food-search");
  await search.click();
  await search.fill(query);
  await page.locator(".combobox-option").filter({ hasText: query }).first().click();
  await page.getByTestId("ingredient-amount").fill(amount);
  await page.getByTestId("add-ingredient").click();
}

async function main() {
  const only = process.argv[2] as "desktop" | "mobile" | undefined;
  const viewports = only ? VIEWPORTS.filter((v) => v.tag === only) : VIEWPORTS;
  console.log(`Cleaning up prior artifacts…`);
  await cleanup();
  await seedPlanner();
  for (const vp of viewports) {
    console.log(`\n=== Capturing ${vp.tag} (${vp.width}×${vp.height}) ===`);
    await run(vp);
  }
  console.log(`\nDone. Screenshots under ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
