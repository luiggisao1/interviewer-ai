import React from "react";
import { Mic, MicOff, SkipForward } from "lucide-react";

interface InterviewerAudioTileProps {
  voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error";
  muted: boolean;
  recruiterName?: string;
  onSkipSpeech: () => void;
  onToggleMute: () => void;
}

export const InterviewerAudioTile: React.FC<InterviewerAudioTileProps> = ({
  voiceStatus,
  muted,
  recruiterName = "Iris",
  onSkipSpeech,
  onToggleMute,
}) => {
  return (
    <div className="md:col-span-4 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between min-h-[380px] transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-ink text-paper font-serif font-semibold text-lg grid place-items-center shadow-sm">
            {recruiterName ? recruiterName[0].toUpperCase() : "I"}
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink leading-tight">{recruiterName}</h3>
            <p className="text-xs text-ink-muted mt-0.5">Staff AI Interviewer</p>
          </div>
        </div>

        <span
          className={`font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-full border tracking-wider ${
            voiceStatus === "speaking"
              ? "bg-accent/15 border-accent/35 text-accent-deep"
              : voiceStatus === "listening"
              ? muted
                ? "bg-muted border-border text-ink-muted"
                : "bg-emerald-50 border-emerald-200 text-verified-deep"
              : voiceStatus === "connecting"
              ? "bg-amber-50 border-amber-200 text-accent-deep"
              : voiceStatus === "error"
              ? "bg-red-50 border-red-200 text-danger-deep"
              : "bg-muted border-border text-ink-muted"
          }`}
        >
          {voiceStatus === "speaking" && "SPEAKING"}
          {voiceStatus === "listening" && (muted ? "MUTED" : "LISTENING")}
          {voiceStatus === "connecting" && "ANALYZING"}
          {voiceStatus === "idle" && "READY"}
          {voiceStatus === "error" && "RECONNECT"}
        </span>
      </div>

      {/* Dynamic Equalizer Bar Visualizer */}
      <div className="flex items-center justify-center gap-1.5 h-20 bg-muted border border-border rounded-lg px-4 my-2" aria-hidden="true">
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.05s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.05s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.2s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.2s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.35s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.35s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.15s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.15s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.4s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.4s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.25s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.25s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.1s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.1s]" : "h-2.5 bg-border-strong"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-accent animate-[eqBounce_1.1s_infinite_ease-in-out_0.3s]" : voiceStatus === "listening" && !muted ? "bg-verified animate-[eqBounce_1.4s_infinite_ease-in-out_0.3s]" : "h-2.5 bg-border-strong"}`} />
      </div>

      <div className="flex flex-col gap-2">
        {voiceStatus === "speaking" ? (
          <button
            type="button"
            className="w-full h-11 bg-ink hover:bg-ink/90 text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onSkipSpeech}
          >
            <SkipForward className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <span>Skip Speech</span>
          </button>
        ) : (
          <button
            type="button"
            className={`w-full h-11 border font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 ${
              muted
                ? "bg-red-50 border-red-200 text-danger-deep hover:bg-red-100"
                : "bg-muted/70 border-border-strong hover:bg-surface hover:border-ink/40 text-ink"
            }`}
            onClick={onToggleMute}
            disabled={voiceStatus === "connecting"}
          >
            {muted ? (
              <>
                <Mic className="w-4 h-4" aria-hidden="true" />
                <span>Resume Microphone</span>
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4 text-ink-muted" aria-hidden="true" />
                <span>Pause Microphone</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
