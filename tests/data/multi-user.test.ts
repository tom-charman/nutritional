/**
 * Multi-user isolation — the core guarantee of the per-user data model.
 *
 * Two users (A from the harness, B created here) must never see each other's
 * tracking data, while a shared CANONICAL food (user_id NULL) is visible to
 * both, and a user's edit of a canonical food is a private copy-on-write
 * override that the other user never sees.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createTestDb } from "./harness";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/data/storage";
import {
  getAllDates,
  loadAllSummaries,
  loadDailyEntry,
  loadFoodDatabase,
  loadMeals,
  loadUserSettings,
  saveDailyEntry,
  saveMeal,
  saveFoodItem,
  saveUserSettings,
  updateMeasurements,
} from "@/lib/data/storage";
import { ZERO_NUTRIENTS } from "@/lib/constants";
import type { DailyData, FoodItem, Meal } from "@/lib/domain/types";

let db: DB;
let userA: string; // seeded by the harness
let userB: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, userId: userA, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

beforeEach(async () => {
  // Wipe everything except the harness user A; recreate user B fresh per test.
  await db.execute(sql`DELETE FROM food_entries`);
  await db.execute(sql`DELETE FROM daily_summaries`);
  await db.execute(sql`DELETE FROM daily_targets`);
  await db.execute(sql`DELETE FROM meal_ingredients`);
  await db.execute(sql`DELETE FROM meals`);
  await db.execute(sql`DELETE FROM food_items`);
  await db.execute(sql`DELETE FROM user_settings`);
  await db.execute(sql`DELETE FROM users WHERE email <> 'test@example.com'`);
  const [b] = await db
    .insert(schema.users)
    .values({ email: "b@example.com", name: "User B" })
    .returning({ id: schema.users.id });
  userB = b.id;
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

/** Insert a shared canonical food (user_id NULL) directly. Returns its id. */
async function insertCanonicalFood(name: string, energy = 100): Promise<string> {
  const [r] = await db
    .insert(schema.foodItems)
    .values({
      userId: null,
      canonicalId: null,
      name,
      unitType: "per_100g",
      servingSizeG: null,
      energyKcal: String(energy),
      fatG: "5",
      saturatedFatG: "1",
      carbohydratesG: "10",
      sugarG: "2",
      proteinG: "8",
      fibreG: "3",
      saltG: "0.5",
      calciumMg: "50",
    })
    .returning({ id: schema.foodItems.id });
  return r.id;
}

function dayWith(foodId: string, date: string): DailyData {
  return {
    date,
    entries: [
      {
        kind: "food",
        entry: {
          entry_id: randomUUID(),
          timestamp: `${date}T08:00:00.000Z`,
          food_id: foodId,
          food_name: "x",
          weight_g: 150,
          quantity: null,
          nutrients: { ...ZERO_NUTRIENTS, energy_kcal: 150 },
        },
      },
    ],
    measurements: { morning_weight_kg: null, evening_weight_kg: null },
  };
}

describe("multi-user isolation", () => {
  it("user B sees none of user A's tracking data", async () => {
    const canonical = await insertCanonicalFood("Oats");
    const date = "2024-03-01";
    await saveDailyEntry(db, userA, dayWith(canonical, date));
    await updateMeasurements(db, userA, date, { morning_weight_kg: 80 });
    await saveUserSettings(db, userA, {
      goal_weight_kg: 75,
      weekly_rate_target_kg: -0.5,
      start_weight_kg: 82,
      start_date: date,
      hide_weekly_panel: false,
    });

    // A has the data...
    expect(await loadDailyEntry(db, userA, date)).not.toBeNull();
    expect(await loadAllSummaries(db, userA)).toHaveLength(1);
    expect(await getAllDates(db, userA)).toEqual([date]);
    expect((await loadUserSettings(db, userA)).goal_weight_kg).toBe(75);

    // ...B sees none of it.
    expect(await loadDailyEntry(db, userB, date)).toBeNull();
    expect(await loadAllSummaries(db, userB)).toHaveLength(0);
    expect(await getAllDates(db, userB)).toHaveLength(0);
    expect((await loadUserSettings(db, userB)).goal_weight_kg).toBeNull();
  });

  it("a canonical food is shared, but a private add is not", async () => {
    await insertCanonicalFood("Shared Banana");
    await saveFoodItem(db, userB, makeFood({ name: "B Secret Snack" }));

    const aFoods = (await loadFoodDatabase(db, userA)).map((f) => f.name);
    const bFoods = (await loadFoodDatabase(db, userB)).map((f) => f.name);

    expect(aFoods).toContain("Shared Banana");
    expect(bFoods).toContain("Shared Banana");
    expect(bFoods).toContain("B Secret Snack");
    expect(aFoods).not.toContain("B Secret Snack");
  });

  it("editing a canonical food is a private copy-on-write override", async () => {
    const canonical = await insertCanonicalFood("Shared Oats", 100);

    // B edits the canonical food to 200 kcal.
    await saveFoodItem(db, userB, {
      ...makeFood({ name: "Shared Oats", energy_kcal: 200 }),
      id: canonical,
    });

    const aOats = (await loadFoodDatabase(db, userA)).filter((f) => f.name === "Shared Oats");
    const bOats = (await loadFoodDatabase(db, userB)).filter((f) => f.name === "Shared Oats");

    // A still sees the untouched canonical; B sees exactly one row — the override.
    expect(aOats).toHaveLength(1);
    expect(aOats[0].energy_kcal).toBe(100);
    expect(bOats).toHaveLength(1);
    expect(bOats[0].energy_kcal).toBe(200);
  });

  it("both users can own a meal and a summary with the same name/date", async () => {
    const canonical = await insertCanonicalFood("Egg");
    const date = "2024-03-02";
    const breakfast = (owner: string): Meal => ({
      id: randomUUID(),
      name: "Breakfast",
      yield_mode: "whole",
      yield_weight_g: null,
      yield_count: null,
      ingredients: [
        {
          food_id: canonical,
          food_name: "Egg",
          weight_g: 100,
          quantity: null,
          nutrients: { ...ZERO_NUTRIENTS, energy_kcal: 100 },
        },
      ],
    });

    // Composite (user_id, name) / (user_id, date) uniqueness lets both coexist.
    await expect(saveMeal(db, userA, breakfast(userA))).resolves.not.toThrow();
    await expect(saveMeal(db, userB, breakfast(userB))).resolves.not.toThrow();
    await saveDailyEntry(db, userA, dayWith(canonical, date));
    await saveDailyEntry(db, userB, dayWith(canonical, date));

    expect(await loadMeals(db, userA)).toHaveLength(1);
    expect(await loadMeals(db, userB)).toHaveLength(1);
    expect(await loadAllSummaries(db, userA)).toHaveLength(1);
    expect(await loadAllSummaries(db, userB)).toHaveLength(1);
  });
});
