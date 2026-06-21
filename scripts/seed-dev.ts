/**
 * Seed the LOCAL dev database with sample data for manual testing.
 *   DATABASE_URL=postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_db \
 *     npx tsx scripts/seed-dev.ts
 */
import { randomUUID } from "node:crypto";
import { db, sql } from "@/lib/db/client";
import { saveDailyEntry, saveFoodItem, updateMeasurements } from "@/lib/data/storage";
import { calculateNutrients } from "@/lib/domain/nutrients";
import type { FoodItem } from "@/lib/domain/types";

const FOODS: FoodItem[] = [
  {
    id: randomUUID(), name: "Porridge Oats", unit_type: "per_100g", serving_size_g: null,
    energy_kcal: 389, fat_g: 6.9, saturated_fat_g: 1.2, carbohydrates_g: 66.3,
    sugar_g: 0.99, protein_g: 16.9, fibre_g: 10.6, salt_g: 0.002, calcium_mg: 54,
  },
  {
    id: randomUUID(), name: "Banana", unit_type: "per_item", serving_size_g: 118,
    energy_kcal: 105, fat_g: 0.4, saturated_fat_g: 0.1, carbohydrates_g: 27,
    sugar_g: 14.4, protein_g: 1.3, fibre_g: 3.1, salt_g: 0, calcium_mg: 5.9,
  },
  {
    id: randomUUID(), name: "Chicken Breast", unit_type: "per_100g", serving_size_g: null,
    energy_kcal: 165, fat_g: 3.6, saturated_fat_g: 1, carbohydrates_g: 0,
    sugar_g: 0, protein_g: 31, fibre_g: 0, salt_g: 0.1, calcium_mg: 15,
  },
  {
    id: randomUUID(), name: "Whole Milk", unit_type: "per_100g", serving_size_g: null,
    energy_kcal: 64, fat_g: 3.5, saturated_fat_g: 2.3, carbohydrates_g: 4.7,
    sugar_g: 4.7, protein_g: 3.4, fibre_g: 0, salt_g: 0.1, calcium_mg: 120,
  },
];

async function main() {
  // Ensure a dev user exists and own all seeded data with it.
  await sql`INSERT INTO users (email, name) VALUES ('dev@example.com', 'Dev User') ON CONFLICT (email) DO NOTHING`;
  const [userRow] = await sql`SELECT id FROM users WHERE email = 'dev@example.com'`;
  const userId = userRow.id as string;

  for (const f of FOODS) await saveFoodItem(db, userId, f);
  console.log(`Seeded ${FOODS.length} foods`);

  // a meal template
  const mealId = randomUUID();
  await sql`INSERT INTO meals (id, user_id, name) VALUES (${mealId}, ${userId}, 'Oats & Banana') ON CONFLICT (user_id, name) DO NOTHING`;
  await sql`INSERT INTO meal_ingredients (meal_id, food_id, weight_g) VALUES (${mealId}, ${FOODS[0].id}, 60)`;
  await sql`INSERT INTO meal_ingredients (meal_id, food_id, quantity) VALUES (${mealId}, ${FOODS[1].id}, 1)`;
  console.log("Seeded 1 meal template");

  // ~60 days of history
  const today = new Date();
  for (let i = 60; i >= 1; i--) {
    const date = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const jitter = Math.sin(i / 5) * 150;
    const oatsW = 60 + (i % 3) * 10;
    const chickenW = 200 + jitter / 3;
    const milkW = 200;
    const entries = [FOODS[0], FOODS[2], FOODS[3]].map((food, idx) => {
      const w = [oatsW, chickenW, milkW][idx];
      return {
        kind: "food" as const,
        entry: {
          entry_id: randomUUID(),
          timestamp: `${date}T${String(8 + idx * 2).padStart(2, "0")}:00:00.000Z`,
          food_id: food.id,
          food_name: food.name,
          weight_g: w,
          quantity: null,
          nutrients: calculateNutrients(food, { weight_g: w }),
        },
      };
    });
    await saveDailyEntry(db, userId, { date, entries, measurements: { morning_weight_kg: null, evening_weight_kg: null } });
    await updateMeasurements(db, userId, date, {
      morning_weight_kg: 71 - i * 0.03 + Math.sin(i / 3) * 0.4,
      evening_weight_kg: 71.8 - i * 0.03 + Math.sin(i / 3) * 0.4,
    });
  }
  console.log("Seeded 60 days of entries + weights");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
