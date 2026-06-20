/**
 * Data-access layer — exact port of nutritional/data_entry/sqlmodel_storage.py.
 *
 * All functions take a Drizzle database so the identical code path runs
 * against postgres.js in the app and PGlite in tests.
 *
 * Critical invariants (see sqlmodel_storage.py):
 *  - saveDailyEntry: delete-all-for-date + reinsert; upserts daily_summaries
 *    writing ONLY nutrient columns (never weights); empty day → NULLs, not 0.
 *  - updateMeasurements: independent upsert writing only provided weights.
 *  - loadDailyEntry: groups food_entries by meal_id into MealEntry objects.
 *  - getOrCreateDailyTargets: existing → most recent earlier (date rewritten)
 *    → defaults.
 *  - updated_at is maintained by DB triggers — never written here.
 */
import { and, asc, count, desc, eq, ilike, lt, max } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NUTRIENT_KEYS, type Nutrients, type TargetMode, type UnitType } from "@/lib/constants";
import { num, num0, dec, decOrNull } from "@/lib/db/coerce";
import * as schema from "@/lib/db/schema";
import { dailyTotals } from "@/lib/domain/nutrients";
import { getDefaultTargets } from "@/lib/domain/targets";
import type {
  DailyData,
  DailySummary,
  DailyTargets,
  DayEntry,
  FoodEntry,
  FoodItem,
  Meal,
  MealEntry,
  UserSettings,
} from "@/lib/domain/types";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const { foodItems, foodEntries, dailySummaries, dailyTargets, meals, mealIngredients, userSettings } =
  schema;

// ============= Row mappers (decimal-string → number in one place) =============

type FoodItemRow = typeof foodItems.$inferSelect;

function rowToFoodItem(row: FoodItemRow): FoodItem {
  return {
    id: row.id,
    name: row.name,
    unit_type: row.unitType as UnitType,
    serving_size_g: num(row.servingSizeG),
    energy_kcal: num0(row.energyKcal),
    fat_g: num0(row.fatG),
    saturated_fat_g: num0(row.saturatedFatG),
    carbohydrates_g: num0(row.carbohydratesG),
    sugar_g: num0(row.sugarG),
    protein_g: num0(row.proteinG),
    fibre_g: num0(row.fibreG),
    salt_g: num0(row.saltG),
    calcium_mg: num0(row.calciumMg),
  };
}

type FoodEntryRow = typeof foodEntries.$inferSelect;

function rowToFoodEntry(row: FoodEntryRow, foodName: string): FoodEntry {
  return {
    entry_id: row.id,
    timestamp: (row.timestamp as Date).toISOString(),
    food_id: row.foodId ?? "",
    food_name: foodName,
    weight_g: num(row.weightG),
    quantity: num(row.quantity),
    nutrients: {
      energy_kcal: num0(row.energyKcal),
      fat_g: num0(row.fatG),
      saturated_fat_g: num0(row.saturatedFatG),
      carbohydrates_g: num0(row.carbohydratesG),
      sugar_g: num0(row.sugarG),
      protein_g: num0(row.proteinG),
      fibre_g: num0(row.fibreG),
      salt_g: num0(row.saltG),
      calcium_mg: num0(row.calciumMg),
    },
  };
}

function nutrientCols(n: Nutrients) {
  return {
    energyKcal: dec(n.energy_kcal),
    fatG: dec(n.fat_g),
    saturatedFatG: dec(n.saturated_fat_g),
    carbohydratesG: dec(n.carbohydrates_g),
    sugarG: dec(n.sugar_g),
    proteinG: dec(n.protein_g),
    fibreG: dec(n.fibre_g),
    saltG: dec(n.salt_g),
    calciumMg: dec(n.calcium_mg),
  };
}

const NULL_NUTRIENT_COLS = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbohydratesG: null,
  sugarG: null,
  proteinG: null,
  fibreG: null,
  saltG: null,
  calciumMg: null,
};

// ============= Food Items =============

export async function loadFoodDatabase(db: DB): Promise<FoodItem[]> {
  const rows = await db.select().from(foodItems).orderBy(asc(foodItems.name));
  return rows.map(rowToFoodItem);
}

/**
 * Distinct foods the user has logged, ranked by recency (most-recent
 * `entry_date` first) then frequency (the "favourite" signal). Powers the
 * pinned "Recent" section atop the entry-page selector. Uses the existing
 * `idx_food_entries_food_id` index; no schema change.
 *
 * v1 covers foods only (the dominant repeat case) — foods logged as meal
 * ingredients also count, since `food_id` is set on those rows too. Meals
 * themselves are intentionally excluded.
 */
