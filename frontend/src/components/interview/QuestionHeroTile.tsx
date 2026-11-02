import React, { FormEvent } from "react";
import type { Message, Plan } from "../../types";

interface QuestionHeroTileProps {
  plan: Plan;
  messages: Message[];
  answer: string;
  setAnswer: (val: string) => void;
  voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error";
  muted: boolean;
  textMode: boolean;
  loading: boolean;
  complete: boolean;
  recruiterName?: string;
  micLevel?: number;
  onSpeakText: (text: string) => void;
  onSubmitAnswer: (e: FormEvent) => void;
}

export const QuestionHeroTile: React.FC<QuestionHeroTileProps> = ({
  plan,
  messages,
  answer,
  setAnswer,
  voiceStatus,
  muted,
  textMode,
  loading,
  complete,
  recruiterName = "Iris",
  micLevel = 0,
  onSpeakText,
  onSubmitAnswer,
}) => {
  const candidateTurnsCount = messages.filter((m) => m.role === "candidate").length;
  const currentTurnNumber = Math.min(plan.estimated_turns, candidateTurnsCount + 1);

  // Find the latest interviewer message
  const lastInterviewerMsg = [...messages].reverse().find((m) => m.role === "interviewer");
  const questionText = lastInterviewerMsg?.content || "Waiting for interviewer to present the first question…";

  return (
    <div className="md:col-span-8 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between min-h-[380px] transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-sky-400">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
          <span>QUESTION {String(currentTurnNumber).padStart(2, "0")} / {String(plan.estimated_turns).padStart(2, "0")}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400 font-medium font-sans">{plan.title}</span>
        </div>

        <button
          type="button"
          className="bg-[#080D1A] border border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-600/10 text-slate-300 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all cursor-pointer"
          onClick={() => onSpeakText(questionText)}
          title="Replay interviewer question aloud"
        >
          🔊 Replay Question
        </button>
      </div>

      <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-snug mb-6">
        {questionText}
      </h2>

      {/* Candidate Response Area (Voice Buffer or Textarea) */}
      <div className="bg-[#080D1A] border border-blue-500/15 rounded-xl p-4 mt-auto flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono pb-2 border-b border-white/5">
          <span className="flex items-center gap-2 font-bold text-sky-400 uppercase text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                voiceStatus === "listening"
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400 animate-pulse"
                  : voiceStatus === "speaking"
                  ? "bg-sky-400 shadow-sm shadow-sky-400"
                  : "bg-slate-600"
              }`}
            />
            {!textMode ? "Real-Time Candidate Voice Stream" : "Text Response Mode"}
          </span>
          <span className="text-slate-400 text-[11px] flex items-center gap-1.5">
            {!textMode ? (
              voiceStatus === "speaking" ? (
                `${recruiterName} is speaking aloud…`
              ) : voiceStatus === "connecting" ? (
                `${recruiterName} is processing…`
              ) : muted ? (
                "Microphone Paused"
              ) : (
                <>
                  {micLevel > 5 ? (
                    <span className="text-emerald-300 font-semibold flex items-center gap-1.5">
                      🎙️ Voice Detected
                      <span className="inline-flex items-center gap-0.5 h-3 ml-0.5">
                        <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.4s_infinite]" style={{ height: `${Math.max(4, Math.min(14, micLevel * 0.25))}px` }} />
                        <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.3s_infinite]" style={{ height: `${Math.max(6, Math.min(16, micLevel * 0.35))}px` }} />
                        <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.45s_infinite]" style={{ height: `${Math.max(4, Math.min(14, micLevel * 0.25))}px` }} />
                      </span>
                    </span>
                  ) : (
                    "Microphone Floor Open · Speak freely"
                  )}
                </>
              )
            ) : (
              "Press Enter to Send"
            )}
          </span>
        </div>

        {!textMode ? (
          <div className="min-h-[72px] flex items-center">
            {answer ? (
              <p className="font-mono text-sm leading-relaxed text-white">{answer}</p>
            ) : (
              <p className="text-sm italic text-slate-400 leading-relaxed">
                {muted
                  ? "Microphone paused. Click 'Resume Mic' or press Space to speak."
                  : voiceStatus === "speaking"
                  ? `${recruiterName} is speaking aloud… Listening will begin immediately when she finishes.`
                  : "Speak your technical explanation aloud; transcript streams here in real time…"}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmitAnswer} className="flex flex-col">
            <textarea
              className="w-full bg-transparent border-none text-white text-sm outline-none resize-vertical leading-relaxed font-sans placeholder-slate-500"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={complete ? "Interview complete — get your debrief." : "Type your technical answer…"}
              disabled={loading || complete}
              rows={4}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </form>
        )}
      </div>
    </div>
  );
};
