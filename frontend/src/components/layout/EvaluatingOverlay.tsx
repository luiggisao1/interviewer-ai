import React from "react";

export const EvaluatingOverlay: React.FC = () => {
  return (
    <div
      className="fixed inset-0 bg-[#060A14]/85 backdrop-blur-xl z-[2000] grid place-items-center p-6"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-[520px] w-full bg-[#0E1626] border border-blue-500/35 rounded-[18px] p-9 text-center shadow-2xl flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-sky-400 rounded-full animate-spin mb-5" />
        <h2 className="text-xl font-bold text-white mb-2">Synthesizing Interview Debrief…</h2>
        <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
          Benchmarking technical depth, problem-solving, trade-off articulation, and communication clarity against your study guide notes.
        </p>
        <div className="text-xs text-sky-400 font-mono flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse" />
          <span>Calibrating senior-level benchmark answers (5–10s)</span>
        </div>
      </div>
    </div>
  );
};