export async function loadRecentFoods(db: DB, limit = 8): Promise<FoodItem[]> {
  const ranked = await db
    .select({ food: foodItems })
    .from(foodEntries)
    .innerJoin(foodItems, eq(foodEntries.foodId, foodItems.id))
    .groupBy(foodItems.id)
    .orderBy(desc(max(foodEntries.entryDate)), desc(count()))
    .limit(limit);
  return ranked.map((r) => rowToFoodItem(r.food));
}

export async function searchFoodItems(db: DB, query: string): Promise<FoodItem[]> {
  const rows = await db
    .select()
    .from(foodItems)
    .where(ilike(foodItems.name, `%${query}%`))
    .orderBy(asc(foodItems.name));
  return rows.map(rowToFoodItem);
}

export async function getFoodItem(db: DB, foodId: string): Promise<FoodItem | null> {
  // Python strips a legacy "food:" prefix — preserve that behavior.
  const id = foodId.startsWith("food:") ? foodId.slice(5) : foodId;
  const rows = await db.select().from(foodItems).where(eq(foodItems.id, id)).limit(1);
  return rows.length ? rowToFoodItem(rows[0]) : null;
}

export async function saveFoodItem(db: DB, item: FoodItem): Promise<void> {
  // Enforce the per_item/per_100g serving-size invariant before the DB CHECK.
  if (item.unit_type === "per_item" && item.serving_size_g === null) {
    throw new Error("serving_size_g is required when unit_type is per_item");
  }
  if (item.unit_type === "per_100g" && item.serving_size_g !== null) {
    throw new Error("serving_size_g should be null when unit_type is per_100g");
  }
  const values = {
    id: item.id,
    name: item.name,
    unitType: item.unit_type,
    servingSizeG: decOrNull(item.serving_size_g),
    ...nutrientCols(item),
  };
  await db
    .insert(foodItems)
    .values(values)
    .onConflictDoUpdate({
      target: foodItems.id,
      set: {
        name: values.name,
        unitType: values.unitType,
        servingSizeG: values.servingSizeG,
        ...nutrientCols(item),
      },
    });
}

export async function deleteFoodItem(db: DB, foodId: string): Promise<boolean> {
  const deleted = await db
    .delete(foodItems)
    .where(eq(foodItems.id, foodId))
    .returning({ id: foodItems.id });
  return deleted.length > 0;
}

// ============= Meals =============

async function mealWithIngredients(db: DB, mealRow: { id: string; name: string }): Promise<Meal> {
  const rows = await db
    .select({
      foodId: mealIngredients.foodId,
      weightG: mealIngredients.weightG,
      quantity: mealIngredients.quantity,
      foodName: foodItems.name,
      food: foodItems,
    })
    .from(mealIngredients)
    .leftJoin(foodItems, eq(mealIngredients.foodId, foodItems.id))
    .where(eq(mealIngredients.mealId, mealRow.id));

  const ingredients = rows
    .filter((r) => r.food !== null)
    .map((r) => {
      const food = rowToFoodItem(r.food as FoodItemRow);
      const weightG = num(r.weightG);
      const quantity = num(r.quantity);
      const multiplier =
        food.unit_type === "per_100g" ? (weightG ?? 0) / 100.0 : (quantity ?? 0);
      const nutrients = { ...food };
      const scaled: Nutrients = {
        energy_kcal: nutrients.energy_kcal * multiplier,
        fat_g: nutrients.fat_g * multiplier,
        saturated_fat_g: nutrients.saturated_fat_g * multiplier,
        carbohydrates_g: nutrients.carbohydrates_g * multiplier,
        sugar_g: nutrients.sugar_g * multiplier,
        protein_g: nutrients.protein_g * multiplier,
        fibre_g: nutrients.fibre_g * multiplier,
        salt_g: nutrients.salt_g * multiplier,
        calcium_mg: nutrients.calcium_mg * multiplier,
      };
      return {
        food_id: food.id,
        food_name: food.name,
        weight_g: weightG,
        quantity,
        nutrients: scaled,
      };
    });

  return { id: mealRow.id, name: mealRow.name, ingredients };
}

export async function loadMeals(db: DB): Promise<Meal[]> {
  const rows = await db.select().from(meals).orderBy(asc(meals.name));
  return Promise.all(rows.map((r) => mealWithIngredients(db, r)));
}

