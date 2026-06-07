/**
 * Daily targets logic — port of models.py DailyTargets and
 * pages/entry.py macro-bar indicator thresholds.
 */
import type { NutrientKey, TargetMode } from "@/lib/constants";
import type { DailyTargets } from "./types";

/** get_default_targets (models.py:253-277) — matches DB column defaults. */
export function getDefaultTargets(date: string): DailyTargets {
  return {
    date,
    mode: "target",
    values: {
      energy_kcal: 2000,
      protein_g: 150,
      carbohydrates_g: 225,
      fat_g: 67,
      sugar_g: 90,
      saturated_fat_g: 20,
      fibre_g: 30,
      salt_g: 6,
      calcium_mg: 700,
    },
    modes: {
      energy_kcal: "target",
      protein_g: "target",
      carbohydrates_g: "target",
      fat_g: "target",
      sugar_g: "limit",
      saturated_fat_g: "limit",
      fibre_g: "target",
      salt_g: "limit",
      calcium_mg: "target",
    },
  };
}

/** get_nutrient_mode (models.py:247-251): per-nutrient override else default mode. */
export function getNutrientMode(
  targets: DailyTargets,
  nutrient: NutrientKey,
): TargetMode {
  return targets.modes[nutrient] ?? targets.mode;
}

export type IndicatorState = "met" | "warning" | "exceeded" | null;

/**
 * Macro bar indicator (pages/entry.py create_macro_bar):
 *  - limit mode: value > target*1.1 → exceeded(⚠), value > target → warning(⚠)
 *  - target mode: value >= target → met(✓)
 */
export function macroIndicator(
  value: number,
  target: number,
  mode: TargetMode,
): IndicatorState {
  if (mode === "limit") {
    if (value > target * 1.1) return "exceeded";
    if (value > target) return "warning";
    return null;
  }
  return value >= target ? "met" : null;
}

export type CalorieStatus = "over" | "near" | "default";

/**
 * Calories-remaining card (entry.py:1564-1615):
 * remaining display = max(0, target - consumed);
 * over target → red; within 200 kcal of target → green.
 */
export function calorieStatus(
  consumed: number,
  target: number,
): { remaining: number; status: CalorieStatus; statusText: string } {
  const rawRemaining = target - consumed;
  const remaining = Math.max(0, Math.round(rawRemaining));
  if (rawRemaining < 0) {
    return {
      remaining,
      status: "over",
      statusText: `${Math.round(-rawRemaining)} kcal over target`,
    };
  }
  if (rawRemaining < 200) {
    return { remaining, status: "near", statusText: "Target nearly met" };
  }
  return { remaining, status: "default", statusText: "On track" };
}
