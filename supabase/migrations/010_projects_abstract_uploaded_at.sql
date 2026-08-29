-- =============================================================================
-- PROJECTS.ABSTRACT_UPLOADED_AT
-- Records when the research abstract / paper file was uploaded for a project,
-- so the admin Group Projects table can show an "Uploaded" date.
-- The backend sets this (fire-and-forget) on abstract create/update; until this
-- migration runs, the UI falls back to created_at.
-- =============================================================================

ALTER TABLE projects ADD COLUMN IF NOT EXISTS abstract_uploaded_at TIMESTAMPTZ;

-- Backfill existing projects that already have an abstract.
-- Use created_at (immutable) rather than updated_at — updated_at gets bumped by
-- every later edit, so it no longer reflects the original upload date.
-- Disable the updated_at trigger for the backfill so it doesn't get touched.
ALTER TABLE projects DISABLE TRIGGER trg_projects_updated_at;

UPDATE projects
SET abstract_uploaded_at = created_at
WHERE abstract_text IS NOT NULL AND abstract_uploaded_at IS NULL;

ALTER TABLE projects ENABLE TRIGGER trg_projects_updated_at;
