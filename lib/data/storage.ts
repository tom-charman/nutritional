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
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  isNotNull,
  lt,
  lte,
  max,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  NUTRIENT_KEYS,
  ZERO_NUTRIENTS,
  type Nutrients,
  type TargetMode,
  type UnitType,
} from "@/lib/constants";
import { num, num0, dec, decOrNull } from "@/lib/db/coerce";
import * as schema from "@/lib/db/schema";
import { calculateNutrients, dailyTotals, sumNutrients } from "@/lib/domain/nutrients";
import { getDefaultTargets } from "@/lib/domain/targets";
import { weekDates } from "@/lib/domain/plan/week";
import type {
  DailyData,
  DailySummary,
  DailyTargets,
  DayEntry,
  FoodEntry,
  FoodItem,
  Meal,
  MealEntry,
  PlanItem,
  PlanSlot,
  UserSettings,
  WeekPlan,
} from "@/lib/domain/types";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const {
  foodItems,
  foodEntries,
  dailySummaries,
  dailyTargets,
  meals,
  mealIngredients,
  userSettings,
  mealPlans,
  mealPlanItems,
} = schema;

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
    // Provenance — preserved across saveDailyEntry's delete+reinsert.
    source: (row.source as "manual" | "plan" | null) ?? undefined,
    plan_item_id: row.planItemId ?? null,
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

/**
 * The effective-food-list predicate for a user (Option A copy-on-write overlay):
 * the user's own rows (private adds + overrides) UNION canonical rows
 * (`user_id IS NULL`) the user has not shadowed with an override.
 */
function visibleFoods(db: DB, userId: string): SQL {
  const shadowedCanonicalIds = db
    .select({ id: foodItems.canonicalId })
    .from(foodItems)
    .where(and(eq(foodItems.userId, userId), isNotNull(foodItems.canonicalId)));
  return or(
    eq(foodItems.userId, userId),
    and(isNull(foodItems.userId), notInArray(foodItems.id, shadowedCanonicalIds)),
  ) as SQL;
}

