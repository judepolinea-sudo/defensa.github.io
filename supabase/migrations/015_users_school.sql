-- =============================================================================
-- USERS / REGISTRATION SCHOOL
-- Which school / campus a user is connected to. Chosen from a dropdown on the
-- registration form and the admin "Register User" form.
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS school TEXT;
ALTER TABLE registration_requests ADD COLUMN IF NOT EXISTS school TEXT;
