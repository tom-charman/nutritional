-- Nutritional Tracker Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Food items reference table
CREATE TABLE IF NOT EXISTS food_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    unit_type VARCHAR(20) NOT NULL DEFAULT 'per_100g' CHECK (unit_type IN ('per_100g', 'per_item')),
    serving_size_g DECIMAL(8,2),  -- Required when unit_type = 'per_item', represents weight of one item
    energy_kcal DECIMAL(8,2) NOT NULL,
    fat_g DECIMAL(8,2) NOT NULL,
    saturated_fat_g DECIMAL(8,2) NOT NULL,
    carbohydrates_g DECIMAL(8,2) NOT NULL,
    sugar_g DECIMAL(8,2) NOT NULL,
    protein_g DECIMAL(8,2) NOT NULL,
    fibre_g DECIMAL(8,2) NOT NULL,
    salt_g DECIMAL(8,2) NOT NULL,
    calcium_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_serving_size CHECK (
        (unit_type = 'per_item' AND serving_size_g IS NOT NULL) OR
        (unit_type = 'per_100g' AND serving_size_g IS NULL)
    )
);

-- Individual food entries (history)
CREATE TABLE IF NOT EXISTS food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    food_id UUID REFERENCES food_items(id),
    weight_g DECIMAL(8,2),  -- For per_100g items
    quantity DECIMAL(8,2),  -- For per_item items (e.g., 1.5 bananas)
    energy_kcal DECIMAL(8,2) NOT NULL,
    fat_g DECIMAL(8,2) NOT NULL,
    saturated_fat_g DECIMAL(8,2) NOT NULL,
    carbohydrates_g DECIMAL(8,2) NOT NULL,
    sugar_g DECIMAL(8,2) NOT NULL,
    protein_g DECIMAL(8,2) NOT NULL,
    fibre_g DECIMAL(8,2) NOT NULL,
    salt_g DECIMAL(8,2) NOT NULL,
    calcium_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily summaries (main app data source)
CREATE TABLE IF NOT EXISTS daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_date DATE NOT NULL UNIQUE,
    energy_kcal DECIMAL(8,2),
    fat_g DECIMAL(8,2),
    saturated_fat_g DECIMAL(8,2),
    carbohydrates_g DECIMAL(8,2),
    sugar_g DECIMAL(8,2),
    protein_g DECIMAL(8,2),
    fibre_g DECIMAL(8,2),
    salt_g DECIMAL(8,2),
    calcium_mg DECIMAL(8,2),
    morning_weight_kg DECIMAL(5,2),
    evening_weight_kg DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily targets (nutritional goals/limits)
