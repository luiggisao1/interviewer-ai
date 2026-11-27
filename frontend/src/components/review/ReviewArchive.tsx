import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Layers,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import { api } from "../../api";
import type {
  HistoryFilters,
  HistoryQueryParams,
  StorageMode,
  StoredSessionDetail,
  StoredSessionSummary,
  StudyGuideSection,
} from "../../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface ReviewArchiveProps {
  onStartNew: () => void;
}

interface TopicSessionGroup {
  key: string;
  displayName: string;
  sessions: StoredSessionSummary[];
}

const ALL_SENTINEL = "__all__";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function slugify(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "item";
}

function formatDateForFilename(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "session";
  return date.toISOString().slice(0, 10);
}

function groupSessionsByTopic(sessions: StoredSessionSummary[]): TopicSessionGroup[] {
  const groups = new Map<string, TopicSessionGroup>();
  for (const session of sessions) {
    const displayName = session.study_guide_section.trim() || session.role.trim() || "General";
    const key = displayName.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.sessions.push(session);
    } else {
      groups.set(key, { key, displayName, sessions: [session] });
    }
  }
  for (const group of groups.values()) {
    group.sessions.sort((a, b) => {
      const scoreA = a.overall_score ?? -1;
      const scoreB = b.overall_score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.created_at.localeCompare(a.created_at);
    });
  }
  return Array.from(groups.values());
}

function getScoreBadgeClass(score: number): string {
  if (score >= 85) return "bg-emerald-50 border-emerald-200 text-verified-deep";
  if (score >= 70) return "bg-sky-50 border-sky-200 text-sky-800";
  if (score >= 55) return "bg-amber-50 border-amber-200 text-accent-deep";
  return "bg-red-50 border-red-200 text-danger-deep";
}

function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface AnswerComparisonGridProps {
  storageMode: StorageMode;
  candidateAnswer: string | null;
  seniorAnswer: string;
  whyStronger: string;
  showCandidateAnswers: boolean;
  showSeniorAnswers: boolean;
}

