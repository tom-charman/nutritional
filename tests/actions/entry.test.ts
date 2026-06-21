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
