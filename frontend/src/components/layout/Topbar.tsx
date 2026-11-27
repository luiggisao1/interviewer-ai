import React from "react";
import { Database, Mic, Plus, User, X } from "lucide-react";
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
    <header className="h-[60px] px-4 md:px-8 flex items-center justify-between bg-card/90 backdrop-blur-md border-b border-border shrink-0 z-50">
      <div className="flex items-center gap-3">
        <a
          href="#"
          className="flex items-center gap-2.5 text-ink font-semibold text-base tracking-tight select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={(e) => {
            e.preventDefault();
            if (stage !== "setup") onReset();
          }}
        >
          <span className="w-8 h-8 rounded-lg bg-ink text-paper grid place-items-center shadow-sm">
            <Mic className="w-4 h-4 text-amber-400" aria-hidden="true" />
          </span>
          <span className="font-serif text-lg tracking-tight">
            Interviewer <em className="italic text-accent-deep font-semibold">AI</em>
          </span>
        </a>
      </div>

      <div className="flex items-center gap-2.5 md:gap-3.5 text-xs">
        {trimmedName && (stage === "interview" || stage === "results") && (
          <div className="hidden sm:flex items-center gap-1.5 bg-surface border border-accent/30 text-ink px-2.5 py-1 rounded-full font-medium">
            <User className="w-3.5 h-3.5 text-accent-deep" aria-hidden="true" />
            <span>{trimmedName}</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-2 text-ink-muted font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              storageMode === "none"
                ? "bg-ink-muted/50"
                : storageMode === "senior_only"
                  ? "bg-accent"
                  : "bg-verified"
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
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              stage === "review"
                ? "bg-ink text-white border-ink shadow-sm"
                : "bg-card hover:bg-surface text-ink border-border-strong hover:border-ink/40"
            }`}
          >
            <Database className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Review Archive</span>
          </button>
        )}

        {stage === "review" && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-verified-deep border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Interview</span>
          </button>
        )}

        {(stage === "interview" || stage === "results") && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-card hover:bg-red-50 text-ink-secondary hover:text-danger-deep border border-border-strong hover:border-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onReset}
            title="Exit Session"
          >
            <span>Exit Session</span>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
};
