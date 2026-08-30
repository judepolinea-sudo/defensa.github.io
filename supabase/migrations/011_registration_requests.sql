-- =============================================================================
-- REGISTRATION REQUESTS
-- Self-registration no longer creates a Firebase Auth user or a `users` row.
-- The request is held here (with the password encrypted at rest) until an
-- admin approves it. On approval the server creates the real Firebase + users
-- account and deletes the request. On reject the request row is deleted and
-- nothing else was ever created.
-- =============================================================================

CREATE TABLE IF NOT EXISTS registration_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  full_name    TEXT        NOT NULL,
  program      TEXT,
  year_level   TEXT,
  enc_password TEXT        NOT NULL,   -- AES-256-GCM, format iv:tag:ciphertext (base64)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_anon_registration_requests"
  ON registration_requests FOR ALL TO anon USING (false);
CREATE POLICY "block_jwt_registration_requests"
  ON registration_requests FOR ALL TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_regreq_created_at ON registration_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regreq_email      ON registration_requests (email);
