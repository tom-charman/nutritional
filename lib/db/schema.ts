/**
 * Drizzle schema mirroring database/init.sql EXACTLY.
 *
 * IMPORTANT: This schema is documentation + query typing only. The production
 * database already exists and `updated_at` is maintained by DB triggers —
 * NEVER run drizzle-kit push/migrate against it. CHECK constraints live in
 * the DB (see init.sql); application code validates before insert.
 *
 * MULTI-USER: every user-owned table carries `userId`. `food_items` is a shared
 * canonical set (`userId` NULL) plus each user's copy-on-write diff (`userId` =
 * them; `canonicalId` set only on an override of a canonical row).
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  boolean,
  smallint,
} from "drizzle-orm/pg-core";

/** DECIMAL(8,2) nutrient column helper (NOT NULL). */
const nutrient = (name: string) => numeric(name, { precision: 8, scale: 2 });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const foodItems = pgTable(
  "food_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = canonical/shared; otherwise the owning user. */
    userId: uuid("user_id").references(() => users.id),
    /** Set only on a user's override — the canonical row it shadows. */
    canonicalId: uuid("canonical_id"),
    name: varchar("name", { length: 255 }).notNull(),
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
  (t) => [
    index("idx_food_items_name").on(t.name),
    index("idx_food_items_user_id").on(t.userId),
    index("idx_food_items_canonical_id").on(t.canonicalId),
    // Canonical names unique among canonical rows; per-user names unique per user.
    uniqueIndex("food_items_canonical_name")
      .on(t.name)
      .where(sql`user_id IS NULL`),
    uniqueIndex("food_items_user_name")
      .on(t.userId, t.name)
      .where(sql`user_id IS NOT NULL`),
  ],
);

export const foodEntries = pgTable(
  "food_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
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
    /** Provenance: NULL/'manual' = hand-logged; 'plan' = materialised from a plan item. */
    source: varchar("source", { length: 10 }),
    /** The plan item this row was applied from — idempotency key + plan-vs-actual link. */
    planItemId: uuid("plan_item_id").references(() => mealPlanItems.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_food_entries_entry_date").on(t.entryDate),
    index("idx_food_entries_user_date").on(t.userId, t.entryDate),
    index("idx_food_entries_food_id").on(t.foodId),
    index("idx_food_entries_meal_id").on(t.mealId),
    index("idx_food_entries_meal_log_id").on(t.mealLogId),
    index("idx_food_entries_plan_item_id").on(t.planItemId),
  ],
);

export const dailySummaries = pgTable(
  "daily_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    summaryDate: date("summary_date").notNull(),
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
  (t) => [
    index("idx_daily_summaries_summary_date").on(t.summaryDate),
    uniqueIndex("daily_summaries_user_date").on(t.userId, t.summaryDate),
  ],
);

export const dailyTargets = pgTable(
  "daily_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    targetDate: date("target_date").notNull(),
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
  (t) => [
    index("idx_daily_targets_target_date").on(t.targetDate),
    uniqueIndex("daily_targets_user_date").on(t.userId, t.targetDate),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    // Yield mode (see init.sql check_meal_yield): 'whole' | 'by_weight' | 'by_count'.
    yieldMode: varchar("yield_mode", { length: 10 }).notNull().default("whole"),
    yieldWeightG: numeric("yield_weight_g", { precision: 8, scale: 2 }),
    yieldCount: numeric("yield_count", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_meals_user_id").on(t.userId),
    uniqueIndex("meals_user_name").on(t.userId, t.name),
  ],
);

/**
 * Cross-user settings — one row per user, keyed by `userId`. (Was a single-row
 * table fixed at `id = 1` in the single-user era; the prod migration performs
 * the PK swap for existing databases.)
 */
export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  goalWeightKg: numeric("goal_weight_kg", { precision: 5, scale: 2 }),
  weeklyRateTargetKg: numeric("weekly_rate_target_kg", { precision: 4, scale: 2 }),
  startWeightKg: numeric("start_weight_kg", { precision: 5, scale: 2 }),
  startDate: date("start_date"),
  hideWeeklyPanel: boolean("hide_weekly_panel").notNull().default(false),
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

/**
 * Weekly Planner. A plan is first-class data, SEPARATE from the logged
 * food_entries — the record of intent. One meal_plans row per (user, ISO week).
 */
export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Monday of the planned week (ISO week). */
    weekStart: date("week_start").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_meal_plans_user_id").on(t.userId),
    uniqueIndex("meal_plans_user_week").on(t.userId, t.weekStart),
  ],
);

/**
 * One planned item in a (day, slot) cell. References EITHER a meal template OR a
 * single food, never both (CHECK in the DB; app validates before insert).
 */
export const mealPlanItems = pgTable(
  "meal_plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => mealPlans.id, { onDelete: "cascade" }),
    /** Denormalised for direct scoping/indexes. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    planDate: date("plan_date").notNull(),
    /** breakfast | lunch | dinner | snack */
    slot: varchar("slot", { length: 10 }).notNull(),
    /** Stable order within a slot. */
    position: smallint("position").notNull().default(0),
    mealId: uuid("meal_id").references(() => meals.id, { onDelete: "cascade" }),
    foodId: uuid("food_id").references(() => foodItems.id),
    portions: numeric("portions", { precision: 8, scale: 2 }),
    weightG: numeric("weight_g", { precision: 8, scale: 2 }),
    quantity: numeric("quantity", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_meal_plan_items_plan_id").on(t.planId),
    index("idx_meal_plan_items_user_date").on(t.userId, t.planDate),
  ],
);
