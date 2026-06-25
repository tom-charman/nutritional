-- 004_vitamin_c.sql — add Vitamin C as a 10th tracked nutrient.
--
-- WHAT THIS ADDS:
--   vitamin_c_mg DECIMAL(8,2) on the four nutrient tables, mirroring calcium_mg:
--     food_items / food_entries — NOT NULL (DEFAULT 0 backfills existing rows).
--     daily_summaries           — NULLABLE (NULL = "not recorded"; recomputed on
--                                 next save of a day, like every other summary col).
--     daily_targets             — NOT NULL DEFAULT 200 (the default daily target),
--                                 plus vitamin_c_mode for the per-nutrient
--                                 target/limit override (NULL = use default_mode).
--
-- Purely additive: ADD COLUMN IF NOT EXISTS only. Idempotent, safe to re-run,
-- wrapped in one transaction.
--
-- SOURCE OF TRUTH: database/init.sql mirrors this for fresh installs; lib/db/schema.ts
-- mirrors it for query typing; lib/constants.ts (NUTRIENT_KEYS) is the app-side list.
-- Keep them in sync.
--
-- No GRANT block: these are columns on tables the app role already owns — the
-- table-level grants in init.sql cover new columns automatically.
--
-- RUN IT (manually, against the target database — deploy is a pure code swap and
-- does NOT migrate; apply this to prod immediately before the deploy of this feature):
--
--   psql "$DATABASE_URL" -f database/migrations/004_vitamin_c.sql

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE food_items     ADD COLUMN IF NOT EXISTS vitamin_c_mg DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE food_entries   ADD COLUMN IF NOT EXISTS vitamin_c_mg DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE daily_summaries ADD COLUMN IF NOT EXISTS vitamin_c_mg DECIMAL(8,2);
ALTER TABLE daily_targets  ADD COLUMN IF NOT EXISTS vitamin_c_mg DECIMAL(8,2) NOT NULL DEFAULT 200;
ALTER TABLE daily_targets  ADD COLUMN IF NOT EXISTS vitamin_c_mode VARCHAR(10)
    CHECK (vitamin_c_mode IN ('target', 'limit'));

COMMIT;
