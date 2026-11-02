import React from "react";

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
    <div className="md:col-span-4 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between transition-colors">
      <div className="mb-3.5">
        <span className="text-[10px] font-mono font-bold text-sky-400 tracking-wider block mb-1">
          TURN ACTIONS
        </span>
        <h4 className="text-sm font-bold text-white">Session Controls</h4>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/40 transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          onClick={onSubmitAnswer}
          disabled={answerLength === 0 || loading || complete}
        >
          {loading ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
          ) : !textMode ? (
            "Done Speaking ↵"
          ) : (
            "Send Answer ↑"
          )}
        </button>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className={`h-9 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              muted
                ? "bg-red-500/20 border-red-500/40 text-red-300"
                : "bg-[#080D1A] border-blue-500/20 hover:border-blue-500/40 text-slate-300 hover:text-white"
            }`}
            onClick={onToggleMute}
            title="Toggle Microphone (Spacebar)"
          >
            {muted ? "🎙️ Resume" : "🔇 Mute"}
          </button>

          <button
            type="button"
            className="h-9 px-2 rounded-lg text-xs font-semibold bg-[#080D1A] border border-blue-500/20 hover:border-blue-500/40 text-slate-300 hover:text-white transition-all cursor-pointer truncate"
            onClick={() => setTextMode(!textMode)}
            title="Switch between Voice and Text mode"
          >
            {textMode ? "🎙️ Voice" : "💬 Text"}
          </button>

          <button
            type="button"
            className="h-9 px-2 rounded-lg text-xs font-semibold bg-[#080D1A] border border-blue-500/20 hover:border-blue-500/40 text-slate-300 hover:text-white transition-all cursor-pointer truncate"
            onClick={onToggleTranscript}
            title="View Full Interview History"
          >
            📜 History
          </button>
        </div>

        <button
          type="button"
          className="w-full h-10 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          onClick={onEndInterview}
          disabled={!hasCandidateAnswers || loading || isEvaluating}
        >
          {isEvaluating ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-red-300/30 border-t-red-300 rounded-full animate-spin mr-1.5" /> Generating Debrief…
            </>
          ) : (
            "End Interview & Get Debrief →"
          )}
        </button>
      </div>

      <div className="pt-2 text-center text-[11px] text-slate-500 font-mono">
        <span>Hotkeys: <kbd className="bg-white/10 px-1 py-0.5 rounded text-slate-300">Space</kbd> Mic Pause · <kbd className="bg-white/10 px-1 py-0.5 rounded text-slate-300">Enter</kbd> Commit</span>
      </div>
    </div>
  );
};
