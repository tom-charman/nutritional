import { describe, expect, it } from "vitest";
import {
  calculateMacroCalories,
  createDateRange,
  interpolateDaily,
  normalizeToRdi,
  rollingAverage,
} from "@/lib/domain/charts/series";

describe("createDateRange", () => {
  it("creates inclusive daily range", () => {
    expect(createDateRange("2024-01-01", "2024-01-03")).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("single day", () => {
    expect(createDateRange("2024-01-01", "2024-01-01")).toEqual(["2024-01-01"]);
  });
});

describe("interpolateDaily (preprocessing.py port)", () => {
  it("fills gaps linearly between known points", () => {
    const { dates, values } = interpolateDaily(
      ["2024-01-01", "2024-01-03"],
      [100, 120],
    );
    expect(dates).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(values).toEqual([100, 110, 120]);
  });

  it("does NOT extrapolate outside first/last known points", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"],
      [null, 10, null, 20, null],
    );
    expect(values).toEqual([null, 10, 15, 20, null]);
  });

  it("single valid value → no interpolation", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-03"],
      [null, 42],
    );
    expect(values).toEqual([null, null, 42]);
  });

  it("all null stays all null", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-02"],
      [null, null],
    );
    expect(values).toEqual([null, null]);
  });

  it("empty input", () => {
    const { dates, values } = interpolateDaily([], []);
    expect(dates).toEqual([]);
    expect(values).toEqual([]);
  });

  it("does NOT bridge gaps wider than maxGapDays (no fabricated lines)", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-12"], // 11-day gap > default 7
      [100, 200],
    );
    expect(values[0]).toBe(100);
    expect(values[11]).toBe(200);
    // the void stays null — chart line breaks instead of inventing data
    expect(values.slice(1, 11)).toEqual(new Array(10).fill(null));
  });

  it("bridges gaps at exactly maxGapDays", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-08"], // 7-day gap = default limit
      [0, 70],
    );
    expect(values).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it("custom maxGapDays widens the bridge", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-12"],
      [100, 200],
      30,
    );
    expect(values[5]).toBeCloseTo(100 + (500 / 11));
  });

  it("multiple gaps interpolate against nearest neighbours", () => {
    const { values } = interpolateDaily(
      [
        "2024-01-01",
        "2024-01-02",
        "2024-01-03",
        "2024-01-04",
        "2024-01-05",
        "2024-01-06",
        "2024-01-07",
      ],
      [0, null, null, 30, null, null, 60],
    );
    expect(values).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });
});

describe("rollingAverage (preprocessing.py port)", () => {
  it("matches the docstring example: window=3 over [1..5]", () => {
    expect(rollingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
  });

  it("skips nulls within window", () => {
    const result = rollingAverage([1, null, 3], 3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(1); // only [1] valid
    expect(result[2]).toBe(2); // mean(1,3)
  });

  it("respects minPeriods", () => {
    const result = rollingAverage([null, null, 3], 2, 2);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull(); // only one valid in window
  });

  it("empty input", () => {
    expect(rollingAverage([], 5)).toEqual([]);
  });
});

describe("normalizeToRdi", () => {
  it("converts to percentages", () => {
    expect(normalizeToRdi([50, 100, 150], 100)).toEqual([50, 100, 150]);
  });

  it("rdi=0 yields nulls", () => {
    expect(normalizeToRdi([50, 100], 0)).toEqual([null, null]);
  });

  it("null passthrough", () => {
    expect(normalizeToRdi([null, 30], 30)).toEqual([null, 100]);
  });
});

describe("calculateMacroCalories (preprocessing.py port)", () => {
  it("adjusted macro kcal sums to recorded total", () => {
    const result = calculateMacroCalories([50], [200], [70], [20], [2000]);
    const sum =
      result.protein_cal[0]! +
      result.carbs_cal[0]! +
      result.saturated_fat_cal[0]! +
      result.other_fat_cal[0]!;
    expect(sum).toBeCloseTo(2000);
  });

  it("proportions follow 4/4/9 factors", () => {
    // potential: protein 200, carbs 800, satfat 90, otherfat 360 → total 1450
    const result = calculateMacroCalories([50], [200], [50], [10], [1450]);
    expect(result.protein_cal[0]).toBeCloseTo(200);
    expect(result.carbs_cal[0]).toBeCloseTo(800);
    expect(result.saturated_fat_cal[0]).toBeCloseTo(90);
    expect(result.other_fat_cal[0]).toBeCloseTo(360);
  });

  it("zero grams → adjustment factor 1, all zero", () => {
    const result = calculateMacroCalories([0], [0], [0], [0], [500]);
    expect(result.protein_cal[0]).toBe(0);
    expect(result.carbs_cal[0]).toBe(0);
  });

  it("other fat clipped at 0 when saturated exceeds total fat", () => {
    const result = calculateMacroCalories([0], [0], [5], [10], [90]);
    expect(result.other_fat_cal[0]).toBe(0);
  });

  it("null rows stay null", () => {
    const result = calculateMacroCalories([null], [1], [1], [1], [100]);
    expect(result.protein_cal[0]).toBeNull();
  });
});
