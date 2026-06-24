import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./harness";
import type { DB } from "@/lib/data/storage";
import {
  clearPlanDay,
  copyPlanDay,
  deletePlanItem,
  loadWeekPlan,
  savePlanItem,
  saveDailyEntry,
  saveFoodItem,
  saveMeal,
  updatePlanItemAmount,
} from "@/lib/data/storage";
import type { FoodEntry, FoodItem, Meal } from "@/lib/domain/types";
import { weekDates } from "@/lib/domain/plan/week";
import { ZERO_NUTRIENTS } from "@/lib/constants";

let db: DB;
let userId: string;
let close: () => Promise<void>;

const WEEK = "2024-06-03"; // a Monday
const [MON, TUE, WED, THU] = weekDates(WEEK);

beforeAll(async () => {
  ({ db, userId, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

function makeFood(partial: Partial<FoodItem> = {}): FoodItem {
  return {
    id: randomUUID(),
    name: `Food-${randomUUID().slice(0, 8)}`,
    unit_type: "per_100g",
    serving_size_g: null,
    energy_kcal: 100,
    fat_g: 5,
    saturated_fat_g: 1,
    carbohydrates_g: 10,
    sugar_g: 2,
    protein_g: 8,
    fibre_g: 3,
    salt_g: 0.5,
    calcium_mg: 50,
    ...partial,
  };
}

async function seedMeal(name: string, food: FoodItem, weightG: number): Promise<Meal> {
  const meal: Meal = {
    id: randomUUID(),
    name,
    yield_mode: "whole",
    yield_weight_g: null,
    yield_count: null,
    ingredients: [
      {
        food_id: food.id,
        food_name: food.name,
        weight_g: weightG,
        quantity: null,
        // loadWeekPlan recomputes nutrients from the live food, so these are placeholders.
        nutrients: { ...ZERO_NUTRIENTS },
      },
    ],
  };
  await saveMeal(db, userId, meal);
  return meal;
}

describe("week plan storage", () => {
  it("saves a meal item and computes scaled nutrients", async () => {
    const food = makeFood({ name: "Oats", energy_kcal: 380, protein_g: 13 });
    await saveFoodItem(db, userId, food);
    const meal = await seedMeal("Porridge", food, 100); // 100g => exactly per-100g values

    await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: MON,
      slot: "breakfast",
      mealId: meal.id,
      portions: 2,
    });

    const plan = await loadWeekPlan(db, userId, WEEK);
    const item = plan.items.find((i) => i.plan_date === MON && i.slot === "breakfast");
    expect(item).toBeDefined();
    expect(item!.ref.kind).toBe("meal");
    // 100g of oats = 380 kcal; 2 portions = 760
    expect(item!.nutrients.energy_kcal).toBeCloseTo(760, 5);
    expect(item!.applied).toBe(false);
  });

  it("saves a food item by weight", async () => {
    const food = makeFood({ name: "Banana", unit_type: "per_item", serving_size_g: 120, energy_kcal: 105 });
    await saveFoodItem(db, userId, food);
    await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: TUE,
      slot: "snack",
      foodId: food.id,
      quantity: 2,
    });
    const plan = await loadWeekPlan(db, userId, WEEK);
    const item = plan.items.find((i) => i.plan_date === TUE && i.slot === "snack");
    expect(item!.ref.kind).toBe("food");
    expect(item!.nutrients.energy_kcal).toBeCloseTo(210, 5); // 2 × 105
  });

  it("rejects an item that references neither / both", async () => {
    await expect(
      savePlanItem(db, userId, { weekStart: WEEK, planDate: MON, slot: "lunch" }),
    ).rejects.toThrow();
  });

  it("plans a by_weight meal by grams and derives the scaling factor", async () => {
    const food = makeFood({ name: "CakeFlour", energy_kcal: 100 });
    await saveFoodItem(db, userId, food);
    // 1200 g ingredient → 1200 kcal batch; finished weight 1200 g.
    const meal: Meal = {
      id: randomUUID(),
      name: "PlanCake",
      yield_mode: "by_weight",
      yield_weight_g: 1200,
      yield_count: null,
      ingredients: [
        { food_id: food.id, food_name: food.name, weight_g: 1200, quantity: null, nutrients: { ...ZERO_NUTRIENTS } },
      ],
    };
    await saveMeal(db, userId, meal);

    // A by_weight meal stores its amount in weight_g (not portions).
    await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: WED,
      slot: "dinner",
      mealId: meal.id,
      weightG: 150,
    });

    const plan = await loadWeekPlan(db, userId, WEEK);
    const item = plan.items.find((i) => i.plan_date === WED && i.slot === "dinner");
    expect(item!.ref.kind).toBe("meal");
    expect(item!.ref.kind === "meal" && item!.ref.yield_mode).toBe("by_weight");
    expect(item!.ref.kind === "meal" && item!.ref.consumed_amount).toBeCloseTo(150);
    expect(item!.ref.kind === "meal" && item!.ref.portions).toBeCloseTo(0.125); // factor
    expect(item!.nutrients.energy_kcal).toBeCloseTo(150, 5); // 1200 × 0.125
  });

  it("edits an item amount in place", async () => {
    const food = makeFood({ energy_kcal: 200 });
    await saveFoodItem(db, userId, food);
    const id = await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: WED,
      slot: "dinner",
      foodId: food.id,
      weightG: 100,
    });
    await updatePlanItemAmount(db, userId, id, 250);
    const plan = await loadWeekPlan(db, userId, WEEK);
    const item = plan.items.find((i) => i.id === id);
    expect(item!.ref).toMatchObject({ kind: "food", weight_g: 250 });
    expect(item!.nutrients.energy_kcal).toBeCloseTo(500, 5); // 250g × 200/100
  });

  it("copies a day onto another day", async () => {
    const food = makeFood({ energy_kcal: 90 });
    await saveFoodItem(db, userId, food);
    const fromDay = weekDates("2024-06-10")[0]; // a fresh week to avoid cross-test noise
    const toDay = weekDates("2024-06-10")[1];
    await savePlanItem(db, userId, {
      weekStart: "2024-06-10",
      planDate: fromDay,
      slot: "breakfast",
      foodId: food.id,
      weightG: 100,
    });
    const n = await copyPlanDay(db, userId, "2024-06-10", fromDay, toDay);
    expect(n).toBe(1);
    const plan = await loadWeekPlan(db, userId, "2024-06-10");
    expect(plan.items.filter((i) => i.plan_date === toDay)).toHaveLength(1);
  });

  it("clears a day", async () => {
    const food = makeFood({ energy_kcal: 100 });
    await saveFoodItem(db, userId, food);
    await savePlanItem(db, userId, { weekStart: WEEK, planDate: THU, slot: "dinner", foodId: food.id, weightG: 100 });
    const plan = await loadWeekPlan(db, userId, WEEK);
    const before = plan.items.filter((i) => i.plan_date === THU).length;
    expect(before).toBeGreaterThan(0);
    await clearPlanDay(db, userId, THU);
    const after = await loadWeekPlan(db, userId, WEEK);
    expect(after.items.filter((i) => i.plan_date === THU)).toHaveLength(0);
  });
});

