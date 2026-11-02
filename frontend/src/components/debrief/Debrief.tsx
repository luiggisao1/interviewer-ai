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
} from "lucide-react";
import type { Evaluation } from "../../types";

interface DebriefProps {
  evaluation: Evaluation;
  provider: string;
  onReset: () => void;
}

export const Debrief: React.FC<DebriefProps> = ({
  evaluation,
  provider,
  onReset,
}) => {
  const [activeTab, setActiveTab] = useState<"feedback" | "benchmarks" | "roadmap">("feedback");

  const getVerdict = (score: number) => {
    if (score >= 85)
      return {
        label: "STRONG HIRE",
        pillClass: "bg-emerald-950/70 border-emerald-500/40 text-emerald-300",
        scoreColor: "text-emerald-400",
        boxGlow: "border-emerald-500/30 shadow-emerald-950/20",
        ringBg: "bg-emerald-950/40 border-emerald-500/40",
      };
    if (score >= 70)
      return {
        label: "HIRE",
        pillClass: "bg-blue-950/70 border-blue-500/40 text-blue-300",
        scoreColor: "text-blue-400",
        boxGlow: "border-blue-500/30 shadow-blue-950/20",
        ringBg: "bg-blue-950/40 border-blue-500/40",
      };
    if (score >= 55)
      return {
        label: "LEAN HIRE",
        pillClass: "bg-amber-950/70 border-amber-500/40 text-amber-300",
        scoreColor: "text-amber-400",
        boxGlow: "border-amber-500/30 shadow-amber-950/20",
        ringBg: "bg-amber-950/40 border-amber-500/40",
      };
    return {
      label: "NEEDS CALIBRATION",
      pillClass: "bg-red-950/70 border-red-500/40 text-red-300",
      scoreColor: "text-red-400",
      boxGlow: "border-red-500/30 shadow-red-950/20",
      ringBg: "bg-red-950/40 border-red-500/40",
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
        
        {/* LEFT COLUMN: Sticky Scorecard & Executive Assessment (38%) */}
        <div className="lg:col-span-5 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between gap-5 overflow-y-auto transition-colors">
          <div>
            {/* Header Tag */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 bg-sky-950/70 border border-sky-500/30 px-3 py-1 rounded-full tracking-wide">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>SESSION EVALUATION DEBRIEF</span>
              </span>
              <span className="text-xs font-mono text-slate-400 uppercase">
                {provider} BENCHMARK
              </span>
            </div>

            {/* Hero Score Ring & Verdict Card */}
            <div className={`flex items-center gap-5 bg-[#080D1A] border ${verdict.boxGlow} p-5 rounded-2xl mb-5 shadow-xl`}>
              <div className={`w-20 h-20 rounded-2xl ${verdict.ringBg} border flex flex-col items-center justify-center shrink-0`}>
                <span className={`text-4xl font-extrabold ${verdict.scoreColor}`}>
                  {evaluation.overall_score}
                </span>
                <span className="text-xs text-slate-400 font-mono -mt-1">/ 100</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-md border tracking-wider w-fit ${verdict.pillClass}`}>
                  <Award className="w-3.5 h-3.5" />
                  <span>{verdict.label}</span>
                </span>
                <p className="text-xs text-slate-400 leading-snug">
                  Calibrated against Staff / Senior Software Engineer bar
                </p>
              </div>
            </div>

            {/* Executive Summary (Generous 15px-16px font) */}
            <div className="flex flex-col gap-2 mb-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Executive Synthesis
              </h3>
              <p className="text-[15px] text-slate-200 leading-relaxed font-sans">
                {evaluation.summary}
              </p>
            </div>

            {/* Quick Dimension Radar Pills */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-[#080D1A] border border-blue-500/15 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-medium">Strengths</span>
                <span className={`${hasNoStrengths ? "text-slate-400" : "text-emerald-400"} font-bold font-mono`}>
                  {hasNoStrengths ? 0 : evaluation.strengths.length} Verified
                </span>
              </div>
              <div className="bg-[#080D1A] border border-blue-500/15 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-medium">Growth Areas</span>
                <span className="text-amber-400 font-bold font-mono">
                  {evaluation.improvements.length} Target
                </span>
              </div>
              <div className="bg-[#080D1A] border border-blue-500/15 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-medium">Notes Grounding</span>
                <span className="text-sky-400 font-bold font-mono">
                  {evaluation.study_guide_feedback.length} Focus
                </span>
              </div>
              <div className="bg-[#080D1A] border border-blue-500/15 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-medium">Architecture</span>
                <span className="text-purple-400 font-bold font-mono">Staff Depth</span>
              </div>
            </div>
          </div>

          {/* Sticky Bottom CTA */}
          <div className="pt-3 border-t border-white/10 mt-auto">
            <button
              onClick={onReset}
              className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[15px] rounded-xl shadow-lg shadow-blue-600/40 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 cursor-pointer"
            >
              <span>Start Over with New Interview Rep</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Deep-Dive Inspector (62%) */}
        <div className="lg:col-span-7 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col gap-5 overflow-hidden transition-colors">
          
          {/* Segmented Nav Bar */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex gap-1.5 bg-[#080D1A] p-1 rounded-xl border border-blue-500/15 text-xs font-semibold">
              <button
                onClick={() => setActiveTab("feedback")}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "feedback"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                1. 360° Feedback Matrix
              </button>
              <button
                onClick={() => setActiveTab("benchmarks")}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "benchmarks"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                2. Staff Benchmark Comparisons ({evaluation.senior_answers.length})
              </button>
              <button
                onClick={() => setActiveTab("roadmap")}
                className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "roadmap"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                3. Action Roadmap ({evaluation.next_steps.length})
              </button>
            </div>
            <span className="text-xs text-slate-500 hidden sm:block">Deep Dive Analysis</span>
          </div>

          {/* TAB 1: 360° Feedback Matrix */}
          {activeTab === "feedback" && (
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
              
              {/* Strengths Card */}
              <div
                className={`bg-[#080D1A] border ${
                  hasNoStrengths ? "border-slate-800" : "border-emerald-500/25"
                } rounded-2xl p-5 flex flex-col gap-3 shadow-sm`}
              >
                <div
                  className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                    hasNoStrengths ? "text-slate-400" : "text-emerald-400"
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${hasNoStrengths ? "text-slate-500" : "text-emerald-400"}`} />
                  <span>{hasNoStrengths ? "Observed Strengths" : "What Worked Well (Strengths)"}</span>
                </div>
                <ul className="flex flex-col gap-2.5 text-[14.5px] leading-relaxed font-sans">
                  {hasNoStrengths ? (
                    <li className="flex items-start gap-2.5 text-slate-400 italic">
                      <span className="text-slate-600 font-bold shrink-0 mt-0.5">—</span>
                      <span>No technical strengths demonstrated during this session.</span>
                    </li>
                  ) : (
                    evaluation.strengths.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-slate-200">
                        <span className="text-emerald-400 font-bold shrink-0 mt-0.5">✓</span>
                        <span>{item}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* Growth Areas Card */}
              <div
                className={`bg-[#080D1A] border ${
                  isPerfectScore
                    ? "border-emerald-500/30"
                    : isHighScore
                    ? "border-indigo-500/30"
                    : "border-amber-500/25"
                } rounded-2xl p-5 flex flex-col gap-3 shadow-sm`}
              >
                <div
                  className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                    isPerfectScore
                      ? "text-emerald-400"
                      : isHighScore
                      ? "text-indigo-400"
                      : "text-amber-400"
                  }`}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>
                    {isPerfectScore
                      ? "Gold Standard Verification"
                      : isHighScore
                      ? "Staff+ Horizons & Advanced Scaling"
                      : "Target Opportunity (Growth Areas)"}
                  </span>
                </div>
                <ul className="flex flex-col gap-2.5 text-[14.5px] text-slate-200 leading-relaxed font-sans">
                  {evaluation.improvements.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span
                        className={`font-bold shrink-0 mt-0.5 ${
                          isPerfectScore
                            ? "text-emerald-400"
                            : isHighScore
                            ? "text-indigo-400"
                            : "text-amber-400"
                        }`}
                      >
                        {isPerfectScore ? "★" : isHighScore ? "✦" : "▲"}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Study Grounding Card */}
              {evaluation.study_guide_feedback.length > 0 && (
                <div className="bg-[#080D1A] border border-blue-500/20 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider">
                    <BookOpen className="w-4 h-4 text-sky-400" />
                    <span>Study Guide Grounding & Alignment</span>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-[14.5px] text-slate-200 leading-relaxed font-sans">
                    {evaluation.study_guide_feedback.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="text-sky-400 font-bold shrink-0 mt-0.5">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Systems & Architecture Depth */}
              {evaluation.technical_feedback.length > 0 && (
                <div className="bg-[#080D1A] border border-purple-500/20 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                    <Cpu className="w-4 h-4 text-purple-400" />
                    <span>Technical & Systems Architecture Depth</span>
                  </div>
                  <ul className="flex flex-col gap-2.5 text-[14.5px] text-slate-200 leading-relaxed font-sans">
                    {evaluation.technical_feedback.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="text-purple-400 font-bold shrink-0 mt-0.5">◆</span>
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
                <div className="bg-[#080D1A] border border-white/10 rounded-2xl p-8 text-center text-slate-400 text-sm">
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
                        className="bg-[#080D1A] border border-emerald-500/30 rounded-2xl p-5 flex flex-col gap-3.5 shadow-md shadow-emerald-950/20"
                      >
                        <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-mono font-bold bg-emerald-950/70 border border-emerald-500/30 text-emerald-300 px-2.5 py-1 rounded">
                              Turn {idx + 1}
                            </span>
                            <h4 className="text-sm font-bold text-white">{item.question}</h4>
                          </div>
                          <span className="text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                            <Award className="w-3.5 h-3.5 text-emerald-400" />
                            <span>GOLD STANDARD</span>
                          </span>
                        </div>

                        <div className="bg-black/40 p-4 rounded-xl border border-emerald-500/15 flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                            YOUR RESPONSE (STAFF BENCHMARK LEVEL)
                          </span>
                          <p className="text-[14.5px] text-slate-200 leading-relaxed font-sans">
                            {item.candidate_answer}
                          </p>
                        </div>

                        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 text-[13.5px] text-emerald-200 leading-relaxed flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-emerald-300 font-bold block mb-0.5">
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
                      className="bg-[#080D1A] border border-blue-500/20 rounded-2xl p-5 flex flex-col gap-3.5 shadow-md"
                    >
                      <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono font-bold bg-sky-950/70 border border-sky-500/30 text-sky-300 px-2.5 py-1 rounded">
                            Turn {idx + 1}
                          </span>
                          <h4 className="text-sm font-bold text-white">{item.question}</h4>
                        </div>
                        <span className="text-xs font-mono text-emerald-400 font-semibold">
                          STAFF BENCHMARK
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">
                            YOUR RESPONSE
                          </span>
                          <p className="text-[14px] text-slate-200 leading-relaxed font-sans">
                            {item.candidate_answer}
                          </p>
                        </div>

                        <div className="bg-emerald-950/20 p-4 rounded-xl border border-emerald-500/30 flex flex-col gap-1.5">
                          <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                            STAFF-LEVEL MODEL RESPONSE
                          </span>
                          <p className="text-[14px] text-slate-200 leading-relaxed font-sans">
                            {item.senior_answer}
                          </p>
                        </div>
                      </div>

                      <div className="bg-blue-950/30 border border-blue-500/25 p-3.5 rounded-xl text-[13.5px] text-slate-200 leading-relaxed">
                        <strong className="text-sky-300 font-semibold">
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
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400 uppercase tracking-wider pb-1">
                <Compass className="w-4 h-4 text-sky-400" />
                <span>Targeted Engineering Practice Directives</span>
              </div>

              {evaluation.next_steps.length === 0 ? (
                <div className="bg-[#080D1A] border border-white/10 rounded-2xl p-8 text-center text-slate-400 text-sm">
                  No next steps required — candidate reached benchmark bar!
                </div>
              ) : (
                evaluation.next_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-4 bg-[#080D1A] border border-blue-500/15 hover:border-blue-500/30 p-4 rounded-2xl transition-colors"
                  >
                    <span className="w-8 h-8 rounded-xl bg-blue-600/20 text-sky-400 font-bold text-sm grid place-items-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col gap-1 flex-1">
                      <strong className="text-[15px] text-white font-semibold">
                        Action Milestone #{idx + 1}
                      </strong>
                      <p className="text-[14px] text-slate-300 leading-relaxed font-sans">
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
