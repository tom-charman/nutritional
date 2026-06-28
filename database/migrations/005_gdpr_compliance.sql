-- 005_gdpr_compliance.sql — GDPR accountability schema.
--
-- WHAT THIS ADDS:
--   users.health_consent_at      TIMESTAMP NULL — when the user gave explicit
--                                 Article 9 consent to process their health data.
--                                 NULL = not yet consented (the consent gate blocks
--                                 the app until set).
--   users.health_consent_version VARCHAR(20) NULL — the notice version consented to,
--                                 so a material change to the privacy notice can force
--                                 re-consent (see HEALTH_CONSENT_VERSION in lib/constants.ts).
--
--   privacy_requests              NEW table — the rights-request register. Every
--                                 contact-form submission (access / export / correction /
--                                 deletion / complaint / other) is persisted here as a
--                                 backstop so a request is never lost if the email send
--                                 fails. Mirrors compliance/rights-log.md.
--
-- Additive only: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS. Idempotent,
-- safe to re-run, wrapped in one transaction.
--
-- SOURCE OF TRUTH: database/init.sql mirrors this for fresh installs; lib/db/schema.ts
-- mirrors it for query typing. Keep them in sync.
--
-- RUN IT (manually, against the target database — deploy is a pure code swap and
-- does NOT migrate; apply this to prod immediately before the deploy of this feature):
--
--   psql "$DATABASE_URL" -f database/migrations/005_gdpr_compliance.sql

\set ON_ERROR_STOP on

BEGIN;

-- Explicit health-data (Article 9) consent, recorded per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_version VARCHAR(20);

-- Rights-request register. requester_email is the reply-to the person typed (NOT
-- necessarily an authorised/account email — requests can come from anyone, incl.
-- people who can't sign in). Retained for accountability even after a user is
-- deleted; anonymise requester_email on request.
CREATE TABLE IF NOT EXISTS privacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type VARCHAR(20) NOT NULL,            -- access | export | correction | deletion | complaint | other
    requester_email VARCHAR(255) NOT NULL,
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

-- keep updated_at fresh, matching every other table.
DROP TRIGGER IF EXISTS update_privacy_requests_updated_at ON privacy_requests;
CREATE TRIGGER update_privacy_requests_updated_at BEFORE UPDATE ON privacy_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- privacy_requests is a NEW table: in prod this migration runs as the `postgres`
-- superuser, so the table is owned by postgres and INVISIBLE to the app role until
-- granted. (Guarded on role existence so local/PGlite runs skip it.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutritional_user') THEN
        GRANT ALL ON privacy_requests TO nutritional_user;
    END IF;
END $$;

COMMIT;