export async function getMeal(db: DB, mealId: string): Promise<Meal | null> {
  const rows = await db.select().from(meals).where(eq(meals.id, mealId)).limit(1);
  return rows.length ? mealWithIngredients(db, rows[0]) : null;
}

/**
 * save_meal (sqlmodel_storage.py:171-211): upsert the meal row, then
 * delete-and-reinsert its ingredients.
 */
export async function saveMeal(db: DB, meal: Meal): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(meals)
      .values({ id: meal.id, name: meal.name })
      .onConflictDoUpdate({ target: meals.id, set: { name: meal.name } });
    await tx.delete(mealIngredients).where(eq(mealIngredients.mealId, meal.id));
    if (meal.ingredients.length > 0) {
      await tx.insert(mealIngredients).values(
        meal.ingredients.map((ing) => ({
          mealId: meal.id,
          foodId: ing.food_id,
          weightG: decOrNull(ing.weight_g),
          quantity: decOrNull(ing.quantity),
        })),
      );
    }
  });
}

/**
 * delete_meal (sqlmodel_storage.py:231-249): ingredients cascade via FK.
 * food_entries referencing the meal keep their data but lose the grouping —
 * clear meal_id first so history stays intact (entries become individual).
 */
export async function deleteMeal(db: DB, mealId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .update(foodEntries)
      .set({ mealId: null })
      .where(eq(foodEntries.mealId, mealId));
    const deleted = await tx
      .delete(meals)
      .where(eq(meals.id, mealId))
      .returning({ id: meals.id });
    return deleted.length > 0;
  });
}

// ============= Daily Entries =============

export async function loadDailyEntry(db: DB, date: string): Promise<DailyData | null> {
  const entryRows = await db
    .select({
      entry: foodEntries,
      foodName: foodItems.name,
    })
    .from(foodEntries)
    .leftJoin(foodItems, eq(foodEntries.foodId, foodItems.id))
    .where(eq(foodEntries.entryDate, date))
    .orderBy(asc(foodEntries.timestamp));

  const summaryRows = await db
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.summaryDate, date))
    .limit(1);
  const summary = summaryRows[0] ?? null;

  // Return null only if there are no entries AND no measurements row
  if (entryRows.length === 0 && !summary) return null;

  const individual: DayEntry[] = [];
  // Group a logged meal's ingredient rows. Prefer the per-log meal_log_id so the
  // same meal eaten twice in a day stays as two entries; legacy rows (written
  // before meal_log_id existed) have none, so fall back to grouping by meal_id.
  interface Group {
    mealId: string;
    mealLogId: string;
    portions: number;
    ingredients: FoodEntry[];
  }
  const mealGroups = new Map<string, Group>();

  for (const { entry, foodName } of entryRows) {
    const fe = rowToFoodEntry(entry, foodName ?? "Unknown");
    if (entry.mealId) {
      const key = entry.mealLogId ?? `legacy:${entry.mealId}`;
      const group = mealGroups.get(key) ?? {
        mealId: entry.mealId,
        mealLogId: entry.mealLogId ?? entry.mealId,
        // legacy rows have no stored portions → default to 1
        portions: num(entry.portions) ?? 1.0,
        ingredients: [],
      };
      group.ingredients.push(fe);
      mealGroups.set(key, group);
    } else {
      individual.push({ kind: "food", entry: fe });
    }
  }

  const mealEntries: DayEntry[] = [];
  for (const group of mealGroups.values()) {
    const mealRows = await db.select().from(meals).where(eq(meals.id, group.mealId)).limit(1);
    if (mealRows.length) {
      const me: MealEntry = {
        meal_id: group.mealId,
        meal_log_id: group.mealLogId,
        meal_name: mealRows[0].name,
        portions: group.portions,
        ingredients: group.ingredients,
      };
      mealEntries.push({ kind: "meal", entry: me });
    }
  }

  return {
    date,
    entries: [...individual, ...mealEntries],
    measurements: {
      morning_weight_kg: num(summary?.morningWeightKg),
      evening_weight_kg: num(summary?.eveningWeightKg),
    },
  };
}

