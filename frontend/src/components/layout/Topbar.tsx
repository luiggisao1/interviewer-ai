import React from "react";

interface TopbarProps {
  provider: string;
  stage: "setup" | "interview" | "results";
  onReset: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ provider, stage, onReset }) => {
  return (
    <header className="h-[60px] px-4 md:px-8 flex items-center justify-between bg-[#0E1626]/85 backdrop-blur-md border-b border-blue-500/15 shrink-0 z-50">
      <div className="flex items-center gap-3">
        <a
          href="#"
          className="flex items-center gap-2.5 text-white font-bold text-base tracking-tight select-none"
          onClick={(e) => {
            e.preventDefault();
            if (stage !== "setup") onReset();
          }}
        >
          <span className="w-8 h-8 rounded-lg bg-blue-600 text-white grid place-items-center text-xs font-extrabold shadow-lg shadow-blue-600/30">
            IA
          </span>
          <span>
            Interviewer <strong className="text-sky-400 font-extrabold">AI</strong>
          </span>
        </a>
      </div>

      <div className="flex items-center gap-3.5 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400" />
          <span>{provider ? `${provider.toUpperCase()}` : "CLAUDE"} · Private Practice</span>
        </div>
        {stage !== "setup" && (
          <button
            className="bg-blue-500/10 hover:bg-red-500/20 text-slate-300 hover:text-red-300 border border-blue-500/20 hover:border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            onClick={onReset}
            title="Exit Session"
          >
            Exit Session ✕
          </button>
        )}
      </div>
    </header>
  );
};
