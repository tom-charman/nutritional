import { describe, expect, it } from "vitest";
import {
  calculateNutrients,
  dailyTotals,
  mealEntryTotals,
  sumNutrients,
} from "@/lib/domain/nutrients";
import type { DayEntry, FoodEntry, FoodItem, MealEntry } from "@/lib/domain/types";
import { ZERO_NUTRIENTS, type Nutrients } from "@/lib/constants";

const banana: FoodItem = {
  id: "f1",
  name: "Banana",
  unit_type: "per_item",
  serving_size_g: 118,
  energy_kcal: 105,
  fat_g: 0.4,
  saturated_fat_g: 0.1,
  carbohydrates_g: 27,
  sugar_g: 14.4,
  protein_g: 1.3,
  fibre_g: 3.1,
  salt_g: 0,
  calcium_mg: 5.9,
};

const oats: FoodItem = {
  id: "f2",
  name: "Oats",
  unit_type: "per_100g",
  serving_size_g: null,
  energy_kcal: 389,
  fat_g: 6.9,
  saturated_fat_g: 1.2,
  carbohydrates_g: 66.3,
  sugar_g: 0.99,
  protein_g: 16.9,
  fibre_g: 10.6,
  salt_g: 0.002,
  calcium_mg: 54,
};

function entry(nutrients: Partial<Nutrients>): FoodEntry {
  return {
    entry_id: "e",
    timestamp: "2024-01-01T08:00:00Z",
    food_id: "f",
    food_name: "x",
    weight_g: 100,
    quantity: null,
    nutrients: { ...ZERO_NUTRIENTS, ...nutrients },
  };
}

describe("calculateNutrients (calculator.py port)", () => {
  it("per_100g: multiplier = weight/100", () => {
    const n = calculateNutrients(oats, { weight_g: 50 });
    expect(n.energy_kcal).toBeCloseTo(194.5);
    expect(n.protein_g).toBeCloseTo(8.45);
    expect(n.fibre_g).toBeCloseTo(5.3);
  });

  it("per_100g: weight 100 returns values unchanged", () => {
    const n = calculateNutrients(oats, { weight_g: 100 });
    expect(n.energy_kcal).toBeCloseTo(389);
  });

  it("per_item: multiplier = quantity", () => {
    const n = calculateNutrients(banana, { quantity: 1.5 });
    expect(n.energy_kcal).toBeCloseTo(157.5);
    expect(n.sugar_g).toBeCloseTo(21.6);
  });

  it("per_100g without weight throws", () => {
    expect(() => calculateNutrients(oats, { quantity: 1 })).toThrow(
      "weight_g is required",
    );
  });

  it("per_item without quantity throws", () => {
    expect(() => calculateNutrients(banana, { weight_g: 100 })).toThrow(
      "quantity is required",
    );
  });

  it("zero weight gives zero nutrients", () => {
    const n = calculateNutrients(oats, { weight_g: 0 });
    expect(n.energy_kcal).toBe(0);
    expect(n.calcium_mg).toBe(0);
  });
});

describe("sumNutrients / dailyTotals", () => {
  it("sums all nine fields", () => {
    const total = sumNutrients([
      { ...ZERO_NUTRIENTS, energy_kcal: 100, protein_g: 10 },
      { ...ZERO_NUTRIENTS, energy_kcal: 200, protein_g: 5, salt_g: 1.5 },
    ]);
    expect(total.energy_kcal).toBe(300);
    expect(total.protein_g).toBe(15);
    expect(total.salt_g).toBe(1.5);
    expect(total.fibre_g).toBe(0);
  });

  it("dailyTotals returns NULL (not zeros) for an empty day — models.py:288", () => {
    expect(dailyTotals([])).toBeNull();
  });

  it("dailyTotals sums food entries and meal entries", () => {
    const meal: MealEntry = {
      meal_id: "m1",
      meal_name: "Breakfast",
      portions: 1,
      ingredients: [
        entry({ energy_kcal: 150, carbohydrates_g: 20 }),
        entry({ energy_kcal: 50, fat_g: 3 }),
      ],
    };
    const entries: DayEntry[] = [
      { kind: "food", entry: entry({ energy_kcal: 100 }) },
      { kind: "meal", entry: meal },
    ];
    const totals = dailyTotals(entries)!;
    expect(totals.energy_kcal).toBe(300);
    expect(totals.carbohydrates_g).toBe(20);
    expect(totals.fat_g).toBe(3);
  });

  it("mealEntryTotals sums ingredient nutrients", () => {
    const meal: MealEntry = {
      meal_id: "m1",
      meal_name: "Lunch",
      portions: 2,
      ingredients: [entry({ energy_kcal: 120 }), entry({ energy_kcal: 80 })],
    };
    // portions already baked into ingredient nutrients — totals just sum
    expect(mealEntryTotals(meal).energy_kcal).toBe(200);
  });
});
