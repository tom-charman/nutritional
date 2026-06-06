import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createTestDb } from "./harness";
import type { DB } from "@/lib/data/storage";
import {
  deleteFoodItem,
  deleteMeal,
  getAllDates,
  getFoodItem,
  getMeal,
  saveMeal,
  getOrCreateDailyTargets,
  loadDailyEntry,
  loadDailyTargets,
  loadFoodDatabase,
  loadAllSummaries,
  loadMeals,
  saveDailyEntry,
  saveDailyTargets,
  saveFoodItem,
  searchFoodItems,
  updateMeasurements,
} from "@/lib/data/storage";
import { getDefaultTargets } from "@/lib/domain/targets";
import type { DailyData, FoodEntry, FoodItem } from "@/lib/domain/types";
import { ZERO_NUTRIENTS } from "@/lib/constants";

let db: DB;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
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

function makeEntry(foodId: string, partial: Partial<FoodEntry> = {}): FoodEntry {
  return {
    entry_id: randomUUID(),
    timestamp: "2024-06-01T08:00:00.000Z",
    food_id: foodId,
    food_name: "x",
    weight_g: 150,
    quantity: null,
    nutrients: { ...ZERO_NUTRIENTS, energy_kcal: 150, protein_g: 12 },
    ...partial,
  };
}

describe("food items CRUD", () => {
  it("save, load, search, get, delete round-trip", async () => {
    const food = makeFood({ name: "Porridge Oats" });
    await saveFoodItem(db, food);

    const all = await loadFoodDatabase(db);
    expect(all.some((f) => f.id === food.id)).toBe(true);

    const found = await searchFoodItems(db, "porridge");
    expect(found).toHaveLength(1);
    expect(found[0].energy_kcal).toBe(100); // number, not string

    const got = await getFoodItem(db, food.id);
    expect(got?.name).toBe("Porridge Oats");

    // legacy "food:" prefix stripping
    const gotPrefixed = await getFoodItem(db, `food:${food.id}`);
    expect(gotPrefixed?.id).toBe(food.id);

    // update via upsert
    await saveFoodItem(db, { ...food, energy_kcal: 222 });
    expect((await getFoodItem(db, food.id))?.energy_kcal).toBe(222);

    expect(await deleteFoodItem(db, food.id)).toBe(true);
    expect(await getFoodItem(db, food.id)).toBeNull();
  });

  it("per_item requires serving size; per_100g forbids it", async () => {
    await expect(
      saveFoodItem(db, makeFood({ unit_type: "per_item", serving_size_g: null })),
    ).rejects.toThrow("serving_size_g is required");
    await expect(
      saveFoodItem(db, makeFood({ unit_type: "per_100g", serving_size_g: 50 })),
    ).rejects.toThrow("should be null");
    // valid per_item passes the DB CHECK too
    const banana = makeFood({ unit_type: "per_item", serving_size_g: 118 });
    await saveFoodItem(db, banana);
    expect((await getFoodItem(db, banana.id))?.serving_size_g).toBe(118);
  });
});

