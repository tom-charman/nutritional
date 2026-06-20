import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "./harness";
import type { DB } from "@/lib/data/storage";
import { loadRecentFoods, saveDailyEntry, saveFoodItem } from "@/lib/data/storage";
import type { DailyData, FoodItem } from "@/lib/domain/types";
import { ZERO_NUTRIENTS } from "@/lib/constants";

// Isolated db: loadRecentFoods reads across ALL dates, so it must not share
// state with the broader storage suite.
let db: DB;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});

afterAll(async () => {
  await close();
});

function makeFood(name: string): FoodItem {
  return {
    id: randomUUID(),
    name,
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
  };
}

/** Log `foodIds` (each occurrence = one entry) on `date`, replacing that day. */
async function logDay(date: string, foodIds: string[]): Promise<void> {
  const daily: DailyData = {
    date,
    entries: foodIds.map((food_id) => ({
      kind: "food" as const,
      entry: {
        entry_id: randomUUID(),
        timestamp: `${date}T08:00:00.000Z`,
        food_id,
        food_name: "x",
        weight_g: 100,
        quantity: null,
        nutrients: { ...ZERO_NUTRIENTS, energy_kcal: 100 },
      },
    })),
    measurements: { morning_weight_kg: null, evening_weight_kg: null },
  };
  await saveDailyEntry(db, daily);
}

describe("loadRecentFoods", () => {
  it("ranks by recency first, then frequency, and de-dupes foods", async () => {
    const oats = makeFood("Oats");
    const chicken = makeFood("Chicken");
    const rice = makeFood("Rice");
    const eggs = makeFood("Eggs");
    const milk = makeFood("Milk");
    for (const f of [oats, chicken, rice, eggs, milk]) await saveFoodItem(db, f);

    // Recency: rice is oldest but most frequent; oats is the most recent.
    await logDay("2024-01-01", [rice.id, rice.id, rice.id]); // 3× oldest
    await logDay("2024-01-02", [chicken.id]);
    await logDay("2024-01-03", [oats.id]); // most recent
    // Frequency tiebreak: eggs & milk share the newest date; milk logged twice.
    await logDay("2024-01-04", [eggs.id, milk.id, milk.id]);

    const recents = await loadRecentFoods(db);
    const order = recents.map((f) => f.name);

    // milk & eggs (newest date) lead; milk first on the frequency tiebreak.
    expect(order.slice(0, 2)).toEqual(["Milk", "Eggs"]);
    // recency dominates frequency: oats/chicken precede the more-frequent rice.
    expect(order.indexOf("Oats")).toBeLessThan(order.indexOf("Rice"));
    expect(order.indexOf("Chicken")).toBeLessThan(order.indexOf("Rice"));
    // each food appears exactly once despite multiple logs
    expect(new Set(order).size).toBe(order.length);
    expect(order).toEqual(["Milk", "Eggs", "Oats", "Chicken", "Rice"]);
  });

  it("honours the limit", async () => {
    const recents = await loadRecentFoods(db, 2);
    expect(recents).toHaveLength(2);
    expect(recents.map((f) => f.name)).toEqual(["Milk", "Eggs"]);
  });

  it("returns nutrients as numbers, not decimal strings", async () => {
    const [first] = await loadRecentFoods(db, 1);
    expect(typeof first.energy_kcal).toBe("number");
  });
});
