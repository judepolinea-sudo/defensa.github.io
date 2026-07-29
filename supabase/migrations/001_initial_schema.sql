-- =============================================================================
-- DEFENSA PLATFORM — SUPABASE POSTGRESQL SCHEMA
-- Firebase Authentication remains SSOT for identity.
-- Supabase PostgreSQL is SSOT for all academic records, analytics, and history.
-- All user references use firebase_uid (TEXT) as the external identity key.
-- =============================================================================

-- -------------------------
-- EXTENSIONS
-- -------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------
-- USERS
-- Maps Firebase Auth users to application profiles.
-- firebase_uid is the canonical cross-system identity.
-- -------------------------
CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid     TEXT        UNIQUE NOT NULL,
  email            TEXT        NOT NULL,
  full_name        TEXT        NOT NULL,
  role             TEXT        NOT NULL
                               CHECK (role IN ('STUDENT','CAPSTONE_ADVISER','CAPSTONE_COORDINATOR','ADMIN')),
  program          TEXT        CHECK (program IN ('BSIT','BSCpE') OR program IS NULL),
  year_level       TEXT,
  group_id         UUID,       -- FK to groups (added after groups table)
  adviser_firebase_uid TEXT,   -- Firebase UID of this user's assigned adviser
  is_deleted       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by       TEXT,       -- Firebase UID of creating admin/coordinator
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- GROUPS
-- Each group has one adviser and N students.
-- adviser_firebase_uid links back to a user row via firebase_uid.
-- -------------------------
CREATE TABLE IF NOT EXISTS groups (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  adviser_firebase_uid TEXT        NOT NULL,
  adviser_name         TEXT,
  department           TEXT,
  created_by           TEXT,       -- Firebase UID
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defer FK now that both tables exist
ALTER TABLE users
  ADD CONSTRAINT fk_users_group
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL
  NOT VALID;

-- -------------------------
-- GROUP MEMBERS (junction)
-- Normalized student ↔ group membership.
-- -------------------------
CREATE TABLE IF NOT EXISTS group_members (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id             UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_firebase_uid TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, student_firebase_uid)
);

-- -------------------------
-- PROJECTS
-- One project per group (enforced by UNIQUE on group_id).
-- -------------------------
CREATE TABLE IF NOT EXISTS projects (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID        REFERENCES groups(id) ON DELETE SET NULL,
  title            TEXT        NOT NULL,
  methodology      TEXT        NOT NULL DEFAULT 'Quantitative',
  department       TEXT        CHECK (department IN ('BSIT','BSCpE') OR department IS NULL),
  tech_stack       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  defense_date     TEXT,
  description      TEXT,
  abstract_text    TEXT,
  analysis_results JSONB,
  adviser_name     TEXT,
  status           TEXT        NOT NULL DEFAULT 'active',
  created_by       TEXT,       -- Firebase UID
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id)            -- one project per group
);

-- -------------------------
-- DEFENSE SESSIONS
-- Every practice simulation run by a student.
-- Permanently retained — never hard-deleted.
-- -------------------------
CREATE TABLE IF NOT EXISTS defense_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_firebase_uid TEXT        NOT NULL,   -- Firebase UID
  group_id             UUID        REFERENCES groups(id) ON DELETE SET NULL,
  project_id           UUID        REFERENCES projects(id) ON DELETE SET NULL,
  project_title        TEXT,
  overall_score        INTEGER     CHECK (overall_score BETWEEN 0 AND 100),
  accuracy_score       INTEGER     CHECK (accuracy_score BETWEEN 0 AND 100),
  completeness_score   INTEGER     CHECK (completeness_score BETWEEN 0 AND 100),
  clarity_score        INTEGER     CHECK (clarity_score BETWEEN 0 AND 100),
  confidence_score     INTEGER     CHECK (confidence_score BETWEEN 0 AND 100),
  duration_seconds     INTEGER     NOT NULL DEFAULT 0,
  questions_answered   INTEGER     NOT NULL DEFAULT 0,
  weakest_category     TEXT,
  status               TEXT        NOT NULL DEFAULT 'completed'
                                   CHECK (status IN ('active','completed','abandoned')),
  started_at           TIMESTAMPTZ,
  ended_at             TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- SESSION QUESTIONS
-- Every question asked during a defense session.
-- Permanently retained — answers and feedback stored inline.
-- -------------------------
CREATE TABLE IF NOT EXISTS session_questions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID        NOT NULL REFERENCES defense_sessions(id) ON DELETE CASCADE,
  panelist_name        TEXT,
  panelist_personality TEXT,
  question             TEXT        NOT NULL,
  answer               TEXT,
  source_section       TEXT,
  difficulty           TEXT,
  question_type        TEXT,
  score                INTEGER     CHECK (score BETWEEN 0 AND 100),
  category             TEXT,
  feedback             JSONB,
  confidence_metrics   JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- READINESS HISTORY
-- One row per session — tracks the student's readiness score over time.
-- Powers the trend dashboard.
-- -------------------------
CREATE TABLE IF NOT EXISTS readiness_history (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_firebase_uid TEXT        NOT NULL,
  session_id           UUID        REFERENCES defense_sessions(id) ON DELETE SET NULL,
  readiness_score      INTEGER     NOT NULL CHECK (readiness_score BETWEEN 0 AND 100),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- ACTIVE SESSIONS (session recovery)
-- One row per student — stores live session state so browser refresh restores it.
-- Overwritten on each session start/update; cleared on session end.
-- -------------------------
CREATE TABLE IF NOT EXISTS active_sessions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_firebase_uid TEXT        NOT NULL UNIQUE,
  session_id           UUID        REFERENCES defense_sessions(id) ON DELETE SET NULL,
  current_panelist     JSONB,
  current_question     JSONB,
  question_history     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  answer_draft         TEXT,
  evaluation_state     JSONB,
  coverage_map         JSONB,
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- PANELISTS (reference data)
-- The AI panelist personas available in the system.
-- -------------------------
CREATE TABLE IF NOT EXISTS panelists (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  persona        TEXT,
  specialization TEXT,
  voice_profile  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- AUDIT LOGS
-- Immutable event trail. Never deleted.
-- -------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  TEXT,       -- actor
  action_type   TEXT        NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  metadata      JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------
-- AUTOMATIC updated_at TRIGGER
-- -------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_active_sessions_updated_at
  BEFORE UPDATE ON active_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