describe("daily entry save/load invariants", () => {
  const date = "2024-06-02";

  it("delete+reinsert with meal_id grouping round-trip", async () => {
    const food1 = makeFood();
    const food2 = makeFood();
    await saveFoodItem(db, food1);
    await saveFoodItem(db, food2);

    // a meal template row so loadDailyEntry can resolve the name
    const mealId = randomUUID();
    await db.execute(
      sql`INSERT INTO meals (id, name) VALUES (${mealId}, ${"Test Breakfast"})`,
    );

    const daily: DailyData = {
      date,
      entries: [
        { kind: "food", entry: makeEntry(food1.id) },
        {
          kind: "meal",
          entry: {
            meal_id: mealId,
            meal_name: "Test Breakfast",
            portions: 1,
            ingredients: [
              makeEntry(food1.id, { entry_id: randomUUID() }),
              makeEntry(food2.id, { entry_id: randomUUID(), weight_g: 80 }),
            ],
          },
        },
      ],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    };

    await saveDailyEntry(db, daily);
    const loaded = await loadDailyEntry(db, date);
    expect(loaded).not.toBeNull();
    const foods = loaded!.entries.filter((e) => e.kind === "food");
    const mealsLoaded = loaded!.entries.filter((e) => e.kind === "meal");
    expect(foods).toHaveLength(1);
    expect(mealsLoaded).toHaveLength(1);
    expect(mealsLoaded[0].kind === "meal" && mealsLoaded[0].entry.meal_name).toBe(
      "Test Breakfast",
    );
    expect(mealsLoaded[0].kind === "meal" && mealsLoaded[0].entry.ingredients).toHaveLength(2);

    // resave (idempotent delete+reinsert)
    await saveDailyEntry(db, loaded!);
    const reloaded = await loadDailyEntry(db, date);
    expect(reloaded!.entries).toHaveLength(2);

    // summary totals computed: 150*3 = 450 kcal across three entry rows
    const summaries = await loadAllSummaries(db);
    const s = summaries.find((x) => x.date === date)!;
    expect(s.energy_kcal).toBe(450);
  });

  it("weights survive saveDailyEntry (weight independence)", async () => {
    await updateMeasurements(db, date, { morning_weight_kg: 70.5, evening_weight_kg: 71.2 });

    // re-save the day's entries — weights must be preserved
    const loaded = await loadDailyEntry(db, date);
    await saveDailyEntry(db, loaded!);

    const summaries = await loadAllSummaries(db);
    const s = summaries.find((x) => x.date === date)!;
    expect(s.morning_weight_kg).toBe(70.5);
    expect(s.evening_weight_kg).toBe(71.2);
  });

  it("emptying a day writes NULL nutrients, not 0 — and keeps weights", async () => {
    await saveDailyEntry(db, {
      date,
      entries: [],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    });
    const summaries = await loadAllSummaries(db);
    const s = summaries.find((x) => x.date === date)!;
    expect(s.energy_kcal).toBeNull(); // NULL, never 0
    expect(s.protein_g).toBeNull();
    expect(s.morning_weight_kg).toBe(70.5); // untouched
  });

  it("updateMeasurements: null clears, undefined leaves untouched", async () => {
    const d = "2024-06-04";
    await updateMeasurements(db, d, { morning_weight_kg: 70.1, evening_weight_kg: 71.1 });
    // explicit null clears morning; evening untouched (undefined)
    await updateMeasurements(db, d, { morning_weight_kg: null });
    const s = (await loadAllSummaries(db)).find((x) => x.date === d)!;
    expect(s.morning_weight_kg).toBeNull();
    expect(s.evening_weight_kg).toBe(71.1);
  });

  it("updateMeasurements only sets provided weights", async () => {
    const d = "2024-06-03";
    await updateMeasurements(db, d, { morning_weight_kg: 69.9 });
    let s = (await loadAllSummaries(db)).find((x) => x.date === d)!;
    expect(s.morning_weight_kg).toBe(69.9);
    expect(s.evening_weight_kg).toBeNull();
    expect(s.energy_kcal).toBeNull();

    // updating evening leaves morning intact
    await updateMeasurements(db, d, { evening_weight_kg: 70.7 });
    s = (await loadAllSummaries(db)).find((x) => x.date === d)!;
    expect(s.morning_weight_kg).toBe(69.9);
    expect(s.evening_weight_kg).toBe(70.7);
  });

  it("loadDailyEntry returns null only when no entries AND no summary", async () => {
    expect(await loadDailyEntry(db, "1999-01-01")).toBeNull();
    // weights-only day still loads
    const weightsOnly = await loadDailyEntry(db, "2024-06-03");
    expect(weightsOnly).not.toBeNull();
    expect(weightsOnly!.entries).toHaveLength(0);
    expect(weightsOnly!.measurements.morning_weight_kg).toBe(69.9);
  });

  it("getAllDates newest first", async () => {
    const food = makeFood();
    await saveFoodItem(db, food);
    for (const d of ["2024-07-01", "2024-07-03", "2024-07-02"]) {
      await saveDailyEntry(db, {
        date: d,
        entries: [{ kind: "food", entry: makeEntry(food.id, { entry_id: randomUUID() }) }],
        measurements: { morning_weight_kg: null, evening_weight_kg: null },
      });
    }
    const dates = await getAllDates(db);
    expect(dates.length).toBeGreaterThanOrEqual(3);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
    expect(dates.indexOf("2024-07-03")).toBeLessThan(dates.indexOf("2024-07-01"));
  });
});

describe("target stickiness chain", () => {
  it("defaults when nothing exists", async () => {
    const t = await getOrCreateDailyTargets(db, "2024-01-10");
    expect(t).toEqual(getDefaultTargets("2024-01-10"));
  });

  it("save → exact load; later date inherits with date rewritten", async () => {
    const targets = getDefaultTargets("2024-01-15");
    targets.values.energy_kcal = 2500;
    targets.modes.energy_kcal = "limit";
    await saveDailyTargets(db, targets);

    const loaded = await loadDailyTargets(db, "2024-01-15");
    expect(loaded?.values.energy_kcal).toBe(2500);
    expect(loaded?.modes.energy_kcal).toBe("limit");

    // stickiness: a later date with no row inherits the most recent earlier one
    const inherited = await getOrCreateDailyTargets(db, "2024-02-01");
    expect(inherited.date).toBe("2024-02-01"); // date rewritten
    expect(inherited.values.energy_kcal).toBe(2500);

    // earlier date falls through to defaults
    const before = await getOrCreateDailyTargets(db, "2024-01-01");
    expect(before.values.energy_kcal).toBe(2000);
  });

  it("upsert updates existing row", async () => {
    const t = await getOrCreateDailyTargets(db, "2024-01-15");
    t.values.protein_g = 180;
    await saveDailyTargets(db, t);
    const loaded = await loadDailyTargets(db, "2024-01-15");
    expect(loaded?.values.protein_g).toBe(180);
    expect(loaded?.values.energy_kcal).toBe(2500);
  });
});

