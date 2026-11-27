import React, { FormEvent } from "react";
import { Mic, Volume2 } from "lucide-react";
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

  const lastInterviewerMsg = [...messages].reverse().find((m) => m.role === "interviewer");
  const questionText = lastInterviewerMsg?.content || "Waiting for interviewer to present the first question…";

  return (
    <div className="md:col-span-8 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between min-h-[380px] transition-colors">
      <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-border flex-wrap">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-accent-deep">
          <span className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span>QUESTION {String(currentTurnNumber).padStart(2, "0")} / {String(plan.estimated_turns).padStart(2, "0")}</span>
          <span className="text-border-strong">·</span>
          <span className="text-ink-muted font-medium font-sans">{plan.title}</span>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 bg-muted/70 border border-border-strong hover:bg-surface hover:border-ink/40 text-ink text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onSpeakText(questionText)}
          title="Replay interviewer question aloud"
        >
          <Volume2 className="w-3.5 h-3.5 text-accent-deep" aria-hidden="true" />
          <span>Replay Question</span>
        </button>
      </div>

      <h2 className="font-serif text-2xl md:text-[28px] font-semibold text-ink tracking-tight leading-[1.3] mb-6">
        {questionText}
      </h2>

      {/* Candidate Response Area (Voice Buffer or Textarea) */}
      <div className="bg-surface border border-border rounded-lg p-4 mt-auto flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-xs font-mono pb-2 border-b border-border flex-wrap gap-2">
          <span className="flex items-center gap-2 font-bold text-accent-deep uppercase text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                voiceStatus === "listening"
                  ? "bg-verified animate-pulse"
                  : voiceStatus === "speaking"
                  ? "bg-accent"
                  : "bg-ink-muted/40"
              }`}
            />
            {!textMode ? "Real-Time Candidate Voice Stream" : "Text Response Mode"}
          </span>
          <span className="text-ink-muted text-[11px] flex items-center gap-1.5">
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
                    <span className="text-verified-deep font-semibold flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-verified-deep" aria-hidden="true" />
                      <span>Voice Detected</span>
                      <span className="inline-flex items-center gap-0.5 h-3 ml-0.5" aria-hidden="true">
                        <span className="w-1 bg-verified rounded-full animate-[pulse_0.4s_infinite]" style={{ height: `${Math.max(4, Math.min(14, micLevel * 0.25))}px` }} />
                        <span className="w-1 bg-verified rounded-full animate-[pulse_0.3s_infinite]" style={{ height: `${Math.max(6, Math.min(16, micLevel * 0.35))}px` }} />
                        <span className="w-1 bg-verified rounded-full animate-[pulse_0.45s_infinite]" style={{ height: `${Math.max(4, Math.min(14, micLevel * 0.25))}px` }} />
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
              <p className="font-mono text-sm leading-relaxed text-ink">{answer}</p>
            ) : (
              <p className="text-sm italic text-ink-muted leading-relaxed">
                {muted
                  ? "Microphone paused. Click 'Resume Microphone' or press Space to speak."
                  : voiceStatus === "speaking"
                  ? `${recruiterName} is speaking aloud… Listening will begin immediately when she finishes.`
                  : "Speak your technical explanation aloud; transcript streams here in real time…"}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmitAnswer} className="flex flex-col">
            <textarea
              className="w-full bg-transparent border-none text-ink text-sm outline-none resize-vertical leading-relaxed font-sans placeholder:text-ink-muted/70"
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
