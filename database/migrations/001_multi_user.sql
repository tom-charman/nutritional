-- 001_multi_user.sql — one-time data backfill for the single-user → multi-user cutover.
--
-- WHAT init.sql ALREADY DID (idempotent schema): created the `users` table, added
-- nullable `user_id` to food_entries/daily_summaries/daily_targets/meals, added
-- `user_id`+`canonical_id` to food_items, swapped the old global uniques for the
-- per-scope partial/composite unique indexes, and created the NEW user_settings
-- shape ONLY on fresh databases.
--
-- WHAT THIS FILE DOES (run ONCE, after init.sql, against an existing database):
--   1. Creates the owner's `users` row (their sign-up — see plan "Deployment cutover").
--   2. Backfills all existing tracking rows to that owner.
--   3. Transforms a legacy single-row `user_settings` (integer id, CHECK(id=1))
--      into the per-user shape (user_id PK), assigning the row to the owner.
--   4. Tightens `user_id` to NOT NULL on the tracking tables (food_items stays
--      nullable — canonical rows are NULL).
--
-- food_items rows are intentionally LEFT as canonical (user_id IS NULL): the
-- existing food database becomes the shared canonical set.
--
-- RUN IT (the email MUST be the exact lowercased/trimmed address in
-- AUTHORIZED_EMAILS that Google returns, so the jwt callback links the live
-- session to this row instead of minting a duplicate):
--
--   psql "$DATABASE_URL" \
--     -v owner_email=you@example.com \
--     -v owner_name="Your Name" \
--     -f database/migrations/001_multi_user.sql
--
-- NOTE: pass values WITHOUT surrounding single quotes — this script quotes them
-- via :'owner_email' / :'owner_name'. psql does NOT substitute :vars inside
-- dollar-quoted DO blocks, so all variable use is in plain SQL below.
--
-- Idempotent: safe to re-run. Wrapped in a single transaction.

\set ON_ERROR_STOP on

BEGIN;

-- 1. Owner's users row (their sign-up). ON CONFLICT keeps a re-run a no-op.
INSERT INTO users (email, name)
VALUES (lower(btrim(:'owner_email')), :'owner_name')
ON CONFLICT (email) DO NOTHING;

-- 2. Backfill existing tracking data to the owner.
UPDATE food_entries
   SET user_id = (SELECT id FROM users WHERE email = lower(btrim(:'owner_email')))
 WHERE user_id IS NULL;
UPDATE daily_summaries
   SET user_id = (SELECT id FROM users WHERE email = lower(btrim(:'owner_email')))
 WHERE user_id IS NULL;
UPDATE daily_targets
   SET user_id = (SELECT id FROM users WHERE email = lower(btrim(:'owner_email')))
 WHERE user_id IS NULL;
UPDATE meals
   SET user_id = (SELECT id FROM users WHERE email = lower(btrim(:'owner_email')))
 WHERE user_id IS NULL;

-- 3a. Ensure user_settings has a user_id column and the owner's row is assigned.
--     (Both no-ops if init.sql already created the new per-user shape on a fresh DB.)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
UPDATE user_settings
   SET user_id = (SELECT id FROM users WHERE email = lower(btrim(:'owner_email')))
 WHERE user_id IS NULL;

-- 3b. Structural PK swap for a legacy user_settings (no :vars needed → DO block).
--     Dropping the legacy `id` column also drops its PK and the CHECK(id=1).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_settings' AND column_name = 'id'
    ) THEN
        ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS user_settings_pkey;
        ALTER TABLE user_settings DROP COLUMN id;
        ALTER TABLE user_settings ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE user_settings ADD PRIMARY KEY (user_id);
    END IF;
END $$;

-- 4. Tighten tracking tables now that every row has an owner. food_items is
--    deliberately excluded (canonical rows legitimately have user_id IS NULL).
ALTER TABLE food_entries    ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_summaries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE daily_targets   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE meals           ALTER COLUMN user_id SET NOT NULL;

COMMIT;
