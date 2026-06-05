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
  loadDailyEntry,
  saveDailyEntry,
  saveDailyTargets,
  updateMeasurements,
} from "@/lib/data/storage";
import { calculateNutrients } from "@/lib/domain/nutrients";
import type { DailyData, DailyTargets, DayEntry, FoodEntry } from "@/lib/domain/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

async function loadOrEmptyDay(date: string): Promise<DailyData> {
  return (
    (await loadDailyEntry(db, date)) ?? {
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
): Promise<ActionResult> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: "Please enter an amount" };
  }
  const food = await getFoodItem(db, foodId);
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
  };

  const day = await loadOrEmptyDay(date);
  day.entries.push({ kind: "food", entry });
  await saveDailyEntry(db, day);
  revalidate();
  return { ok: true, message: `Added ${food.name}` };
}

/** Add a meal entry (entry.py add-entry flow, meal branch). */
export async function addMealEntryAction(
  date: string,
  mealId: string,
  portions: number,
): Promise<ActionResult> {
  if (!Number.isFinite(portions) || portions <= 0) {
    return { ok: false, message: "Please enter valid portions" };
  }
  const meal = await getMeal(db, mealId);
  if (!meal) return { ok: false, message: "Meal not found" };

  // Each ingredient scaled by portions and stored as an independent FoodEntry
  const ingredients: FoodEntry[] = [];
  for (const ing of meal.ingredients) {
    const food = await getFoodItem(db, ing.food_id);
    if (!food) continue;
    const scaledWeight = ing.weight_g !== null ? ing.weight_g * portions : null;
    const scaledQuantity = ing.quantity !== null ? ing.quantity * portions : null;
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
    });
  }
  if (ingredients.length === 0) {
    return { ok: false, message: "Meal has no valid ingredients" };
  }

  const day = await loadOrEmptyDay(date);
  day.entries.push({
    kind: "meal",
    entry: { meal_id: meal.id, meal_name: meal.name, portions, ingredients },
  });
  await saveDailyEntry(db, day);
  revalidate();
  return {
    ok: true,
    message: `Added ${meal.name} (${portions} portion${portions === 1 ? "" : "s"})`,
  };
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
  const day = await loadDailyEntry(db, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  let updatedName: string | null = null;
  for (const e of day.entries) {
    const targets: FoodEntry[] =
      e.kind === "food" ? [e.entry] : e.entry.ingredients;
    for (const fe of targets) {
      if (fe.entry_id !== entryId) continue;
      const food = await getFoodItem(db, fe.food_id);
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

  await saveDailyEntry(db, day);
  revalidate();
  return { ok: true, message: `Updated ${updatedName}` };
}

/** Remove an entry — food entry by entry_id, or a whole meal by meal_id. */
export async function removeEntryAction(
  date: string,
  ref: { entryId?: string; mealId?: string },
): Promise<ActionResult> {
  const day = await loadDailyEntry(db, date);
  if (!day) return { ok: false, message: "No entries for this date" };

  const before = day.entries.length;
  day.entries = day.entries.filter((e: DayEntry) => {
    if (ref.entryId && e.kind === "food") return e.entry.entry_id !== ref.entryId;
    if (ref.mealId && e.kind === "meal") return e.entry.meal_id !== ref.mealId;
    return true;
  });
  if (day.entries.length === before) {
    return { ok: false, message: "Entry not found" };
  }

  await saveDailyEntry(db, day);
  revalidate();
  return { ok: true, message: "Entry removed" };
}

/** Weight auto-save — independent of food entries (update_measurements). */
export async function updateWeightAction(
  date: string,
  which: "morning" | "evening",
  value: number | null,
): Promise<ActionResult> {
  // 0 or empty treated as "not entered" (entry.py weight handling)
  const weight = value !== null && value > 0 ? value : null;
  if (weight === null) return { ok: true, message: "" };
  if (weight > 500) return { ok: false, message: "Weight out of range" };

  await updateMeasurements(db, date, {
    morning_weight_kg: which === "morning" ? weight : null,
    evening_weight_kg: which === "evening" ? weight : null,
  });
  revalidate();
  return { ok: true, message: "Weight saved" };
}

/** Save targets from the modal (entry.py save-targets flow). */
export async function saveTargetsAction(targets: DailyTargets): Promise<ActionResult> {
  for (const v of Object.values(targets.values)) {
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, message: "Targets must be zero or greater" };
    }
  }
  await saveDailyTargets(db, targets);
  revalidate();
  return { ok: true, message: "Targets saved" };
}

/** "Copy Previous Targets" — explicit stickiness fetch for the modal. */
export async function getTargetsForDateAction(date: string): Promise<DailyTargets> {
  return getOrCreateDailyTargets(db, date);
}