describe("applied flag + provenance", () => {
  function makeEntry(foodId: string, planItemId: string): FoodEntry {
    return {
      entry_id: randomUUID(),
      timestamp: "2024-06-03T08:00:00.000Z",
      food_id: foodId,
      food_name: "x",
      weight_g: 100,
      quantity: null,
      nutrients: { ...ZERO_NUTRIENTS, energy_kcal: 100 },
      source: "plan",
      plan_item_id: planItemId,
    };
  }

  it("marks an item applied when a log row references it", async () => {
    const food = makeFood();
    await saveFoodItem(db, userId, food);
    const itemId = await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: MON,
      slot: "dinner",
      foodId: food.id,
      weightG: 100,
    });

    await saveDailyEntry(db, userId, {
      date: MON,
      entries: [{ kind: "food", entry: makeEntry(food.id, itemId) }],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    });

    const plan = await loadWeekPlan(db, userId, WEEK);
    expect(plan.items.find((i) => i.id === itemId)!.applied).toBe(true);
  });

  it("preserves provenance across saveDailyEntry's delete+reinsert (the hazard)", async () => {
    const food = makeFood();
    await saveFoodItem(db, userId, food);
    const itemId = await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: TUE,
      slot: "dinner",
      foodId: food.id,
      weightG: 100,
    });
    const entry = makeEntry(food.id, itemId);
    await saveDailyEntry(db, userId, {
      date: TUE,
      entries: [{ kind: "food", entry }],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    });

    // Simulate a later manual edit: reload, bump the amount, save again.
    const { loadDailyEntry } = await import("@/lib/data/storage");
    const day = (await loadDailyEntry(db, userId, TUE))!;
    expect(day.entries[0].kind).toBe("food");
    if (day.entries[0].kind === "food") {
      expect(day.entries[0].entry.plan_item_id).toBe(itemId);
      day.entries[0].entry.nutrients.energy_kcal = 999;
    }
    await saveDailyEntry(db, userId, day);

    // Provenance must survive — the plan item is still "applied".
    const plan = await loadWeekPlan(db, userId, WEEK);
    expect(plan.items.find((i) => i.id === itemId)!.applied).toBe(true);
  });

  it("deleting a plan item keeps the already-applied log row (FK SET NULL)", async () => {
    const food = makeFood();
    await saveFoodItem(db, userId, food);
    const itemId = await savePlanItem(db, userId, {
      weekStart: WEEK,
      planDate: WED,
      slot: "snack",
      foodId: food.id,
      weightG: 100,
    });
    await saveDailyEntry(db, userId, {
      date: WED,
      entries: [{ kind: "food", entry: makeEntry(food.id, itemId) }],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    });

    await deletePlanItem(db, userId, itemId);

    const { loadDailyEntry } = await import("@/lib/data/storage");
    const day = (await loadDailyEntry(db, userId, WED))!;
    // The eaten food remains logged; only the plan link is gone.
    expect(day.entries.some((e) => e.kind === "food")).toBe(true);
  });
});
