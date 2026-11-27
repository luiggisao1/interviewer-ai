import React from "react";

export const EvaluatingOverlay: React.FC = () => {
  return (
    <div
      className="fixed inset-0 bg-ink/45 backdrop-blur-sm z-[2000] grid place-items-center p-6"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-[520px] w-full bg-card border border-border-strong rounded-xl p-9 text-center shadow-2xl flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin mb-5" />
        <h2 className="font-serif text-2xl font-semibold text-ink mb-2 tracking-tight">
          Synthesizing Interview Debrief…
        </h2>
        <p className="text-sm text-ink-muted leading-relaxed mb-5">
          Benchmarking technical depth, problem-solving, trade-off articulation, and communication clarity against your study guide notes.
        </p>
        <div className="text-xs text-accent-deep font-mono flex items-center gap-2 bg-surface border border-border px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-verified animate-pulse" />
          <span>Calibrating senior-level benchmark answers (5–10s)</span>
        </div>
      </div>
    </div>
  );
};
