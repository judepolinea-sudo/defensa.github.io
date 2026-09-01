-- =============================================================================
-- USERS PRESENCE
-- Tracks when a user last signed in and when they were last seen active, so the
-- admin dashboard can show who is currently online. The client sends a small
-- heartbeat while the app is open; "online" = last_seen_at within a few minutes.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;

-- Fast lookup of currently-online users.
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON users (last_seen_at DESC);
