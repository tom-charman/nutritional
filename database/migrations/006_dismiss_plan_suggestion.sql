-- 006_dismiss_plan_suggestion.sql — persist dismissal of entry-page "ghost" suggestions.
--
-- WHAT THIS ADDS:
--   meal_plan_items.dismissed_at TIMESTAMP (NULLABLE) — when set, the user
--   dismissed that planned item's one-click "ghost" suggestion on the daily
--   entry screen. Previously dismissal lived only in client React state, so a
--   dismissed suggestion reappeared on reload or another device. With this
--   column the dismissal is persisted per plan item (each item is date-specific)
--   and the suggestion stays hidden across reloads/devices.
--
-- Purely additive: ADD COLUMN IF NOT EXISTS only. Idempotent, safe to re-run,
-- wrapped in one transaction. Existing rows get NULL (= not dismissed), so all
-- current suggestions behave exactly as before.
--
-- SOURCE OF TRUTH: database/init.sql mirrors this for fresh installs;
-- lib/db/schema.ts mirrors it for query typing. Keep them in sync.
--
-- No GRANT block: this is a column on a table the app role already owns — the
-- table-level grants in init.sql cover new columns automatically.
--
-- RUN IT (manually, against the target database — deploy is a pure code swap and
-- does NOT migrate; apply this to prod immediately before the deploy of this feature):
--
--   psql "$DATABASE_URL" -f database/migrations/006_dismiss_plan_suggestion.sql

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE meal_plan_items ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMP;

COMMIT;
