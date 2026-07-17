-- Nutritional Tracker Database Schema
-- PostgreSQL 15+
--
-- MULTI-USER. Every user-owned table carries a `user_id`. `food_items` is a
-- shared canonical reference set (rows with `user_id IS NULL`) plus each user's
-- private copy-on-write diff:
--   * a user's NEW food      = (user_id = them, canonical_id NULL)
--   * a user's EDIT of a     = (user_id = them, canonical_id = the canonical row
--     canonical food            it shadows)
-- The effective food list for a user = canonical rows they have not shadowed,
-- UNION their own rows. See lib/data/storage.ts.
--
-- This file is the source of truth for FRESH installs and is re-applied
-- idempotently to migrate existing databases' SCHEMA (ADD COLUMN IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS, CREATE ... IF NOT EXISTS). The one-time DATA
-- backfill for the existing single-user prod database — creating the owner's
-- users row and assigning historical rows to it, then the user_settings PK swap
-- — lives in database/migrations/001_multi_user.sql (it needs the owner email).

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (identity). Surrogate UUID PK; email kept in its own UNIQUE column so a
-- user can change email later without rewriting any foreign key.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GDPR: explicit Article 9 consent to process health-revealing data (weights,
-- food logs, macro targets, meal plans). NULL = not yet consented; the in-app
-- consent gate blocks the app until set. version tracks the notice consented to
-- so a material change can force re-consent (see migrations/005_gdpr_compliance.sql).
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_version VARCHAR(20);

