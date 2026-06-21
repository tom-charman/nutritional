/**
 * Plan vs actual. Compares a week's PLANNED nutrients (the intent) against what
 * was actually LOGGED (daily_summaries) as a signed delta (actual − planned).
 *
 * Honesty: if either side is missing for a nutrient/day the delta is `null`
 * (UNKNOWN — never silently 0). Planned-but-not-logged and logged-but-unplanned
 * are both legitimate and stay distinguishable.
 */
import { NUTRIENT_KEYS, type NutrientKey, type Nutrients } from "@/lib/constants";
import type { DailySummary } from "@/lib/domain/types";

export interface NutrientDelta {
  planned: number | null;
  actual: number | null;
  /** actual − planned; null when either side is missing. */
  delta: number | null;
}
export type DeltaByNutrient = Record<NutrientKey, NutrientDelta>;

export interface DayComparison {
  date: string;
  planned: boolean;
  logged: boolean;
  byNutrient: DeltaByNutrient;
}

export interface WeekComparison {
  /**
   * Per-nutrient totals over the COMPARABLE basis only — days that were both
   * planned and logged — so planned/actual/delta share one denominator and the
   * delta is the honest "did I stick to the plan" net. Days planned-but-not-
   * logged or logged-but-unplanned show per-day (byDay) but not here.
   */
  week: DeltaByNutrient;
  byDay: DayComparison[];
  /** Days counted in the week totals (both planned and logged). */
  comparableDays: number;
  /** True when at least one day in the week has logged data (gates the UI). */
  anyLogged: boolean;
}

/** A daily_summaries row → Nutrients, or null for an empty/weight-only day. */
export function summaryToNutrients(s: DailySummary | undefined): Nutrients | null {
  if (!s || s.energy_kcal === null) return null;
  return {
    energy_kcal: s.energy_kcal ?? 0,
    fat_g: s.fat_g ?? 0,
    saturated_fat_g: s.saturated_fat_g ?? 0,
    carbohydrates_g: s.carbohydrates_g ?? 0,
    sugar_g: s.sugar_g ?? 0,
    protein_g: s.protein_g ?? 0,
    fibre_g: s.fibre_g ?? 0,
    salt_g: s.salt_g ?? 0,
    calcium_mg: s.calcium_mg ?? 0,
  };
}

function delta(planned: number | null, actual: number | null): NutrientDelta {
  return {
    planned,
    actual,
    delta: planned === null || actual === null ? null : actual - planned,
  };
}

export function comparePlanVsActual(
  plannedByDay: Record<string, Nutrients | null>,
  summariesByDate: Record<string, DailySummary>,
  dates: string[],
): WeekComparison {
  const byDay: DayComparison[] = [];
  // Week totals accumulate ONLY over the comparable basis (days with both sides),
  // so planned/actual/delta are one consistent denominator. null until a
  // comparable day contributes.
  const weekPlanned: Record<NutrientKey, number | null> = {} as never;
  const weekActual: Record<NutrientKey, number | null> = {} as never;
  for (const k of NUTRIENT_KEYS) {
    weekPlanned[k] = null;
    weekActual[k] = null;
  }

  let anyLogged = false;
  let comparableDays = 0;
  for (const date of dates) {
    const planned = plannedByDay[date] ?? null;
    const actual = summaryToNutrients(summariesByDate[date]);
    if (actual) anyLogged = true;
    const comparable = planned !== null && actual !== null;
    if (comparable) comparableDays++;

    const byNutrient = {} as DeltaByNutrient;
    for (const k of NUTRIENT_KEYS) {
      const p = planned ? planned[k] : null;
      const a = actual ? actual[k] : null;
      byNutrient[k] = delta(p, a);
      if (comparable) {
        weekPlanned[k] = (weekPlanned[k] ?? 0) + (p as number);
        weekActual[k] = (weekActual[k] ?? 0) + (a as number);
      }
    }
    byDay.push({ date, planned: planned !== null, logged: actual !== null, byNutrient });
  }

  const week = {} as DeltaByNutrient;
  for (const k of NUTRIENT_KEYS) week[k] = delta(weekPlanned[k], weekActual[k]);

  return { week, byDay, comparableDays, anyLogged };
}
