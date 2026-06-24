/**
 * Meal yield-mode helpers — shared by server actions, storage and the client UIs
 * so the consumed-amount ↔ scaling-factor conversion and its display stay in one
 * place. A recipe's ingredients are always scaled by a single FACTOR; the factor
 * is derived from the user's consumed amount according to the meal's yield mode.
 */
import type { MealYieldMode } from "@/lib/constants";
import type { Meal } from "./types";

type MealYield = Pick<Meal, "yield_mode" | "yield_weight_g" | "yield_count">;

/**
 * Convert a consumed amount (portions / grams / item count, per the meal's yield
 * mode) into the scaling factor applied to the recipe's ingredients. Returns null
 * when the mode needs a yield value that is missing or non-positive.
 */
export function mealConsumedToFactor(meal: MealYield, amount: number): number | null {
  switch (meal.yield_mode) {
    case "by_weight":
      return meal.yield_weight_g && meal.yield_weight_g > 0
        ? amount / meal.yield_weight_g
        : null;
    case "by_count":
      return meal.yield_count && meal.yield_count > 0 ? amount / meal.yield_count : null;
    default:
      return amount;
  }
}

/** Inverse of mealConsumedToFactor: factor → the consumed amount in display units. */
export function mealFactorToConsumed(meal: MealYield, factor: number): number {
  if (meal.yield_mode === "by_weight") return factor * (meal.yield_weight_g ?? 0);
  if (meal.yield_mode === "by_count") return factor * (meal.yield_count ?? 0);
  return factor;
}

/** Integer when whole, else one decimal — matches the amount display elsewhere. */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Human label for a consumed amount, e.g. "150 g", "×2", "1 portion". */
export function formatConsumed(mode: MealYieldMode, amount: number): string {
  if (mode === "by_weight") return `${fmtNum(amount)} g`;
  if (mode === "by_count") return `×${fmtNum(amount)}`;
  return `${fmtNum(amount)} portion${amount === 1 ? "" : "s"}`;
}

/** Amount-input config (label/placeholder/step) for logging a meal, by yield mode. */
export function mealAmountConfig(mode: MealYieldMode): {
  label: string;
  placeholder: string;
  min: number;
  step: number;
} {
  if (mode === "by_weight") {
    return { label: "Weight (g)", placeholder: "e.g. 150", min: 0, step: 1 };
  }
  if (mode === "by_count") {
    return { label: "How many?", placeholder: "e.g. 2", min: 0, step: 1 };
  }
  return { label: "Portions", placeholder: "1.0", min: 0.1, step: 0.1 };
}
