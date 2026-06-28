import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, isNull } from "drizzle-orm";
import { createTestDb } from "./harness";
import type { DB } from "@/lib/data/storage";
import * as schema from "@/lib/db/schema";
import { collectAllUserData, deleteAllUserData } from "@/lib/data/gdpr";

const {
  users,
  foodItems,
  foodEntries,
  dailySummaries,
  dailyTargets,
  meals,
  mealIngredients,
  mealPlans,
  mealPlanItems,
} = schema;

const ZERO = {
  energyKcal: "0",
  fatG: "0",
  saturatedFatG: "0",
  carbohydratesG: "0",
  sugarG: "0",
  proteinG: "0",
  fibreG: "0",
  saltG: "0",
  calciumMg: "0",
  vitaminCMg: "0",
} as const;

let db: DB;
let userId: string; // the user under test (test@example.com)
let otherId: string;
let canonicalFoodId: string;
let close: () => Promise<void>;

/** Seed one full set of personal data for `uid`; returns the user's food id. */
async function seedUser(uid: string): Promise<string> {
  const [food] = await db
    .insert(foodItems)
    .values({ userId: uid, name: `Food ${uid.slice(0, 8)}`, ...ZERO })
    .returning({ id: foodItems.id });

  await db.insert(foodEntries).values({
    userId: uid,
    entryDate: "2024-02-01",
    timestamp: new Date("2024-02-01T08:00:00Z"),
    foodId: food.id,
    ...ZERO,
  });
  await db
    .insert(dailySummaries)
    .values({ userId: uid, summaryDate: "2024-02-01", morningWeightKg: "80" });
  await db.insert(dailyTargets).values({ userId: uid, targetDate: "2024-02-01" });

  const [meal] = await db
    .insert(meals)
    .values({ userId: uid, name: `Meal ${uid.slice(0, 8)}` })
    .returning({ id: meals.id });
  await db
    .insert(mealIngredients)
    .values({ mealId: meal.id, foodId: food.id, weightG: "100" });

  const [plan] = await db
    .insert(mealPlans)
    .values({ userId: uid, weekStart: "2024-01-29" })
    .returning({ id: mealPlans.id });
  await db.insert(mealPlanItems).values({
    planId: plan.id,
    userId: uid,
    planDate: "2024-02-01",
    slot: "breakfast",
    foodId: food.id,
    weightG: "100",
  });
  return food.id;
}

beforeAll(async () => {
  ({ db, userId, close } = await createTestDb());
  const [other] = await db
    .insert(users)
    .values({ email: "other@example.com", name: "Other" })
    .returning({ id: users.id });
  otherId = other.id;

  // Shared canonical food — app data, NOT owned by any user.
  const [canon] = await db
    .insert(foodItems)
    .values({ userId: null, name: "Canonical Apple", ...ZERO })
    .returning({ id: foodItems.id });
  canonicalFoodId = canon.id;

  await seedUser(userId);
  await seedUser(otherId);
});

afterAll(async () => {
  await close();
});

describe("collectAllUserData", () => {
  it("gathers the user's own rows only, excluding canonical foods and other users", async () => {
    const data = await collectAllUserData(db, userId);

    expect((data.account as { id: string }).id).toBe(userId);
    expect(data.foodEntries).toHaveLength(1);
    expect(data.dailySummaries).toHaveLength(1);
    expect(data.dailyTargets).toHaveLength(1);
    expect(data.meals).toHaveLength(1);
    expect(data.mealIngredients).toHaveLength(1);
    expect(data.mealPlans).toHaveLength(1);
    expect(data.mealPlanItems).toHaveLength(1);

    // Only the user's own food — never the canonical row.
    expect(data.foodItems).toHaveLength(1);
    const ids = (data.foodItems as { id: string }[]).map((f) => f.id);
    expect(ids).not.toContain(canonicalFoodId);
  });
});

describe("deleteAllUserData", () => {
  it("erases every personal row, leaving canonical foods and other users intact", async () => {
    const summary = await deleteAllUserData(db, userId);

    // Reported counts.
    expect(summary.users).toBe(1);
    expect(summary.food_entries).toBe(1);
    expect(summary.meals).toBe(1);
    expect(summary.food_items).toBe(1);

    // The user and all their data are gone.
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(
      await db.select().from(foodEntries).where(eq(foodEntries.userId, userId)),
    ).toHaveLength(0);
    expect(await db.select().from(meals).where(eq(meals.userId, userId))).toHaveLength(0);
    expect(
      await db.select().from(mealPlanItems).where(eq(mealPlanItems.userId, userId)),
    ).toHaveLength(0);

    // Canonical food survives.
    expect(
      await db.select().from(foodItems).where(eq(foodItems.id, canonicalFoodId)),
    ).toHaveLength(1);
    // It is still canonical (user_id IS NULL).
    expect(await db.select().from(foodItems).where(isNull(foodItems.userId))).toHaveLength(1);

    // The other user is untouched.
    expect(await db.select().from(users).where(eq(users.id, otherId))).toHaveLength(1);
    expect(
      await db.select().from(foodEntries).where(eq(foodEntries.userId, otherId)),
    ).toHaveLength(1);
    expect(await db.select().from(meals).where(eq(meals.userId, otherId))).toHaveLength(1);
  });
});
