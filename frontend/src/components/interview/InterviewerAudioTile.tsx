import React from "react";

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
    <div className="md:col-span-4 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between min-h-[380px] transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-800 to-[#0E1626] border border-blue-500/20 text-white font-extrabold text-lg grid place-items-center shadow-lg">
            {recruiterName ? recruiterName[0].toUpperCase() : "I"}
          </div>
          <div>
            <h4 className="text-sm font-bold text-white leading-tight">{recruiterName}</h4>
            <p className="text-xs text-slate-400 mt-0.5">Staff AI Interviewer</p>
          </div>
        </div>

        <span
          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wider ${
            voiceStatus === "speaking"
              ? "bg-blue-600/20 border border-blue-500/40 text-blue-300"
              : voiceStatus === "listening"
              ? muted
                ? "bg-slate-800/80 border border-white/10 text-slate-400"
                : "bg-sky-950/80 border border-sky-500/30 text-sky-300"
              : voiceStatus === "connecting"
              ? "bg-amber-500/15 border border-amber-500/30 text-amber-300"
              : "bg-white/5 border border-white/10 text-slate-400"
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
      <div className="flex items-center justify-center gap-1.5 h-20 bg-[#080D1A] border border-blue-500/15 rounded-xl px-4 my-2">
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.05s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.05s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.2s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.2s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.35s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.35s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.15s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.15s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.4s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.4s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.25s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.25s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.1s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.1s]" : "h-2.5 bg-slate-700"}`} />
        <span className={`w-1 rounded-full transition-all duration-200 ${voiceStatus === "speaking" ? "bg-sky-400 animate-[eqBounce_1.1s_infinite_ease-in-out_0.3s]" : voiceStatus === "listening" && !muted ? "bg-emerald-400 animate-[eqBounce_1.4s_infinite_ease-in-out_0.3s]" : "h-2.5 bg-slate-700"}`} />
      </div>

      <div className="flex flex-col gap-2">
        {voiceStatus === "speaking" ? (
          <button
            type="button"
            className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-600/40 transition-all cursor-pointer"
            onClick={onSkipSpeech}
          >
            ⏭ Skip Speech
          </button>
        ) : (
          <button
            type="button"
            className={`w-full h-11 border font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              muted
                ? "bg-red-500/15 border-red-500/35 text-red-200 hover:bg-red-500/25"
                : "bg-[#080D1A] border-blue-500/20 hover:border-blue-500/40 text-slate-200 hover:text-white"
            }`}
            onClick={onToggleMute}
            disabled={voiceStatus === "connecting"}
          >
            {muted ? "🎙️ Resume Microphone" : "🔇 Pause Microphone"}
          </button>
        )}
      </div>
    </div>
  );
};