export async function loadFoodDatabase(db: DB, userId: string): Promise<FoodItem[]> {
  const rows = await db
    .select()
    .from(foodItems)
    .where(visibleFoods(db, userId))
    .orderBy(asc(foodItems.name));
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
export async function loadRecentFoods(db: DB, userId: string, limit = 8): Promise<FoodItem[]> {
  const ranked = await db
    .select({ food: foodItems })
    .from(foodEntries)
    .innerJoin(foodItems, eq(foodEntries.foodId, foodItems.id))
    .where(eq(foodEntries.userId, userId))
    .groupBy(foodItems.id)
    .orderBy(desc(max(foodEntries.entryDate)), desc(count()))
    .limit(limit);
  return ranked.map((r) => rowToFoodItem(r.food));
}

export async function searchFoodItems(
  db: DB,
  userId: string,
  query: string,
): Promise<FoodItem[]> {
  const rows = await db
    .select()
    .from(foodItems)
    .where(and(visibleFoods(db, userId), ilike(foodItems.name, `%${query}%`)))
    .orderBy(asc(foodItems.name));
  return rows.map(rowToFoodItem);
}

export async function getFoodItem(
  db: DB,
  userId: string,
  foodId: string,
): Promise<FoodItem | null> {
  // Python strips a legacy "food:" prefix — preserve that behavior.
  const id = foodId.startsWith("food:") ? foodId.slice(5) : foodId;
  // Visible to this user = canonical OR owned by them (never another user's food).
  const rows = await db
    .select()
    .from(foodItems)
    .where(and(eq(foodItems.id, id), or(isNull(foodItems.userId), eq(foodItems.userId, userId))))
    .limit(1);
  return rows.length ? rowToFoodItem(rows[0]) : null;
}

/**
 * Save a food under the copy-on-write overlay. Returns the effective row id
 * (which differs from `item.id` when editing a canonical food creates an
 * override):
 *  - no existing row        → a brand-new private food (user_id = them).
 *  - the user's own row      → updated in place (their add or existing override).
 *  - a canonical row          → never mutated; create/update a private OVERRIDE
 *    (user_id = them, canonical_id = the canonical row it shadows).
 */
export async function saveFoodItem(db: DB, userId: string, item: FoodItem): Promise<string> {
  // Enforce the per_item/per_100g serving-size invariant before the DB CHECK.
  if (item.unit_type === "per_item" && item.serving_size_g === null) {
    throw new Error("serving_size_g is required when unit_type is per_item");
  }
  if (item.unit_type === "per_100g" && item.serving_size_g !== null) {
    throw new Error("serving_size_g should be null when unit_type is per_100g");
  }
  const cols = {
    name: item.name,
    unitType: item.unit_type,
    servingSizeG: decOrNull(item.serving_size_g),
    ...nutrientCols(item),
  };

  const existing = item.id
    ? await db
        .select({ id: foodItems.id, userId: foodItems.userId })
        .from(foodItems)
        .where(eq(foodItems.id, item.id))
        .limit(1)
    : [];
  const row = existing[0];

  if (!row) {
    // Brand-new private food owned by the user.
    const inserted = await db
      .insert(foodItems)
      .values({ id: item.id || undefined, userId, canonicalId: null, ...cols })
      .returning({ id: foodItems.id });
    return inserted[0].id;
  }

  if (row.userId === userId) {
    // The user's own food or an existing override — update in place.
    await db.update(foodItems).set(cols).where(eq(foodItems.id, item.id));
    return item.id;
  }

  if (row.userId === null) {
    // Editing a canonical food → copy-on-write. Reuse this user's existing
    // override of it if present, else create one. The canonical row is untouched.
    const override = await db
      .select({ id: foodItems.id })
      .from(foodItems)
      .where(and(eq(foodItems.userId, userId), eq(foodItems.canonicalId, item.id)))
      .limit(1);
    if (override.length) {
      await db.update(foodItems).set(cols).where(eq(foodItems.id, override[0].id));
      return override[0].id;
    }
    const inserted = await db
      .insert(foodItems)
      .values({ userId, canonicalId: item.id, ...cols })
      .returning({ id: foodItems.id });
    return inserted[0].id;
  }

  throw new Error("Cannot edit another user's food");
}

/** Delete only the user's OWN food (private add or override); canonical rows are
 *  shared and cannot be deleted by a user. Returns false if not theirs. */
export async function deleteFoodItem(db: DB, userId: string, foodId: string): Promise<boolean> {
  const deleted = await db
    .delete(foodItems)
    .where(and(eq(foodItems.id, foodId), eq(foodItems.userId, userId)))
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

export async function loadMeals(db: DB, userId: string): Promise<Meal[]> {
  const rows = await db
    .select()
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(asc(meals.name));
  return Promise.all(rows.map((r) => mealWithIngredients(db, r)));
}

export async function getMeal(db: DB, userId: string, mealId: string): Promise<Meal | null> {
  const rows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .limit(1);
  return rows.length ? mealWithIngredients(db, rows[0]) : null;
}

/**
 * save_meal (sqlmodel_storage.py:171-211): upsert the meal row, then
 * delete-and-reinsert its ingredients.
 */
export async function saveMeal(db: DB, userId: string, meal: Meal): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(meals)
      .values({ id: meal.id, userId, name: meal.name })
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
export async function deleteMeal(db: DB, userId: string, mealId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Clear meal_id only on THIS user's entries (keeps their history intact).
    await tx
      .update(foodEntries)
      .set({ mealId: null })
      .where(and(eq(foodEntries.mealId, mealId), eq(foodEntries.userId, userId)));
    const deleted = await tx
      .delete(meals)
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
      .returning({ id: meals.id });
    return deleted.length > 0;
  });
}

// ============= Daily Entries =============

export async function loadDailyEntry(
  db: DB,
  userId: string,
  date: string,
): Promise<DailyData | null> {
  const entryRows = await db
    .select({
      entry: foodEntries,
      foodName: foodItems.name,
    })
    .from(foodEntries)
    .leftJoin(foodItems, eq(foodEntries.foodId, foodItems.id))
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.entryDate, date)))
    .orderBy(asc(foodEntries.timestamp));

  const summaryRows = await db
    .select()
    .from(dailySummaries)
    .where(and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, date)))
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
    const mealRows = await db
      .select()
      .from(meals)
      .where(and(eq(meals.id, group.mealId), eq(meals.userId, userId)))
      .limit(1);
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

