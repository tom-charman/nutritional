/**
 * GDPR data-subject machinery: gather and erase ALL of one user's personal
 * data. Both take a Drizzle database so the same code runs against postgres.js
 * in the app and PGlite in tests.
 *
 * SCOPE NOTE: canonical food_items (user_id IS NULL) are shared app reference
 * data, NOT personal data — they are deliberately excluded from both the export
 * and the deletion. Only a user's OWN food rows (their additions and overrides)
 * are theirs.
 */
import { eq, inArray } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/data/storage";

const {
  users,
  userSettings,
  foodItems,
  foodEntries,
  dailySummaries,
  dailyTargets,
  meals,
  mealIngredients,
  mealPlans,
  mealPlanItems,
} = schema;

/** Everything we hold about a user, keyed by table — the portability export. */
export interface UserDataExport {
  exportedFor: string; // userId
  account: unknown;
  settings: unknown;
  foodItems: unknown[]; // the user's OWN foods only (canonical excluded)
  foodEntries: unknown[];
  dailySummaries: unknown[];
  dailyTargets: unknown[];
  meals: unknown[];
  mealIngredients: unknown[];
  mealPlans: unknown[];
  mealPlanItems: unknown[];
}

/** Collect every personal-data row for `userId` (canonical foods excluded). */
export async function collectAllUserData(
  db: DB,
  userId: string,
): Promise<UserDataExport> {
  const [account] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const ownFoodItems = await db
    .select()
    .from(foodItems)
    .where(eq(foodItems.userId, userId));
  const userMeals = await db.select().from(meals).where(eq(meals.userId, userId));
  const mealIds = userMeals.map((m) => m.id);
  const ingredients = mealIds.length
    ? await db
        .select()
        .from(mealIngredients)
        .where(inArray(mealIngredients.mealId, mealIds))
    : [];

  return {
    exportedFor: userId,
    account: account ?? null,
    settings: settings ?? null,
    foodItems: ownFoodItems,
    foodEntries: await db
      .select()
      .from(foodEntries)
      .where(eq(foodEntries.userId, userId)),
    dailySummaries: await db
      .select()
      .from(dailySummaries)
      .where(eq(dailySummaries.userId, userId)),
    dailyTargets: await db
      .select()
      .from(dailyTargets)
      .where(eq(dailyTargets.userId, userId)),
    meals: userMeals,
    mealIngredients: ingredients,
    mealPlans: await db
      .select()
      .from(mealPlans)
      .where(eq(mealPlans.userId, userId)),
    mealPlanItems: await db
      .select()
      .from(mealPlanItems)
      .where(eq(mealPlanItems.userId, userId)),
  };
}

/** Per-table counts of rows removed by deleteAllUserData. */
export type DeletionSummary = Record<string, number>;

/**
 * Permanently erase all of a user's personal data, in FK-safe order, inside one
 * transaction. Canonical food_items are never touched. privacy_requests are
 * deliberately retained (accountability record) and are NOT deleted here.
 *
 * The app's FKs only cascade for meal_ingredients (via meals), meal_plan_items
 * (via meal_plans) and user_settings (via users); everything else is deleted
 * explicitly. Order matters: rows that REFERENCE another table go first.
 */
export async function deleteAllUserData(
  db: DB,
  userId: string,
): Promise<DeletionSummary> {
  return db.transaction(async (tx) => {
    const summary: DeletionSummary = {};
    const del = async (
      label: string,
      run: () => Promise<{ id: string }[]>,
    ) => {
      summary[label] = (await run()).length;
    };

    // 1. food_entries — references meals, food_items and meal_plan_items.
    await del("food_entries", () =>
      tx
        .delete(foodEntries)
        .where(eq(foodEntries.userId, userId))
        .returning({ id: foodEntries.id }),
    );
    // 2. meal_plans — cascades meal_plan_items.
    await del("meal_plans", () =>
      tx
        .delete(mealPlans)
        .where(eq(mealPlans.userId, userId))
        .returning({ id: mealPlans.id }),
    );
    // 3. meal_plan_items — sweep any not removed by the cascade above.
    await del("meal_plan_items", () =>
      tx
        .delete(mealPlanItems)
        .where(eq(mealPlanItems.userId, userId))
        .returning({ id: mealPlanItems.id }),
    );
    // 4 & 5. daily aggregates / targets.
    await del("daily_summaries", () =>
      tx
        .delete(dailySummaries)
        .where(eq(dailySummaries.userId, userId))
        .returning({ id: dailySummaries.id }),
    );
    await del("daily_targets", () =>
      tx
        .delete(dailyTargets)
        .where(eq(dailyTargets.userId, userId))
        .returning({ id: dailyTargets.id }),
    );
    // 6. meals — cascades meal_ingredients.
    await del("meals", () =>
      tx
        .delete(meals)
        .where(eq(meals.userId, userId))
        .returning({ id: meals.id }),
    );
    // 7. food_items — the user's OWN rows only (canonical user_id IS NULL stays).
    await del("food_items", () =>
      tx
        .delete(foodItems)
        .where(eq(foodItems.userId, userId))
        .returning({ id: foodItems.id }),
    );
    // 8. user_settings (PK is user_id; would cascade, deleted explicitly).
    await del("user_settings", () =>
      tx
        .delete(userSettings)
        .where(eq(userSettings.userId, userId))
        .returning({ id: userSettings.userId }),
    );
    // 9. the account row, last.
    await del("users", () =>
      tx.delete(users).where(eq(users.id, userId)).returning({ id: users.id }),
    );

    return summary;
  });
}
