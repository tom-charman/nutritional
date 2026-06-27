import { describe, expect, it } from "vitest";
import {
  formatConsumed,
  mealAmountConfig,
  mealConsumedToFactor,
  mealFactorToConsumed,
} from "@/lib/domain/meals";

const whole = { yield_mode: "whole" as const, yield_weight_g: null, yield_count: null };
const byWeight = { yield_mode: "by_weight" as const, yield_weight_g: 1200, yield_count: null };
const byCount = { yield_mode: "by_count" as const, yield_weight_g: null, yield_count: 12 };

describe("mealConsumedToFactor", () => {
  it("whole: factor equals the portions entered", () => {
    expect(mealConsumedToFactor(whole, 2)).toBe(2);
  });
  it("by_weight: grams / finished weight", () => {
    expect(mealConsumedToFactor(byWeight, 150)).toBeCloseTo(0.125);
  });
  it("by_count: items / yield count", () => {
    expect(mealConsumedToFactor(byCount, 2)).toBeCloseTo(2 / 12);
  });
  it("returns null when the needed yield is missing or non-positive", () => {
    expect(mealConsumedToFactor({ yield_mode: "by_weight", yield_weight_g: 0, yield_count: null }, 150)).toBeNull();
    expect(mealConsumedToFactor({ yield_mode: "by_count", yield_weight_g: null, yield_count: null }, 2)).toBeNull();
  });
});

describe("mealFactorToConsumed is the inverse", () => {
  it("round-trips by_weight", () => {
    const f = mealConsumedToFactor(byWeight, 150)!;
    expect(mealFactorToConsumed(byWeight, f)).toBeCloseTo(150);
  });
  it("round-trips by_count", () => {
    const f = mealConsumedToFactor(byCount, 3)!;
    expect(mealFactorToConsumed(byCount, f)).toBeCloseTo(3);
  });
});

describe("formatConsumed", () => {
  it("labels each mode", () => {
    expect(formatConsumed("by_weight", 150)).toBe("150 g");
    expect(formatConsumed("by_count", 2)).toBe("×2");
    expect(formatConsumed("whole", 1)).toBe("1 portion");
    expect(formatConsumed("whole", 2)).toBe("2 portions");
    expect(formatConsumed("by_weight", 150.5)).toBe("150.5 g");
  });
});

describe("mealAmountConfig", () => {
  it("uses the right input label per mode", () => {
    expect(mealAmountConfig("by_weight").label).toBe("Weight (g)");
    expect(mealAmountConfig("by_count").label).toBe("How many?");
    expect(mealAmountConfig("whole").label).toBe("Portions");
  });
});
