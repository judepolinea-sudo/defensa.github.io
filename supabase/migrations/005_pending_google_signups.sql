-- =============================================================================
-- PENDING GOOGLE SIGNUPS
-- First-time Google sign-ins don't get a `users` row immediately — they must
-- click a real confirmation email (Firebase's built-in sign-in-with-email-link,
-- which requires no third-party email service) before the account is created.
-- This table tracks that in-between state server-side so it works across
-- devices/tabs, not just within one browser's localStorage.
-- =============================================================================

CREATE TABLE IF NOT EXISTS pending_google_signups (
  firebase_uid TEXT        PRIMARY KEY,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_google_signups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_anon_pending_google_signups" ON pending_google_signups FOR ALL TO anon USING (false);
CREATE POLICY "block_jwt_pending_google_signups"  ON pending_google_signups FOR ALL TO authenticated USING (false);
