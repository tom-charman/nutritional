import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb } from "../data/harness";
import type { DB } from "@/lib/data/storage";
import { loadDailyEntry, saveFoodItem, saveMeal } from "@/lib/data/storage";
import type { FoodItem, Meal } from "@/lib/domain/types";
import { ZERO_NUTRIENTS } from "@/lib/constants";

// The server actions resolve the current user via requireUserId(), which in the
// AUTH_DISABLED bypass maps to TEST_USER_EMAIL. Match the harness user's email
// (test@example.com) so actions and direct storage reads share the SAME user.
// These must be set BEFORE the action module (and its transitive user.ts, whose
// AUTH_DISABLED is captured at load) is imported — hence vi.hoisted.
vi.hoisted(() => {
  process.env.AUTH_DISABLED = "true";
  process.env.TEST_USER_EMAIL = "test@example.com";
  process.env.AUTHORIZED_EMAILS = "test@example.com";
});

// The server actions import a module-level db client and call revalidatePath.
// Point the client at a PGlite test db and no-op the cache revalidation.
const h = vi.hoisted(() => ({ db: undefined as unknown as DB }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return h.db;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// `server-only` is a no-op marker provided by the Next.js bundler; it is not a
// real installed package, so the action's requireUserId() import chain needs it
// stubbed under the plain Node test runtime.
vi.mock("server-only", () => ({}));
// lib/auth.ts instantiates NextAuth at module load, which pulls in next/server
// (unavailable under the plain Node runtime). requireUserId() only ever touches
// the pure allowlist helpers in the AUTH_DISABLED bypass, so stub the module
// with faithful reimplementations of those and a never-called auth().
vi.mock("@/lib/auth", () => {
  const parseAllowlist = (raw: string | undefined): Set<string> =>
    new Set(
      (raw ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && !e.startsWith("#")),
    );
  return {
    parseAllowlist,
    isAuthorizedEmail: (email: string | null | undefined) =>
      !!email && parseAllowlist(process.env.AUTHORIZED_EMAILS).has(email.trim().toLowerCase()),
    auth: async () => null,
  };
});

import {
  addFoodEntryAction,
  addMealEntryAction,
  copyDayEntriesAction,
  editMealPortionsAction,
  removeEntryAction,
  swapFoodEntryAction,
} from "@/app/actions/entry";

let close: () => Promise<void>;
let userId: string;

beforeAll(async () => {
  const t = await createTestDb();
  h.db = t.db;
  userId = t.userId;
  close = t.close;
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
    vitamin_c_mg: 5,
    ...partial,
  };
}

describe("copyDayEntriesAction", () => {
  it("clones a prior day with fresh ids, independent of the source", async () => {
    const food = makeFood({ name: "CopyOats", energy_kcal: 100 });
    await saveFoodItem(h.db, userId, food);

    const mealFood = makeFood({ name: "CopyChicken", energy_kcal: 200 });
    await saveFoodItem(h.db, userId, mealFood);
    const meal: Meal = {
      id: randomUUID(),
      name: "Dinner",
      yield_mode: "whole",
      yield_weight_g: null,
      yield_count: null,
      ingredients: [
        { food_id: mealFood.id, food_name: "CopyChicken", weight_g: 100, quantity: null, nutrients: { ...ZERO_NUTRIENTS } },
      ],
    };
    await saveMeal(h.db, userId, meal);

    const src = "2024-03-01";
    const dst = "2024-03-02"; // default source = day before dst
    await addFoodEntryAction(src, food.id, 150);
    await addMealEntryAction(src, meal.id, 1);

    const result = await copyDayEntriesAction(dst);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("2024-03-01");

    const source = await loadDailyEntry(h.db, userId, src);
    const target = await loadDailyEntry(h.db, userId, dst);
    expect(target!.entries).toHaveLength(2);

    // ids must NOT be shared between source and copy
    const idsOf = (d: typeof source) =>
      d!.entries.flatMap((e) =>
        e.kind === "food"
          ? [e.entry.entry_id]
          : [e.entry.meal_log_id, ...e.entry.ingredients.map((i) => i.entry_id)],
      );
    const shared = idsOf(source).filter((id) => idsOf(target).includes(id));
    expect(shared).toHaveLength(0);

    // amounts/nutrients carried over faithfully
    const copiedFood = target!.entries.find((e) => e.kind === "food");
    expect(copiedFood?.kind === "food" && copiedFood.entry.weight_g).toBe(150);

    // deleting a copied row must not touch the source day
    const copiedId = copiedFood?.kind === "food" ? copiedFood.entry.entry_id : "";
    await removeEntryAction(dst, { entryId: copiedId });
    expect((await loadDailyEntry(h.db, userId, src))!.entries).toHaveLength(2);
  });

  it("errors when the source day is empty", async () => {
    const result = await copyDayEntriesAction("2024-04-02", "2024-04-01");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Nothing to copy");
  });
});

describe("swapFoodEntryAction", () => {
  it("swaps a standalone food entry, recomputing nutrients and keeping the amount", async () => {
    const oats = makeFood({ name: "SwapOats", energy_kcal: 100 });
    const rice = makeFood({ name: "SwapRice", energy_kcal: 130 });
    await saveFoodItem(h.db, userId, oats);
    await saveFoodItem(h.db, userId, rice);

    const date = "2024-05-01";
    await addFoodEntryAction(date, oats.id, 200); // 200g → 200 kcal

    const day = await loadDailyEntry(h.db, userId, date);
    const entryId = day!.entries[0].kind === "food" ? day!.entries[0].entry.entry_id : "";

    const result = await swapFoodEntryAction(date, entryId, rice.id);
    expect(result.ok).toBe(true);

    const after = await loadDailyEntry(h.db, userId, date);
    const e = after!.entries[0];
    expect(e.kind === "food" && e.entry.food_name).toBe("SwapRice");
    expect(e.kind === "food" && e.entry.weight_g).toBe(200); // amount preserved
    expect(e.kind === "food" && e.entry.nutrients.energy_kcal).toBe(260); // 200g × 1.3
  });

  it("reinterprets the amount when the new food uses a different unit model", async () => {
    const oats = makeFood({ name: "Oats2", energy_kcal: 100 }); // per_100g
    const banana = makeFood({
      name: "Banana",
      unit_type: "per_item",
      serving_size_g: 100,
      energy_kcal: 90,
    });
    await saveFoodItem(h.db, userId, oats);
    await saveFoodItem(h.db, userId, banana);

    const date = "2024-05-02";
    await addFoodEntryAction(date, oats.id, 2); // weight_g = 2
    const day = await loadDailyEntry(h.db, userId, date);
    const entryId = day!.entries[0].kind === "food" ? day!.entries[0].entry.entry_id : "";

    await swapFoodEntryAction(date, entryId, banana.id);
    const after = await loadDailyEntry(h.db, userId, date);
    const e = after!.entries[0];
    // 2 now means quantity (2 bananas), not 2 grams
    expect(e.kind === "food" && e.entry.weight_g).toBeNull();
    expect(e.kind === "food" && e.entry.quantity).toBe(2);
    expect(e.kind === "food" && e.entry.nutrients.energy_kcal).toBe(180); // 2 × 90
  });

  it("swaps an ingredient inside a logged meal", async () => {
    const a = makeFood({ name: "IngA", energy_kcal: 100 });
    const b = makeFood({ name: "IngB", energy_kcal: 300 });
    await saveFoodItem(h.db, userId, a);
    await saveFoodItem(h.db, userId, b);
    const meal: Meal = {
      id: randomUUID(),
      name: "Bowl",
      yield_mode: "whole",
      yield_weight_g: null,
      yield_count: null,
      ingredients: [
        { food_id: a.id, food_name: "IngA", weight_g: 100, quantity: null, nutrients: { ...ZERO_NUTRIENTS } },
      ],
    };
    await saveMeal(h.db, userId, meal);

    const date = "2024-05-03";
    await addMealEntryAction(date, meal.id, 1);
    const day = await loadDailyEntry(h.db, userId, date);
    const mealEntry = day!.entries.find((e) => e.kind === "meal");
    const ingId =
      mealEntry?.kind === "meal" ? mealEntry.entry.ingredients[0].entry_id : "";

    const result = await swapFoodEntryAction(date, ingId, b.id);
    expect(result.ok).toBe(true);

    const after = await loadDailyEntry(h.db, userId, date);
    const m = after!.entries.find((e) => e.kind === "meal");
    expect(m?.kind === "meal" && m.entry.ingredients[0].food_name).toBe("IngB");
    expect(m?.kind === "meal" && m.entry.ingredients[0].nutrients.energy_kcal).toBe(300);
  });

  it("errors when the entry id is unknown", async () => {
    const food = makeFood();
    await saveFoodItem(h.db, userId, food);
    const result = await swapFoodEntryAction("2024-05-04", randomUUID(), food.id);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No entries");
  });
});

describe("addMealEntryAction — yield modes", () => {
  // A single ingredient at 100 kcal/100 g keeps the batch arithmetic obvious.
  async function seedYieldMeal(
    name: string,
    ingredientWeightG: number,
    yield_: Pick<Meal, "yield_mode" | "yield_weight_g" | "yield_count">,
  ): Promise<Meal> {
    const food = makeFood({ name: `${name}-food`, energy_kcal: 100 });
    await saveFoodItem(h.db, userId, food);
    const meal: Meal = {
      id: randomUUID(),
      name,
      ...yield_,
      ingredients: [
        {
          food_id: food.id,
          food_name: food.name,
          weight_g: ingredientWeightG,
          quantity: null,
          nutrients: { ...ZERO_NUTRIENTS, energy_kcal: ingredientWeightG },
        },
      ],
    };
    await saveMeal(h.db, userId, meal);
    return meal;
  }

  it("by_weight: logging a 150 g slice of a 1200 g batch scales to 12.5%", async () => {
    // 1200 g ingredient → 1200 kcal batch; finished weight 1200 g.
    const meal = await seedYieldMeal("Cake", 1200, {
      yield_mode: "by_weight",
      yield_weight_g: 1200,
      yield_count: null,
    });
    const date = "2024-07-01";
    const res = await addMealEntryAction(date, meal.id, 150);
    expect(res.ok).toBe(true);
    expect(res.message).toContain("150 g");

    const day = await loadDailyEntry(h.db, userId, date);
    const m = day!.entries.find((e) => e.kind === "meal");
    expect(m?.kind === "meal" && m.entry.portions).toBeCloseTo(0.125); // factor
    expect(m?.kind === "meal" && m.entry.consumed_amount).toBeCloseTo(150);
    expect(m?.kind === "meal" && m.entry.yield_mode).toBe("by_weight");
    expect(m?.kind === "meal" && m.entry.ingredients[0].weight_g).toBeCloseTo(150);
    expect(m?.kind === "meal" && m.entry.ingredients[0].nutrients.energy_kcal).toBeCloseTo(150);
  });

  it("by_count: logging 2 of 12 cookies scales to one sixth", async () => {
    // 600 g ingredient → 600 kcal batch; yields 12 cookies.
    const meal = await seedYieldMeal("Cookies", 600, {
      yield_mode: "by_count",
      yield_weight_g: null,
      yield_count: 12,
    });
    const date = "2024-07-02";
    const res = await addMealEntryAction(date, meal.id, 2);
    expect(res.ok).toBe(true);
    expect(res.message).toContain("×2");

    const day = await loadDailyEntry(h.db, userId, date);
    const m = day!.entries.find((e) => e.kind === "meal");
    expect(m?.kind === "meal" && m.entry.portions).toBeCloseTo(2 / 12);
    expect(m?.kind === "meal" && m.entry.consumed_amount).toBeCloseTo(2);
    expect(m?.kind === "meal" && m.entry.ingredients[0].nutrients.energy_kcal).toBeCloseTo(100);
  });

  it("editing the consumed amount rescales the logged meal", async () => {
    const meal = await seedYieldMeal("Stew", 1000, {
      yield_mode: "by_weight",
      yield_weight_g: 1000,
      yield_count: null,
    });
    const date = "2024-07-03";
    await addMealEntryAction(date, meal.id, 200); // 200 kcal
    let day = await loadDailyEntry(h.db, userId, date);
    let m = day!.entries.find((e) => e.kind === "meal");
    const logId = m?.kind === "meal" ? m.entry.meal_log_id : "";

    const res = await editMealPortionsAction(date, logId, 400); // double it
    expect(res.ok).toBe(true);

    day = await loadDailyEntry(h.db, userId, date);
    m = day!.entries.find((e) => e.kind === "meal");
    expect(m?.kind === "meal" && m.entry.consumed_amount).toBeCloseTo(400);
    expect(m?.kind === "meal" && m.entry.ingredients[0].nutrients.energy_kcal).toBeCloseTo(400);
  });

  it("whole meals are unchanged: portions stay the consumed amount", async () => {
    const meal = await seedYieldMeal("Plate", 100, {
      yield_mode: "whole",
      yield_weight_g: null,
      yield_count: null,
    });
    const date = "2024-07-04";
    const res = await addMealEntryAction(date, meal.id, 2); // 2 portions
    expect(res.ok).toBe(true);
    expect(res.message).toContain("2 portions");

    const day = await loadDailyEntry(h.db, userId, date);
    const m = day!.entries.find((e) => e.kind === "meal");
    expect(m?.kind === "meal" && m.entry.portions).toBe(2);
    expect(m?.kind === "meal" && m.entry.consumed_amount).toBe(2);
    expect(m?.kind === "meal" && m.entry.ingredients[0].nutrients.energy_kcal).toBeCloseTo(200);
  });
});
