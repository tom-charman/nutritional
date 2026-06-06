import { describe, expect, it } from "vitest";
import {
  caloriesAxisLimits,
  weightAxisLimits,
  windowCaloriesWeight,
  windowMacroBreakdown,
  windowNutrientsRdi,
  type CaloriesWeightData,
} from "@/lib/domain/charts/prepare";

const sample: CaloriesWeightData = {
  dates: ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
  calories_avg: [2000, 2100, 2200, 2300],
  weight_morning: [70, 70.5, 71, 71.5],
  weight_evening: [71, 71.5, 72, 72.5],
  y1Limits: [1800, 2500],
  y2Limits: [69, 74],
};

describe("range windowing", () => {
  it("null cutoff returns data unchanged (ALL)", () => {
    expect(windowCaloriesWeight(sample, null)).toBe(sample);
  });

  it("cutoff before all data returns data unchanged", () => {
    expect(windowCaloriesWeight(sample, "2025-06-01")).toBe(sample);
  });

  it("slices all series from the cutoff and recomputes limits", () => {
    const w = windowCaloriesWeight(sample, "2026-01-03");
    expect(w.dates).toEqual(["2026-01-03", "2026-01-04"]);
    expect(w.calories_avg).toEqual([2200, 2300]);
    expect(w.weight_morning).toEqual([71, 71.5]);
    // limits recomputed for the visible window
    expect(w.y1Limits).toEqual(caloriesAxisLimits([2200, 2300]));
    expect(w.y2Limits).toEqual(weightAxisLimits([71, 71.5], [72, 72.5]));
  });

  it("windows macro and RDI data consistently", () => {
    const macro = windowMacroBreakdown(
      {
        dates: sample.dates,
        protein_cal: [1, 2, 3, 4],
        other_carbs_cal: [1, 2, 3, 4],
        sugar_cal: [1, 2, 3, 4],
        other_fat_cal: [1, 2, 3, 4],
        saturated_fat_cal: [1, 2, 3, 4],
      },
      "2026-01-04",
    );
    expect(macro.dates).toEqual(["2026-01-04"]);
    expect(macro.protein_cal).toEqual([4]);

    const rdi = windowNutrientsRdi(
      { dates: sample.dates, series: { sugar_g: [10, 20, 30, 40] } },
      "2026-01-02",
    );
    expect(rdi.series.sugar_g).toEqual([20, 30, 40]);
  });
});

describe("axis limit helpers (transforms.py parity)", () => {
  it("calories limits round to 100s, fallback on empty", () => {
    expect(caloriesAxisLimits([])).toEqual([0, 3000]);
    const [lo, hi] = caloriesAxisLimits([2000, 2100]);
    expect(lo % 100).toBe(0);
    expect(hi % 100).toBe(0);
    expect(lo).toBeLessThan(2000);
    expect(hi).toBeGreaterThan(2100);
  });

  it("weight limits are integers, fallback on empty", () => {
    expect(weightAxisLimits([])).toEqual([60, 90]);
    const [lo, hi] = weightAxisLimits([70.2], [71.8]);
    expect(Number.isInteger(lo)).toBe(true);
    expect(Number.isInteger(hi)).toBe(true);
  });
});
