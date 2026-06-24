-- 003_meal_yield_modes.sql — yield modes for batch-cooked recipes.
--
-- WHAT THIS ADDS (to the `meals` table only):
--   yield_mode     'whole' (default) | 'by_weight' | 'by_count'
--   yield_weight_g finished cooked weight, set iff by_weight (cake/stew/soup).
--   yield_count    number of items yielded, set iff by_count (cookies).
--   check_meal_yield — enforces the per-mode column rules.
--
-- A recipe can now be logged three ways. 'whole' is the legacy behaviour (scale
-- ingredients by portions, eat the assembled batch). 'by_weight' / 'by_count'
-- describe a batch you cook then eat a fraction of — you log a weighed slice or
-- a count of items, and the ingredients are scaled by that fraction. See
-- lib/data/storage.ts and app/actions/{entry,meals,planner}.ts.
--
-- Purely additive: ADD COLUMN IF NOT EXISTS + the standard DROP/ADD constraint
-- two-step (CHECK adds are not IF-NOT-EXISTS-able). DEFAULT 'whole' means every
-- existing meal keeps behaving identically — no data backfill. The amount a
-- by_weight/by_count meal is logged/planned at reuses the EXISTING weight_g /
-- quantity columns on food_entries and meal_plan_items, so no other table changes.
-- Idempotent, safe to re-run, wrapped in one transaction.
--
-- SOURCE OF TRUTH: database/init.sql mirrors this for fresh installs; lib/db/schema.ts
-- mirrors it for query typing. Keep all three in sync.
--
-- RUN IT (manually, against the target database — deploy is a pure code swap and
-- does NOT migrate; apply this to prod ONLY at the very end, immediately before the
-- single deploy of the finished feature):
--
--   psql "$DATABASE_URL" -f database/migrations/003_meal_yield_modes.sql
--
-- No new tables, so no GRANT block is needed (the columns inherit the meals grant).

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_mode VARCHAR(10) NOT NULL DEFAULT 'whole';
ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_weight_g DECIMAL(8,2);
ALTER TABLE meals ADD COLUMN IF NOT EXISTS yield_count DECIMAL(8,2);

ALTER TABLE meals DROP CONSTRAINT IF EXISTS check_meal_yield;
ALTER TABLE meals ADD CONSTRAINT check_meal_yield CHECK (
    (yield_mode = 'whole'     AND yield_weight_g IS NULL AND yield_count IS NULL) OR
    (yield_mode = 'by_weight' AND yield_weight_g IS NOT NULL AND yield_weight_g > 0 AND yield_count IS NULL) OR
    (yield_mode = 'by_count'  AND yield_count IS NOT NULL AND yield_count > 0 AND yield_weight_g IS NULL)
);

COMMIT;
