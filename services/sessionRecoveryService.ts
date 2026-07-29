/**
 * Session Recovery Service
 *
 * Persists live defense session state to Supabase so that a browser
 * refresh fully restores the student's in-progress session.
 *
 * Stored state per student (one active row):
 *   - session_id        — the defense_sessions UUID
 *   - current_panelist  — the AI panelist currently questioning
 *   - current_question  — the question currently on screen
 *   - question_history  — all Q&A pairs answered so far
 *   - answer_draft      — partial answer the student has typed/spoken
 *   - evaluation_state  — partial evaluation scores
 *   - coverage_map      — RAG section coverage tracker
 *
 * API contract (used by backend route handlers):
 *   saveActiveSession(uid, payload) → upsert active_sessions row
 *   getActiveSession(uid)           → restore row or null
 *   clearActiveSession(uid)         → delete row on session end
 */

import { supabase } from "../lib/supabaseAdmin.ts";

export interface ActiveSessionPayload {
  sessionId?: string;
  currentPanelist?: Record<string, unknown> | null;
  currentQuestion?: Record<string, unknown> | null;
  questionHistory?: Record<string, unknown>[];
  answerDraft?: string | null;
  evaluationState?: Record<string, unknown> | null;
  coverageMap?: Record<string, unknown> | null;
}

export async function saveActiveSession(
  studentFirebaseUid: string,
  payload: ActiveSessionPayload,
): Promise<void> {
  const row = {
    student_firebase_uid: studentFirebaseUid,
    session_id: payload.sessionId ?? null,
    current_panelist: payload.currentPanelist ?? null,
    current_question: payload.currentQuestion ?? null,
    question_history: payload.questionHistory ?? [],
    answer_draft: payload.answerDraft ?? null,
    evaluation_state: payload.evaluationState ?? null,
    coverage_map: payload.coverageMap ?? null,
    last_updated: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("active_sessions")
    .upsert(row, { onConflict: "student_firebase_uid" });

  if (error) {
    console.error("[SessionRecovery] saveActiveSession error:", error.message);
    throw new Error("Failed to save session state: " + error.message);
  }
}

export async function getActiveSession(
  studentFirebaseUid: string,
): Promise<ActiveSessionPayload | null> {
  const { data, error } = await supabase
    .from("active_sessions")
    .select("*")
    .eq("student_firebase_uid", studentFirebaseUid)
    .single();

  if (error || !data) return null;

  return {
    sessionId: data.session_id ?? undefined,
    currentPanelist: data.current_panelist ?? null,
    currentQuestion: data.current_question ?? null,
    questionHistory: (data.question_history as Record<string, unknown>[]) ?? [],
    answerDraft: data.answer_draft ?? null,
    evaluationState: data.evaluation_state ?? null,
    coverageMap: data.coverage_map ?? null,
  };
}

export async function clearActiveSession(
  studentFirebaseUid: string,
): Promise<void> {
  const { error } = await supabase
    .from("active_sessions")
    .delete()
    .eq("student_firebase_uid", studentFirebaseUid);

  if (error) {
    console.error("[SessionRecovery] clearActiveSession error:", error.message);
  }
}
