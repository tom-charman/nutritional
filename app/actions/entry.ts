"use server";

/**
 * Daily Entry server actions — mirror the callback flows in pages/entry.py.
 * All nutrient math happens server-side via the shared domain functions;
 * every mutation loads the day, modifies it, and saves it wholesale
 * (delete+reinsert, summary recomputed, weights untouched).
 */
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import {
  getFoodItem,
  getMeal,
  getOrCreateDailyTargets,
  getRecentWeightKg,
  loadDailyEntry,
  saveDailyEntry,
  saveDailyTargets,
  updateMeasurements,
} from "@/lib/data/storage";
import { requireUserId } from "@/lib/data/user";
import { calculateNutrients } from "@/lib/domain/nutrients";
import { formatConsumed, mealConsumedToFactor } from "@/lib/domain/meals";
import type { DailyData, DailyTargets, DayEntry, FoodEntry } from "@/lib/domain/types";
import type { Nutrients } from "@/lib/constants";
import { saveFoodAction } from "@/app/actions/foods";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** Optional feedback tone. "info" marks a benign no-op (e.g. "already
   *  empty") so the UI can show a neutral toast rather than a success ✓. */
  tone?: "info";
}

/**
 * Marks an entry as materialised from a Weekly Planner plan item. Threaded onto
 * the FoodEntry so it survives saveDailyEntry's delete+reinsert (the dedupe key
 * for idempotent re-apply + the plan-vs-actual link).
 */
export interface EntryProvenance {
  source: "plan";
  planItemId: string;
}

async function loadOrEmptyDay(userId: string, date: string): Promise<DailyData> {
  return (
    (await loadDailyEntry(db, userId, date)) ?? {
      date,
      entries: [],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    }
  );
}

function revalidate() {
  revalidatePath("/entry");
  revalidatePath("/");
}

/** Add a food entry (entry.py add-entry flow, food branch). */
export async function addFoodEntryAction(
  date: string,
  foodId: string,
  amount: number,
  provenance?: EntryProvenance,
): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Please enter an amount" };
  }
  const userId = await requireUserId();
  const food = await getFoodItem(db, userId, foodId);
  if (!food) return { ok: false, message: "Food item not found" };

  const isPerItem = food.unit_type === "per_item";
  const nutrients = calculateNutrients(food, {
    weight_g: isPerItem ? null : amount,
    quantity: isPerItem ? amount : null,
  });

  const entry: FoodEntry = {
    entry_id: randomUUID(),
    timestamp: new Date().toISOString(),
    food_id: food.id,
    food_name: food.name,
    weight_g: isPerItem ? null : amount,
    quantity: isPerItem ? amount : null,
    nutrients,
    source: provenance?.source,
    plan_item_id: provenance?.planItemId,
  };

  const day = await loadOrEmptyDay(userId, date);
  day.entries.push({ kind: "food", entry });
  await saveDailyEntry(db, userId, day);
  revalidate();
  return { ok: true, message: `Added ${food.name}` };
}

/**
 * Quick-add: log food that isn't in the database yet (e.g. a takeaway) without
 * leaving the entry page. Creates a reusable per-100g food whose values ARE the
 * entry (logged at 100 g → exact), then logs it. Macros left blank are 0.
 */
export async function quickAddEntryAction(
  date: string,
  input: { name: string; nutrients: Partial<Nutrients> },
): Promise<ActionResult> {
  const name = input.name?.trim();
  if (!name) return { ok: false, message: "Please enter a name" };
  const energy = input.nutrients.energy_kcal;
  if (!Number.isFinite(energy) || (energy ?? 0) <= 0) {
    return { ok: false, message: "Please enter calories" };
  }
  const id = randomUUID();
  // Reuse the food-save validation/duplicate handling, then log it.
  const saved = await saveFoodAction({
    id,
    name,
    unit_type: "per_100g",
    serving_size_g: null,
    nutrients: input.nutrients,
  });
  if (!saved.ok) return saved;
  return addFoodEntryAction(date, id, 100);
}

