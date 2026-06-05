/**
 * Chart data preparation — exact ports of nutritional/plotting/transforms.py.
 * Run on the server; outputs are plain JSON-serializable objects passed as
 * props to the client d3 chart components.
 */
import { RDI_GUIDELINES } from "@/lib/constants";
import type { DailySummary } from "@/lib/domain/types";
import {
  calculateMacroCalories,
  interpolateDaily,
  normalizeToRdi,
  rollingAverage,
  type Series,
} from "./series";

export interface CaloriesWeightData {
  dates: string[];
  calories_avg: Series;
  weight_morning: Series;
  weight_evening: Series;
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

/** prepare_calories_weight_data (transforms.py:18-109). */
export function prepareCaloriesWeight(
  summaries: DailySummary[],
  rollingWindow: number,
): CaloriesWeightData {
  const dates = summaries.map((s) => s.date);
  const { dates: commonDates, values: calInterp } = interpolateDaily(
    dates,
    column(summaries, "energy_kcal"),
  );
  const caloriesAvg = rollingAverage(calInterp, rollingWindow);
  // Weights: interpolate only, no rolling average (show actual weight trend)
  const weightMorning = interpolateDaily(
    dates,
    column(summaries, "morning_weight_kg"),
  ).values;
  const weightEvening = interpolateDaily(
    dates,
    column(summaries, "evening_weight_kg"),
  ).values;

  // Calories axis: round to 100s with >=50 padding
  const calValid = caloriesAvg.filter((v): v is number => v !== null);
  let y1Limits: [number, number];
  if (calValid.length > 0) {
    const calMin = Math.min(...calValid);
    const calMax = Math.max(...calValid);
    let pad = (calMax - calMin) * 0.1;
    if (pad < 50) pad = 50;
    y1Limits = [
      Math.floor((calMin - pad) / 100) * 100,
      Math.floor((calMax + pad + 99) / 100) * 100,
    ];
  } else {
    y1Limits = [0, 3000];
  }

  // Weight axis: round to integers with >=0.5 padding
  const wValid = [...weightMorning, ...weightEvening].filter(
    (v): v is number => v !== null,
  );
  let y2Limits: [number, number];
  if (wValid.length > 0) {
    const wMin = Math.min(...wValid);
    const wMax = Math.max(...wValid);
    const wPad = Math.max((wMax - wMin) * 0.1, 0.5);
    y2Limits = [Math.floor(wMin - wPad), Math.ceil(wMax + wPad)];
  } else {
    y2Limits = [60, 90];
  }

  return {
    dates: commonDates,
    calories_avg: caloriesAvg,
    weight_morning: weightMorning,
    weight_evening: weightEvening,
    y1Limits,
    y2Limits,
  };
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