describe("meal template CRUD", () => {
  it("saveMeal round-trip: upsert + ingredient replacement", async () => {
    const oats = makeFood({ name: "Crud Oats", energy_kcal: 400 });
    const milk = makeFood({ name: "Crud Milk", energy_kcal: 60 });
    await saveFoodItem(db, oats);
    await saveFoodItem(db, milk);

    const mealId = randomUUID();
    await saveMeal(db, {
      id: mealId,
      name: "Crud Breakfast",
      ingredients: [
        { food_id: oats.id, food_name: oats.name, weight_g: 50, quantity: null, nutrients: ZERO_NUTRIENTS },
      ],
    });
    let loaded = await getMeal(db, mealId);
    expect(loaded?.name).toBe("Crud Breakfast");
    expect(loaded?.ingredients).toHaveLength(1);
    expect(loaded?.ingredients[0].nutrients.energy_kcal).toBeCloseTo(200);

    // update: rename + replace ingredients
    await saveMeal(db, {
      id: mealId,
      name: "Crud Breakfast v2",
      ingredients: [
        { food_id: oats.id, food_name: oats.name, weight_g: 30, quantity: null, nutrients: ZERO_NUTRIENTS },
        { food_id: milk.id, food_name: milk.name, weight_g: 200, quantity: null, nutrients: ZERO_NUTRIENTS },
      ],
    });
    loaded = await getMeal(db, mealId);
    expect(loaded?.name).toBe("Crud Breakfast v2");
    expect(loaded?.ingredients).toHaveLength(2);
    expect(loaded?.ingredients[0].nutrients.energy_kcal).toBeCloseTo(120);
  });

  it("deleteMeal preserves logged entries as individual rows", async () => {
    const food = makeFood({ name: "Crud Toast" });
    await saveFoodItem(db, food);
    const mealId = randomUUID();
    await saveMeal(db, {
      id: mealId,
      name: "Crud Logged Meal",
      ingredients: [
        { food_id: food.id, food_name: food.name, weight_g: 40, quantity: null, nutrients: ZERO_NUTRIENTS },
      ],
    });
    // log the meal on a day
    const date = "2024-08-01";
    await saveDailyEntry(db, {
      date,
      entries: [
        {
          kind: "meal",
          entry: {
            meal_id: mealId,
            meal_name: "Crud Logged Meal",
            portions: 1,
            ingredients: [makeEntry(food.id, { entry_id: randomUUID(), weight_g: 40 })],
          },
        },
      ],
      measurements: { morning_weight_kg: null, evening_weight_kg: null },
    });

    expect(await deleteMeal(db, mealId)).toBe(true);
    expect(await getMeal(db, mealId)).toBeNull();

    // the day's entry survives, now as an individual food entry
    const day = await loadDailyEntry(db, date);
    expect(day?.entries).toHaveLength(1);
    expect(day?.entries[0].kind).toBe("food");
  });

  it("deleteMeal returns false for unknown id", async () => {
    expect(await deleteMeal(db, randomUUID())).toBe(false);
  });
});

describe("meals", () => {
  it("loads meal templates with scaled ingredient nutrients", async () => {
    const oats = makeFood({ name: "Meal Oats", energy_kcal: 389 });
    await saveFoodItem(db, oats);
    const mealId = randomUUID();
    await db.execute(
      sql`INSERT INTO meals (id, name) VALUES (${mealId}, ${"Overnight Oats"})`,
    );
    await db.execute(
      sql`INSERT INTO meal_ingredients (meal_id, food_id, weight_g) VALUES (${mealId}, ${oats.id}, ${50})`,
    );

    const meal = await getMeal(db, mealId);
    expect(meal?.name).toBe("Overnight Oats");
    expect(meal?.ingredients).toHaveLength(1);
    expect(meal?.ingredients[0].nutrients.energy_kcal).toBeCloseTo(194.5);

    const allMeals = await loadMeals(db);
    expect(allMeals.some((m) => m.id === mealId)).toBe(true);
  });
});