CREATE TABLE IF NOT EXISTS daily_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_date DATE NOT NULL UNIQUE,
    default_mode VARCHAR(10) NOT NULL DEFAULT 'target' CHECK (default_mode IN ('target', 'limit')),
    -- Target values
    energy_kcal DECIMAL(8,2) NOT NULL DEFAULT 2000,
    protein_g DECIMAL(8,2) NOT NULL DEFAULT 150,
    carbohydrates_g DECIMAL(8,2) NOT NULL DEFAULT 225,
    fat_g DECIMAL(8,2) NOT NULL DEFAULT 67,
    sugar_g DECIMAL(8,2) NOT NULL DEFAULT 90,
    saturated_fat_g DECIMAL(8,2) NOT NULL DEFAULT 20,
    fibre_g DECIMAL(8,2) NOT NULL DEFAULT 30,
    salt_g DECIMAL(8,2) NOT NULL DEFAULT 6,
    calcium_mg DECIMAL(8,2) NOT NULL DEFAULT 700,
    -- Per-nutrient mode overrides (NULL = use default_mode)
    energy_mode VARCHAR(10) CHECK (energy_mode IN ('target', 'limit')),
    protein_mode VARCHAR(10) CHECK (protein_mode IN ('target', 'limit')),
    carbohydrates_mode VARCHAR(10) CHECK (carbohydrates_mode IN ('target', 'limit')),
    fat_mode VARCHAR(10) CHECK (fat_mode IN ('target', 'limit')),
    sugar_mode VARCHAR(10) CHECK (sugar_mode IN ('target', 'limit')) DEFAULT 'limit',
    saturated_fat_mode VARCHAR(10) CHECK (saturated_fat_mode IN ('target', 'limit')) DEFAULT 'limit',
    fibre_mode VARCHAR(10) CHECK (fibre_mode IN ('target', 'limit')),
    salt_mode VARCHAR(10) CHECK (salt_mode IN ('target', 'limit')) DEFAULT 'limit',
    calcium_mode VARCHAR(10) CHECK (calcium_mode IN ('target', 'limit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meal templates
CREATE TABLE IF NOT EXISTS meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meal ingredients (links meals to foods with amounts)
CREATE TABLE IF NOT EXISTS meal_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    food_id UUID REFERENCES food_items(id),
    -- Amount consumed (one of these should be set)
    weight_g DECIMAL(8,2),
    quantity DECIMAL(8,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_meal_ingredient_amount CHECK (
        (weight_g IS NOT NULL AND quantity IS NULL) OR
        (weight_g IS NULL AND quantity IS NOT NULL)
    )
);

-- Add meal_id column to food_entries for linking to meals (if not exists)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='food_entries' AND column_name='meal_id') THEN
        ALTER TABLE food_entries ADD COLUMN meal_id UUID REFERENCES meals(id);
    END IF;
END $$;

-- Persist a logged meal's portion count and a per-log instance id (if not exists).
-- portions: how many portions of the meal were eaten (e.g. 0.5). Was previously
--   discarded on save and reset to 1 on reload, misrepresenting intake.
-- meal_log_id: groups the ingredient rows of ONE logged meal, so the same meal
--   eaten twice in a day stays as two separate entries instead of merging.
-- Both NULL for individual food rows (and for legacy meal rows, which fall back
-- to grouping by meal_id with portions defaulting to 1).
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS portions DECIMAL(8,2);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS meal_log_id UUID;

-- Cross-day user settings (the first config table NOT keyed by date).
-- Single-row by design (single-user app): a fixed id + CHECK makes a second row
-- impossible; app writes always upsert on id = 1. The seed INSERT is idempotent
-- (ON CONFLICT DO NOTHING) so re-applying init.sql never clobbers edited values.
-- Foundation for goal weight + projection (#9) and, later, target presets (#7).
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    goal_weight_kg DECIMAL(5,2),            -- NULL = no goal set
    weekly_rate_target_kg DECIMAL(4,2),     -- signed: negative = cut; NULL = no target
    start_weight_kg DECIMAL(5,2),
    start_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO user_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_food_entries_entry_date ON food_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_food_entries_food_id ON food_entries(food_id);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_id ON food_entries(meal_id);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_log_id ON food_entries(meal_log_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_summary_date ON daily_summaries(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_targets_target_date ON daily_targets(target_date);
CREATE INDEX IF NOT EXISTS idx_food_items_name ON food_items(name);
CREATE INDEX IF NOT EXISTS idx_meals_name ON meals(name);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal_id ON meal_ingredients(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_ingredients_food_id ON meal_ingredients(food_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to all tables
DROP TRIGGER IF EXISTS update_food_items_updated_at ON food_items;
CREATE TRIGGER update_food_items_updated_at BEFORE UPDATE ON food_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_food_entries_updated_at ON food_entries;
CREATE TRIGGER update_food_entries_updated_at BEFORE UPDATE ON food_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_summaries_updated_at ON daily_summaries;
CREATE TRIGGER update_daily_summaries_updated_at BEFORE UPDATE ON daily_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_daily_targets_updated_at ON daily_targets;
CREATE TRIGGER update_daily_targets_updated_at BEFORE UPDATE ON daily_targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meals_updated_at ON meals;
CREATE TRIGGER update_meals_updated_at BEFORE UPDATE ON meals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meal_ingredients_updated_at ON meal_ingredients;
CREATE TRIGGER update_meal_ingredients_updated_at BEFORE UPDATE ON meal_ingredients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant the application role access to EVERY object in the schema.
--
-- WHY THIS EXISTS: in production this file is applied as the `postgres`
-- superuser (deploy/README + db.sh), so any table created here is owned by
-- `postgres` and is INVISIBLE to the app role `nutritional_user` until granted
-- — a missing grant on a newly-added table 500s the whole app. (Locally the
-- docker entrypoint runs this AS nutritional_user, so ownership already covers
-- it; this block is then a harmless no-op.) Run on every schema apply so new
-- tables are covered automatically, and set DEFAULT PRIVILEGES so future tables
-- created by the same role are granted without a re-apply.
--
-- Guarded on role existence so the PGlite test harness (no such role) skips it.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutritional_user') THEN
        GRANT ALL ON ALL TABLES IN SCHEMA public TO nutritional_user;
        GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO nutritional_user;
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nutritional_user';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nutritional_user';
    END IF;
END $$;
