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
      vitamin_c_mg: 200,
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
      vitamin_c_mg: "target",
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
 * Macro bar indicator, judged against a per-nutrient on-target band (a
 * fraction of the target; see NUTRIENT_BANDS). The band is the grace zone so
 * a trivial deviation never raises an alarm:
 *  - limit mode: value > target*(1+2·band) → exceeded(⚠); value > target*(1+band)
 *    → warning(⚠); at/under the cap (within grace) → met(✓) — staying under a
 *    cap is a win and earns the tick, just like hitting a floor does.
 *  - target mode: value >= target*(1−band) → met(✓) (close enough, any overage
 *    is fine for a floor); below → null (a real shortfall, surfaced as "short").
 *
 * Energy is a window, not a floor — see `energyIndicator`; route per-nutrient
 * judgements through `nutrientIndicator` so calories get the right treatment.
 */
export function macroIndicator(
  value: number,
  target: number,
  mode: TargetMode,
  band: number,
): IndicatorState {
  if (mode === "limit") {
    if (value > target * (1 + 2 * band)) return "exceeded";
    if (value > target * (1 + band)) return "warning";
    return "met";
  }
  return value >= target * (1 - band) ? "met" : null;
}

/**
 * Calories are special: a tick means "in the band", so both a shortfall AND an
 * overage break it (eating far under target is no more "on target" than eating
 * over). Judged as a window around the energy target:
 *  - value > target*(1+2·band) → exceeded(⚠); value > target*(1+band) → warning(⚠);
 *  - within ±band of target → met(✓);
 *  - below target*(1−band) → null (a real shortfall, never a tick).
 * Mirrors the energy half of `calorieStatus` (the remaining-card copy).
 */
export function energyIndicator(
  value: number,
  target: number,
  band: number,
): IndicatorState {
  if (value > target * (1 + 2 * band)) return "exceeded";
  if (value > target * (1 + band)) return "warning";
  return value >= target * (1 - band) ? "met" : null;
}

/**
 * The single entry point UI surfaces should use to judge a nutrient: energy
 * gets the in-band window (`energyIndicator`); every other nutrient follows its
 * stored target/limit `mode` via `macroIndicator`.
 */
export function nutrientIndicator(
  nutrient: NutrientKey,
  value: number,
  target: number,
  mode: TargetMode,
  band: number,
): IndicatorState {
  return nutrient === "energy_kcal"
    ? energyIndicator(value, target, band)
    : macroIndicator(value, target, mode, band);
}

/**
 * Whole-number percentage a projected value sits over a limit target, for the
 * live preview copy ("…40% over your salt limit"). Only meaningful once
 * `macroIndicator` has flagged the value as warning/exceeded (i.e. projected >
 * target); guards a zero/negative target to avoid Infinity/NaN.
 */
export function limitOverPct(projected: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((projected / target - 1) * 100);
}

export type CalorieStatus = "over" | "met" | "near" | "default";

/**
 * Calories-remaining card (entry.py:1564-1615), judged against the energy
 * on-target band (a fraction of target; see NUTRIENT_BANDS.energy_kcal):
 * remaining display = max(0, target - consumed);
 *  - consumed > target*(1+band) → "over" (red); the overage is ≥ band·target,
 *    so it never reads as a misleading bare "0 over".
 *  - remaining rounds to 0 (reached the target, incl. the upper grace band) →
 *    "met" ("Target met"). NOT "nearly met": a bare "0 remaining / nearly met"
 *    is the same rounding-to-zero nonsense the bands exist to kill.
 *  - still short but within the band → "near" ("Target nearly met"); always a
 *    real positive remainder, so the copy and the number agree.
 *  - comfortably under → "default" ("On track", room remaining).
 */
export function calorieStatus(
  consumed: number,
  target: number,
  band: number,
): { remaining: number; over: number; status: CalorieStatus; statusText: string } {
  const rawRemaining = target - consumed;
  const remaining = Math.max(0, Math.round(rawRemaining));
  if (consumed > target * (1 + band)) {
    // Surface the overage as its own number so the card can show it prominently
    // ("Calories Over: 1,725") instead of a misleading bare "0 remaining".
    return {
      remaining,
      over: Math.round(consumed - target),
      status: "over",
      statusText: "over target",
    };
  }
  if (remaining === 0) {
    // Hit the target (within the upper grace band). "0 remaining" means met,
    // not "nearly" — keep the number and the words consistent.
    return { remaining, over: 0, status: "met", statusText: "Target met" };
  }
  if (consumed >= target * (1 - band)) {
    return { remaining, over: 0, status: "near", statusText: "Target nearly met" };
  }
  return { remaining, over: 0, status: "default", statusText: "On track" };
}
