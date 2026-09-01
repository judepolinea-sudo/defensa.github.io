-- =============================================================================
-- PASSWORD RESET REQUESTS
-- A signed-out user submits their email + a new password from the login screen.
-- Nothing changes in Firebase until an admin approves the request; on approval
-- the server sets the new password on the Firebase account and deletes the row.
-- The new password is stored encrypted at rest (AES-256-GCM, same scheme as
-- registration_requests).
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  enc_password TEXT        NOT NULL,   -- AES-256-GCM, format iv:tag:ciphertext (base64)
  status       TEXT        NOT NULL DEFAULT 'PENDING',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_anon_password_reset_requests"
  ON password_reset_requests FOR ALL TO anon USING (false);
CREATE POLICY "block_jwt_password_reset_requests"
  ON password_reset_requests FOR ALL TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_pwreset_created_at ON password_reset_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pwreset_email      ON password_reset_requests (email);
