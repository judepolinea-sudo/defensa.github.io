-- =============================================================================
-- PROJECTS.DEPARTMENT AS FREE TEXT
-- A project is created from an uploaded paper/abstract and can belong to ANY
-- program, not just BSIT/BSCpE. Drop the CHECK constraint from
-- 001_initial_schema.sql that restricted the fixed list — mirrors what
-- 008_users_program_free_text.sql did for users.program.
-- =============================================================================

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_department_check;
