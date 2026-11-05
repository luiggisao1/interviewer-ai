export type Role =
  "Software Engineer" | "Frontend Engineer" | "Backend Engineer" | "Data Scientist" | "Product Manager" | "Custom Role";
export type Mode = "Technical" | "Behavioral" | "Mixed";
export type Difficulty = "Junior" | "Mid-level" | "Senior";
export type AudioMode = "web" | "gemini_live" | "openai_realtime";

export interface InterviewConfig {
  role: Role;
  custom_role: string;
  mode: Mode;
  difficulty: Difficulty;
  duration_minutes: number;
  custom_instructions: string;
  provider?: string;
  evaluation_provider?: string;
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
