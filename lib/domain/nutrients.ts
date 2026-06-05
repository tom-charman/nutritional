/**
 * Nutrient calculation — exact port of data_entry/calculator.py and
 * models.py calculate_totals semantics.
 */
import {
  NUTRIENT_KEYS,
  ZERO_NUTRIENTS,
  type Nutrients,
} from "@/lib/constants";
import type { DayEntry, FoodItem, MealEntry } from "./types";

export interface Amount {
  weight_g?: number | null;
  quantity?: number | null;
}

/**
 * calculate_nutrients (calculator.py:6-45):
 * per_100g → weight_g/100 multiplier; per_item → quantity multiplier.
 */
export function calculateNutrients(food: FoodItem, amount: Amount): Nutrients {
  let multiplier: number;
  if (food.unit_type === "per_100g") {
    if (amount.weight_g === null || amount.weight_g === undefined) {
      throw new Error("weight_g is required for per_100g items");
    }
    multiplier = amount.weight_g / 100.0;
  } else if (food.unit_type === "per_item") {
    if (amount.quantity === null || amount.quantity === undefined) {
      throw new Error("quantity is required for per_item items");
    }
    multiplier = amount.quantity;
  } else {
    throw new Error(`Unknown unit type: ${food.unit_type}`);
  }

  const result = { ...ZERO_NUTRIENTS };
  for (const key of NUTRIENT_KEYS) {
    result[key] = food[key] * multiplier;
  }
  return result;
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const totals = { ...ZERO_NUTRIENTS };
  for (const item of items) {
    for (const key of NUTRIENT_KEYS) {
      totals[key] += item[key];
    }
  }
  return totals;
}

/** MealEntry.calculate_totals (models.py:115-133). */
export function mealEntryTotals(meal: MealEntry): Nutrients {
  return sumNutrients(meal.ingredients.map((i) => i.nutrients));
}

/**
 * DailyData.calculate_totals (models.py:288-316):
 * returns NULL for an empty day — this null must propagate to
 * daily_summaries (never write 0 for an empty day).
 */
export function dailyTotals(entries: DayEntry[]): Nutrients | null {
  if (entries.length === 0) return null;
  return sumNutrients(
    entries.map((e) =>
      e.kind === "food" ? e.entry.nutrients : mealEntryTotals(e.entry),
    ),
  );
}
