export type Role =
  "Software Engineer" | "Frontend Engineer" | "Backend Engineer" | "Data Scientist" | "Product Manager" | "Custom Role";
export type Mode = "Technical" | "Behavioral" | "Mixed";
export type Difficulty = "Junior" | "Mid-level" | "Senior";
export type AudioMode = "web" | "gemini_live" | "openai_realtime";
export type StorageMode = "all" | "senior_only" | "none";

export interface InterviewConfig {
  role: Role;
  custom_role: string;
  mode: Mode;
  difficulty: Difficulty;
  duration_minutes: number;
  custom_instructions: string;
  provider?: string;
  evaluation_provider?: string;
  candidate_name: string;
  storage_mode: StorageMode;
  study_guide_section?: string;
}
export interface StudyGuideSection {
  id: string;
  title: string;
  content: string;
}
export interface Plan {
  title: string;
  summary: string;
  focus_areas: string[];
  questions: string[];
  estimated_turns: number;
}
export interface Message {
  role: "interviewer" | "candidate";
  content: string;
}
export interface SeniorAnswer {
  question: string;
  candidate_answer: string;
  senior_answer: string;
  why_stronger: string;
}
export interface Evaluation {
  overall_score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  study_guide_feedback: string[];
  technical_feedback: string[];
  senior_answers: SeniorAnswer[];
  next_steps: string[];
}

export interface StoredResponseItem {
  id: number;
  session_id: string;
  candidate_name: string;
  storage_mode: StorageMode;
  role: string;
  difficulty: string;
  mode: string;
  study_guide_section: string;
  plan_title: string;
  provider: string;
  overall_score: number | null;
  question_order: number;
  question: string;
  candidate_answer: string | null;
  senior_answer: string;
  why_stronger: string;
  created_at: string;
}

export interface StoredSessionSummary {
  id: string;
  candidate_name: string;
  storage_mode: StorageMode;
  role: string;
  difficulty: string;
  mode: string;
  study_guide_section: string;
  plan_title: string;
  provider: string;
  overall_score: number | null;
  summary: string;
  response_count: number;
  created_at: string;
}

export interface StoredSessionDetail extends StoredSessionSummary {
  study_guide_content?: string;
  responses: StoredResponseItem[];
}

export interface QuestionAnswerEntry {
  response_id: number;
  session_id: string;
  candidate_name: string;
  storage_mode: StorageMode;
  difficulty: string;
  role: string;
  study_guide_section: string;
  overall_score: number | null;
  candidate_answer: string | null;
  senior_answer: string;
  why_stronger: string;
  created_at: string;
}

export interface QuestionGroup {
  question: string;
  study_guide_section: string;
  answer_count: number;
  entries: QuestionAnswerEntry[];
}

export interface HistoryFilters {
  candidates: string[];
  sections: string[];
}

export interface HistoryQueryParams {
  candidate_name?: string;
  section?: string;
  storage_mode?: StorageMode | "";
  search?: string;
}

export interface AccessKeySummary {
  id: string;
  label: string;
  key_prefix: string;
  is_active: boolean;
  max_uses: number | null;
  uses_count: number;
  requests_used: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface CreateAccessKeyResponse extends AccessKeySummary {
  raw_key: string;
}
