-- =============================================================================
-- USERS.AVATAR
-- Optional profile photo, stored inline as a small data URI (the client
-- resizes to 256x256 JPEG before upload, so this stays well under ~40 KB).
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
