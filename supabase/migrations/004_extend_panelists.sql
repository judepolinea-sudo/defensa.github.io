-- =============================================================================
-- EXTEND: panelists table
-- Panelists are now server-generated per session (random name, domain-matched
-- role/persona) instead of a fixed client-side list, and each generated
-- panelist is persisted here as a record of what was used for that session.
-- =============================================================================

ALTER TABLE panelists
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS student_firebase_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_panelists_student_fuid ON panelists (student_firebase_uid);
