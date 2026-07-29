-- =============================================================================
-- PERFORMANCE INDEXES
-- Optimized for: dashboard queries, session lookups, analytics aggregations
-- =============================================================================

-- USERS
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid   ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email          ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role           ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_group_id       ON users (group_id);
CREATE INDEX IF NOT EXISTS idx_users_is_deleted     ON users (is_deleted);
CREATE INDEX IF NOT EXISTS idx_users_adviser_fuid   ON users (adviser_firebase_uid);

-- GROUPS
CREATE INDEX IF NOT EXISTS idx_groups_adviser_fuid  ON groups (adviser_firebase_uid);

-- GROUP MEMBERS
CREATE INDEX IF NOT EXISTS idx_gm_group_id          ON group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_gm_student_fuid      ON group_members (student_firebase_uid);

-- PROJECTS
CREATE INDEX IF NOT EXISTS idx_projects_group_id    ON projects (group_id);
CREATE INDEX IF NOT EXISTS idx_projects_department  ON projects (department);
CREATE INDEX IF NOT EXISTS idx_projects_status      ON projects (status);

-- DEFENSE SESSIONS — most frequently queried table
CREATE INDEX IF NOT EXISTS idx_ds_student_fuid      ON defense_sessions (student_firebase_uid);
CREATE INDEX IF NOT EXISTS idx_ds_group_id          ON defense_sessions (group_id);
CREATE INDEX IF NOT EXISTS idx_ds_project_id        ON defense_sessions (project_id);
CREATE INDEX IF NOT EXISTS idx_ds_created_at        ON defense_sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ds_overall_score     ON defense_sessions (overall_score);
CREATE INDEX IF NOT EXISTS idx_ds_status            ON defense_sessions (status);
-- Composite for student history queries
CREATE INDEX IF NOT EXISTS idx_ds_student_created   ON defense_sessions (student_firebase_uid, created_at DESC);

-- SESSION QUESTIONS
CREATE INDEX IF NOT EXISTS idx_sq_session_id        ON session_questions (session_id);
CREATE INDEX IF NOT EXISTS idx_sq_category          ON session_questions (category);

-- READINESS HISTORY
CREATE INDEX IF NOT EXISTS idx_rh_student_fuid      ON readiness_history (student_firebase_uid);
CREATE INDEX IF NOT EXISTS idx_rh_session_id        ON readiness_history (session_id);
CREATE INDEX IF NOT EXISTS idx_rh_created_at        ON readiness_history (created_at DESC);
-- Composite for trend queries
CREATE INDEX IF NOT EXISTS idx_rh_student_trend     ON readiness_history (student_firebase_uid, created_at DESC);

-- ACTIVE SESSIONS
CREATE INDEX IF NOT EXISTS idx_as_student_fuid      ON active_sessions (student_firebase_uid);

-- AUDIT LOGS
CREATE INDEX IF NOT EXISTS idx_al_firebase_uid      ON audit_logs (firebase_uid);
CREATE INDEX IF NOT EXISTS idx_al_action_type       ON audit_logs (action_type);
CREATE INDEX IF NOT EXISTS idx_al_created_at        ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_al_resource          ON audit_logs (resource_type, resource_id);