/**
 * Add a meal entry (entry.py add-entry flow, meal branch). `amount` is the
 * consumed amount in the meal's own unit: portions ('whole'), grams of the
 * finished batch ('by_weight'), or item count ('by_count'). It is converted to
 * a single scaling FACTOR applied to every ingredient (see lib/constants
 * MealYieldMode), so all downstream nutrient math stays uniform.
 */
export async function addMealEntryAction(
  date: string,
  mealId: string,
  amount: number,
  provenance?: EntryProvenance,
): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Please enter a valid amount" };
  }
  const userId = await requireUserId();
  const meal = await getMeal(db, userId, mealId);
  if (!meal) return { ok: false, message: "Recipe not found" };

  const factor = mealConsumedToFactor(meal, amount);
  if (factor === null) return { ok: false, message: "This recipe's yield is invalid" };

  // Each ingredient scaled by `factor` and stored as an independent FoodEntry.
  // When applied from a plan, every ingredient carries the SAME plan_item_id so
  // the whole logged meal dedupes as one unit on re-apply.
  const ingredients: FoodEntry[] = [];
  for (const ing of meal.ingredients) {
    const food = await getFoodItem(db, userId, ing.food_id);
    if (!food) continue;
    const scaledWeight = ing.weight_g !== null ? ing.weight_g * factor : null;
    const scaledQuantity = ing.quantity !== null ? ing.quantity * factor : null;
    const nutrients = calculateNutrients(food, {
      weight_g: scaledWeight,
      quantity: scaledQuantity,
    });
    ingredients.push({
      entry_id: randomUUID(),
      timestamp: new Date().toISOString(),
      food_id: food.id,
      food_name: food.name,
      weight_g: scaledWeight,
      quantity: scaledQuantity,
      nutrients,
      source: provenance?.source,
      plan_item_id: provenance?.planItemId,
    });
  }
  if (ingredients.length === 0) {
    return { ok: false, message: "Recipe has no valid ingredients" };
  }

  const day = await loadOrEmptyDay(userId, date);
  day.entries.push({
    kind: "meal",
    entry: {
      meal_id: meal.id,
      meal_log_id: randomUUID(),
      meal_name: meal.name,
      portions: factor,
      yield_mode: meal.yield_mode,
      consumed_amount: amount,
      ingredients,
    },
  });
  await saveDailyEntry(db, userId, day);
  revalidate();
  return {
    ok: true,
    message: `Added ${meal.name} (${formatConsumed(meal.yield_mode, amount)})`,
  };
}

/**
 * Rescale a logged meal to a new consumed amount (portions / grams / item count,
 * per the meal's yield mode). Ingredients scale linearly with the consumed amount,
 * so we rescale by newAmount/oldAmount — no need to refetch the recipe's yield.
 */
export async function editMealPortionsAction(
  date: string,
  mealLogId: string,
  newAmount: number,
): Promise<ActionResult> {
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return { ok: false, message: "Please enter a valid amount" };
  }
  const userId = await requireUserId();
  const day = await loadDailyEntry(db, userId, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  const target = day.entries.find(
    (e): e is Extract<DayEntry, { kind: "meal" }> =>
      e.kind === "meal" && e.entry.meal_log_id === mealLogId,
  );
  if (!target) return { ok: false, message: "Recipe not found" };

  // Old amount is the literal consumed amount; legacy rows fall back to portions
  // (where consumed === factor === portions, so the ratio is unchanged).
  const oldAmount = target.entry.consumed_amount ?? target.entry.portions;
  if (oldAmount <= 0) return { ok: false, message: "Recipe not found" };
  const rescale = newAmount / oldAmount;

  for (const ing of target.entry.ingredients) {
    const food = await getFoodItem(db, userId, ing.food_id);
    if (!food) continue;
    ing.weight_g = ing.weight_g !== null ? ing.weight_g * rescale : null;
    ing.quantity = ing.quantity !== null ? ing.quantity * rescale : null;
    ing.nutrients = calculateNutrients(food, {
      weight_g: ing.weight_g,
      quantity: ing.quantity,
    });
  }
  target.entry.portions = target.entry.portions * rescale;
  target.entry.consumed_amount = newAmount;

  await saveDailyEntry(db, userId, day);
  revalidate();
  return { ok: true, message: `Updated ${target.entry.meal_name}` };
}