export async function saveDailyEntry(db: DB, userId: string, daily: DailyData): Promise<void> {
  const totals = dailyTotals(daily.entries);

  await db.transaction(async (tx) => {
    // Delete this user's existing entries for this date (replaced wholesale)
    await tx
      .delete(foodEntries)
      .where(and(eq(foodEntries.userId, userId), eq(foodEntries.entryDate, daily.date)));

    // Insert entries — meal ingredients carry meal_id, individual rows don't
    const rows: (typeof foodEntries.$inferInsert)[] = [];
    for (const e of daily.entries) {
      if (e.kind === "food") {
        rows.push({
          id: e.entry.entry_id,
          userId,
          entryDate: daily.date,
          timestamp: new Date(e.entry.timestamp),
          foodId: e.entry.food_id,
          mealId: null,
          mealLogId: null,
          portions: null,
          weightG: decOrNull(e.entry.weight_g),
          quantity: decOrNull(e.entry.quantity),
          source: e.entry.source ?? null,
          planItemId: e.entry.plan_item_id ?? null,
          ...nutrientCols(e.entry.nutrients),
        });
      } else {
        for (const ing of e.entry.ingredients) {
          rows.push({
            id: ing.entry_id,
            userId,
            entryDate: daily.date,
            timestamp: new Date(ing.timestamp),
            foodId: ing.food_id,
            mealId: e.entry.meal_id,
            mealLogId: e.entry.meal_log_id,
            portions: dec(e.entry.portions),
            weightG: decOrNull(ing.weight_g),
            quantity: decOrNull(ing.quantity),
            source: ing.source ?? null,
            planItemId: ing.plan_item_id ?? null,
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
      .values({ userId, summaryDate: daily.date, ...summarySet })
      .onConflictDoUpdate({
        target: [dailySummaries.userId, dailySummaries.summaryDate],
        set: summarySet, // weight columns intentionally absent
      });
  });
}

export async function getAllDates(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ d: foodEntries.entryDate })
    .from(foodEntries)
    .where(eq(foodEntries.userId, userId))
    .orderBy(desc(foodEntries.entryDate));
  return rows.map((r) => r.d);
}

// ============= Measurements =============

export async function updateMeasurements(
  db: DB,
  userId: string,
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
    .where(and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, date)))
    .limit(1);

  if (existing.length) {
    if (Object.keys(set).length > 0) {
      await db
        .update(dailySummaries)
        .set(set)
        .where(and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, date)));
    }
  } else {
    // New row: weights only, nutrients stay NULL
    await db.insert(dailySummaries).values({ userId, summaryDate: date, ...set });
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

export async function loadDailyTargets(
  db: DB,
  userId: string,
  date: string,
): Promise<DailyTargets | null> {
  const rows = await db
    .select()
    .from(dailyTargets)
    .where(and(eq(dailyTargets.userId, userId), eq(dailyTargets.targetDate, date)))
    .limit(1);
  return rows.length ? rowToTargets(rows[0]) : null;
}

export async function getPreviousDayTargets(
  db: DB,
  userId: string,
  date: string,
): Promise<DailyTargets | null> {
  const rows = await db
    .select()
    .from(dailyTargets)
    .where(and(eq(dailyTargets.userId, userId), lt(dailyTargets.targetDate, date)))
    .orderBy(desc(dailyTargets.targetDate))
    .limit(1);
  if (!rows.length) return null;
  const targets = rowToTargets(rows[0]);
  targets.date = date; // rewrite to the requested date, as in python
  return targets;
}

export async function getOrCreateDailyTargets(
  db: DB,
  userId: string,
  date: string,
): Promise<DailyTargets> {
  return (
    (await loadDailyTargets(db, userId, date)) ??
    (await getPreviousDayTargets(db, userId, date)) ??
    getDefaultTargets(date)
  );
}

export async function saveDailyTargets(
  db: DB,
  userId: string,
  targets: DailyTargets,
): Promise<void> {
  const values = {
    userId,
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
  const { userId: _u, targetDate: _ignored, ...set } = values;
  await db
    .insert(dailyTargets)
    .values(values)
    .onConflictDoUpdate({ target: [dailyTargets.userId, dailyTargets.targetDate], set });
}

// ============= Summaries (dashboard) =============

export async function loadAllSummaries(db: DB, userId: string): Promise<DailySummary[]> {
  const rows = await db
    .select()
    .from(dailySummaries)
    .where(eq(dailySummaries.userId, userId))
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

// ============= User Settings (cross-day, one row per user) =============

/**
 * Load this user's settings row. Returns all-null defaults if no row exists yet
 * (e.g. a brand-new user who hasn't saved settings), so callers never have to
 * null-check the result. A row is created lazily on first save.
 */
export async function loadUserSettings(db: DB, userId: string): Promise<UserSettings> {
  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const r = rows[0];
  return {
    goal_weight_kg: num(r?.goalWeightKg),
    weekly_rate_target_kg: num(r?.weeklyRateTargetKg),
    start_weight_kg: num(r?.startWeightKg),
    start_date: r?.startDate ?? null,
    hide_weekly_panel: r?.hideWeeklyPanel ?? false,
  };
}

/**
 * Upsert this user's settings row (keyed by user_id). updated_at is left to the
 * DB trigger (never written here), matching the daily-targets invariant.
 */
export async function saveUserSettings(
  db: DB,
  userId: string,
  s: UserSettings,
): Promise<void> {
  const set = {
    goalWeightKg: decOrNull(s.goal_weight_kg),
    weeklyRateTargetKg: decOrNull(s.weekly_rate_target_kg),
    startWeightKg: decOrNull(s.start_weight_kg),
    startDate: s.start_date,
    hideWeeklyPanel: s.hide_weekly_panel,
  };
  await db
    .insert(userSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}

// ============= Weekly Planner =============

/** Scale a nutrient bundle by a factor (e.g. meal portions). */
function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = { ...ZERO_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) out[key] = n[key] * factor;
  return out;
}

/**
 * Load a week's plan (Monday `weekStart` .. +6). Computes each item's planned
 * nutrients (meal = template ingredients summed × portions; food = scaled by
 * amount) and an `applied` flag — true when a logged food_entries row already
 * references the item (the apply idempotency key + plan-vs-actual link).
 */
export async function loadWeekPlan(
  db: DB,
  userId: string,
  weekStart: string,
): Promise<WeekPlan> {
  const dates = weekDates(weekStart);
  const weekEnd = dates[dates.length - 1];

  const rows = await db
    .select()
    .from(mealPlanItems)
    .where(
      and(
        eq(mealPlanItems.userId, userId),
        gte(mealPlanItems.planDate, weekStart),
        lte(mealPlanItems.planDate, weekEnd),
      ),
    )
    .orderBy(asc(mealPlanItems.planDate), asc(mealPlanItems.position), asc(mealPlanItems.createdAt));

  // Which items are already applied? One grouped read over the week's log.
  const appliedRows = await db
    .selectDistinct({ planItemId: foodEntries.planItemId })
    .from(foodEntries)
    .where(
      and(
        eq(foodEntries.userId, userId),
        gte(foodEntries.entryDate, weekStart),
        lte(foodEntries.entryDate, weekEnd),
        isNotNull(foodEntries.planItemId),
      ),
    );
  const applied = new Set(appliedRows.map((r) => r.planItemId).filter((id): id is string => !!id));

  // Prefetch meal templates once; fetch foods lazily with a cache.
  const mealList = await loadMeals(db, userId);
  const mealMap = new Map(mealList.map((m) => [m.id, m] as const));
  const foodCache = new Map<string, FoodItem | null>();

  const items: PlanItem[] = [];
  for (const row of rows) {
    let ref: PlanItem["ref"];
    let nutrients: Nutrients;

    if (row.mealId) {
      const meal = mealMap.get(row.mealId);
      if (!meal) continue; // template gone (FK cascade normally prevents this)
      const portions = num(row.portions) ?? 1;
      const base = sumNutrients(meal.ingredients.map((i) => i.nutrients));
      nutrients = scaleNutrients(base, portions);
      ref = { kind: "meal", meal_id: meal.id, meal_name: meal.name, portions };
    } else if (row.foodId) {
      let food = foodCache.get(row.foodId);
      if (food === undefined) {
        food = await getFoodItem(db, userId, row.foodId);
        foodCache.set(row.foodId, food);
      }
      if (!food) continue; // food removed — skip rather than invent zeros
      const weightG = num(row.weightG);
      const quantity = num(row.quantity);
      nutrients = calculateNutrients(food, { weight_g: weightG, quantity });
      ref = {
        kind: "food",
        food_id: food.id,
        food_name: food.name,
        weight_g: weightG,
        quantity,
      };
    } else {
      continue; // malformed row (CHECK should prevent this)
    }

    items.push({
      id: row.id,
      plan_date: row.planDate,
      slot: row.slot as PlanSlot,
      position: row.position,
      ref,
      nutrients,
      applied: applied.has(row.id),
    });
  }

  return { week_start: weekStart, items };
}

/**
 * Get (or create) the meal_plans container row for (user, week). Mirrors the
 * getOrCreateUserId concurrency pattern: insert-or-nothing, then select.
 */
export async function getOrCreatePlan(
  db: DB,
  userId: string,
  weekStart: string,
): Promise<string> {
  await db
    .insert(mealPlans)
    .values({ userId, weekStart })
    .onConflictDoNothing({ target: [mealPlans.userId, mealPlans.weekStart] });
  const rows = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(eq(mealPlans.userId, userId), eq(mealPlans.weekStart, weekStart)))
    .limit(1);
  return rows[0].id;
}

/** A planned item to insert/update. Exactly one of mealId/foodId must be set. */
export interface PlanItemInput {
  /** Set to update an existing item in place; omit to insert. */
  id?: string;
  weekStart: string;
  planDate: string;
  slot: PlanSlot;
  position?: number;
  mealId?: string | null;
  portions?: number | null;
  foodId?: string | null;
  weightG?: number | null;
  quantity?: number | null;
}

function validatePlanRef(input: PlanItemInput): void {
  const hasMeal = !!input.mealId;
  const hasFood = !!input.foodId;
  if (hasMeal === hasFood) {
    throw new Error("A plan item must reference exactly one of a meal or a food");
  }
  if (hasMeal && !((input.portions ?? 0) > 0)) {
    throw new Error("Meal portions must be greater than 0");
  }
  if (hasFood) {
    const amount = input.weightG ?? input.quantity ?? 0;
    if (!(amount > 0)) throw new Error("Food amount must be greater than 0");
  }
}

/** Insert or update a single plan item. Returns its id. */
export async function savePlanItem(
  db: DB,
  userId: string,
  input: PlanItemInput,
): Promise<string> {
  validatePlanRef(input);
  const planId = await getOrCreatePlan(db, userId, input.weekStart);
  const values = {
    planId,
    userId,
    planDate: input.planDate,
    slot: input.slot,
    position: input.position ?? 0,
    mealId: input.mealId ?? null,
    foodId: input.foodId ?? null,
    portions: decOrNull(input.portions ?? null),
    weightG: decOrNull(input.weightG ?? null),
    quantity: decOrNull(input.quantity ?? null),
  };

  if (input.id) {
    const updated = await db
      .update(mealPlanItems)
      .set(values)
      .where(and(eq(mealPlanItems.id, input.id), eq(mealPlanItems.userId, userId)))
      .returning({ id: mealPlanItems.id });
    if (updated.length) return updated[0].id;
    // Fall through to insert if the id wasn't this user's row.
  }
  const inserted = await db.insert(mealPlanItems).values(values).returning({ id: mealPlanItems.id });
  return inserted[0].id;
}

/**
 * Edit a plan item's amount in place (user-scoped): meal refs update `portions`,
 * food refs update whichever of weight_g/quantity the item already uses.
 */
export async function updatePlanItemAmount(
  db: DB,
  userId: string,
  itemId: string,
  amount: number,
): Promise<boolean> {
  if (!(amount > 0)) throw new Error("Amount must be greater than 0");
  const rows = await db
    .select()
    .from(mealPlanItems)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.userId, userId)))
    .limit(1);
  if (!rows.length) return false;
  const row = rows[0];
  const set = row.mealId
    ? { portions: dec(amount) }
    : row.weightG !== null
      ? { weightG: dec(amount) }
      : { quantity: dec(amount) };
  await db
    .update(mealPlanItems)
    .set(set)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.userId, userId)));
  return true;
}

