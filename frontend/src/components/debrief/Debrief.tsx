import React, { useState } from "react";
import {
  Award,
  CheckCircle2,
  TrendingUp,
  BookOpen,
  Cpu,
  ArrowRight,
  Sparkles,
  Compass,
  Database,
  Shield,
  Check,
  Star,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { Evaluation, StorageMode } from "../../types";

interface DebriefProps {
  evaluation: Evaluation;
  provider: string;
  candidateName?: string;
  storageMode?: StorageMode;
  savedSessionId?: string | null;
  onReset: () => void;
  onOpenReview?: () => void;
}

export const Debrief: React.FC<DebriefProps> = ({
  evaluation,
  provider,
  candidateName,
  storageMode = "none",
  savedSessionId,
  onReset,
  onOpenReview,
}) => {
  const [activeTab, setActiveTab] = useState<"feedback" | "benchmarks" | "roadmap">("feedback");

  const getVerdict = (score: number) => {
    if (score >= 85)
      return {
        label: "STRONG HIRE",
        pillClass: "bg-emerald-50 border-emerald-200 text-verified-deep",
        scoreColor: "text-verified-deep",
        boxGlow: "border-emerald-200",
        ringBg: "bg-emerald-50 border-emerald-200",
      };
    if (score >= 70)
      return {
        label: "HIRE",
        pillClass: "bg-sky-50 border-sky-200 text-sky-800",
        scoreColor: "text-sky-800",
        boxGlow: "border-sky-200",
        ringBg: "bg-sky-50 border-sky-200",
      };
    if (score >= 55)
      return {
        label: "LEAN HIRE",
        pillClass: "bg-amber-50 border-amber-200 text-accent-deep",
        scoreColor: "text-accent-deep",
        boxGlow: "border-amber-200",
        ringBg: "bg-amber-50 border-amber-200",
      };
    return {
      label: "NEEDS CALIBRATION",
      pillClass: "bg-red-50 border-red-200 text-danger-deep",
      scoreColor: "text-danger-deep",
      boxGlow: "border-red-200",
      ringBg: "bg-red-50 border-red-200",
    };
  };

  const verdict = getVerdict(evaluation.overall_score);
  const isHighScore = evaluation.overall_score >= 90;
  const isPerfectScore = evaluation.overall_score === 100;
  const hasNoStrengths =
    !evaluation.strengths ||
    evaluation.strengths.length === 0 ||
    evaluation.strengths.every(
      (s) =>
        s.toLowerCase().includes("no technical strengths") ||
        s.toLowerCase().includes("no strengths demonstrated")
    );

  return (
    <div className="flex-1 max-w-[1280px] mx-auto w-full px-4 md:px-6 py-3 overflow-hidden min-h-0">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-full items-stretch">

        {/* LEFT COLUMN: Sticky Scorecard & Executive Assessment */}
        <div className="lg:col-span-5 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between gap-5 overflow-y-auto transition-colors">
          <div>
            {/* Header Tag */}
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4 gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-accent-deep bg-accent/10 border border-accent/25 px-3 py-1 rounded-full tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5 text-accent-deep" aria-hidden="true" />
                <span>Session Evaluation Debrief</span>
              </span>
              <span className="text-xs font-mono text-ink-muted uppercase">
                {provider} BENCHMARK
              </span>
            </div>

            {/* Hero Score Ring & Verdict Card */}
            <div className={`flex items-center gap-5 bg-surface border ${verdict.boxGlow} p-5 rounded-xl mb-5`}>
              <div className={`w-20 h-20 rounded-xl ${verdict.ringBg} border flex flex-col items-center justify-center shrink-0`}>
                <span className={`text-4xl font-extrabold font-mono ${verdict.scoreColor}`}>
                  {evaluation.overall_score}
                </span>
                <span className="text-xs text-ink-muted font-mono -mt-1">/ 100</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-md border tracking-wider w-fit ${verdict.pillClass}`}>
                  <Award className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{verdict.label}</span>
                </span>
                <p className="text-xs text-ink-muted leading-snug">
                  Calibrated against Staff / Senior Software Engineer bar
                </p>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="flex flex-col gap-2 mb-5">
              <h2 className="text-xs font-mono font-bold text-ink-muted uppercase tracking-wider">
                Executive Synthesis
              </h2>
              <p className="text-[15px] text-ink-secondary leading-relaxed font-sans">
                {evaluation.summary}
              </p>
            </div>

            {/* Quick Dimension Radar Pills */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/70 border border-border p-3 rounded-lg flex items-center justify-between">
                <span className="text-ink-muted font-medium">Strengths</span>
                <span className={`${hasNoStrengths ? "text-ink-muted" : "text-verified-deep"} font-bold font-mono`}>
                  {hasNoStrengths ? 0 : evaluation.strengths.length} Verified
                </span>
              </div>
              <div className="bg-muted/70 border border-border p-3 rounded-lg flex items-center justify-between">
                <span className="text-ink-muted font-medium">Growth Areas</span>
                <span className="text-accent-deep font-bold font-mono">
                  {evaluation.improvements.length} Target
                </span>
              </div>
              <div className="bg-muted/70 border border-border p-3 rounded-lg flex items-center justify-between">
                <span className="text-ink-muted font-medium">Notes Grounding</span>
                <span className="text-sky-800 font-bold font-mono">
                  {evaluation.study_guide_feedback.length} Focus
                </span>
              </div>
              <div className="bg-muted/70 border border-border p-3 rounded-lg flex items-center justify-between">
                <span className="text-ink-muted font-medium">Architecture</span>
                <span className="text-ink font-bold font-mono">Staff Depth</span>
              </div>
            </div>
          </div>

          {/* Sticky Bottom CTA & Storage Status */}
          <div className="pt-3 border-t border-border mt-auto flex flex-col gap-3">
            {savedSessionId && storageMode === "all" ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-emerald-950 leading-snug">
                  <Database className="w-4 h-4 text-verified-deep shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="text-verified-deep font-semibold block">
                      Saved for {candidateName?.trim() || "Candidate"}
                    </strong>
                    <span className="text-emerald-900/80">
                      Questions, your answers, and LLM senior answers are stored.
                    </span>
                  </div>
                </div>
                {onOpenReview && (
                  <button
                    type="button"
                    onClick={onOpenReview}
                    className="shrink-0 bg-card hover:bg-emerald-100 text-verified-deep border border-emerald-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    View in Review Archive
                  </button>
                )}
              </div>
            ) : savedSessionId && storageMode === "senior_only" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-amber-950 leading-snug">
                  <Shield className="w-4 h-4 text-accent-deep shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <strong className="text-accent-deep font-semibold block">
                      Saved Senior Benchmark Only ({candidateName?.trim() || "Candidate"})
                    </strong>
                    <span className="text-amber-900/80">
                      Questions &amp; LLM senior answers stored; personal answers were omitted.
                    </span>
                  </div>
                </div>
                {onOpenReview && (
                  <button
                    type="button"
                    onClick={onOpenReview}
                    className="shrink-0 bg-card hover:bg-amber-100 text-accent-deep border border-amber-300 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    View in Review Archive
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-muted/70 border border-border rounded-xl px-3 py-2.5 text-xs text-ink-muted flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                <span>Private session — responses were not saved to the database.</span>
              </div>
            )}

            <button
              type="button"
              onClick={onReset}
              className="w-full h-12 bg-ink hover:bg-ink/90 text-white font-semibold text-[15px] rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <span>Start Over with New Interview Rep</span>
              <ArrowRight className="w-4 h-4 text-amber-400" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Deep-Dive Inspector */}
        <div className="lg:col-span-7 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col gap-5 overflow-hidden transition-colors">

          {/* Segmented Nav Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-border shrink-0 gap-2 flex-wrap">
            <div className="flex gap-1 bg-muted p-1 rounded-lg border border-border text-xs font-semibold flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab("feedback")}
                className={`px-3.5 py-1.5 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeTab === "feedback"
                    ? "bg-ink text-white shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                1. 360° Feedback Matrix
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("benchmarks")}
                className={`px-3.5 py-1.5 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeTab === "benchmarks"
                    ? "bg-ink text-white shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                2. Staff Benchmark Comparisons ({evaluation.senior_answers.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("roadmap")}
                className={`px-3.5 py-1.5 rounded-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeTab === "roadmap"
                    ? "bg-ink text-white shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                3. Action Roadmap ({evaluation.next_steps.length})
              </button>
            </div>
            <span className="text-xs font-mono text-ink-muted hidden sm:block">Deep Dive Analysis</span>
          </div>

          {/* TAB 1: 360° Feedback Matrix */}
          {activeTab === "feedback" && (
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">

              {/* Strengths Card */}
              <div
                className={`bg-surface/60 border ${
                  hasNoStrengths ? "border-border" : "border-emerald-200"
                } rounded-xl p-5 flex flex-col gap-3`}
              >
                <div
                  className={`flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider ${
                    hasNoStrengths ? "text-ink-muted" : "text-verified-deep"
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${hasNoStrengths ? "text-ink-muted" : "text-verified-deep"}`} aria-hidden="true" />
                  <span>{hasNoStrengths ? "Observed Strengths" : "What Worked Well (Strengths)"}</span>
                </div>
                <ul className="flex flex-col gap-2.5 text-[14.5px] leading-relaxed font-sans">
                  {hasNoStrengths ? (
                    <li className="flex items-start gap-2.5 text-ink-muted italic">
                      <Minus className="w-4 h-4 text-ink-muted shrink-0 mt-1" aria-hidden="true" />
                      <span>No technical strengths demonstrated during this session.</span>
                    </li>
                  ) : (
                    evaluation.strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-ink">
                        <Check className="w-4 h-4 text-verified-deep shrink-0 mt-1" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Growth Areas Card */}
              <div
                className={`bg-surface/60 border ${
                  isPerfectScore
                    ? "border-emerald-200"
                    : isHighScore
                    ? "border-border-strong"
                    : "border-amber-200"
                } rounded-xl p-5 flex flex-col gap-3`}
              >
                <div
                  className={`flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider ${
                    isPerfectScore
                      ? "text-verified-deep"
                      : isHighScore
                      ? "text-ink"
                      : "text-accent-deep"
                  }`}
                >
                  <TrendingUp className="w-4 h-4" aria-hidden="true" />
                  <span>
                    {isPerfectScore
                      ? "Gold Standard Verification"
                      : isHighScore
                      ? "Staff+ Horizons & Advanced Scaling"
                      : "Target Opportunity (Growth Areas)"}
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5 text-[14.5px] text-ink-secondary leading-relaxed font-sans">
                  {evaluation.improvements.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      {isPerfectScore ? (
                        <Star className="w-4 h-4 text-verified-deep shrink-0 mt-1" aria-hidden="true" />
                      ) : isHighScore ? (
                        <Sparkles className="w-4 h-4 text-accent-deep shrink-0 mt-1" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-accent-deep shrink-0 mt-1" aria-hidden="true" />
                      )}
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Study Grounding Card */}
              {evaluation.study_guide_feedback.length > 0 && (
                <div className="bg-muted/60 border border-border rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-ink uppercase tracking-wider">
                    <BookOpen className="w-4 h-4 text-accent-deep" aria-hidden="true" />
                    <span>Study Guide Grounding &amp; Alignment</span>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-[14.5px] text-ink-secondary leading-relaxed font-sans">
                    {evaluation.study_guide_feedback.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-2.5" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Systems & Architecture Depth */}
              {evaluation.technical_feedback.length > 0 && (
                <div className="bg-muted/60 border border-border rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-ink uppercase tracking-wider">
                    <Cpu className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                    <span>Technical &amp; Systems Architecture Depth</span>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-[14.5px] text-ink-secondary leading-relaxed font-sans">
                    {evaluation.technical_feedback.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rotate-45 bg-ink-muted shrink-0 mt-2.5" aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Staff Model Comparisons */}
          {activeTab === "benchmarks" && (
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
              {evaluation.senior_answers.length === 0 ? (
                <div className="bg-muted/60 border border-border rounded-xl p-8 text-center text-ink-muted text-sm">
                  No turn comparison data available for this rep.
                </div>
              ) : (
                evaluation.senior_answers.map((item, idx) => {
                  const isGoldStandard =
                    isPerfectScore ||
                    !item.senior_answer ||
                    item.senior_answer.trim() === item.candidate_answer.trim() ||
                    item.senior_answer.toLowerCase().includes("gold standard") ||
                    item.senior_answer.toLowerCase().includes("benchmark achieved") ||
                    item.why_stronger.toLowerCase().includes("gold standard");

                  if (isGoldStandard) {
                    return (
                      <article
                        key={idx}
                        className="bg-surface/50 border border-emerald-200 rounded-xl p-5 flex flex-col gap-3.5"
                      >
                        <div className="flex items-center justify-between pb-2.5 border-b border-border gap-2 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-mono font-bold bg-emerald-50 border border-emerald-200 text-verified-deep px-2.5 py-1 rounded">
                              Turn {idx + 1}
                            </span>
                            <h3 className="font-serif text-base font-semibold text-ink">{item.question}</h3>
                          </div>
                          <span className="text-xs font-mono font-bold bg-emerald-50 text-verified-deep border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-verified-deep" aria-hidden="true" />
                            <span>GOLD STANDARD</span>
                          </span>
                        </div>

                        <div className="bg-card p-4 rounded-lg border border-emerald-200 flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-ink-muted uppercase tracking-wider">
                            YOUR RESPONSE (STAFF BENCHMARK LEVEL)
                          </span>
                          <p className="text-[14.5px] text-ink leading-relaxed font-sans">
                            {item.candidate_answer}
                          </p>
                        </div>

                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 text-[13.5px] text-emerald-950 leading-relaxed flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-verified-deep shrink-0 mt-0.5" aria-hidden="true" />
                          <div>
                            <strong className="text-verified-deep font-bold block mb-0.5">
                              Evaluation Validation:
                            </strong>
                            <span>
                              {item.why_stronger ||
                                "Exemplary execution: Your answer already matches senior production standards. No model answer required."}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  }

                  return (
                    <article
                      key={idx}
                      className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3.5"
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-border gap-2 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold bg-accent/10 border border-accent/25 text-accent-deep px-2.5 py-1 rounded">
                            Turn {idx + 1}
                          </span>
                          <h3 className="font-serif text-base font-semibold text-ink">{item.question}</h3>
                        </div>
                        <span className="text-xs font-mono text-verified-deep font-semibold">
                          STAFF BENCHMARK
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-muted/70 p-4 rounded-lg border border-border flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-ink-muted uppercase tracking-wider">
                            YOUR RESPONSE
                          </span>
                          <p className="text-[14px] text-ink leading-relaxed font-sans">
                            {item.candidate_answer}
                          </p>
                        </div>

                        <div className="bg-emerald-50/70 p-4 rounded-lg border border-emerald-200 flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-verified-deep uppercase tracking-wider">
                            STAFF-LEVEL MODEL RESPONSE
                          </span>
                          <p className="text-[14px] text-ink leading-relaxed font-sans">
                            {item.senior_answer}
                          </p>
                        </div>
                      </div>

                      <div className="bg-surface border border-accent/30 p-3.5 rounded-lg text-[13.5px] text-ink-secondary leading-relaxed">
                        <strong className="text-accent-deep font-semibold">
                          {isHighScore ? "Staff Perspective & Nuance:" : "Why it is stronger:"}
                        </strong>{" "}
                        {item.why_stronger}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: Action Roadmap */}
          {activeTab === "roadmap" && (
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-accent-deep uppercase tracking-wider pb-1">
                <Compass className="w-4 h-4 text-accent-deep" aria-hidden="true" />
                <span>Targeted Engineering Practice Directives</span>
              </div>

              {evaluation.next_steps.length === 0 ? (
                <div className="bg-muted/60 border border-border rounded-xl p-8 text-center text-ink-muted text-sm">
                  No next steps required — candidate reached benchmark bar!
                </div>
              ) : (
                evaluation.next_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 bg-surface/60 border border-border hover:border-border-strong p-4 rounded-xl transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/25 text-accent-deep font-mono font-bold text-sm grid place-items-center shrink-0 mt-0.5">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="flex flex-col gap-1 flex-1">
                      <strong className="font-serif text-base text-ink font-semibold">
                        Action Milestone #{idx + 1}
                      </strong>
                      <p className="text-[14px] text-ink-secondary leading-relaxed font-sans">
                        {step}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
