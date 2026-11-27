import React, { useEffect } from "react";
import { Volume2, X } from "lucide-react";
import type { Message } from "../../types";

interface TranscriptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  recruiterName?: string;
  onSpeak: (text: string) => void;
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  isOpen,
  onClose,
  messages,
  recruiterName = "Iris",
  onSpeak,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-ink/35 backdrop-blur-sm z-[1000] flex justify-end"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Interview Transcript"
        className="w-full max-w-lg h-full bg-paper border-l border-border-strong p-6 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border shrink-0">
          <div>
            <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block">
              CHRONOLOGICAL RECORD
            </span>
            <h3 className="font-serif text-lg font-semibold text-ink">Interview Transcript</h3>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-card hover:bg-muted border border-border-strong text-ink px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${
                msg.role === "interviewer"
                  ? "bg-card border-border"
                  : "bg-surface border-accent/25 ml-4"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className={msg.role === "interviewer" ? "text-accent-deep font-bold" : "text-verified-deep font-bold"}>
                  {msg.role === "interviewer" ? `${recruiterName} (Staff AI)` : "You (Candidate)"}
                </span>
                {msg.role === "interviewer" && (
                  <button
                    type="button"
                    className="text-ink-muted hover:text-ink text-xs flex items-center gap-1 cursor-pointer rounded px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => onSpeak(msg.content)}
                    title="Play message aloud"
                  >
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Read</span>
                  </button>
                )}
              </div>
              <p className="text-sm text-ink leading-relaxed font-sans">{msg.content}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};