/** Delete a plan item (user-scoped). Applied food_entries survive (FK SET NULL). */
export async function deletePlanItem(db: DB, userId: string, itemId: string): Promise<boolean> {
  const deleted = await db
    .delete(mealPlanItems)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.userId, userId)))
    .returning({ id: mealPlanItems.id });
  return deleted.length > 0;
}

/** Copy every plan item from `fromDate` to `toDate` (same week). Returns count. */
export async function copyPlanDay(
  db: DB,
  userId: string,
  weekStart: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const planId = await getOrCreatePlan(db, userId, weekStart);
  const rows = await db
    .select()
    .from(mealPlanItems)
    .where(and(eq(mealPlanItems.userId, userId), eq(mealPlanItems.planDate, fromDate)))
    .orderBy(asc(mealPlanItems.position));
  if (rows.length === 0) return 0;
  await db.insert(mealPlanItems).values(
    rows.map((r) => ({
      planId,
      userId,
      planDate: toDate,
      slot: r.slot,
      position: r.position,
      mealId: r.mealId,
      foodId: r.foodId,
      portions: r.portions,
      weightG: r.weightG,
      quantity: r.quantity,
    })),
  );
  return rows.length;
}

/** Stamp one meal into `slot` on each of `dates`. Returns count inserted. */
export async function paintMealAcrossDays(
  db: DB,
  userId: string,
  weekStart: string,
  mealId: string,
  portions: number,
  slot: PlanSlot,
  dates: string[],
): Promise<number> {
  if (!(portions > 0)) throw new Error("Meal portions must be greater than 0");
  if (dates.length === 0) return 0;
  const planId = await getOrCreatePlan(db, userId, weekStart);
  await db.insert(mealPlanItems).values(
    dates.map((d) => ({
      planId,
      userId,
      planDate: d,
      slot,
      position: 0,
      mealId,
      portions: dec(portions),
    })),
  );
  return dates.length;
}