const AnswerComparisonGrid: React.FC<AnswerComparisonGridProps> = ({
  storageMode,
  candidateAnswer,
  seniorAnswer,
  whyStronger,
  showCandidateAnswers,
  showSeniorAnswers,
}) => {
  if (!showCandidateAnswers && !showSeniorAnswers) {
    return (
      <div className="bg-muted/70 border border-border rounded-lg px-4 py-3 text-xs text-ink-muted italic">
        Both answer panels are hidden. Enable &ldquo;Candidate Answers&rdquo; or &ldquo;LLM Senior Answers&rdquo; above to inspect responses.
      </div>
    );
  }

  const gridCols = showCandidateAnswers && showSeniorAnswers ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
  const hasSeniorText = seniorAnswer.trim().length > 0;

  return (
    <div className={`grid ${gridCols} gap-3.5`}>
      {showCandidateAnswers && (
        <div className="bg-muted/70 p-4 rounded-lg border border-border flex flex-col gap-1.5">
          <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
            Candidate Answer
          </span>
          {candidateAnswer !== null ? (
            <p className="text-[14px] text-ink leading-relaxed font-sans whitespace-pre-wrap">
              {candidateAnswer || "No response recorded."}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-xs text-ink-muted italic py-1">
              <Shield className="w-3.5 h-3.5 text-accent-deep shrink-0" aria-hidden="true" />
              <span>
                Candidate answer not stored (
                {storageMode === "senior_only" ? "Senior-only mode" : "Omitted"}).
              </span>
            </div>
          )}
        </div>
      )}

      {showSeniorAnswers && (
        <div className="bg-emerald-50/70 p-4 rounded-lg border border-emerald-200 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono font-bold text-verified-deep uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{hasSeniorText ? "LLM Suggested Senior Answer" : "Gold Standard Validation"}</span>
            </span>
          </div>

          {hasSeniorText ? (
            <>
              <p className="text-[14px] text-ink leading-relaxed font-sans whitespace-pre-wrap">
                {seniorAnswer}
              </p>
              {whyStronger.trim() && (
                <div className="mt-1 bg-surface border border-accent/30 rounded-lg p-2.5 text-xs text-ink-secondary leading-relaxed">
                  <strong className="text-accent-deep font-semibold">Why stronger: </strong>
                  {whyStronger}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-2 text-[13.5px] text-emerald-950 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-verified-deep shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {whyStronger.trim() || "Candidate response already matched senior benchmark bar."}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ReviewArchive: React.FC<ReviewArchiveProps> = ({ onStartNew }) => {
  const [showCandidateAnswers, setShowCandidateAnswers] = useState(true);
  const [showSeniorAnswers, setShowSeniorAnswers] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>(ALL_SENTINEL);
  const [selectedStorageMode, setSelectedStorageMode] = useState<string>(ALL_SENTINEL);

  const [filters, setFilters] = useState<HistoryFilters>({ candidates: [], sections: [] });
  const [guideSections, setGuideSections] = useState<StudyGuideSection[]>([]);
  const [sessions, setSessions] = useState<StoredSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<StoredSessionDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void api
      .studyGuideSections()
      .then((sections) => setGuideSections(sections))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const activeQuery = useCallback((): HistoryQueryParams => {
    return {
      section: selectedSection === ALL_SENTINEL ? undefined : selectedSection,
      storage_mode:
        selectedStorageMode === ALL_SENTINEL ? undefined : (selectedStorageMode as StorageMode),
      search: debouncedSearch || undefined,
    };
  }, [selectedSection, selectedStorageMode, debouncedSearch]);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = activeQuery();

    try {
      const [filterData, sessionsData] = await Promise.all([
        api.historyFilters(),
        api.listSessions(query),
      ]);
      setFilters(filterData);
      setSessions(sessionsData);

      setSelectedSessionId((currentId) => {
        if (currentId && sessionsData.some((s) => s.id === currentId)) {
          return currentId;
        }
        return sessionsData[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved interview responses.");
    } finally {
      setLoading(false);
    }
  }, [activeQuery]);

  useEffect(() => {
    void loadArchive();
  }, [loadArchive]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedSessionDetail(null);
      return;
    }

    let cancelled = false;
    async function loadDetail(sessionId: string) {
      setDetailLoading(true);
      try {
        const detail = await api.getSession(sessionId);
        if (!cancelled) {
          setSelectedSessionDetail(detail);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load session details.");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail(selectedSessionId);
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const topicGroups = useMemo(() => groupSessionsByTopic(sessions), [sessions]);

  const activeStudyGuideText = useMemo(() => {
    if (!selectedSessionDetail) return "";
    const savedText = selectedSessionDetail.study_guide_content?.trim();
    if (savedText) return savedText;
    const topicKey = selectedSessionDetail.study_guide_section.trim().toLowerCase();
    if (!topicKey) return "";
    return (
      guideSections.find((s) => s.title.trim().toLowerCase() === topicKey)?.content.trim() || ""
    );
  }, [selectedSessionDetail, guideSections]);

  const previewBlocks = useMemo(() => {
    if (!activeStudyGuideText) return [];
    return activeStudyGuideText
      .replace(/\f/g, "\n\n")
      .replace(/^Generated on\b.*$/gim, "")
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean);
  }, [activeStudyGuideText]);

  function buildSessionFilename(sessionId: string): string {
    const summary =
      selectedSessionDetail?.id === sessionId
        ? selectedSessionDetail
        : sessions.find((s) => s.id === sessionId);
    if (!summary) {
      return `interview-session-${sessionId.slice(0, 8)}.md`;
    }
    const topicSlug = slugify(summary.study_guide_section || summary.role);
    const difficultySlug = slugify(summary.difficulty);
    const datePart = formatDateForFilename(summary.created_at);
    return `${topicSlug}-${difficultySlug}-${datePart}.md`;
  }

  async function handleExportMarkdown(options?: { sessionId?: string; section?: string }) {
    setExporting(true);
    setError("");
    const sessionId = options?.sessionId;
    const section = options?.section;

    try {
      const markdown = await api.exportMarkdown({
        ...(sessionId
          ? { session_id: sessionId }
          : section
            ? { ...activeQuery(), section, view: "sessions" }
            : { ...activeQuery(), view: "sessions" }),
        include_candidate_answers: showCandidateAnswers,
        include_senior_answers: showSeniorAnswers,
      });

      const filename = sessionId
        ? buildSessionFilename(sessionId)
        : section
          ? `${slugify(section)}-sessions.md`
          : "interview-archive-sessions.md";

      downloadMarkdown(markdown, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export Markdown.");
    } finally {
      setExporting(false);
    }
  }

  const totalSessions = sessions.length;
  const totalTopics = topicGroups.length;
  const activePreviewTitle =
    selectedSessionDetail?.study_guide_section ||
    selectedSessionDetail?.plan_title ||
    "Study Guide";

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden w-full max-w-[1320px] mx-auto py-1">
      {/* Top Toolbar */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-5 shadow-editorial flex flex-col gap-4 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/25 text-accent-deep flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="font-serif text-xl font-semibold text-ink tracking-tight">
                  Interview Response Archive
                </h1>
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="bg-surface border border-border-strong text-ink px-2 py-0.5 rounded-full">
                    {totalSessions} {totalSessions === 1 ? "Session" : "Sessions"}
                  </span>
                  <span className="bg-amber-50 border border-amber-200 text-accent-deep px-2 py-0.5 rounded-full">
                    {totalTopics} {totalTopics === 1 ? "Topic" : "Topics"}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-muted border border-border text-ink-muted px-2 py-0.5 rounded-full">
                    <Lock className="w-2.5 h-2.5 text-ink-muted" aria-hidden="true" />
                    <span>Anonymous · Read-Only</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Top 3 highest-scored sessions per topic (plus Senior Only benchmarks), grouped anonymously by study topic.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exporting || !selectedSessionId}
              onClick={() => selectedSessionId && void handleExportMarkdown({ sessionId: selectedSessionId })}
              title="Download only the currently selected session as Markdown (.md)"
              className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-verified-deep border border-emerald-200 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{exporting ? "Exporting…" : "Export Selected .md"}</span>
            </button>
            <button
              type="button"
              disabled={exporting || sessions.length === 0}
              onClick={() => void handleExportMarkdown()}
              title="Download all filtered sessions combined as Markdown (.md)"
              className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-lg text-xs font-semibold bg-muted/70 hover:bg-surface text-ink border border-border-strong transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Download className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              <span>Export All .md</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Display Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center pt-3 border-t border-border">
          <div className="lg:col-span-6 relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search questions, answers, topics..."
              className="bg-muted/60 border border-border-strong rounded-lg pl-9 pr-3.5 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
            />
          </div>

          <div className="lg:col-span-2">
            <Select value={selectedSection} onValueChange={setSelectedSection}>
              <SelectTrigger aria-label="Filter by topic">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Topics</SelectItem>
                {filters.sections.map((sec) => (
                  <SelectItem key={sec} value={sec}>
                    {sec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-2">
            <Select value={selectedStorageMode} onValueChange={setSelectedStorageMode}>
              <SelectTrigger aria-label="Filter by storage mode">
                <SelectValue placeholder="All Modes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Modes</SelectItem>
                <SelectItem value="all">My Answers + Senior</SelectItem>
                <SelectItem value="senior_only">Senior Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-2 flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setShowCandidateAnswers((v) => !v)}
              title="Toggle candidate answers visibility"
              className={`flex items-center gap-1 px-2.5 h-[42px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                showCandidateAnswers
                  ? "bg-surface border-accent/40 text-accent-deep"
                  : "bg-muted/70 border-border text-ink-muted hover:text-ink"
              }`}
            >
              {showCandidateAnswers ? <Eye className="w-3.5 h-3.5" aria-hidden="true" /> : <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>Answers</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSeniorAnswers((v) => !v)}
              title="Toggle LLM senior answers visibility"
              className={`flex items-center gap-1 px-2.5 h-[42px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                showSeniorAnswers
                  ? "bg-emerald-50 border-emerald-300 text-verified-deep"
                  : "bg-muted/70 border-border text-ink-muted hover:text-ink"
              }`}
            >
              {showSeniorAnswers ? <Eye className="w-3.5 h-3.5" aria-hidden="true" /> : <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>Senior</span>
            </button>

            <button
              type="button"
              onClick={() => void loadArchive()}
              title="Refresh archive"
              aria-label="Refresh archive"
              className="w-[42px] h-[42px] rounded-lg bg-muted/70 border border-border-strong hover:bg-surface text-ink-secondary hover:text-ink flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-accent-deep" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-danger-deep px-4 py-2.5 rounded-xl text-xs font-medium shrink-0">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      {loading && sessions.length === 0 ? (
        <div className="flex-1 min-h-0 bg-card border border-border rounded-xl flex flex-col items-center justify-center gap-3 text-ink-muted text-sm">
          <RefreshCw className="w-6 h-6 animate-spin text-accent-deep" aria-hidden="true" />
          <span>Loading saved interview responses…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex-1 min-h-0 bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface border border-border-strong flex items-center justify-center text-accent-deep">
            <MessageSquare className="w-6 h-6" aria-hidden="true" />
          </div>
          <h2 className="font-serif text-lg font-semibold text-ink">No saved interview responses found</h2>
          <p className="text-sm text-ink-muted max-w-md">
            Complete an interview with &ldquo;My Answers + Senior&rdquo; or &ldquo;Senior Only&rdquo; selected, or adjust your search filters above.
          </p>
          <button
            type="button"
            onClick={onStartNew}
            className="mt-2 inline-flex items-center gap-2 bg-ink hover:bg-ink/90 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Start New Interview</span>
          </button>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
          {/* Left Column (4 cols): Sessions grouped by Topic */}
          <div className="lg:col-span-4 bg-card border border-border rounded-xl p-4 flex flex-col gap-4 min-h-0 overflow-y-auto shadow-editorial">
            {topicGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen className="w-4 h-4 text-accent-deep shrink-0" aria-hidden="true" />
                    <span className="font-serif text-base font-semibold text-ink truncate">
                      {group.displayName}
                    </span>
                    <span className="text-[11px] font-mono bg-muted border border-border text-ink-muted px-2 py-0.5 rounded-full shrink-0">
                      {group.sessions.length} {group.sessions.length === 1 ? "session" : "sessions"}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void handleExportMarkdown({ section: group.displayName })}
                    title={`Export all ${group.displayName} sessions (.md)`}
                    aria-label={`Export all ${group.displayName} sessions`}
                    className="p-1.5 rounded-md text-ink-muted hover:text-verified-deep hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-colors cursor-pointer disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {group.sessions.map((session) => {
                    const isSelected = session.id === selectedSessionId;
                    return (
                      <div
                        key={session.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSessionId(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedSessionId(session.id);
                          }
                        }}
                        className={`rounded-xl p-3 border transition-colors cursor-pointer flex flex-col gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          isSelected
                            ? "bg-surface border-accent/60 shadow-sm"
                            : "bg-muted/40 border-border hover:border-border-strong"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-ink line-clamp-1">
                            {session.plan_title || `${session.difficulty} ${session.role}`}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {session.overall_score !== null ? (
                              <span
                                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${getScoreBadgeClass(
                                  session.overall_score
                                )}`}
                              >
                                {session.overall_score}/100
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-accent-deep">
                                Senior Only
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Layers className="w-3 h-3 text-accent-deep" aria-hidden="true" />
                            <span>
                              {session.difficulty} · {session.role} · {session.response_count} Q
                            </span>
                          </span>
                          <span>{formatDate(session.created_at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Right Column (8 cols): Session Detail */}
          <div className="lg:col-span-8 bg-card border border-border rounded-xl p-5 flex flex-col gap-4 min-h-0 overflow-y-auto shadow-editorial">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-ink-muted text-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-accent-deep" aria-hidden="true" />
                <span>Loading session details…</span>
              </div>
            ) : !selectedSessionDetail ? (
              <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">
                Select a session on the left to inspect its questions and answers.
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-border shrink-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-serif text-lg font-semibold text-ink">
                        {selectedSessionDetail.study_guide_section ||
                          selectedSessionDetail.plan_title ||
                          selectedSessionDetail.role}
                      </h2>
                      <span className="text-xs text-ink-muted">
                        · {selectedSessionDetail.difficulty} {selectedSessionDetail.role} ({selectedSessionDetail.mode})
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted mt-1">
                      {selectedSessionDetail.plan_title ? `${selectedSessionDetail.plan_title} · ` : ""}
                      Engine:{" "}
                      <span className="uppercase font-mono text-ink">
                        {selectedSessionDetail.provider}
                      </span>{" "}
                      · {formatDate(selectedSessionDetail.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {selectedSessionDetail.overall_score !== null ? (
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-full border w-fit ${getScoreBadgeClass(
                          selectedSessionDetail.overall_score
                        )}`}
                      >
                        <Award className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Score: {selectedSessionDetail.overall_score} / 100</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1 rounded-full border bg-amber-50 border-amber-200 text-accent-deep w-fit">
                        <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Senior Benchmark Only</span>
                      </span>
                    )}

                    {activeStudyGuideText && (
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        title="Preview the study guide or custom notes used for this session"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface hover:bg-muted text-accent-deep border border-border-strong transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Preview Study Guide</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void handleExportMarkdown({ sessionId: selectedSessionDetail.id })}
                      title="Download this session as Markdown (.md)"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-verified-deep border border-emerald-200 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Export This Session .md</span>
                    </button>
                  </div>
                </div>

                {selectedSessionDetail.summary && (
                  <div className="bg-surface border border-border rounded-xl p-4 text-sm text-ink-secondary leading-relaxed">
                    <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider block mb-1">
                      Executive Summary
                    </span>
                    {selectedSessionDetail.summary}
                  </div>
                )}

                {selectedSessionDetail.responses.length === 0 ? (
                  <div className="bg-muted/60 border border-border rounded-xl p-6 text-center text-sm text-ink-muted">
                    No question-answer pairs were recorded for this session.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {selectedSessionDetail.responses.map((item) => (
                      <article
                        key={item.id}
                        className="bg-surface/40 border border-border rounded-xl p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold bg-accent/10 border border-accent/25 text-accent-deep px-2 py-0.5 rounded shrink-0 mt-0.5">
                            Q{item.question_order}
                          </span>
                          <h3 className="font-serif text-base font-semibold text-ink leading-snug">
                            {item.question}
                          </h3>
                        </div>

                        <AnswerComparisonGrid
                          storageMode={selectedSessionDetail.storage_mode}
                          candidateAnswer={item.candidate_answer}
                          seniorAnswer={item.senior_answer}
                          whyStronger={item.why_stronger}
                          showCandidateAnswers={showCandidateAnswers}
                          showSeniorAnswers={showSeniorAnswers}
                        />
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Study Guide Preview Reading Drawer */}
      {previewOpen && activeStudyGuideText && (
        <div
          className="fixed inset-0 bg-ink/35 backdrop-blur-sm z-[1000] flex justify-end"
          onClick={() => setPreviewOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Study Guide Preview: ${activePreviewTitle}`}
            className="w-full max-w-xl h-full bg-paper border-l border-border-strong p-6 flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border shrink-0">
              <div>
                <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block">
                  {selectedSessionDetail?.study_guide_content?.trim()
                    ? "Session Grounding Material"
                    : "study_guide.md"}
                </span>
                <h2 className="font-serif text-xl font-semibold text-ink mt-0.5">
                  {activePreviewTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="inline-flex items-center gap-1.5 bg-card hover:bg-muted border border-border-strong text-ink px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 pr-1 flex flex-col gap-3">
              {previewBlocks.map((block, idx) => {
                const isShortHeading =
                  block.length < 72 && !block.includes(".") && !block.includes(":");
                return isShortHeading ? (
                  <h3
                    key={idx}
                    className="font-serif text-base font-semibold text-ink pt-2 first:pt-0 border-b border-border/60 pb-1"
                  >
                    {block}
                  </h3>
                ) : (
                  <p key={idx} className="text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
                    {block}
                  </p>
                );
              })}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
