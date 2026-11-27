import React, { FormEvent, useEffect, useState } from "react";
import type {
  AudioMode,
  Difficulty,
  InterviewConfig,
  Mode,
  Role,
  StorageMode,
  StudyGuideSection,
} from "../../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SegmentedControl } from "../ui/segmented-control";
import { Switch } from "../ui/switch";
import { BookOpen, Cpu, ArrowRight, UserCheck, KeyRound, Eye, EyeOff, FileText, X } from "lucide-react";

interface SetupProps {
  config: InterviewConfig;
  updateConfig: <K extends keyof InterviewConfig>(key: K, value: InterviewConfig[K]) => void;
  guideSections: StudyGuideSection[];
  selectedSection: string;
  setSelectedSection: (id: string) => void;
  studyGuide: string;
  setStudyGuide: (content: string) => void;
  guideLoading: boolean;
  provider: string;
  setProvider: (provider: string) => void;
  availableEngines?: string[];
  audioMode?: AudioMode;
  setAudioMode?: (mode: AudioMode) => void;
  autoSpeak: boolean;
  setAutoSpeak: (speak: boolean) => void;
  loading: boolean;
  error: string;
  recruiterName?: string;
  requireAccessKey?: boolean;
  accessKey?: string;
  setAccessKey?: (val: string) => void;
  startInterview: (e: FormEvent) => void;
}

const ROLES: Role[] = [
  "Software Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Data Scientist",
  "Product Manager",
  "Custom Role",
];

const SENIORITY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "Junior", label: "Junior" },
  { value: "Mid-level", label: "Mid-level" },
  { value: "Senior", label: "Senior" },
];

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "Technical", label: "Technical" },
  { value: "Behavioral", label: "Behavioral" },
  { value: "Mixed", label: "Mixed" },
];

const DURATION_OPTIONS = [
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
];

const STORAGE_OPTIONS: { value: StorageMode; label: string }[] = [
  { value: "all", label: "My Answers + Senior" },
  { value: "senior_only", label: "Senior Only" },
  { value: "none", label: "Don't Save" },
];

function getStorageHelperText(mode: StorageMode): string {
  switch (mode) {
    case "all":
      return "Keeps the top 3 highest-scored sessions per topic anonymously (questions, answers, score, and senior benchmarks) in the shared Review Archive.";
    case "senior_only":
      return "Saves only the questions and LLM senior answers anonymously to the shared read-only archive — your personal answers and score are NOT stored.";
    case "none":
      return "Private session — nothing from this session will be stored in the database.";
  }
}

function getEngineLabel(engine: string): string {
  switch (engine.toLowerCase()) {
    case "gemini":
      return "Google Gemini";
    case "anthropic":
      return "Anthropic Claude";
    case "openai":
      return "OpenAI";
    case "mock":
      return "Deterministic Mock Engine (Testing)";
    default:
      return engine.toUpperCase();
  }
}

