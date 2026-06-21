-- 002_weekly_planner.sql — additive schema for the Weekly Planner feature.
--
-- WHAT THIS ADDS:
--   1. meal_plans          — one container per (user, ISO week).
--   2. meal_plan_items     — planned items in (day, slot) cells; ref a meal OR a food.
--   3. food_entries.source / food_entries.plan_item_id — provenance so applying a
--      plan into the daily log is idempotent and plan-vs-actual works.
--
-- A "plan" is intent, SEPARATE from the logged food_entries. Applying a plan item
-- materialises it into editable food_entries (today only — we log what we ate, not
-- from memory). See docs + lib/data/storage.ts.
--
-- Purely additive: CREATE TABLE / ADD COLUMN / CREATE INDEX with IF NOT EXISTS, no
-- data backfill — existing food_entries keep source = NULL (= manual). Idempotent,
-- safe to re-run, wrapped in one transaction.
--
-- SOURCE OF TRUTH: database/init.sql mirrors this for fresh installs; lib/db/schema.ts
-- mirrors it for query typing. Keep all three in sync.
--
-- RUN IT (manually, against the target database — deploy is a pure code swap and
-- does NOT migrate; apply this to prod ONLY at the very end, immediately before the
-- single deploy of the finished feature):
--
--   psql "$DATABASE_URL" -f database/migrations/002_weekly_planner.sql
--
-- The role-guarded GRANT block in init.sql grants nutritional_user on ALL tables on
-- every schema apply, so re-applying init.sql after this covers the new tables. This
-- migration also grants explicitly (guarded) so it is self-sufficient if run alone.

\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS meal_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    week_start DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS meal_plans_user_week ON meal_plans(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);

CREATE TABLE IF NOT EXISTS meal_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    plan_date DATE NOT NULL,
    slot VARCHAR(10) NOT NULL,
    position SMALLINT NOT NULL DEFAULT 0,
    meal_id UUID REFERENCES meals(id) ON DELETE CASCADE,
    food_id UUID REFERENCES food_items(id),
    portions DECIMAL(8,2),
    weight_g DECIMAL(8,2),
    quantity DECIMAL(8,2),
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

-- Provenance on the LOG (NULL/'manual' = hand-logged; 'plan' = materialised).
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS source VARCHAR(10);
ALTER TABLE food_entries ADD COLUMN IF NOT EXISTS plan_item_id UUID
    REFERENCES meal_plan_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_food_entries_plan_item_id ON food_entries(plan_item_id);

-- updated_at triggers (function defined in init.sql).
DROP TRIGGER IF EXISTS update_meal_plans_updated_at ON meal_plans;
CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON meal_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meal_plan_items_updated_at ON meal_plan_items;
CREATE TRIGGER update_meal_plan_items_updated_at BEFORE UPDATE ON meal_plan_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant the app role on the new tables (guarded so the PGlite test harness skips it).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutritional_user') THEN
        GRANT ALL ON meal_plans TO nutritional_user;
        GRANT ALL ON meal_plan_items TO nutritional_user;
    END IF;
END $$;

COMMIT;
