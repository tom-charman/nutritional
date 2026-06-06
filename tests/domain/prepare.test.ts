import { describe, expect, it } from "vitest";
import {
  prepareCaloriesWeight,
  prepareMacroBreakdown,
  prepareNutrientsRdi,
} from "@/lib/domain/charts/prepare";
import type { DailySummary } from "@/lib/domain/types";

function summary(
  date: string,
  partial: Partial<Omit<DailySummary, "date">> = {},
): DailySummary {
  return {
    date,
    energy_kcal: null,
    fat_g: null,
    saturated_fat_g: null,
    carbohydrates_g: null,
    sugar_g: null,
    protein_g: null,
    fibre_g: null,
    salt_g: null,
    calcium_mg: null,
    morning_weight_kg: null,
    evening_weight_kg: null,
    ...partial,
  };
}

const sample: DailySummary[] = [
  summary("2024-01-01", {
    energy_kcal: 2000,
    protein_g: 100,
    carbohydrates_g: 200,
    sugar_g: 50,
    fat_g: 70,
    saturated_fat_g: 20,
    fibre_g: 25,
    salt_g: 5,
    calcium_mg: 800,
    morning_weight_kg: 70,
    evening_weight_kg: 71,
  }),
  summary("2024-01-03", {
    energy_kcal: 2200,
    protein_g: 120,
    carbohydrates_g: 220,
    sugar_g: 60,
    fat_g: 75,
    saturated_fat_g: 22,
    fibre_g: 30,
    salt_g: 6,
    calcium_mg: 900,
    morning_weight_kg: 69.5,
    evening_weight_kg: 70.5,
  }),
];

describe("prepareCaloriesWeight (transforms.py port)", () => {
  const result = prepareCaloriesWeight(sample, 30);

  it("interpolates to contiguous daily range", () => {
    expect(result.dates).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
  });

  it("weights are interpolated but NOT rolling-averaged", () => {
    expect(result.weight_morning).toEqual([70, 69.75, 69.5]);
    expect(result.weight_evening).toEqual([71, 70.75, 70.5]);
  });

  it("calories rolling-averaged (window 30 → cumulative mean here)", () => {
    expect(result.calories_avg[0]).toBeCloseTo(2000);
    expect(result.calories_avg[1]).toBeCloseTo(2050); // mean(2000, 2100)
    expect(result.calories_avg[2]).toBeCloseTo(2100); // mean(2000, 2100, 2200)
  });

  it("calories axis limits rounded to 100s", () => {
    expect(result.y1Limits[0] % 100).toBe(0);
    expect(result.y1Limits[1] % 100).toBe(0);
    expect(result.y1Limits[0]).toBeLessThan(2000);
    expect(result.y1Limits[1]).toBeGreaterThan(2100);
  });

  it("weight axis limits are integers", () => {
    expect(Number.isInteger(result.y2Limits[0])).toBe(true);
    expect(Number.isInteger(result.y2Limits[1])).toBe(true);
  });

  it("empty data → fallback limits", () => {
    const empty = prepareCaloriesWeight([], 30);
    expect(empty.y1Limits).toEqual([0, 3000]);
    expect(empty.y2Limits).toEqual([60, 90]);
    expect(empty.dates).toEqual([]);
  });

  it("weight bridges long gaps; calories break across them", () => {
    const gappy = [
      summary("2024-01-01", { energy_kcal: 2000, morning_weight_kg: 70 }),
      summary("2024-01-20", { energy_kcal: 2200, morning_weight_kg: 71.9 }), // 19-day gap
    ];
    const r = prepareCaloriesWeight(gappy, 30);
    // weight: continuous physical quantity → fully interpolated
    expect(r.weight_morning[10]).toBeCloseTo(70 + (1.9 * 10) / 19);
    expect(r.weight_morning.every((v) => v !== null)).toBe(true);
    // calories: void stays null (no fabricated eating); rolling avg decays
    // off the last real point, so assert the raw gap behavior via day 10
    // having no contribution beyond the trailing window of real data
    const calMid = r.calories_avg[10];
    expect(calMid).toBe(2000); // trailing window only ever saw day 1's value
  });
});

describe("prepareMacroBreakdown (transforms.py port)", () => {
  const result = prepareMacroBreakdown(sample, 30);

  it("returns the five stacked series", () => {
    expect(result.protein_cal).toHaveLength(3);
    expect(result.other_carbs_cal).toHaveLength(3);
    expect(result.sugar_cal).toHaveLength(3);
    expect(result.other_fat_cal).toHaveLength(3);
    expect(result.saturated_fat_cal).toHaveLength(3);
  });

  it("first day macro kcal sums to recorded calories", () => {
    const sum =
      result.protein_cal[0]! +
      result.other_carbs_cal[0]! +
      result.sugar_cal[0]! +
      result.other_fat_cal[0]! +
      result.saturated_fat_cal[0]!;
    expect(sum).toBeCloseTo(2000, 6);
  });

  it("sugar share is proportional to sugar/carbs ratio", () => {
    const carbsCal = result.sugar_cal[0]! + result.other_carbs_cal[0]!;
    expect(result.sugar_cal[0]! / carbsCal).toBeCloseTo(50 / 200);
  });
});

describe("prepareNutrientsRdi (transforms.py port)", () => {
  const result = prepareNutrientsRdi(sample, 30);

  it("produces a series per RDI guideline nutrient", () => {
    expect(Object.keys(result.series).sort()).toEqual([
      "calcium_mg",
      "fibre_g",
      "salt_g",
      "saturated_fat_g",
      "sugar_g",
    ]);
  });

  it("normalizes to % of RDI (production values: satfat 30, calcium 1000)", () => {
    // day 1: satfat 20 / RDI 30
    expect(result.series.saturated_fat_g[0]).toBeCloseTo((20 / 30) * 100);
    expect(result.series.calcium_mg[0]).toBeCloseTo(80);
    expect(result.series.salt_g[0]).toBeCloseTo((5 / 6) * 100);
  });
});
