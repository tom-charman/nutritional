import { describe, expect, it } from "vitest";
import {
  calculateMacroCalories,
  clampSlope,
  createDateRange,
  estimateMaintenance,
  interpolateDaily,
  normalizeToRdi,
  rejectWeightSpikes,
  rollingAverage,
  trailingSlope,
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

  it("bridges gaps of any length by default (python parity)", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-12"], // 11-day gap
      [100, 200],
    );
    expect(values[0]).toBe(100);
    expect(values[11]).toBe(200);
    expect(values[5]).toBeCloseTo(100 + (500 / 11));
    expect(values.every((v) => v !== null)).toBe(true);
  });

  it("optional maxGapDays caps how wide a void may be bridged", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-12"], // 11-day gap > cap of 7
      [100, 200],
      7,
    );
    expect(values[0]).toBe(100);
    expect(values[11]).toBe(200);
    // the void stays null — chart line would break instead of inventing data
    expect(values.slice(1, 11)).toEqual(new Array(10).fill(null));
  });

  it("bridges gaps at exactly maxGapDays", () => {
    const { values } = interpolateDaily(
      ["2024-01-01", "2024-01-08"], // 7-day gap = cap
      [0, 70],
      7,
    );
    expect(values).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
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

describe("trailingSlope", () => {
  it("rising ramp → slope of +1 per step (minPoints met)", () => {
    const s = trailingSlope([0, 1, 2, 3, 4], 5, 1);
    expect(s[4]).toBeCloseTo(1);
  });

  it("falling ramp → negative slope", () => {
    const s = trailingSlope([4, 3, 2, 1, 0], 5, 1);
    expect(s[4]).toBeCloseTo(-1);
  });

  it("flat series → slope 0 (not null; denom > 0)", () => {
    const s = trailingSlope([5, 5, 5, 5], 4, 1);
    expect(s[3]).toBe(0);
  });

  it("skips nulls within the window", () => {
    const s = trailingSlope([0, null, 2, null, 4], 5, 1);
    expect(s[4]).toBeCloseTo(1);
  });

  it("fewer than minPoints valid in window → null", () => {
    const s = trailingSlope([null, null, 5], 3, 2);
    expect(s[2]).toBeNull(); // only one valid observation
  });

  it("a single valid point → null (denom <= 0)", () => {
    const s = trailingSlope([42], 5, 1);
    expect(s[0]).toBeNull();
  });

  it("is slice-invariant once the window is full (local day-offset abscissa)", () => {
    const v = [10, 11, 13, 12, 15, 14, 17, 16, 19, 18];
    const window = 4;
    const cut = 3;
    const full = trailingSlope(v, window, 2);
    const sliced = trailingSlope(v.slice(cut), window, 2);
    // Past the warmup, each sliced index sees the identical full window as the
    // matching full-array index — values match exactly. (The first window-1
    // sliced entries legitimately differ: their window is truncated.)
    for (let i = window - 1; i < sliced.length; i++) {
      expect(sliced[i]).toBe(full[cut + i]);
    }
  });
});

describe("estimateMaintenance", () => {
  it("rising weight → maintenance below intake by slope×kcalPerKg", () => {
    // slope +0.01 kg/day, 7700 kcal/kg → 77 kcal/day surplus
    expect(estimateMaintenance([2500], [0.01], 7700)).toEqual([2500 - 77]);
  });

  it("falling weight → maintenance above intake", () => {
    expect(estimateMaintenance([2500], [-0.01], 7700)).toEqual([2500 + 77]);
  });

  it("flat weight → maintenance equals intake", () => {
    expect(estimateMaintenance([2500], [0], 7700)).toEqual([2500]);
  });

  it("null calorie or null slope → null", () => {
    expect(estimateMaintenance([null, 2500], [0.01, null], 7700)).toEqual([
      null,
      null,
    ]);
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

describe("weight-outlier robustness (UX review #6)", () => {
  it("rejectWeightSpikes drops an impossible day-over-day jump", () => {
    // 66, 66.2, 150 (fat-finger), 66.3 → the 150 is dropped, neighbours kept
    const out = rejectWeightSpikes([66, 66.2, 150, 66.3], 3);
    expect(out).toEqual([66, 66.2, null, 66.3]);
  });

  it("rejectWeightSpikes passes through legitimate gradual change and nulls", () => {
    expect(rejectWeightSpikes([70, null, 69.5, 69], 3)).toEqual([70, null, 69.5, 69]);
  });

  it("clampSlope caps extreme slopes but leaves real trends untouched", () => {
    expect(clampSlope([2.5, -2.5, 0.1, null], 0.5)).toEqual([0.5, -0.5, 0.1, null]);
  });

  it("a single 150kg spike no longer poisons maintenance", () => {
    const cal = [2000, 2000, 2000];
    // raw slope from a spike would be huge; clamped to ±0.5 → bounded estimate
    const clamped = clampSlope([1.7], 0.5); // 1.7 kg/day outlier
    const m = estimateMaintenance([cal[0]], clamped, 7700);
    // 2000 - 0.5*7700 = -1850, NOT 2000 - 1.7*7700 = -11090
    expect(m[0]).toBe(2000 - 0.5 * 7700);
  });
});
