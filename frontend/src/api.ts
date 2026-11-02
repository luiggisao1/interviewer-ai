import type { Evaluation, InterviewConfig, Message, Plan, StudyGuideSection } from "./types";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function connectionError(error: unknown): Error {
  if (error instanceof DOMException && error.name === "AbortError") {
    return new Error("The AI request took too long. Please try again; your transcript is still available.");
  }
  return new Error("Cannot reach the API. Confirm the backend is running and try again.");
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}${path}`,
      body === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch (error) {
    throw connectionError(error);
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { detail?: string | Array<{ msg: string }> };
    const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg).join(", ") : data.detail;
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function createRealtimeCall(
  sdp: string,
  study_guide: string,
  config: InterviewConfig,
  plan: Plan,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}/realtime/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp, study_guide, config, plan }),
    });
  } catch (error) {
    throw connectionError(error);
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(data.detail || `Voice connection failed (${response.status})`);
  }
  return response.text();
}

export const api = {
  health: () => request<{ status: string; provider: string; recruiter_name?: string }>("/health"),
  providers: () => request<{ active: string; available: string[]; recruiter_name?: string }>("/providers"),
  studyGuideSections: () => request<StudyGuideSection[]>("/study-guide/sections"),
  createRealtimeCall,
  createPlan: (study_guide: string, config: InterviewConfig) =>
    request<{ plan: Plan; opening_message: string; provider: string }>("/plan", { study_guide, config }),
  nextTurn: (plan: Plan, config: InterviewConfig, transcript: Message[], candidate_answer: string) =>
    request<{ interviewer_message: string; is_complete: boolean; turn_number: number }>("/turn", {
      plan,
      config,
      transcript,
      candidate_answer,
    }),
  evaluate: (study_guide: string, config: InterviewConfig, plan: Plan, transcript: Message[]) =>
    request<{ evaluation: Evaluation; provider: string }>("/evaluation", { study_guide, config, plan, transcript }),
};
