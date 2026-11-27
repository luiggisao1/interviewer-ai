import React from "react";
import { ArrowRight, CornerDownLeft, MessageSquare, Mic, MicOff, ScrollText, Send } from "lucide-react";

interface SessionControlsTileProps {
  textMode: boolean;
  setTextMode: (val: boolean) => void;
  voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error";
  muted: boolean;
  onToggleMute: () => void;
  onSubmitAnswer: () => void;
  onEndInterview: () => void;
  onToggleTranscript: () => void;
  hasCandidateAnswers: boolean;
  answerLength: number;
  loading: boolean;
  isEvaluating: boolean;
  complete: boolean;
}

export const SessionControlsTile: React.FC<SessionControlsTileProps> = ({
  textMode,
  setTextMode,
  muted,
  onToggleMute,
  onSubmitAnswer,
  onEndInterview,
  onToggleTranscript,
  hasCandidateAnswers,
  answerLength,
  loading,
  isEvaluating,
  complete,
}) => {
  return (
    <div className="md:col-span-4 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between transition-colors">
      <div className="mb-3.5 pb-2.5 border-b border-border">
        <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block mb-0.5">
          TURN ACTIONS
        </span>
        <h3 className="font-serif text-base font-semibold text-ink">Session Controls</h3>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className="w-full h-11 bg-ink hover:bg-ink/90 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={onSubmitAnswer}
          disabled={answerLength === 0 || loading || complete}
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
          ) : !textMode ? (
            <>
              <span>Done Speaking</span>
              <CornerDownLeft className="w-4 h-4 text-amber-400" aria-hidden="true" />
            </>
          ) : (
            <>
              <span>Send Answer</span>
              <Send className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            </>
          )}
        </button>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={`h-9 px-2 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              muted
                ? "bg-red-50 border-red-200 text-danger-deep hover:bg-red-100"
                : "bg-muted/70 border-border-strong hover:bg-surface text-ink"
            }`}
            onClick={onToggleMute}
            title="Toggle Microphone (Spacebar)"
          >
            {muted ? (
              <>
                <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                <span>Mute</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="h-9 px-2 rounded-lg text-xs font-semibold bg-muted/70 border border-border-strong hover:bg-surface text-ink inline-flex items-center justify-center gap-1 transition-colors cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={() => setTextMode(!textMode)}
            title="Switch between Voice and Text mode"
          >
            {textMode ? (
              <>
                <Mic className="w-3.5 h-3.5 text-accent-deep shrink-0" aria-hidden="true" />
                <span>Voice</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                <span>Text</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="h-9 px-2 rounded-lg text-xs font-semibold bg-muted/70 border border-border-strong hover:bg-surface text-ink inline-flex items-center justify-center gap-1 transition-colors cursor-pointer truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onToggleTranscript}
            title="View Full Interview History"
          >
            <ScrollText className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
            <span>History</span>
          </button>
        </div>

        <button
          type="button"
          className="w-full h-10 bg-red-50 hover:bg-red-100 border border-red-200 text-danger-deep font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={onEndInterview}
          disabled={!hasCandidateAnswers || loading || isEvaluating}
        >
          {isEvaluating ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-red-300 border-t-danger-deep rounded-full animate-spin mr-1.5" /> Generating Debrief…
            </>
          ) : (
            <>
              <span>End Interview &amp; Get Debrief</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </div>

      <div className="pt-2.5 text-center text-xs text-ink-muted font-mono">
        <span>
          Hotkeys: <kbd className="bg-muted border border-border-strong px-1.5 py-0.5 rounded text-ink">Space</kbd> Mic Pause ·{" "}
          <kbd className="bg-muted border border-border-strong px-1.5 py-0.5 rounded text-ink">Enter</kbd> Commit
        </span>
      </div>
    </div>
  );
};