export async function saveDailyEntry(db: DB, daily: DailyData): Promise<void> {
  const totals = dailyTotals(daily.entries);

  await db.transaction(async (tx) => {
    // Delete existing entries for this date (replaced wholesale)
    await tx.delete(foodEntries).where(eq(foodEntries.entryDate, daily.date));

    // Insert entries — meal ingredients carry meal_id, individual rows don't
    const rows: (typeof foodEntries.$inferInsert)[] = [];
    for (const e of daily.entries) {
      if (e.kind === "food") {
        rows.push({
          id: e.entry.entry_id,
          entryDate: daily.date,
          timestamp: new Date(e.entry.timestamp),
          foodId: e.entry.food_id,
          mealId: null,
          mealLogId: null,
          portions: null,
          weightG: decOrNull(e.entry.weight_g),
          quantity: decOrNull(e.entry.quantity),
          ...nutrientCols(e.entry.nutrients),
        });
      } else {
        for (const ing of e.entry.ingredients) {
          rows.push({
            id: ing.entry_id,
            entryDate: daily.date,
            timestamp: new Date(ing.timestamp),
            foodId: ing.food_id,
            mealId: e.entry.meal_id,
            mealLogId: e.entry.meal_log_id,
            portions: dec(e.entry.portions),
            weightG: decOrNull(ing.weight_g),
            quantity: decOrNull(ing.quantity),
            ...nutrientCols(ing.nutrients),
          });
        }
      }
    }
    if (rows.length > 0) {
      await tx.insert(foodEntries).values(rows);
    }

    // Upsert daily summary — nutrients ONLY, weights never touched here.
    // Empty day → NULL nutrients (never 0).
    const summarySet = totals !== null ? nutrientCols(totals) : NULL_NUTRIENT_COLS;
    await tx
      .insert(dailySummaries)
      .values({ summaryDate: daily.date, ...summarySet })
      .onConflictDoUpdate({
        target: dailySummaries.summaryDate,
        set: summarySet, // weight columns intentionally absent
      });
  });
}

export async function getAllDates(db: DB): Promise<string[]> {
  const rows = await db
    .selectDistinct({ d: foodEntries.entryDate })
    .from(foodEntries)
    .orderBy(desc(foodEntries.entryDate));
  return rows.map((r) => r.d);
}

// ============= Measurements =============

export async function updateMeasurements(
  db: DB,
  date: string,
  weights: { morning_weight_kg?: number | null; evening_weight_kg?: number | null },
): Promise<void> {
  // Set clause contains ONLY the provided weights:
  //  - undefined → leave existing value untouched (python: `if x is not None`)
  //  - null      → EXPLICIT CLEAR, sets DB NULL (UX addition over python:
  //                emptying the input means "I didn't mean to track this")
  //  - number    → set the value
  const set: Record<string, string | null> = {};
  if (weights.morning_weight_kg !== undefined) {
    set.morningWeightKg =
      weights.morning_weight_kg === null ? null : dec(weights.morning_weight_kg);
  }
  if (weights.evening_weight_kg !== undefined) {
    set.eveningWeightKg =
      weights.evening_weight_kg === null ? null : dec(weights.evening_weight_kg);
  }

  const existing = await db
    .select({ id: dailySummaries.id })
    .from(dailySummaries)
    .where(eq(dailySummaries.summaryDate, date))
    .limit(1);

  if (existing.length) {
    if (Object.keys(set).length > 0) {
      await db.update(dailySummaries).set(set).where(eq(dailySummaries.summaryDate, date));
    }
  } else {
    // New row: weights only, nutrients stay NULL
    await db.insert(dailySummaries).values({ summaryDate: date, ...set });
  }
}

// ============= Daily Targets =============

type TargetsRow = typeof dailyTargets.$inferSelect;

function rowToTargets(row: TargetsRow): DailyTargets {
  return {
    date: row.targetDate,
    mode: row.defaultMode as TargetMode,
    values: {
      energy_kcal: num0(row.energyKcal),
      protein_g: num0(row.proteinG),
      carbohydrates_g: num0(row.carbohydratesG),
      fat_g: num0(row.fatG),
      sugar_g: num0(row.sugarG),
      saturated_fat_g: num0(row.saturatedFatG),
      fibre_g: num0(row.fibreG),
      salt_g: num0(row.saltG),
      calcium_mg: num0(row.calciumMg),
    },
    modes: {
      energy_kcal: (row.energyMode as TargetMode | null) ?? null,
      protein_g: (row.proteinMode as TargetMode | null) ?? null,
      carbohydrates_g: (row.carbohydratesMode as TargetMode | null) ?? null,
      fat_g: (row.fatMode as TargetMode | null) ?? null,
      sugar_g: (row.sugarMode as TargetMode | null) ?? null,
      saturated_fat_g: (row.saturatedFatMode as TargetMode | null) ?? null,
      fibre_g: (row.fibreMode as TargetMode | null) ?? null,
      salt_g: (row.saltMode as TargetMode | null) ?? null,
      calcium_mg: (row.calciumMode as TargetMode | null) ?? null,
    },
  };
}

