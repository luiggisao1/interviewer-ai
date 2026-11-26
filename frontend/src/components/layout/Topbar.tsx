import React from "react";
import { Database, Plus, User } from "lucide-react";
import type { StorageMode } from "../../types";

interface TopbarProps {
  provider: string;
  stage: "setup" | "interview" | "results" | "review" | "admin";
  storageMode?: StorageMode;
  candidateName?: string;
  onReset: () => void;
  onOpenReview: () => void;
}

function getStorageLabel(storageMode?: StorageMode): string {
  switch (storageMode) {
    case "all":
      return "Saving All";
    case "senior_only":
      return "Senior Only";
    default:
      return "Private Practice";
  }
}

export const Topbar: React.FC<TopbarProps> = ({
  provider,
  stage,
  storageMode = "all",
  candidateName,
  onReset,
  onOpenReview,
}) => {
  const trimmedName = candidateName?.trim();
  const storageLabel = getStorageLabel(storageMode);

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

      <div className="flex items-center gap-2.5 md:gap-3.5 text-xs">
        {trimmedName && (stage === "interview" || stage === "results") && (
          <div className="hidden sm:flex items-center gap-1.5 bg-sky-950/60 border border-sky-500/25 text-sky-200 px-2.5 py-1 rounded-full font-medium">
            <User className="w-3.5 h-3.5 text-sky-400" />
            <span>{trimmedName}</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-2 text-slate-400">
          <span
            className={`w-2 h-2 rounded-full shadow-sm ${
              storageMode === "none"
                ? "bg-slate-400 shadow-slate-400"
                : storageMode === "senior_only"
                  ? "bg-sky-400 shadow-sky-400"
                  : "bg-emerald-400 shadow-emerald-400"
            }`}
          />
          <span>
            {provider ? provider.toUpperCase() : "AI"} · {storageLabel}
          </span>
        </div>

        {stage !== "interview" && (
          <button
            type="button"
            onClick={onOpenReview}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              stage === "review"
                ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30"
                : "bg-blue-500/10 hover:bg-blue-500/20 text-sky-300 hover:text-white border-blue-500/25"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Review Archive</span>
          </button>
        )}

        {stage === "review" && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-white border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Interview</span>
          </button>
        )}

        {(stage === "interview" || stage === "results") && (
          <button
            type="button"
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
