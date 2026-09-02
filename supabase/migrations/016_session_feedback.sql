-- =============================================================================
-- SESSION FEEDBACK (quick post-session survey)
-- One short survey per finished practice session: three 1-5 ratings, one
-- yes/somewhat/no readiness question, and an optional free-text comment.
-- =============================================================================

CREATE TABLE IF NOT EXISTS session_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID        REFERENCES defense_sessions(id) ON DELETE CASCADE,
  student_firebase_uid TEXT     NOT NULL,
  realism_rating    SMALLINT,   -- 1-5: how realistic the panel felt
  difficulty_rating SMALLINT,   -- 1-5: difficulty was appropriate
  helpfulness_rating SMALLINT,  -- 1-5: how helpful the feedback was
  prepared          TEXT,       -- 'yes' | 'somewhat' | 'no'
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "block_anon_session_feedback"
  ON session_feedback FOR ALL TO anon USING (false);
CREATE POLICY "block_jwt_session_feedback"
  ON session_feedback FOR ALL TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_session_feedback_session ON session_feedback (session_id);
CREATE INDEX IF NOT EXISTS idx_session_feedback_student ON session_feedback (student_firebase_uid);
