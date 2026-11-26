import React, { useCallback, useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  Layers,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { api } from "../../api";
import type {
  HistoryFilters,
  HistoryQueryParams,
  QuestionGroup,
  StorageMode,
  StoredSessionDetail,
  StoredSessionSummary,
} from "../../types";
import { SegmentedControl } from "../ui/segmented-control";
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

type ArchiveView = "questions" | "sessions";

const ALL_SENTINEL = "__all__";

const VIEW_OPTIONS: { value: ArchiveView; label: string }[] = [
  { value: "questions", label: "Compare by Question" },
  { value: "sessions", label: "Browse by Person / Session" },
];

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

function getScoreBadgeClass(score: number): string {
  if (score >= 85) return "bg-emerald-950/70 border-emerald-500/40 text-emerald-300";
  if (score >= 70) return "bg-blue-950/70 border-blue-500/40 text-blue-300";
  if (score >= 55) return "bg-amber-950/70 border-amber-500/40 text-amber-300";
  return "bg-red-950/70 border-red-500/40 text-red-300";
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
  candidateName: string;
  storageMode: StorageMode;
  candidateAnswer: string | null;
  seniorAnswer: string;
  whyStronger: string;
  showCandidateAnswers: boolean;
  showSeniorAnswers: boolean;
}

const AnswerComparisonGrid: React.FC<AnswerComparisonGridProps> = ({
  candidateName,
  storageMode,
  candidateAnswer,
  seniorAnswer,
  whyStronger,
  showCandidateAnswers,
  showSeniorAnswers,
}) => {
  if (!showCandidateAnswers && !showSeniorAnswers) {
    return (
      <div className="bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-xs text-slate-400 italic">
        Both answer panels are hidden. Enable &ldquo;Candidate Answers&rdquo; or &ldquo;LLM Senior Answers&rdquo; above to inspect responses.
      </div>
    );
  }

  const gridCols = showCandidateAnswers && showSeniorAnswers ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
  const hasSeniorText = seniorAnswer.trim().length > 0;

  return (
    <div className={`grid ${gridCols} gap-3.5`}>
      {showCandidateAnswers && (
        <div className="bg-black/40 p-4 rounded-xl border border-white/10 flex flex-col gap-1.5">
          <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
            {candidateName}&rsquo;s Answer
          </span>
          {candidateAnswer !== null ? (
            <p className="text-[14px] text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
              {candidateAnswer || "No response recorded."}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400 italic py-1">
              <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                Candidate answer not stored (
                {storageMode === "senior_only" ? "Senior-only mode" : "Omitted"}).
              </span>
            </div>
          )}
        </div>
      )}

      {showSeniorAnswers && (
        <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-500/30 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{hasSeniorText ? "LLM Suggested Senior Answer" : "Gold Standard Validation"}</span>
            </span>
          </div>

          {hasSeniorText ? (
            <>
              <p className="text-[14px] text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                {seniorAnswer}
              </p>
              {whyStronger.trim() && (
                <div className="mt-1 bg-blue-950/35 border border-blue-500/20 rounded-lg p-2.5 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-sky-300 font-semibold">Why stronger: </strong>
                  {whyStronger}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-2 text-[13.5px] text-emerald-200 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
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
  const [view, setView] = useState<ArchiveView>("questions");
  const [showCandidateAnswers, setShowCandidateAnswers] = useState(true);
  const [showSeniorAnswers, setShowSeniorAnswers] = useState(true);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<string>(ALL_SENTINEL);
  const [selectedSection, setSelectedSection] = useState<string>(ALL_SENTINEL);
  const [selectedStorageMode, setSelectedStorageMode] = useState<string>(ALL_SENTINEL);

  const [filters, setFilters] = useState<HistoryFilters>({ candidates: [], sections: [] });
  const [questionGroups, setQuestionGroups] = useState<QuestionGroup[]>([]);
  const [sessions, setSessions] = useState<StoredSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<StoredSessionDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const activeQuery = useCallback((): HistoryQueryParams => {
    return {
      candidate_name: selectedCandidate === ALL_SENTINEL ? undefined : selectedCandidate,
      section: selectedSection === ALL_SENTINEL ? undefined : selectedSection,
      storage_mode:
        selectedStorageMode === ALL_SENTINEL ? undefined : (selectedStorageMode as StorageMode),
      search: debouncedSearch || undefined,
    };
  }, [selectedCandidate, selectedSection, selectedStorageMode, debouncedSearch]);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = activeQuery();

    try {
      const [filterData, groupsData, sessionsData] = await Promise.all([
        api.historyFilters(),
        api.listQuestions(query),
        api.listSessions(query),
      ]);
      setFilters(filterData);
      setQuestionGroups(groupsData);
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

  async function handleExportMarkdown(sessionId?: string) {
    setExporting(true);
    setError("");
    try {
      const markdown = await api.exportMarkdown({
        ...(sessionId ? { session_id: sessionId } : { ...activeQuery(), view }),
        include_candidate_answers: showCandidateAnswers,
        include_senior_answers: showSeniorAnswers,
      });
      const filename = sessionId
        ? `interview-session-${sessionId.slice(0, 8)}.md`
        : `interview-archive-${view}.md`;
      downloadMarkdown(markdown, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export Markdown.");
    } finally {
      setExporting(false);
    }
  }

  const totalPeople = filters.candidates.length;
  const totalSessions = sessions.length;
  const totalQuestions = questionGroups.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden w-full max-w-[1320px] mx-auto py-1">
      {/* Top Toolbar */}
      <div className="bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-4 md:p-5 shadow-xl flex flex-col gap-4 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  Interview Response Archive
                </h1>
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className="bg-sky-950/70 border border-sky-500/25 text-sky-300 px-2 py-0.5 rounded-full">
                    {totalSessions} {totalSessions === 1 ? "Session" : "Sessions"}
                  </span>
                  <span className="bg-emerald-950/60 border border-emerald-500/25 text-emerald-300 px-2 py-0.5 rounded-full">
                    {totalQuestions} {totalQuestions === 1 ? "Question" : "Questions"}
                  </span>
                  <span className="bg-purple-950/60 border border-purple-500/25 text-purple-300 px-2 py-0.5 rounded-full">
                    {totalPeople} {totalPeople === 1 ? "Person" : "People"}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-slate-800/80 border border-white/10 text-slate-300 px-2 py-0.5 rounded-full">
                    <Lock className="w-2.5 h-2.5 text-slate-400" />
                    <span>Read-Only</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Compare how different candidates answered each question alongside the LLM-suggested senior benchmark answers
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <SegmentedControl<ArchiveView>
              options={VIEW_OPTIONS}
              value={view}
              onChange={setView}
              size="sm"
              className="w-full sm:w-auto"
            />
            <button
              type="button"
              disabled={exporting || (view === "questions" ? questionGroups.length === 0 : sessions.length === 0)}
              onClick={() => void handleExportMarkdown()}
              title="Download filtered archive as Markdown (.md)"
              className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-[10px] text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? "Exporting…" : "Export .md"}</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Display Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center pt-3 border-t border-white/10">
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search questions, answers, names, topics..."
              className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] pl-9 pr-3.5 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors w-full"
            />
          </div>

          <div className="lg:col-span-2">
            <Select value={selectedCandidate} onValueChange={setSelectedCandidate}>
              <SelectTrigger aria-label="Filter by person">
                <SelectValue placeholder="All People" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All People</SelectItem>
                {filters.candidates.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              className={`flex items-center gap-1 px-2.5 h-[42px] rounded-[10px] text-xs font-semibold border transition-colors cursor-pointer ${
                showCandidateAnswers
                  ? "bg-blue-500/15 border-blue-500/30 text-sky-300"
                  : "bg-[#080D1A] border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              {showCandidateAnswers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Answers</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSeniorAnswers((v) => !v)}
              title="Toggle LLM senior answers visibility"
              className={`flex items-center gap-1 px-2.5 h-[42px] rounded-[10px] text-xs font-semibold border transition-colors cursor-pointer ${
                showSeniorAnswers
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-[#080D1A] border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              {showSeniorAnswers ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Senior</span>
            </button>

            <button
              type="button"
              onClick={() => void loadArchive()}
              title="Refresh archive"
              className="w-[42px] h-[42px] rounded-[10px] bg-[#080D1A] border border-blue-500/15 hover:border-blue-500/35 text-slate-300 hover:text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/15 border border-red-500/30 text-red-200 px-4 py-2.5 rounded-xl text-xs font-medium shrink-0">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      {loading && questionGroups.length === 0 && sessions.length === 0 ? (
        <div className="flex-1 min-h-0 bg-[#0E1626] border border-blue-500/15 rounded-[18px] flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
          <span>Loading saved interview responses…</span>
        </div>
      ) : (view === "questions" ? questionGroups.length === 0 : sessions.length === 0) ? (
        <div className="flex-1 min-h-0 bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-8 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center text-sky-400">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">No saved interview responses found</h2>
          <p className="text-sm text-slate-400 max-w-md">
            Complete an interview with &ldquo;My Answers + Senior&rdquo; or &ldquo;Senior Only&rdquo; selected, or adjust your search filters above.
          </p>
          <button
            type="button"
            onClick={onStartNew}
            className="mt-2 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Start New Interview</span>
          </button>
        </div>
      ) : view === "questions" ? (
        /* VIEW 1: Compare by Question */
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-4">
          {questionGroups.map((group, groupIdx) => (
            <section
              key={`${group.question}-${groupIdx}`}
              className="bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/30 rounded-[18px] p-5 shadow-xl flex flex-col gap-4 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 pb-3 border-b border-white/10">
                <div className="flex items-start gap-2.5">
                  <span className="text-xs font-mono font-bold bg-sky-950/70 border border-sky-500/30 text-sky-300 px-2.5 py-1 rounded shrink-0 mt-0.5">
                    Q{groupIdx + 1}
                  </span>
                  <h2 className="text-[15px] font-bold text-white leading-snug">{group.question}</h2>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {group.study_guide_section && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#080D1A] border border-blue-500/20 text-sky-300 px-2.5 py-1 rounded-full">
                      <BookOpen className="w-3 h-3" />
                      <span>{group.study_guide_section}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-blue-600/15 border border-blue-500/30 text-blue-300 px-2.5 py-1 rounded-full">
                    <Users className="w-3 h-3" />
                    <span>
                      {group.answer_count} {group.answer_count === 1 ? "response" : "responses"}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3.5">
                {group.entries.map((entry) => (
                  <article
                    key={entry.response_id}
                    className="bg-[#080D1A] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg">
                          <User className="w-3.5 h-3.5 text-sky-400" />
                          <span>{entry.candidate_name}</span>
                        </span>
                        <span className="text-xs text-slate-400">
                          {entry.difficulty} · {entry.role}
                        </span>
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                            entry.storage_mode === "senior_only"
                              ? "bg-sky-950/60 border-sky-500/30 text-sky-300"
                              : "bg-emerald-950/50 border-emerald-500/25 text-emerald-300"
                          }`}
                        >
                          {entry.storage_mode === "senior_only" ? "Senior Only" : "Full"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs">
                        {entry.overall_score !== null && (
                          <span
                            className={`inline-flex items-center gap-1 font-mono font-bold px-2.5 py-0.5 rounded-full border ${getScoreBadgeClass(
                              entry.overall_score
                            )}`}
                          >
                            <Award className="w-3 h-3" />
                            <span>{entry.overall_score}/100</span>
                          </span>
                        )}
                        <span className="text-slate-500 inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(entry.created_at)}</span>
                        </span>
                      </div>
                    </div>

                    <AnswerComparisonGrid
                      candidateName={entry.candidate_name}
                      storageMode={entry.storage_mode}
                      candidateAnswer={entry.candidate_answer}
                      seniorAnswer={entry.senior_answer}
                      whyStronger={entry.why_stronger}
                      showCandidateAnswers={showCandidateAnswers}
                      showSeniorAnswers={showSeniorAnswers}
                    />
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* VIEW 2: Browse by Person / Session */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
          {/* Left Column (4 cols): Session List */}
          <div className="lg:col-span-4 bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-4 flex flex-col gap-2.5 min-h-0 overflow-y-auto">
            {sessions.map((session) => {
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
                  className={`rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col gap-2 ${
                    isSelected
                      ? "bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-950/40"
                      : "bg-[#080D1A] border-white/10 hover:border-blue-500/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="font-bold text-sm text-white truncate">
                        {session.candidate_name}
                      </span>
                    </div>

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
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border bg-sky-950/60 border-sky-500/30 text-sky-300">
                          Senior Only
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 font-medium line-clamp-1">
                    {session.plan_title || `${session.difficulty} ${session.role}`}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3 h-3 text-sky-400" />
                      <span>
                        {session.study_guide_section || session.role} · {session.response_count} Q
                      </span>
                    </span>
                    <span>{formatDate(session.created_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column (8 cols): Session Detail */}
          <div className="lg:col-span-8 bg-[#0E1626] border border-blue-500/15 rounded-[18px] p-5 flex flex-col gap-4 min-h-0 overflow-y-auto">
            {detailLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-slate-400 text-sm">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>Loading session details…</span>
              </div>
            ) : !selectedSessionDetail ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Select a session on the left to inspect its questions and answers.
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/10 shrink-0">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-white">
                        {selectedSessionDetail.candidate_name}
                      </h2>
                      <span className="text-xs text-slate-400">
                        · {selectedSessionDetail.difficulty} {selectedSessionDetail.role} ({selectedSessionDetail.mode})
                      </span>
                      {selectedSessionDetail.study_guide_section && (
                        <span className="text-[11px] bg-sky-950/70 border border-sky-500/25 text-sky-300 px-2 py-0.5 rounded-full">
                          {selectedSessionDetail.study_guide_section}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedSessionDetail.plan_title} · Engine:{" "}
                      <span className="uppercase font-mono text-slate-300">
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
                        <Award className="w-3.5 h-3.5" />
                        <span>Score: {selectedSessionDetail.overall_score} / 100</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-3 py-1 rounded-full border bg-sky-950/60 border-sky-500/30 text-sky-300 w-fit">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Senior Benchmark Only</span>
                      </span>
                    )}

                    <button
                      type="button"
                      disabled={exporting}
                      onClick={() => void handleExportMarkdown(selectedSessionDetail.id)}
                      title="Download this session as Markdown (.md)"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Session .md</span>
                    </button>
                  </div>
                </div>

                {selectedSessionDetail.summary && (
                  <div className="bg-[#080D1A] border border-blue-500/15 rounded-2xl p-4 text-sm text-slate-200 leading-relaxed">
                    <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Executive Summary
                    </span>
                    {selectedSessionDetail.summary}
                  </div>
                )}

                {selectedSessionDetail.responses.length === 0 ? (
                  <div className="bg-[#080D1A] border border-white/10 rounded-2xl p-6 text-center text-sm text-slate-400">
                    No question-answer pairs were recorded for this session.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {selectedSessionDetail.responses.map((item) => (
                      <article
                        key={item.id}
                        className="bg-[#080D1A] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="text-xs font-mono font-bold bg-sky-950/70 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded shrink-0 mt-0.5">
                            Q{item.question_order}
                          </span>
                          <h3 className="text-sm font-bold text-white leading-snug">
                            {item.question}
                          </h3>
                        </div>

                        <AnswerComparisonGrid
                          candidateName={selectedSessionDetail.candidate_name}
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
    </div>
  );
};