/** Remove all plan items for a day (user-scoped). Returns count. */
export async function clearPlanDay(
  db: DB,
  userId: string,
  planDate: string,
): Promise<number> {
  const deleted = await db
    .delete(mealPlanItems)
    .where(and(eq(mealPlanItems.userId, userId), eq(mealPlanItems.planDate, planDate)))
    .returning({ id: mealPlanItems.id });
  return deleted.length;
}

/** Fetch a single plan item (user-scoped) with computed nutrients, or null. */
export async function getPlanItem(
  db: DB,
  userId: string,
  itemId: string,
): Promise<PlanItem | null> {
  const rows = await db
    .select()
    .from(mealPlanItems)
    .where(and(eq(mealPlanItems.id, itemId), eq(mealPlanItems.userId, userId)))
    .limit(1);
  if (!rows.length) return null;
  const row = rows[0];

  // applied = a logged row already references this item on its plan_date.
  const appliedRows = await db
    .selectDistinct({ planItemId: foodEntries.planItemId })
    .from(foodEntries)
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.planItemId, itemId)))
    .limit(1);
  const applied = appliedRows.length > 0;

  if (row.mealId) {
    const meal = await getMeal(db, userId, row.mealId);
    if (!meal) return null;
    const portions = num(row.portions) ?? 1;
    const nutrients = scaleNutrients(
      sumNutrients(meal.ingredients.map((i) => i.nutrients)),
      portions,
    );
    return {
      id: row.id,
      plan_date: row.planDate,
      slot: row.slot as PlanSlot,
      position: row.position,
      ref: { kind: "meal", meal_id: meal.id, meal_name: meal.name, portions },
      nutrients,
      applied,
    };
  }
  if (row.foodId) {
    const food = await getFoodItem(db, userId, row.foodId);
    if (!food) return null;
    const weightG = num(row.weightG);
    const quantity = num(row.quantity);
    return {
      id: row.id,
      plan_date: row.planDate,
      slot: row.slot as PlanSlot,
      position: row.position,
      ref: { kind: "food", food_id: food.id, food_name: food.name, weight_g: weightG, quantity },
      nutrients: calculateNutrients(food, { weight_g: weightG, quantity }),
      applied,
    };
  }
  return null;
}

/** Remove every planned item across a week (user-scoped). Returns count. */
export async function clearPlanWeek(
  db: DB,
  userId: string,
  weekStart: string,
): Promise<number> {
  const dates = weekDates(weekStart);
  const deleted = await db
    .delete(mealPlanItems)
    .where(
      and(
        eq(mealPlanItems.userId, userId),
        gte(mealPlanItems.planDate, dates[0]),
        lte(mealPlanItems.planDate, dates[dates.length - 1]),
      ),
    )
    .returning({ id: mealPlanItems.id });
  return deleted.length;
}

// keep NUTRIENT_KEYS referenced for editors that tree-shake unused imports
export { NUTRIENT_KEYS };