-- Food items: shared canonical reference (user_id IS NULL) + per-user diff.
CREATE TABLE IF NOT EXISTS food_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),            -- NULL = canonical/shared
    canonical_id UUID REFERENCES food_items(id),  -- set only on a user's override
    name VARCHAR(255) NOT NULL,
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
    vitamin_c_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_serving_size CHECK (
        (unit_type = 'per_item' AND serving_size_g IS NOT NULL) OR
        (unit_type = 'per_100g' AND serving_size_g IS NULL)
    )
);
-- Existing databases: add the overlay columns and replace the old global name
-- unique with per-scope partial uniques (canonical names unique; per-user names
-- unique per user — so two users can each own "My Shake", and a user's override
-- can coexist with the canonical row it shadows).
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE food_items ADD COLUMN IF NOT EXISTS canonical_id UUID REFERENCES food_items(id);
ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS food_items_canonical_name ON food_items(name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS food_items_user_name ON food_items(user_id, name) WHERE user_id IS NOT NULL;

-- Individual food entries (history). Nutrients are denormalized at log time, so
-- a later food edit/override never rewrites past entries.
CREATE TABLE IF NOT EXISTS food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
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
    vitamin_c_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Daily summaries (main app data source)
CREATE TABLE IF NOT EXISTS daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    summary_date DATE NOT NULL,
    energy_kcal DECIMAL(8,2),
    fat_g DECIMAL(8,2),
    saturated_fat_g DECIMAL(8,2),
    carbohydrates_g DECIMAL(8,2),
    sugar_g DECIMAL(8,2),
    protein_g DECIMAL(8,2),
    fibre_g DECIMAL(8,2),
    salt_g DECIMAL(8,2),
    calcium_mg DECIMAL(8,2),
    vitamin_c_mg DECIMAL(8,2),
    morning_weight_kg DECIMAL(5,2),
    evening_weight_kg DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE daily_summaries DROP CONSTRAINT IF EXISTS daily_summaries_summary_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_summaries_user_date ON daily_summaries(user_id, summary_date);

-- Daily targets (nutritional goals/limits)
CREATE TABLE IF NOT EXISTS daily_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    target_date DATE NOT NULL,
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
    vitamin_c_mg DECIMAL(8,2) NOT NULL DEFAULT 200,
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
    vitamin_c_mode VARCHAR(10) CHECK (vitamin_c_mode IN ('target', 'limit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE daily_targets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE daily_targets DROP CONSTRAINT IF EXISTS daily_targets_target_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_targets_user_date ON daily_targets(user_id, target_date);

-- Meal templates (per-user)
CREATE TABLE IF NOT EXISTS meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE meals ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS meals_user_name ON meals(user_id, name);

-- Yield mode — how the recipe converts into a logged amount:
--   'whole'     eat the assembled batch, scaled by portions (default; legacy).
--   'by_weight' batch has a finished cooked weight; consume a weighed portion
--               (e.g. a 150 g slice of a 1200 g cake → per-100 g macros).
--   'by_count'  batch yields N identical items; consume a count (e.g. 2 of 12 cookies).
ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_mode VARCHAR(10) NOT NULL DEFAULT 'whole';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_weight_g DECIMAL(8,2);
ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_count DECIMAL(8,2);
ALTER TABLE meals DROP CONSTRAINT IF EXISTS check_meal_yield;
ALTER TABLE meals ADD CONSTRAINT check_meal_yield CHECK (
    (yield_mode = 'whole'     AND yield_weight_g IS NULL AND yield_count IS NULL) OR
    (yield_mode = 'by_weight' AND yield_weight_g IS NOT NULL AND yield_weight_g > 0 AND yield_count IS NULL) OR
    (yield_mode = 'by_count'  AND yield_count IS NOT NULL AND yield_count > 0 AND yield_weight_g IS NULL)
);

-- Meal ingredients (links meals to foods with amounts). Scoped to a user via
-- their parent meal (ON DELETE CASCADE), so no user_id of its own.
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
-- portions: how many portions of the meal were eaten (e.g. 0.5).
-- meal_log_id: groups the ingredient rows of ONE logged meal, so the same meal
--   eaten twice in a day stays as two separate entries instead of merging.
-- Both NULL for individual food rows (and for legacy meal rows, which fall back
-- to grouping by meal_id with portions defaulting to 1).
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS portions DECIMAL(8,2);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS meal_log_id UUID;

-- Cross-user settings — one row per user, keyed by user_id (was a single-row
-- table fixed at id = 1 in the single-user era; the prod migration performs the
-- PK swap for existing databases). Foundation for goal weight + projection (#9)
-- and, later, target presets (#7).
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    goal_weight_kg DECIMAL(5,2),            -- NULL = no goal set
    weekly_rate_target_kg DECIMAL(4,2),     -- signed: negative = cut; NULL = no target
    start_weight_kg DECIMAL(5,2),
    start_date DATE,
    hide_weekly_panel BOOLEAN NOT NULL DEFAULT false,  -- user dismissed the Weekly Trend panel
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weekly Planner: a plan is first-class data, SEPARATE from the logged
-- food_entries. The user assigns meals/foods to (day, slot) cells for a week;
-- a plan item is "applied" (today only — we log what we actually ate, never
-- from memory) by materialising it into editable food_entries. The plan persists
-- as the record of intent, so plan-vs-actual comparison works.
CREATE TABLE IF NOT EXISTS meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    week_start DATE NOT NULL,                     -- Monday of the planned week (ISO week)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_user_week ON meal_plans(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);

-- One planned item in a (day, slot) cell. References EITHER a meal template OR a
-- single food, never both (mirrors meal_ingredients' either/or discipline).
CREATE TABLE IF NOT EXISTS meal_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),   -- denormalised for direct scoping/indexes
    plan_date DATE NOT NULL,
    slot VARCHAR(10) NOT NULL,                     -- breakfast | lunch | dinner | snack
    position SMALLINT NOT NULL DEFAULT 0,          -- stable order within a slot
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    food_id UUID REFERENCES food_items(id),
    portions DECIMAL(8,2),                         -- meal ref
    weight_g DECIMAL(8,2),                         -- food ref (per_100g)
    quantity DECIMAL(8,2),                         -- food ref (per_item)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_plan_item_slot CHECK (slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
    CONSTRAINT check_plan_item_ref CHECK (
        (meal_id IS NOT NULL AND food_id IS NULL) OR
        (meal_id IS NULL AND food_id IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_plan_id ON meal_plan_items(plan_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_user_date ON meal_plan_items(user_id, plan_date);
-- When set, the user dismissed this planned item's entry-page "ghost" suggestion;
-- it stays hidden on that day across reloads/devices (persisted, not client-only).
ALTER TABLE meal_plan_items ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;

-- Provenance on the LOG: where an applied entry came from. source NULL/'manual'
-- = hand-logged (the default, preserves all existing rows); 'plan' = materialised
-- from a plan item. plan_item_id is the idempotency key (skip re-apply if a row
-- already references it) and the link for plan-vs-actual. ON DELETE SET NULL so
-- deleting a plan item NEVER deletes food the user already ate.
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS source VARCHAR(10);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS plan_item_id UUID
    REFERENCES meal_plan_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_food_entries_plan_item_id ON food_entries(plan_item_id);

-- GDPR rights-request register. Every contact-form submission is persisted here
-- as a backstop so a request is never lost if the notification email fails. See
-- migrations/005_gdpr_compliance.sql and compliance/rights-log.md.
CREATE TABLE IF NOT EXISTS privacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(20) NOT NULL,            -- access | export | correction | deletion | complaint | other
    requester_email VARCHAR(255) NOT NULL,        -- the reply-to the person typed (may not be an account email)
    message TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',    -- open | handled | rejected
    handled_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_privacy_request_type CHECK (
        request_type IN ('access', 'export', 'correction', 'deletion', 'complaint', 'other')
    ),
    CONSTRAINT check_privacy_request_status CHECK (
        status IN ('open', 'handled', 'rejected')
    )
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_created_at ON privacy_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_status ON privacy_requests(status);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_food_entries_entry_date ON food_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_food_entries_user_date ON food_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_food_entries_food_id ON food_entries(food_id);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_id ON food_entries(meal_id);
CREATE INDEX IF NOT EXISTS idx_food_entries_meal_log_id ON food_entries(meal_log_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_summary_date ON daily_summaries(summary_date);
CREATE INDEX IF NOT EXISTS idx_daily_targets_target_date ON daily_targets(target_date);
CREATE INDEX IF NOT EXISTS idx_food_items_name ON food_items(name);
CREATE INDEX IF NOT EXISTS idx_food_items_user_id ON food_items(user_id);
CREATE INDEX IF NOT EXISTS idx_food_items_canonical_id ON food_items(canonical_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);
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
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON meal_plans;
CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON meal_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meal_plan_items_updated_at ON meal_plan_items;
CREATE TRIGGER update_meal_plan_items_updated_at BEFORE UPDATE ON meal_plan_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_privacy_requests_updated_at ON privacy_requests;
CREATE TRIGGER update_privacy_requests_updated_at BEFORE UPDATE ON privacy_requests
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
