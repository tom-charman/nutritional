/**
 * Chart data preparation — exact ports of nutritional/plotting/transforms.py.
 * Run on the server; outputs are plain JSON-serializable objects passed as
 * props to the client d3 chart components.
 */
import {
  KCAL_PER_KG,
  MAINTENANCE_MIN_POINTS,
  MAX_WEIGHT_DELTA_KG,
  MAX_WEIGHT_SLOPE_KG_PER_DAY,
  RDI_GUIDELINES,
  TREND_EWMA_ALPHA,
} from "@/lib/constants";
import type { DailySummary } from "@/lib/domain/types";
import {
  calculateMacroCalories,
  clampSlope,
  estimateMaintenance,
  ewma,
  interpolateDaily,
  normalizeToRdi,
  rejectWeightSpikes,
  rollingAverage,
  trailingSlope,
  type Series,
} from "./series";

export interface CaloriesWeightData {
  dates: string[];
  calories_avg: Series;
  weight_morning: Series;
  weight_evening: Series;
  /**
   * Responsive EWMA-smoothed trend weight (kg) — the cutter-facing weight line.
   * Deliberately shorter-horizon than `maintenance`'s 30-day slope (see constants).
   */
  weight_trend: Series;
  /** Estimated maintenance calories (adaptive TDEE); not plotted, shown as a readout. */
  maintenance: Series;
  /** Goal weight (kg) for the chart's reference guide; null when no goal set. */
  goal_weight_kg: number | null;
  y1Limits: [number, number];
  y2Limits: [number, number];
}

export interface MacroBreakdownData {
  dates: string[];
  protein_cal: Series;
  other_carbs_cal: Series;
  sugar_cal: Series;
  other_fat_cal: Series;
  saturated_fat_cal: Series;
}

export interface NutrientsRdiData {
  dates: string[];
  /** key → % of RDI series, keyed by NutrientKey present in RDI_GUIDELINES */
  series: Record<string, Series>;
}

function column(
  summaries: DailySummary[],
  key: keyof DailySummary,
): Series {
  return summaries.map((s) => s[key] as number | null);
}

/**
 * Minimum y-axis spans — scale honesty. Auto-fit axes make tiny
 * fluctuations look like big swings; these floors guarantee that noise
 * stays visually small while deliberate changes stay visible:
 *  - calories: bulk/cut adjustments are ±200–500 kcal, so an 800 kcal
 *    floor renders a 500 kcal shift at ~60% of plot height and ±75 kcal
 *    noise under 10%.
 *  - weight: a slow cut/lean bulk is ~0.25–0.5 kg/week (3–6 kg per
 *    quarter); a 6 kg floor renders real progress at half the plot and a
 *    stable ±0.5 kg wobble as a calm ribbon.
 * Longer windows still auto-grow beyond the floor.
 */
export const MIN_CALORIES_SPAN = 800;
export const MIN_WEIGHT_SPAN = 6;

/** Calories axis: round to 100s with >=50 padding (transforms.py) + span floor. */
export function caloriesAxisLimits(values: Series): [number, number] {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length === 0) return [0, 3000];
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (max - min < MIN_CALORIES_SPAN) {
    const mid = (min + max) / 2;
    min = mid - MIN_CALORIES_SPAN / 2;
    max = mid + MIN_CALORIES_SPAN / 2;
  }
  let pad = (max - min) * 0.1;
  if (pad < 50) pad = 50;
  return [
    Math.floor((min - pad) / 100) * 100,
    Math.floor((max + pad + 99) / 100) * 100,
  ];
}

