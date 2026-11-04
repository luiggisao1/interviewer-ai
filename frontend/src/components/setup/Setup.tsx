import React, { FormEvent } from "react";
import type { AudioMode, Difficulty, InterviewConfig, Mode, Role, StudyGuideSection } from "../../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { SegmentedControl } from "../ui/segmented-control";
import { Switch } from "../ui/switch";
import { Sparkles, BookOpen, Cpu, ArrowRight } from "lucide-react";

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

function getEngineLabel(engine: string): string {
  switch (engine.toLowerCase()) {
    case "gemini":
      return "Google Gemini (Gemini 2.5 Flash / 3.8 Flash)";
    case "anthropic":
      return "Anthropic Claude (Claude 3.5 Sonnet)";
    case "openai":
      return "OpenAI (GPT-4o / GPT-4o-mini)";
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
  startInterview,
}) => {
  const engineList = availableEngines.length > 0
    ? availableEngines
    : ["gemini", "anthropic", "openai", "mock"];

  const activeEngine = config.provider || provider || engineList[0];

  return (
    <div className="h-full flex flex-col justify-center gap-4 min-h-0">
      {/* Compact Top Header */}
      <header className="flex items-center justify-between pb-3 border-b border-blue-500/15 shrink-0">
        <div className="flex items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-400 bg-sky-950/70 border border-sky-500/30 px-3 py-1 rounded-full tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>INTERVIEW COCKPIT</span>
          </span>
          <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
            Turn what you studied into what you can <span className="text-sky-400 font-extrabold not-italic">explain aloud.</span>
          </h1>
        </div>
        <p className="text-[13px] text-slate-400 hidden sm:block">
          Grounded directly in study notes · Calibrated for Staff/Senior rigor
        </p>
      </header>

      {/* Unified 2-Column Cockpit Form */}
      <form className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full max-w-[1240px] mx-auto" onSubmit={startInterview}>
        
        {/* LEFT COLUMN (58%): Interview Parameters & Calibration */}
        <div className="md:col-span-7 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col gap-4 transition-colors">
          <div className="flex items-start gap-3 pb-3 border-b border-white/10 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Interview Parameters & Notes</h3>
              <p className="text-[13px] text-slate-400 mt-0.5">Configure knowledge grounding, role, and question taxonomy</p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 flex-1">
            
            {/* Knowledge Domain Section */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-200">Study Guide Section</label>
              <Select
                value={selectedSection}
                disabled={guideLoading}
                onValueChange={(val) => {
                  setSelectedSection(val);
                  if (val === "custom") {
                    setStudyGuide("");
                  } else {
                    setStudyGuide(guideSections.find((s) => s.id === val)?.content ?? "");
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
                  <SelectItem value="custom">✏️ Custom Notes / Paste Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedSection === "custom" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-200">
                  Custom Material <span className="text-slate-400 font-normal text-xs">({studyGuide.length.toLocaleString()} characters)</span>
                </label>
                <textarea
                  className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] p-3 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-full resize-none font-mono leading-relaxed transition-colors"
                  value={studyGuide}
                  onChange={(e) => setStudyGuide(e.target.value)}
                  placeholder="Paste system design notes, API documentation, or architecture details…"
                  maxLength={30000}
                  rows={4}
                />
              </div>
            ) : (
              <div className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-[13px] text-slate-400 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" />
                  <strong className="text-sky-400 font-semibold">Loaded {studyGuide.length.toLocaleString()} characters</strong>
                  <span className="text-slate-600">·</span>
                  <span className="text-[11px] font-mono font-semibold bg-sky-950/70 border border-sky-500/20 text-sky-300 px-2 py-0.5 rounded">
                    Grounded in study_guide.md
                  </span>
                </div>
              </div>
            )}

            <div className="h-px bg-blue-500/15 my-0.5" />

            {/* Role & Calibration Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-200">Target Role</label>
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
                <label className="text-[13px] font-semibold text-slate-200">Seniority Level</label>
                <SegmentedControl<Difficulty>
                  options={SENIORITY_OPTIONS}
                  value={config.difficulty}
                  onChange={(val) => updateConfig("difficulty", val)}
                />
              </div>
            </div>

            {config.role === "Custom Role" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-200">Custom Role Title</label>
                <input
                  className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3.5 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors w-full"
                  value={config.custom_role}
                  onChange={(e) => updateConfig("custom_role", e.target.value)}
                  placeholder="e.g. Distributed Systems Staff Engineer"
                  maxLength={100}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-200">Evaluation Mode</label>
                <SegmentedControl<Mode>
                  options={MODE_OPTIONS}
                  value={config.mode}
                  onChange={(val) => updateConfig("mode", val)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-semibold text-slate-200">Target Duration</label>
                <SegmentedControl<number>
                  options={DURATION_OPTIONS}
                  value={config.duration_minutes}
                  onChange={(val) => updateConfig("duration_minutes", val)}
                />
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT COLUMN (42%): AI Engine, Audio & Launch */}
        <div className="md:col-span-5 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col gap-4 transition-colors">
          <div className="flex items-start gap-3 pb-3 border-b border-white/10 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
              <Cpu className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">AI Engine & Launch</h3>
              <p className="text-[13px] text-slate-400 mt-0.5">Model inference, speech setup, and directives</p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5 flex-1">
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-200">AI Inference Engine</label>
              <Select
                value={activeEngine}
                onValueChange={(val) => {
                  updateConfig("provider", val);
                  setProvider(val);
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
                <label className="text-[13px] font-semibold text-slate-200">Voice Interaction Mode</label>
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
                      <SelectItem value="gemini_live">Gemini Live Multimodal Voice (Direct WebSocket Audio)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between bg-[#080D1A] border border-blue-500/15 px-3.5 py-2.5 rounded-xl gap-3.5">
              <div className="flex flex-col">
                <strong className="block text-[13.5px] font-semibold text-white">Read Answers Aloud</strong>
                <p className="text-xs text-slate-400 mt-0.5">Synthesize {recruiterName}'s questions via Web Audio / Browser TTS</p>
              </div>
              <Switch
                checked={autoSpeak}
                onCheckedChange={setAutoSpeak}
                aria-label="Read interviewer responses aloud"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-200">
                Custom Directives <span className="text-slate-400 font-normal text-xs">(Optional)</span>
              </label>
              <input
                className="bg-[#080D1A] border border-blue-500/15 rounded-[10px] px-3.5 py-2 h-[42px] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors w-full"
                value={config.custom_instructions}
                onChange={(e) => updateConfig("custom_instructions", e.target.value)}
                placeholder="e.g. Focus on scalability, challenge vague answers..."
                maxLength={200}
              />
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-500/30 text-red-200 px-3.5 py-2 rounded-lg text-xs font-medium">
                {error}
              </div>
            )}

            {/* Launch Action Pin */}
            <div className="pt-2 flex flex-col gap-2 mt-auto">
              <button
                type="submit"
                className="w-full h-[46px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-[15px] rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/40 transition-all hover:-translate-y-0.5 tracking-tight disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" /> Initializing {recruiterName}…
                  </>
                ) : (
                  <>
                    <span>Launch Interview Session</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <span className="text-xs text-center text-slate-400">
                ● Ready on {activeEngine.toUpperCase()} · ~{config.duration_minutes} min session
              </span>
            </div>

          </div>
        </div>

      </form>
    </div>
  );
};
