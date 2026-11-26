import type {
  AccessKeySummary,
  CreateAccessKeyResponse,
  Evaluation,
  HistoryFilters,
  HistoryQueryParams,
  InterviewConfig,
  Message,
  Plan,
  QuestionGroup,
  StorageMode,
  StoredResponseItem,
  StoredSessionDetail,
  StoredSessionSummary,
  StudyGuideSection,
} from "./types";

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000/api").replace(/\/$/, "");

export function getRealtimeWsUrl(): string {
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/realtime/ws`;
}

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

async function throwIfNotOk(response: Response, fallbackPrefix: string): Promise<void> {
  if (response.ok) return;
  const data = (await response.json().catch(() => ({}))) as { detail?: string | Array<{ msg: string }> };
  const detail = Array.isArray(data.detail) ? data.detail.map((item) => item.msg).join(", ") : data.detail;
  throw new Error(detail || `${fallbackPrefix} (${response.status})`);
}

function accessHeaders(accessKey?: string): Record<string, string> | undefined {
  const trimmed = accessKey?.trim();
  return trimmed ? { "X-Access-Key": trimmed } : undefined;
}

function adminHeaders(adminSecret: string): Record<string, string> {
  return { "X-Admin-Secret": adminSecret.trim() };
}

async function request<T>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  let response: Response;
  const init: RequestInit | undefined =
    body === undefined
      ? extraHeaders
        ? { headers: extraHeaders }
        : undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", ...extraHeaders },
          body: JSON.stringify(body),
        };
  try {
    response = await fetchWithTimeout(`${API_URL}${path}`, init);
  } catch (error) {
    throw connectionError(error);
  }
  await throwIfNotOk(response, "Request failed");
  return response.json() as Promise<T>;
}

function appendHistoryFilters(searchParams: URLSearchParams, params?: HistoryQueryParams): void {
  if (!params) return;
  if (params.candidate_name?.trim()) searchParams.set("candidate_name", params.candidate_name.trim());
  if (params.section?.trim()) searchParams.set("section", params.section.trim());
  if (params.storage_mode) searchParams.set("storage_mode", params.storage_mode);
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
}

function buildQuery(params?: HistoryQueryParams): string {
  if (!params) return "";
  const searchParams = new URLSearchParams();
  appendHistoryFilters(searchParams, params);
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export interface ExportMarkdownParams extends HistoryQueryParams {
  view?: "questions" | "sessions";
  session_id?: string;
  include_candidate_answers?: boolean;
  include_senior_answers?: boolean;
}

async function exportMarkdown(params?: ExportMarkdownParams): Promise<string> {
  const searchParams = new URLSearchParams();
  appendHistoryFilters(searchParams, params);
  if (params?.view) searchParams.set("view", params.view);
  if (params?.session_id) searchParams.set("session_id", params.session_id);
  if (params?.include_candidate_answers !== undefined) {
    searchParams.set("include_candidate_answers", String(params.include_candidate_answers));
  }
  if (params?.include_senior_answers !== undefined) {
    searchParams.set("include_senior_answers", String(params.include_senior_answers));
  }
  const qs = searchParams.toString();
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}/history/export${qs ? `?${qs}` : ""}`);
  } catch (error) {
    throw connectionError(error);
  }
  await throwIfNotOk(response, "Export failed");
  return response.text();
}

async function createRealtimeCall(
  sdp: string,
  study_guide: string,
  config: InterviewConfig,
  plan: Plan,
  accessKey?: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}/realtime/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...accessHeaders(accessKey) },
      body: JSON.stringify({ sdp, study_guide, config, plan }),
    });
  } catch (error) {
    throw connectionError(error);
  }
  await throwIfNotOk(response, "Voice connection failed");
  return response.text();
}

export const api = {
  health: () => request<{ status: string; provider: string; recruiter_name?: string }>("/health"),
  providers: () =>
    request<{ active: string; available: string[]; recruiter_name?: string; require_access_key?: boolean }>(
      "/providers",
    ),
  studyGuideSections: () => request<StudyGuideSection[]>("/study-guide/sections"),
  createRealtimeCall,
  createPlan: (study_guide: string, config: InterviewConfig, accessKey?: string) =>
    request<{ plan: Plan; opening_message: string; provider: string }>(
      "/plan",
      { study_guide, config },
      accessHeaders(accessKey),
    ),
  nextTurn: (
    plan: Plan,
    config: InterviewConfig,
    transcript: Message[],
    candidate_answer: string,
    accessKey?: string,
  ) =>
    request<{ interviewer_message: string; is_complete: boolean; turn_number: number }>(
      "/turn",
      {
        plan,
        config,
        transcript,
        candidate_answer,
      },
      accessHeaders(accessKey),
    ),
  evaluate: (
    study_guide: string,
    config: InterviewConfig,
    plan: Plan,
    transcript: Message[],
    accessKey?: string,
  ) =>
    request<{
      evaluation: Evaluation;
      provider: string;
      saved_session_id?: string | null;
      storage_mode?: StorageMode;
    }>(
      "/evaluation",
      { study_guide, config, plan, transcript },
      accessHeaders(accessKey),
    ),
  listSessions: (filters?: HistoryQueryParams) =>
    request<StoredSessionSummary[]>(`/history/sessions${buildQuery(filters)}`),
  getSession: (sessionId: string) =>
    request<StoredSessionDetail>(`/history/sessions/${encodeURIComponent(sessionId)}`),
  listQuestions: (filters?: HistoryQueryParams) =>
    request<QuestionGroup[]>(`/history/questions${buildQuery(filters)}`),
  listResponses: (filters?: HistoryQueryParams) =>
    request<StoredResponseItem[]>(`/history/responses${buildQuery(filters)}`),
  historyFilters: () => request<HistoryFilters>("/history/filters"),
  exportMarkdown,
  adminVerify: (adminSecret: string) =>
    request<{ authenticated: boolean; require_access_key: boolean }>(
      "/admin/verify",
      undefined,
      adminHeaders(adminSecret),
    ),
  adminListKeys: (adminSecret: string) =>
    request<AccessKeySummary[]>("/admin/keys", undefined, adminHeaders(adminSecret)),
  adminCreateKey: (
    adminSecret: string,
    payload: { label: string; max_uses: number | null; expires_in_days: number | null },
  ) => request<CreateAccessKeyResponse>("/admin/keys", payload, adminHeaders(adminSecret)),
  adminRevokeKey: (adminSecret: string, keyId: string) =>
    request<AccessKeySummary>(
      `/admin/keys/${encodeURIComponent(keyId)}/revoke`,
      {},
      adminHeaders(adminSecret),
    ),
  adminActivateKey: (adminSecret: string, keyId: string) =>
    request<AccessKeySummary>(
      `/admin/keys/${encodeURIComponent(keyId)}/activate`,
      {},
      adminHeaders(adminSecret),
    ),
};