/** Weight axis: round to integers with >=0.5 padding (transforms.py) + span floor. */
export function weightAxisLimits(...seriesList: Series[]): [number, number] {
  const valid = seriesList.flat().filter((v): v is number => v !== null);
  if (valid.length === 0) return [60, 90];
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (max - min < MIN_WEIGHT_SPAN) {
    const mid = (min + max) / 2;
    min = mid - MIN_WEIGHT_SPAN / 2;
    max = mid + MIN_WEIGHT_SPAN / 2;
  }
  const pad = Math.max((max - min) * 0.1, 0.5);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

/**
 * Window already-prepared chart data to dates >= cutoff (client-side range
 * selector). Rolling averages don't change — each point's trailing window
 * is unaffected by slicing later points off the front. Axis limits are
 * recomputed for the visible window.
 */
export function windowCaloriesWeight(
  data: CaloriesWeightData,
  cutoffIso: string | null,
): CaloriesWeightData {
  if (!cutoffIso) return data;
  const from = data.dates.findIndex((d) => d >= cutoffIso);
  if (from <= 0) return data;
  const dates = data.dates.slice(from);
  const calories_avg = data.calories_avg.slice(from);
  const weight_morning = data.weight_morning.slice(from);
  const weight_evening = data.weight_evening.slice(from);
  const weight_trend = data.weight_trend.slice(from);
  const maintenance = data.maintenance.slice(from);
  const goalGuide: Series = data.goal_weight_kg === null ? [] : [data.goal_weight_kg];
  return {
    dates,
    calories_avg,
    weight_morning,
    weight_evening,
    weight_trend,
    maintenance,
    goal_weight_kg: data.goal_weight_kg,
    y1Limits: caloriesAxisLimits(calories_avg),
    y2Limits: weightAxisLimits(weight_morning, weight_evening, weight_trend, goalGuide),
  };
}

export function windowMacroBreakdown(
  data: MacroBreakdownData,
  cutoffIso: string | null,
): MacroBreakdownData {
  if (!cutoffIso) return data;
  const from = data.dates.findIndex((d) => d >= cutoffIso);
  if (from <= 0) return data;
  return {
    dates: data.dates.slice(from),
    protein_cal: data.protein_cal.slice(from),
    other_carbs_cal: data.other_carbs_cal.slice(from),
    sugar_cal: data.sugar_cal.slice(from),
    other_fat_cal: data.other_fat_cal.slice(from),
    saturated_fat_cal: data.saturated_fat_cal.slice(from),
  };
}

export function windowNutrientsRdi(
  data: NutrientsRdiData,
  cutoffIso: string | null,
): NutrientsRdiData {
  if (!cutoffIso) return data;
  const from = data.dates.findIndex((d) => d >= cutoffIso);
  if (from <= 0) return data;
  return {
    dates: data.dates.slice(from),
    series: Object.fromEntries(
      Object.entries(data.series).map(([k, v]) => [k, v.slice(from)]),
    ),
  };
}

/** prepare_calories_weight_data (transforms.py:18-109). */
export function prepareCaloriesWeight(
  summaries: DailySummary[],
  rollingWindow: number,
  goalWeightKg: number | null = null,
): CaloriesWeightData {
  const dates = summaries.map((s) => s.date);
  const { dates: commonDates, values: calInterp } = interpolateDaily(
    dates,
    column(summaries, "energy_kcal"),
  );
  const caloriesAvg = rollingAverage(calInterp, rollingWindow);
  // Weights: interpolate only, no rolling average (show actual weight trend)
  const morningRaw = column(summaries, "morning_weight_kg");
  const eveningRaw = column(summaries, "evening_weight_kg");
  const weightMorning = interpolateDaily(dates, morningRaw).values;
  const weightEvening = interpolateDaily(dates, eveningRaw).values;

  // Maintenance estimate: trailing weight-trend slope (kg/day) × kcal/kg,
  // subtracted from average intake. Trend weight prefers the (less noisy)
  // morning reading, falling back to evening on days without one.
  const trendRaw: Series = morningRaw.map((m, i) => m ?? eveningRaw[i] ?? null);
  // Robustness: drop impossible spikes before interpolation, then clamp the trend
  // slope — so a single fat-fingered weigh-in can't bend the line into nonsense.
  const trendClean = rejectWeightSpikes(trendRaw, MAX_WEIGHT_DELTA_KG);
  const trendWeight = interpolateDaily(dates, trendClean).values;
  const weightSlope = clampSlope(
    trailingSlope(trendWeight, rollingWindow, MAINTENANCE_MIN_POINTS),
    MAX_WEIGHT_SLOPE_KG_PER_DAY,
  );
  const maintenance = estimateMaintenance(caloriesAvg, weightSlope, KCAL_PER_KG);
  // Responsive trend line for the cutter card/chart — EWMA over the same clean
  // base, NOT the 30-day-lagged regression that drives maintenance.
  const weightTrend = ewma(trendWeight, TREND_EWMA_ALPHA);

  return {
    dates: commonDates,
    calories_avg: caloriesAvg,
    weight_morning: weightMorning,
    weight_evening: weightEvening,
    weight_trend: weightTrend,
    maintenance,
    goal_weight_kg: goalWeightKg,
    y1Limits: caloriesAxisLimits(caloriesAvg),
    y2Limits: weightAxisLimits(weightMorning, weightEvening, weightTrend, goalGuideSeries(goalWeightKg)),
  };
}

/** A single-point series carrying the goal weight, so the axis includes the goal guide. */
function goalGuideSeries(goalWeightKg: number | null): Series {
  return goalWeightKg === null ? [] : [goalWeightKg];
}

/** prepare_macro_breakdown_data (transforms.py:112-217). */
export function prepareMacroBreakdown(
  summaries: DailySummary[],
  rollingWindow: number,
  calProt = 4,
  calCarb = 4,
  calFat = 9,
): MacroBreakdownData {
  const dates = summaries.map((s) => s.date);
  const carbsG = column(summaries, "carbohydrates_g");
  const sugarG = column(summaries, "sugar_g");

  const macroCals = calculateMacroCalories(
    column(summaries, "protein_g"),
    carbsG,
    column(summaries, "fat_g"),
    column(summaries, "saturated_fat_g"),
    column(summaries, "energy_kcal"),
    calProt,
    calCarb,
    calFat,
  );

  // sugar kcal = (sugar_g / carbs_g) * carbs_cal; other carbs = remainder
  const sugarCal: Series = macroCals.carbs_cal.map((cc, i) => {
    const cg = carbsG[i];
    const sg = sugarG[i];
    if (cc === null) return null;
    if (cg !== null && sg !== null && cg > 0) return (sg / cg) * cc;
    return 0;
  });
  const otherCarbsCal: Series = macroCals.carbs_cal.map((cc, i) => {
    const sc = sugarCal[i];
    return cc === null || sc === null ? null : cc - sc;
  });

  const inputs: Record<string, Series> = {
    protein_cal: macroCals.protein_cal,
    other_carbs_cal: otherCarbsCal,
    sugar_cal: sugarCal,
    saturated_fat_cal: macroCals.saturated_fat_cal,
    other_fat_cal: macroCals.other_fat_cal,
  };

  let resultDates: string[] = [];
  const out: Record<string, Series> = {};
  for (const [key, values] of Object.entries(inputs)) {
    const { dates: interpDates, values: interpValues } = interpolateDaily(
      dates,
      values,
    );
    out[key] = rollingAverage(interpValues, rollingWindow);
    if (resultDates.length === 0) resultDates = interpDates;
  }

  return {
    dates: resultDates,
    protein_cal: out.protein_cal,
    other_carbs_cal: out.other_carbs_cal,
    sugar_cal: out.sugar_cal,
    other_fat_cal: out.other_fat_cal,
    saturated_fat_cal: out.saturated_fat_cal,
  };
}

/** prepare_normalized_nutrients_data (transforms.py:220-274). */
export function prepareNutrientsRdi(
  summaries: DailySummary[],
  rollingWindow: number,
  rdiGuidelines: Partial<Record<string, number>> = RDI_GUIDELINES,
): NutrientsRdiData {
  const dates = summaries.map((s) => s.date);
  let resultDates: string[] = [];
  const series: Record<string, Series> = {};

  for (const [nutrient, rdiValue] of Object.entries(rdiGuidelines)) {
    if (rdiValue === undefined) continue;
    const { dates: interpDates, values: interpValues } = interpolateDaily(
      dates,
      column(summaries, nutrient as keyof DailySummary),
    );
    const rolling = rollingAverage(interpValues, rollingWindow);
    series[nutrient] = normalizeToRdi(rolling, rdiValue);
    if (resultDates.length === 0) resultDates = interpDates;
  }

  return { dates: resultDates, series };
}
