/**
 * Drizzle schema mirroring database/init.sql EXACTLY.
 *
 * IMPORTANT: This schema is documentation + query typing only. The production
 * database already exists and `updated_at` is maintained by DB triggers —
 * NEVER run drizzle-kit push/migrate against it. CHECK constraints live in
 * the DB (see init.sql); application code validates before insert.
 */
import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  timestamp,
  index,
  integer,
} from "drizzle-orm/pg-core";

/** DECIMAL(8,2) nutrient column helper (NOT NULL). */
const nutrient = (name: string) => numeric(name, { precision: 8, scale: 2 });

export const foodItems = pgTable(
  "food_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    unitType: varchar("unit_type", { length: 20 }).notNull().default("per_100g"),
    servingSizeG: numeric("serving_size_g", { precision: 8, scale: 2 }),
    energyKcal: nutrient("energy_kcal").notNull(),
    fatG: nutrient("fat_g").notNull(),
    saturatedFatG: nutrient("saturated_fat_g").notNull(),
    carbohydratesG: nutrient("carbohydrates_g").notNull(),
    sugarG: nutrient("sugar_g").notNull(),
    proteinG: nutrient("protein_g").notNull(),
    fibreG: nutrient("fibre_g").notNull(),
    saltG: nutrient("salt_g").notNull(),
    calciumMg: nutrient("calcium_mg").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_food_items_name").on(t.name)],
);

export const foodEntries = pgTable(
  "food_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryDate: date("entry_date").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    foodId: uuid("food_id").references(() => foodItems.id),
    mealId: uuid("meal_id").references(() => meals.id),
    /** Per-log meal instance id — groups one logged meal's ingredient rows. */
    mealLogId: uuid("meal_log_id"),
    /** Portions of the meal that were logged (e.g. 0.5). NULL for individual foods. */
    portions: numeric("portions", { precision: 8, scale: 2 }),
    weightG: numeric("weight_g", { precision: 8, scale: 2 }),
    quantity: numeric("quantity", { precision: 8, scale: 2 }),
    energyKcal: nutrient("energy_kcal").notNull(),
    fatG: nutrient("fat_g").notNull(),
    saturatedFatG: nutrient("saturated_fat_g").notNull(),
    carbohydratesG: nutrient("carbohydrates_g").notNull(),
    sugarG: nutrient("sugar_g").notNull(),
    proteinG: nutrient("protein_g").notNull(),
    fibreG: nutrient("fibre_g").notNull(),
    saltG: nutrient("salt_g").notNull(),
    calciumMg: nutrient("calcium_mg").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_food_entries_entry_date").on(t.entryDate),
    index("idx_food_entries_food_id").on(t.foodId),
    index("idx_food_entries_meal_id").on(t.mealId),
    index("idx_food_entries_meal_log_id").on(t.mealLogId),
  ],
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    summaryDate: date("summary_date").notNull().unique(),
    // Nutrients are NULLABLE: a day with no entries stores NULL (never 0),
    // and weights-only rows exist.
    energyKcal: nutrient("energy_kcal"),
    fatG: nutrient("fat_g"),
    saturatedFatG: nutrient("saturated_fat_g"),
    carbohydratesG: nutrient("carbohydrates_g"),
    sugarG: nutrient("sugar_g"),
    proteinG: nutrient("protein_g"),
    fibreG: nutrient("fibre_g"),
    saltG: nutrient("salt_g"),
    calciumMg: nutrient("calcium_mg"),
    morningWeightKg: numeric("morning_weight_kg", { precision: 5, scale: 2 }),
    eveningWeightKg: numeric("evening_weight_kg", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_daily_summaries_summary_date").on(t.summaryDate)],
);

export const dailyTargets = pgTable(
  "daily_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetDate: date("target_date").notNull().unique(),
    defaultMode: varchar("default_mode", { length: 10 }).notNull().default("target"),
    energyKcal: nutrient("energy_kcal").notNull().default("2000"),
    proteinG: nutrient("protein_g").notNull().default("150"),
    carbohydratesG: nutrient("carbohydrates_g").notNull().default("225"),
    fatG: nutrient("fat_g").notNull().default("67"),
    sugarG: nutrient("sugar_g").notNull().default("90"),
    saturatedFatG: nutrient("saturated_fat_g").notNull().default("20"),
    fibreG: nutrient("fibre_g").notNull().default("30"),
    saltG: nutrient("salt_g").notNull().default("6"),
    calciumMg: nutrient("calcium_mg").notNull().default("700"),
    energyMode: varchar("energy_mode", { length: 10 }),
    proteinMode: varchar("protein_mode", { length: 10 }),
    carbohydratesMode: varchar("carbohydrates_mode", { length: 10 }),
    fatMode: varchar("fat_mode", { length: 10 }),
    sugarMode: varchar("sugar_mode", { length: 10 }).default("limit"),
    saturatedFatMode: varchar("saturated_fat_mode", { length: 10 }).default("limit"),
    fibreMode: varchar("fibre_mode", { length: 10 }),
    saltMode: varchar("salt_mode", { length: 10 }).default("limit"),
    calciumMode: varchar("calcium_mode", { length: 10 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_daily_targets_target_date").on(t.targetDate)],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_meals_name").on(t.name)],
);

/**
 * Cross-day user settings — the first config table NOT keyed by date.
 * Single-row by design (the app is single-user): the DB enforces `id = 1` via a
 * CHECK constraint (see init.sql), and all app writes upsert on that fixed id.
 * Forward-compatible for roadmap #7 (target presets) via added nullable columns.
 */
export const userSettings = pgTable("user_settings", {
  id: integer("id").primaryKey().default(1),
  goalWeightKg: numeric("goal_weight_kg", { precision: 5, scale: 2 }),
  weeklyRateTargetKg: numeric("weekly_rate_target_kg", { precision: 4, scale: 2 }),
  startWeightKg: numeric("start_weight_kg", { precision: 5, scale: 2 }),
  startDate: date("start_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const mealIngredients = pgTable(
  "meal_ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mealId: uuid("meal_id").references(() => meals.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foodItems.id),
    weightG: numeric("weight_g", { precision: 8, scale: 2 }),
    quantity: numeric("quantity", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_meal_ingredients_meal_id").on(t.mealId),
    index("idx_meal_ingredients_food_id").on(t.foodId),
  ],
);