/**
 * Copy a previous day's entries into the target day (default: the day before).
 * Routine eaters log a near-identical day in one click, then tweak amounts in
 * place. Clones carry fresh ids/timestamps so the copy is independent of its
 * source (deleting a copied row never touches the original day).
 */
export async function copyDayEntriesAction(
  targetDate: string,
  sourceDate?: string,
): Promise<ActionResult> {
  const from =
    sourceDate ??
    new Date(Date.parse(`${targetDate}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);

  const userId = await requireUserId();
  const source = await loadDailyEntry(db, userId, from);
  if (!source || source.entries.length === 0) {
    return { ok: false, message: `Nothing to copy from ${from}` };
  }

  const now = new Date().toISOString();
  const clones: DayEntry[] = source.entries.map((e): DayEntry =>
    e.kind === "food"
      ? {
          kind: "food",
          entry: { ...e.entry, entry_id: randomUUID(), timestamp: now },
        }
      : {
          kind: "meal",
          entry: {
            ...e.entry,
            meal_log_id: randomUUID(),
            ingredients: e.entry.ingredients.map((ing) => ({
              ...ing,
              entry_id: randomUUID(),
              timestamp: now,
            })),
          },
        },
  );

  const day = await loadOrEmptyDay(userId, targetDate);
  day.entries.push(...clones);
  await saveDailyEntry(db, userId, day);
  revalidate();
  return {
    ok: true,
    message: `Copied ${clones.length} entr${clones.length === 1 ? "y" : "ies"} from ${from}`,
  };
}

/**
 * Swap the food behind a logged entry without losing the row (entry.py has no
 * equivalent). Keeps the logged amount and reinterprets it for the new food's
 * unit model, then recomputes nutrients. Works on both standalone food entries
 * and ingredients inside a logged meal (mirrors editEntryAmountAction).
 */
export async function swapFoodEntryAction(
  date: string,
  entryId: string,
  newFoodId: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const food = await getFoodItem(db, userId, newFoodId);
  if (!food) return { ok: false, message: "Food item not found" };

  const day = await loadDailyEntry(db, userId, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  let swapped = false;
  for (const e of day.entries) {
    const targets: FoodEntry[] = e.kind === "food" ? [e.entry] : e.entry.ingredients;
    for (const fe of targets) {
      if (fe.entry_id !== entryId) continue;
      const amount = fe.weight_g ?? fe.quantity ?? 0;
      const isPerItem = food.unit_type === "per_item";
      fe.food_id = food.id;
      fe.food_name = food.name;
      fe.weight_g = isPerItem ? null : amount;
      fe.quantity = isPerItem ? amount : null;
      fe.nutrients = calculateNutrients(food, {
        weight_g: fe.weight_g,
        quantity: fe.quantity,
      });
      swapped = true;
    }
  }
  if (!swapped) return { ok: false, message: "Entry not found" };

  await saveDailyEntry(db, userId, day);
  revalidate();
  return { ok: true, message: `Swapped to ${food.name}` };
}

/** Inline-edit a food entry's amount (entry.py save-edit flow). */
export async function editEntryAmountAction(
  date: string,
  entryId: string,
  newAmount: number,
): Promise<ActionResult> {
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return { ok: false, message: "Please enter a valid amount" };
  }
  const userId = await requireUserId();
  const day = await loadDailyEntry(db, userId, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  let updatedName: string | null = null;
  for (const e of day.entries) {
    const targets: FoodEntry[] =
      e.kind === "food" ? [e.entry] : e.entry.ingredients;
    for (const fe of targets) {
      if (fe.entry_id !== entryId) continue;
      const food = await getFoodItem(db, userId, fe.food_id);
      if (!food) return { ok: false, message: "Food item not found" };
      const isPerItem = food.unit_type === "per_item";
      fe.weight_g = isPerItem ? null : newAmount;
      fe.quantity = isPerItem ? newAmount : null;
      fe.nutrients = calculateNutrients(food, {
        weight_g: fe.weight_g,
        quantity: fe.quantity,
      });
      updatedName = food.name;
    }
  }
  if (!updatedName) return { ok: false, message: "Entry not found" };

  await saveDailyEntry(db, userId, day);
  revalidate();
  return { ok: true, message: `Updated ${updatedName}` };
}

/** Remove an entry — food entry by entry_id, or a whole meal by meal_id. */
export async function removeEntryAction(
  date: string,
  ref: { entryId?: string; mealLogId?: string },
): Promise<ActionResult> {
  const userId = await requireUserId();
  const day = await loadDailyEntry(db, userId, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  let removed = false;
  day.entries = day.entries
    .map((e: DayEntry): DayEntry | null => {
      if (ref.mealLogId && e.kind === "meal" && e.entry.meal_log_id === ref.mealLogId) {
        removed = true;
        return null; // remove the whole meal
      }
      if (ref.entryId && e.kind === "food" && e.entry.entry_id === ref.entryId) {
        removed = true;
        return null; // remove an individual food entry
      }
      if (ref.entryId && e.kind === "meal") {
        // remove a single ingredient inside a meal entry
        const remaining = e.entry.ingredients.filter(
          (ing) => ing.entry_id !== ref.entryId,
        );
        if (remaining.length !== e.entry.ingredients.length) {
          removed = true;
          // a meal with no ingredients left disappears entirely
          if (remaining.length === 0) return null;
          return { kind: "meal", entry: { ...e.entry, ingredients: remaining } };
        }
      }
      return e;
    })
    .filter((e): e is DayEntry => e !== null);
  if (!removed) {
    return { ok: false, message: "Entry not found" };
  }

  await saveDailyEntry(db, userId, day);
  revalidate();
  return { ok: true, message: "Entry removed" };
}

/**
 * Weight auto-save — independent of food entries (update_measurements).
 * Empty input (or 0) = explicit clear: "I didn't mean to track weight today."
 */
export async function updateWeightAction(
  date: string,
  which: "morning" | "evening",
  value: number | null,
): Promise<ActionResult> {
  const clearing = value === null || value <= 0;
  if (!clearing && (value > 500 || !Number.isFinite(value))) {
    return { ok: false, message: "Weight must be between 0 and 500 kg" };
  }
  const weight = clearing ? null : value;

  const userId = await requireUserId();
  await updateMeasurements(db, userId, date, {
    morning_weight_kg: which === "morning" ? weight : undefined,
    evening_weight_kg: which === "evening" ? weight : undefined,
  });
  revalidate();
  if (clearing) return { ok: true, message: "Weight cleared" };
  // Saved, but nudge on implausible values (often a lb/kg slip) without blocking.
  // A fixed 30–300 kg band can't catch a slip inside it, so also flag a big jump
  // from the most recent real weigh-in (a lb value is ~2.2× the kg value).
  if (weight !== null) {
    const recent = await getRecentWeightKg(db, userId, date);
    const bigJump = recent !== null && recent > 0 && Math.abs(weight - recent) / recent > 0.25;
    if (weight < 30 || weight > 300 || bigJump) {
      return { ok: true, message: `Saved ${weight} kg — that looks unusual, double-check it` };
    }
  }
  return { ok: true, message: "Weight saved" };
}

/** Save targets from the modal (entry.py save-targets flow). */
export async function saveTargetsAction(targets: DailyTargets): Promise<ActionResult> {
  for (const v of Object.values(targets.values)) {
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, message: "Targets must be zero or greater" };
    }
  }
  const userId = await requireUserId();
  await saveDailyTargets(db, userId, targets);
  revalidate();
  return { ok: true, message: "Targets saved" };
}

/** "Copy Previous Targets" — explicit stickiness fetch for the modal. */
export async function getTargetsForDateAction(date: string): Promise<DailyTargets> {
  const userId = await requireUserId();
  return getOrCreateDailyTargets(db, userId, date);
}
