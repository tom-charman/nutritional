/**
 * Reset E2E residue in nutritional_test:
 *  - rows on the reserved E2E dates (before any prod data exists)
 *  - any "E2E "-prefixed foods/meals
 * Leaves the realistic prod-copy data untouched. Used by global-setup (run
 * start) and by the reset-between-projects step (desktop → mobile).
 */
import postgres from "postgres";

const E2E_DATES = [
  "2024-01-10", "2024-01-11", "2024-01-12", "2024-01-13", "2024-01-14",
  "2024-01-15", "2024-01-16", "2024-01-17", "2024-01-18", "2024-01-19",
];

export async function resetE2EData(): Promise<void> {
  const sql = postgres(
    "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_test",
    { max: 1 },
  );
  try {
    await sql`DELETE FROM food_entries WHERE entry_date = ANY(${E2E_DATES}::date[])`;
    await sql`DELETE FROM daily_summaries WHERE summary_date = ANY(${E2E_DATES}::date[])`;
    await sql`DELETE FROM daily_targets WHERE target_date = ANY(${E2E_DATES}::date[])`;
    await sql`DELETE FROM food_entries WHERE food_id IN (SELECT id FROM food_items WHERE name LIKE 'E2E %')`;
    // Planner residue: plan items referencing E2E foods/meals (meal_id cascades
    // when the meal is dropped below, but food_id has no cascade — clear first).
    await sql`DELETE FROM meal_plan_items WHERE food_id IN (SELECT id FROM food_items WHERE name LIKE 'E2E %')`;
    await sql`DELETE FROM meal_plan_items WHERE meal_id IN (SELECT id FROM meals WHERE name LIKE 'E2E %')`;
    await sql`DELETE FROM meal_ingredients WHERE meal_id IN (SELECT id FROM meals WHERE name LIKE 'E2E %')`;
    await sql`DELETE FROM meal_ingredients WHERE food_id IN (SELECT id FROM food_items WHERE name LIKE 'E2E %')`;
    await sql`DELETE FROM food_entries WHERE meal_id IN (SELECT id FROM meals WHERE name LIKE 'E2E %')`;
    await sql`DELETE FROM meals WHERE name LIKE 'E2E %'`;
    await sql`DELETE FROM food_items WHERE name LIKE 'E2E %'`;
  } finally {
    await sql.end();
  }
}
