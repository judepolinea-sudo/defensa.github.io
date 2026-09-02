-- =============================================================================
-- RUN ALL PENDING MIGRATIONS (011 – 017)  — safe to run more than once.
-- Paste this whole file into the Supabase SQL editor and run it, then
-- Database → "Reload schema cache".
--
-- After this, every part of the app (sign-up, profile, school, phone,
-- presence / "Online Now", password resets, post-session survey) is fully
-- backed by Supabase.
-- =============================================================================

-- 011 — registration requests (kept for legacy rows; sign-up no longer uses it)
CREATE TABLE IF NOT EXISTS registration_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT        NOT NULL,
  full_name    TEXT        NOT NULL,
  program      TEXT,
  year_level   TEXT,
  enc_password TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "block_anon_registration_requests" ON registration_requests;
DROP POLICY IF EXISTS "block_jwt_registration_requests"  ON registration_requests;
CREATE POLICY "block_anon_registration_requests" ON registration_requests FOR ALL TO anon          USING (false);
CREATE POLICY "block_jwt_registration_requests"  ON registration_requests FOR ALL TO authenticated USING (false);
CREATE INDEX IF NOT EXISTS idx_regreq_created_at ON registration_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regreq_email      ON registration_requests (email);

-- 012 — profile photo
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- 013 — presence ("Online Now")
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users (last_seen_at DESC);

-- 014 — admin-approved password resets
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  full_name    TEXT,
  enc_password TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'PENDING',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "block_anon_password_reset_requests" ON password_reset_requests;
DROP POLICY IF EXISTS "block_jwt_password_reset_requests"  ON password_reset_requests;
CREATE POLICY "block_anon_password_reset_requests" ON password_reset_requests FOR ALL TO anon          USING (false);
CREATE POLICY "block_jwt_password_reset_requests"  ON password_reset_requests FOR ALL TO authenticated USING (false);
CREATE INDEX IF NOT EXISTS idx_pwreset_created_at ON password_reset_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pwreset_email      ON password_reset_requests (email);

-- 015 — school / campus
ALTER TABLE users ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS school TEXT;

-- 016 — post-session quick survey
CREATE TABLE IF NOT EXISTS session_feedback (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID        REFERENCES defense_sessions(id) ON DELETE CASCADE,
  student_firebase_uid TEXT        NOT NULL,
  realism_rating       SMALLINT,
  difficulty_rating    SMALLINT,
  helpfulness_rating   SMALLINT,
  prepared             TEXT,
  comment              TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "block_anon_session_feedback" ON session_feedback;
DROP POLICY IF EXISTS "block_jwt_session_feedback"  ON session_feedback;
CREATE POLICY "block_anon_session_feedback" ON session_feedback FOR ALL TO anon          USING (false);
CREATE POLICY "block_jwt_session_feedback"  ON session_feedback FOR ALL TO authenticated USING (false);
CREATE INDEX IF NOT EXISTS idx_session_feedback_session ON session_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_session_feedback_student ON session_feedback (student_firebase_uid);

-- 017 — mobile number
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
