-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- All legitimate data access goes through the Express backend using the
-- service role key, which bypasses RLS entirely.
-- These policies block direct anon/authenticated Supabase client access,
-- ensuring the backend is the only entry point.
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE defense_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE panelists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      ENABLE ROW LEVEL SECURITY;

-- Block all anon access (frontend anon key cannot read/write any table directly)
-- The service role key (backend only) bypasses these policies automatically.

CREATE POLICY "block_anon_users"            ON users            FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_groups"           ON groups           FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_group_members"    ON group_members    FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_projects"         ON projects         FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_defense_sessions" ON defense_sessions FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_session_questions" ON session_questions FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_readiness"        ON readiness_history FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_active_sessions"  ON active_sessions  FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_panelists"        ON panelists        FOR ALL TO anon USING (false);
CREATE POLICY "block_anon_audit_logs"       ON audit_logs       FOR ALL TO anon USING (false);

-- Block authenticated (JWT) direct access too — all access via service role
CREATE POLICY "block_jwt_users"            ON users            FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_groups"           ON groups           FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_group_members"    ON group_members    FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_projects"         ON projects         FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_defense_sessions" ON defense_sessions FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_session_questions" ON session_questions FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_readiness"        ON readiness_history FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_active_sessions"  ON active_sessions  FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_panelists"        ON panelists        FOR ALL TO authenticated USING (false);
CREATE POLICY "block_jwt_audit_logs"       ON audit_logs       FOR ALL TO authenticated USING (false);
