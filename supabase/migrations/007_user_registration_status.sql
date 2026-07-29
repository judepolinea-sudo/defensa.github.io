-- =============================================================================
-- USER REGISTRATION STATUS
-- Supports public self-registration (email/password) from the login page.
-- New self-registered accounts start PENDING and cannot log in until an
-- admin approves them. Existing accounts (admin-created, Google auto-signup)
-- default to APPROVED so nothing already in the system is affected.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'APPROVED'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