export const Setup: React.FC<SetupProps> = ({
  config,
  updateConfig,
  guideSections,
  selectedSection,
  setSelectedSection,
  studyGuide,
  setStudyGuide,
  guideLoading,
  provider,
  setProvider,
  availableEngines = [],
  audioMode = "web",
  setAudioMode,
  autoSpeak,
  setAutoSpeak,
  loading,
  error,
  recruiterName = "Iris",
  requireAccessKey = false,
  accessKey = "",
  setAccessKey,
  startInterview,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!previewOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  const engineList = availableEngines.length > 0
    ? availableEngines
    : ["gemini", "anthropic", "openai", "mock"];

  const activeEngine = config.provider || provider || engineList[0];
  const activeSectionTitle =
    guideSections.find((s) => s.id === selectedSection)?.title ||
    config.study_guide_section ||
    "Study Guide";
  const previewBlocks = studyGuide
    .replace(/\f/g, "\n\n")
    .replace(/^Generated on\b.*$/gim, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto py-3 pr-1 flex flex-col gap-5">
      {/* Editorial Masthead Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-border shrink-0 max-w-[1240px] w-full mx-auto">
        <h1 className="font-serif text-2xl md:text-[28px] font-semibold text-ink tracking-tight leading-tight">
          Turn what you studied into what you can{" "}
          <em className="italic text-accent-deep font-semibold">explain aloud.</em>
        </h1>
        <p className="text-xs md:text-[13px] text-ink-muted hidden sm:block">
          Grounded directly in study notes · Calibrated for Staff/Senior rigor
        </p>
      </header>

      {/* Asymmetric Editorial Cockpit Form */}
      <form className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full max-w-[1240px] mx-auto" onSubmit={startInterview}>

        {/* 01: Candidate Name & Database Storage Preferences */}
        <div className="md:col-span-12 bg-card border border-border hover:border-border-strong rounded-xl p-5 shadow-editorial flex flex-col gap-4 transition-colors">
          <div className="flex items-center gap-3 pb-3 border-b border-border">
            <span className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/25 text-accent-deep font-mono text-xs font-bold flex items-center justify-center shrink-0">
              01
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-verified-deep" aria-hidden="true" />
                <h2 className="font-serif text-lg font-semibold text-ink leading-tight">
                  Before You Start — Candidate &amp; Storage Preferences
                </h2>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Your name is used only by {recruiterName} during the live session and is never published in the shared Review Archive
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            <div className="md:col-span-5 flex flex-col gap-1.5">
              <label htmlFor="candidate-name-input" className="text-[13px] font-semibold text-ink">
                Your Name <span className="text-accent-deep">*</span>
              </label>
              <input
                id="candidate-name-input"
                type="text"
                className="bg-muted/60 border border-border-strong rounded-lg px-3.5 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
                value={config.candidate_name}
                onChange={(e) => updateConfig("candidate_name", e.target.value)}
                placeholder="Enter your name (e.g. Alex Rivera)"
                maxLength={100}
              />
            </div>

            <div className="md:col-span-7 flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">Response Storage</label>
              <SegmentedControl<StorageMode>
                options={STORAGE_OPTIONS}
                value={config.storage_mode}
                onChange={(val) => updateConfig("storage_mode", val)}
              />
              <p className="text-xs text-ink-muted mt-0.5">
                {getStorageHelperText(config.storage_mode)}
              </p>
            </div>
          </div>

          {requireAccessKey && setAccessKey && (
            <div className="pt-3 border-t border-border grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-5 flex flex-col gap-1">
                <label htmlFor="access-key-input" className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-accent-deep" aria-hidden="true" />
                  <span>Access Key <span className="text-accent-deep">*</span></span>
                </label>
                <p className="text-xs text-ink-muted">
                  Required by the server to start interviews using shared AI credits.
                </p>
              </div>
              <div className="md:col-span-7 relative">
                <input
                  id="access-key-input"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  className="bg-muted/60 border border-accent/40 rounded-lg pl-3.5 pr-10 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 font-mono outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Paste your invite access key (e.g. inai_...)"
                  maxLength={128}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  title={showKey ? "Hide access key" : "Show access key"}
                  aria-label={showKey ? "Hide access key" : "Show access key"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-1 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {showKey ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 02: LEFT COLUMN (58%): Study Grounding & Calibration */}
        <div className="md:col-span-7 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col gap-4 transition-colors">
          <div className="flex items-start gap-3 pb-3 border-b border-border shrink-0">
            <span className="w-8 h-8 rounded-lg bg-surface border border-border-strong text-ink font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              02
            </span>
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent-deep" aria-hidden="true" />
                <h2 className="font-serif text-lg font-semibold text-ink leading-tight">
                  Interview Parameters &amp; Notes
                </h2>
              </div>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Configure knowledge grounding, role, and question taxonomy
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            {/* Knowledge Domain Section */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">Study Guide Section</label>
              <Select
                value={selectedSection}
                disabled={guideLoading}
                onValueChange={(val) => {
                  setSelectedSection(val);
                  if (val === "custom") {
                    setStudyGuide("");
                    updateConfig("study_guide_section", "");
                  } else {
                    const matched = guideSections.find((s) => s.id === val);
                    setStudyGuide(matched?.content ?? "");
                    updateConfig("study_guide_section", matched?.title ?? val);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={guideLoading ? "Loading sections…" : "Choose a section"} />
                </SelectTrigger>
                <SelectContent>
                  {guideSections.map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.title}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom Notes / Paste Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedSection === "custom" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="custom-topic-input" className="text-[13px] font-semibold text-ink">
                    Topic Name <span className="text-ink-muted font-normal text-xs">(Optional)</span>
                  </label>
                  <input
                    id="custom-topic-input"
                    type="text"
                    className="bg-muted/60 border border-border-strong rounded-lg px-3.5 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
                    value={config.study_guide_section || ""}
                    onChange={(e) => updateConfig("study_guide_section", e.target.value)}
                    placeholder="e.g. Python (Custom), Kubernetes, System Design"
                    maxLength={100}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-ink">
                    Custom Material
                  </label>
                  <textarea
                    className="bg-muted/60 border border-border-strong rounded-lg p-3 text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent w-full resize-none font-mono leading-relaxed transition-colors"
                    value={studyGuide}
                    onChange={(e) => setStudyGuide(e.target.value)}
                    placeholder="Paste system design notes, API documentation, or architecture details…"
                    maxLength={30000}
                    rows={4}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-lg px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs text-ink-secondary">
                  <span className="w-2 h-2 rounded-full bg-verified shrink-0" />
                  <span className="font-mono font-medium text-ink">Grounded in study_guide.md</span>
                </div>
                <button
                  type="button"
                  disabled={guideLoading || !studyGuide.trim()}
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-deep hover:text-ink bg-card border border-border-strong hover:border-ink/40 px-2.5 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Preview Notes</span>
                </button>
              </div>
            )}

            <div className="h-px bg-border my-0.5" />

            {/* Role & Calibration Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Target Role</label>
                <Select
                  value={config.role}
                  onValueChange={(val) => updateConfig("role", val as Role)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Seniority Level</label>
                <SegmentedControl<Difficulty>
                  options={SENIORITY_OPTIONS}
                  value={config.difficulty}
                  onChange={(val) => updateConfig("difficulty", val)}
                />
              </div>
            </div>

            {config.role === "Custom Role" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Custom Role Title</label>
                <input
                  className="bg-muted/60 border border-border-strong rounded-lg px-3.5 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
                  value={config.custom_role}
                  onChange={(e) => updateConfig("custom_role", e.target.value)}
                  placeholder="e.g. Distributed Systems Staff Engineer"
                  maxLength={100}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Evaluation Mode</label>
                <SegmentedControl<Mode>
                  options={MODE_OPTIONS}
                  value={config.mode}
                  onChange={(val) => updateConfig("mode", val)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Target Duration</label>
                <SegmentedControl<number>
                  options={DURATION_OPTIONS}
                  value={config.duration_minutes}
                  onChange={(val) => updateConfig("duration_minutes", val)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 03: RIGHT COLUMN (42%): AI Engine, Audio & Launch */}
        <div className="md:col-span-5 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col gap-4 transition-colors">
          <div className="flex items-start gap-3 pb-3 border-b border-border shrink-0">
            <span className="w-8 h-8 rounded-lg bg-surface border border-border-strong text-ink font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              03
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-accent-deep" aria-hidden="true" />
                <h2 className="font-serif text-lg font-semibold text-ink leading-tight">
                  AI Engine &amp; Launch
                </h2>
              </div>
              <p className="text-[13px] text-ink-muted mt-0.5">
                Model inference, speech setup, and directives
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 flex-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">AI Inference Engine</label>
              <Select
                value={activeEngine}
                onValueChange={(val) => {
                  updateConfig("provider", val);
                  setProvider(val);
                  if (setAudioMode) {
                    if (val !== "gemini" && audioMode === "gemini_live") {
                      setAudioMode("web");
                    } else if (val !== "openai" && audioMode === "openai_realtime") {
                      setAudioMode("web");
                    }
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {engineList.map((eng) => (
                    <SelectItem key={eng} value={eng}>
                      {getEngineLabel(eng)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {setAudioMode && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-ink">Voice Interaction Mode</label>
                <Select
                  value={audioMode}
                  onValueChange={(val) => setAudioMode(val as AudioMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="web">Free Web Voice (Browser STT/TTS)</SelectItem>
                    {activeEngine === "gemini" && (
                      <SelectItem value="gemini_live">Gemini Live Multimodal Voice</SelectItem>
                    )}
                    {activeEngine === "openai" && (
                      <SelectItem value="openai_realtime">OpenAI Realtime Voice</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">Evaluation Engine</label>
              <Select
                value={config.evaluation_provider || "same"}
                onValueChange={(val) =>
                  updateConfig("evaluation_provider", val === "same" ? undefined : val)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same">Same as Interviewer</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {audioMode === "web" && (
              <div className="flex items-center justify-between bg-surface border border-border px-3.5 py-2.5 rounded-lg gap-3.5">
                <div className="flex flex-col">
                  <strong className="block text-[13.5px] font-semibold text-ink">Read Questions Aloud</strong>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Synthesize {recruiterName}&rsquo;s questions via Web Audio / Browser TTS
                  </p>
                </div>
                <Switch
                  checked={autoSpeak}
                  onCheckedChange={setAutoSpeak}
                  aria-label="Read interviewer questions aloud"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-ink">
                Custom Directives <span className="text-ink-muted font-normal text-xs">(Optional)</span>
              </label>
              <input
                className="bg-muted/60 border border-border-strong rounded-lg px-3.5 py-2 h-[42px] text-sm text-ink placeholder:text-ink-muted/70 outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-accent transition-colors w-full"
                value={config.custom_instructions}
                onChange={(e) => updateConfig("custom_instructions", e.target.value)}
                placeholder="e.g. Focus on scalability, challenge vague answers..."
                maxLength={200}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-danger-deep px-3.5 py-2.5 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            {/* Launch Action Pin */}
            <div className="pt-2 flex flex-col gap-2 mt-auto">
              <button
                type="submit"
                className="w-full h-[46px] bg-ink hover:bg-ink/90 text-white font-semibold text-[15px] rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 tracking-tight disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" /> Initializing {recruiterName}…
                  </>
                ) : (
                  <>
                    <span>Launch Interview Session</span>
                    <ArrowRight className="w-4 h-4 text-amber-400" aria-hidden="true" />
                  </>
                )}
              </button>
              <span className="text-xs text-center text-ink-muted font-mono">
                Ready on {activeEngine.toUpperCase()} · ~{config.duration_minutes} min session
              </span>
            </div>
          </div>
        </div>
      </form>

      {/* Study Guide Preview Reading Drawer */}
      {previewOpen && (
        <div
          className="fixed inset-0 bg-ink/35 backdrop-blur-sm z-[1000] flex justify-end"
          onClick={() => setPreviewOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Study Guide Preview: ${activeSectionTitle}`}
            className="w-full max-w-xl h-full bg-paper border-l border-border-strong p-6 flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-border shrink-0">
              <div>
                <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block">
                  study_guide.md
                </span>
                <h2 className="font-serif text-xl font-semibold text-ink mt-0.5">
                  {activeSectionTitle}
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
