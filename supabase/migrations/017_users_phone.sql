-- =============================================================================
-- USERS.PHONE
-- Mobile number collected on self-registration (Philippine format, stored as
-- the 10 digits after +63, e.g. 9XXXXXXXXX).
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