export async function loadDailyTargets(db: DB, date: string): Promise<DailyTargets | null> {
  const rows = await db
    .select()
    .from(dailyTargets)
    .where(eq(dailyTargets.targetDate, date))
    .limit(1);
  return rows.length ? rowToTargets(rows[0]) : null;
}

export async function getPreviousDayTargets(
  db: DB,
  date: string,
): Promise<DailyTargets | null> {
  const rows = await db
    .select()
    .from(dailyTargets)
    .where(lt(dailyTargets.targetDate, date))
    .orderBy(desc(dailyTargets.targetDate))
    .limit(1);
  if (!rows.length) return null;
  const targets = rowToTargets(rows[0]);
  targets.date = date; // rewrite to the requested date, as in python
  return targets;
}

export async function getOrCreateDailyTargets(db: DB, date: string): Promise<DailyTargets> {
  return (
    (await loadDailyTargets(db, date)) ??
    (await getPreviousDayTargets(db, date)) ??
    getDefaultTargets(date)
  );
}

export async function saveDailyTargets(db: DB, targets: DailyTargets): Promise<void> {
  const values = {
    targetDate: targets.date,
    defaultMode: targets.mode,
    energyKcal: dec(targets.values.energy_kcal),
    proteinG: dec(targets.values.protein_g),
    carbohydratesG: dec(targets.values.carbohydrates_g),
    fatG: dec(targets.values.fat_g),
    sugarG: dec(targets.values.sugar_g),
    saturatedFatG: dec(targets.values.saturated_fat_g),
    fibreG: dec(targets.values.fibre_g),
    saltG: dec(targets.values.salt_g),
    calciumMg: dec(targets.values.calcium_mg),
    energyMode: targets.modes.energy_kcal,
    proteinMode: targets.modes.protein_g,
    carbohydratesMode: targets.modes.carbohydrates_g,
    fatMode: targets.modes.fat_g,
    sugarMode: targets.modes.sugar_g,
    saturatedFatMode: targets.modes.saturated_fat_g,
    fibreMode: targets.modes.fibre_g,
    saltMode: targets.modes.salt_g,
    calciumMode: targets.modes.calcium_mg,
  };
  const { targetDate: _ignored, ...set } = values;
  await db
    .insert(dailyTargets)
    .values(values)
    .onConflictDoUpdate({ target: dailyTargets.targetDate, set });
}

// ============= Summaries (dashboard) =============

export async function loadAllSummaries(db: DB): Promise<DailySummary[]> {
  const rows = await db
    .select()
    .from(dailySummaries)
    .orderBy(asc(dailySummaries.summaryDate));
  return rows.map((row) => ({
    date: row.summaryDate,
    energy_kcal: num(row.energyKcal),
    fat_g: num(row.fatG),
    saturated_fat_g: num(row.saturatedFatG),
    carbohydrates_g: num(row.carbohydratesG),
    sugar_g: num(row.sugarG),
    protein_g: num(row.proteinG),
    fibre_g: num(row.fibreG),
    salt_g: num(row.saltG),
    calcium_mg: num(row.calciumMg),
    morning_weight_kg: num(row.morningWeightKg),
    evening_weight_kg: num(row.eveningWeightKg),
  }));
}

// ============= User Settings (cross-day, single row) =============

/**
 * Load the single user_settings row (id = 1). Returns all-null defaults if the
 * seed row is somehow absent, so callers never have to null-check the result.
 */
export async function loadUserSettings(db: DB): Promise<UserSettings> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1);
  const r = rows[0];
  return {
    goal_weight_kg: num(r?.goalWeightKg),
    weekly_rate_target_kg: num(r?.weeklyRateTargetKg),
    start_weight_kg: num(r?.startWeightKg),
    start_date: r?.startDate ?? null,
  };
}

/**
 * Upsert the single user_settings row on the fixed id = 1. updated_at is left to
 * the DB trigger (never written here), matching the daily-targets invariant.
 */
export async function saveUserSettings(db: DB, s: UserSettings): Promise<void> {
  const set = {
    goalWeightKg: decOrNull(s.goal_weight_kg),
    weeklyRateTargetKg: decOrNull(s.weekly_rate_target_kg),
    startWeightKg: decOrNull(s.start_weight_kg),
    startDate: s.start_date,
  };
  await db
    .insert(userSettings)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: userSettings.id, set });
}

// keep NUTRIENT_KEYS referenced for editors that tree-shake unused imports
export { NUTRIENT_KEYS };
