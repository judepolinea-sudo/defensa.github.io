// ============================================================
// SUPABASE DB ROW TYPES
// These match the snake_case column names in Supabase PostgreSQL.
// Used by lib/supabaseAdmin.ts row mappers — not exposed to the UI.
// ============================================================

export interface DbUser {
  id: string;                     // Supabase UUID
  firebase_uid: string;           // Firebase Auth UID
  email: string;
  full_name: string;
  role: string;
  program: string | null;
  year_level: string | null;
  group_id: string | null;        // Supabase groups UUID
  adviser_firebase_uid: string | null;
  is_deleted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbGroup {
  id: string;                     // Supabase UUID
  name: string;
  adviser_firebase_uid: string;
  adviser_name: string | null;
  department: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbGroupMember {
  id: string;
  group_id: string;               // Supabase UUID
  student_firebase_uid: string;
  created_at: string;
}

export interface DbProject {
  id: string;                     // Supabase UUID
  group_id: string | null;
  title: string;
  methodology: string;
  department: string | null;
  tech_stack: string[];
  defense_date: string | null;
  description: string | null;
  abstract_text: string | null;
  analysis_results: Record<string, unknown> | null;
  adviser_name: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbDefenseSession {
  id: string;                     // Supabase UUID
  student_firebase_uid: string;
  group_id: string | null;
  project_id: string | null;
  project_title: string | null;
  overall_score: number | null;
  accuracy_score: number | null;
  completeness_score: number | null;
  clarity_score: number | null;
  confidence_score: number | null;
  duration_seconds: number;
  questions_answered: number;
  weakest_category: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface DbSessionQuestion {
  id: string;
  session_id: string;
  panelist_name: string | null;
  panelist_personality: string | null;
  question: string;
  answer: string | null;
  source_section: string | null;
  difficulty: string | null;
  question_type: string | null;
  score: number | null;
  category: string | null;
  feedback: Record<string, unknown> | null;
  confidence_metrics: Record<string, unknown> | null;
  created_at: string;
}

export interface DbReadinessHistory {
  id: string;
  student_firebase_uid: string;
  session_id: string | null;
  readiness_score: number;
  created_at: string;
}

export interface DbActiveSession {
  id: string;
  student_firebase_uid: string;
  session_id: string | null;
  current_panelist: Record<string, unknown> | null;
  current_question: Record<string, unknown> | null;
  question_history: Record<string, unknown>[];
  answer_draft: string | null;
  evaluation_state: Record<string, unknown> | null;
  coverage_map: Record<string, unknown> | null;
  last_updated: string;
}

export interface DbAuditLog {
  id: string;
  firebase_uid: string | null;
  action_type: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ============================================================
// ANALYTICS DASHBOARD TYPES
// ============================================================

export interface ReadinessTrend {
  trend: Array<{ readiness_score: number; created_at: string }>;
  avgScore: number;
  sessionCount: number;
  categoryAverages: Record<string, number>;
  strongestCategory: string | null;
  weakestCategory: string | null;
  improvementRate: number;
}

export interface StudentAnalyticsSummary {
  userId: string;
  fullName: string;
  groupId: string | null;
  groupName: string;
  sessionCount: number;
  avgScore: number;
  lastScore: number | null;
  lastDate: string | null;
  atRisk: boolean;
  categoryAvgs: Record<string, number>;
}

export interface GroupAnalyticsResponse {
  summary: {
    totalStudents: number;
    totalSessions: number;
    overallAvg: number;
    atRiskCount: number;
    categoryAverages: Record<string, number>;
  };
  students: StudentAnalyticsSummary[];
}

// ============================================================
// EXISTING APPLICATION TYPES (unchanged)
// ============================================================

export enum UserRole {
  STUDENT = 'STUDENT',
  ADMIN = 'ADMIN',
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.ADMIN]: 'Superadmin',
};

export enum Department {
  BSIT = 'BSIT',
  BSCpE = 'BSCpE',
}

// Schools / campuses a user can be connected to. Shown as a dropdown on the
// registration form and the admin "Register User" form.
export const SCHOOLS = [
  'National University – Clark',
  'National University – Manila',
  'National University – Mall of Asia',
  'National University – Laguna',
  'National University – Fairview',
  'National University – Baliwag',
  'National University – Dasmariñas',
  'National University – Lipa',
  'National University – Bacolod',
  'National University – Eastern Visayas',
] as const;

export const DEFAULT_SCHOOL = 'National University – Clark';

// Joins the parts of a name into a single display string, dropping any blanks.
export function joinName(
  first: string,
  middle: string,
  last: string,
): string {
  return [first, middle, last]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ');
}

export const TECH_STACK_OPTIONS = [
  'React', 'Vue.js', 'Angular', 'Next.js', 'Svelte',
  'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Laravel', 'Spring Boot', 'ASP.NET',
  'MySQL', 'PostgreSQL', 'MongoDB', 'Firebase', 'SQLite', 'Redis',
  'Python', 'Java', 'PHP', 'JavaScript', 'TypeScript', 'C#', 'C++', 'Kotlin', 'Swift',
  'TensorFlow', 'PyTorch', 'Scikit-learn', 'OpenCV',
  'Arduino', 'Raspberry Pi', 'ESP32',
  'Flutter', 'React Native', 'Ionic',
  'Docker', 'AWS', 'Azure', 'Google Cloud', 'REST API', 'GraphQL', 'WebSockets',
  'Tailwind CSS', 'Bootstrap', 'Material UI', 'Figma',
  'Git', 'GitHub', 'Postman',
] as const;

export type TechStackOption = typeof TECH_STACK_OPTIONS[number];

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  // Free text — any program/department, not limited to the Department enum.
  program?: string;
  yearLevel?: string;
  school?: string | null;
  avatar?: string | null;
  performance?: number[];
  project?: ProjectProfile;
  groupId?: string;
  adviserId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface Group {
  id: string;
  name: string;
  adviserId: string;
  adviserName?: string;
  studentIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export enum ResearchMethodology {
  QUANTITATIVE = 'Quantitative',
  QUALITATIVE = 'Qualitative',
  MIXED_METHODS = 'Mixed Methods',
  EXPERIMENTAL = 'Experimental',
}

export enum DifficultyLevel {
  BEGINNER = 'Beginner',
  INTERMEDIATE = 'Intermediate',
  ADVANCED = 'Advanced',
}

export interface Panelist {
  id: string;
  name: string;
  role: string;
  specialization: string;
  persona: string;
}

export interface ProjectProfile {
  id?: string;
  groupId?: string;
  title: string;
  methodology: ResearchMethodology;
  // Free text — a project can come from any program, not just BSIT/BSCpE.
  department?: string;
  techStack: string[];
  defenseDate?: string;
  description?: string;
  abstractText?: string;
  analysisResults?: AnalysisResult;
  adviserName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnalysisResult {
  wordCount: number;
  keyTopics: string[];
  technicalTermsCount: number;
}

export interface Feedback {
  score: number;
  semanticRelevance: number;
  keywordAccuracy: number;
  clarity: number;
  confidenceLevel: number;
  strengths: string[];
  improvements: string[];
  betterExample: string;
}

export interface ThreadExchange {
  question: string;
  answer: string;
  isFollowUp: boolean;
  satisfactionScore: number;
  verdict: 'satisfied' | 'needs_followup' | 'evasive';
  gaps: string[];
  panelistRemark: string;
}

export interface SatisfactionResult {
  satisfaction_score: number;
  verdict: 'satisfied' | 'needs_followup' | 'evasive';
  gaps: string[];
  followup_question: string | null;
  panelist_remark: string;
}

export interface QuestionAnswer {
  question: string;
  answer: string;
  feedback: Feedback;
  category: string;
  panelistName?: string;
  panelistPersonality?: string;
  // Thread data (persisted per Q&A record)
  threadExchanges?: ThreadExchange[];
  satisfactionScore?: number;
  threadVerdict?: 'satisfied' | 'capped' | 'skipped';
  followUpsUsed?: number;
}

export interface SessionResult {
  id: string;
  date: string;
  projectTitle?: string;
  overallScore: number;
  duration: number;
  questionsAnswered: number;
  weakestCategory?: string;
  categoryScores: Record<string, number>;
  history: QuestionAnswer[];
  groupId?: string;
  projectId?: string;
}

export enum SessionPhase {
  INTRODUCTION = 'Introduction',
  METHODOLOGY = 'Methodology',
  RESULTS = 'Results',
  DEFENSE = 'Defense',
}

export interface RagChunk {
  id: string;
  text: string;
  embedding?: number[];
  metadata: {
    section: string;
    pageNumber?: number;
  };
}

export interface SessionState {
  currentPhase: SessionPhase;
  phaseScore: number;
  questionCount: number;
  maxQuestionsPerPhase: number;
  difficulty: DifficultyLevel;
  startTime: number;
  isCompleted: boolean;
}

export interface ConfidenceMetrics {
  responseLength: number;
  fillerWordsCount: number;
  hesitationMarkers: number;
  vagueTermsCount: number;
  responseTimeMs: number;
}
