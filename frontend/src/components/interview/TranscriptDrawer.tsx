import React from "react";
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-[#060A14]/80 backdrop-blur-md z-[1000] flex justify-end"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-lg h-full bg-[#0E1626] border-l border-blue-500/20 p-6 flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div>
            <span className="text-[10px] font-mono font-bold text-sky-400 tracking-wider block">
              CHRONOLOGICAL RECORD
            </span>
            <h3 className="text-base font-bold text-white">Interview Transcript</h3>
          </div>
          <button
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            onClick={onClose}
          >
            ✕ Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-3">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${
                msg.role === "interviewer"
                  ? "bg-[#080D1A] border-blue-500/15"
                  : "bg-blue-600/10 border-blue-500/25 ml-4"
              }`}
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className={msg.role === "interviewer" ? "text-sky-400 font-bold" : "text-emerald-400 font-bold"}>
                  {msg.role === "interviewer" ? `${recruiterName} (Staff AI)` : "You (Candidate)"}
                </span>
                {msg.role === "interviewer" && (
                  <button
                    className="text-slate-400 hover:text-white text-[11px] flex items-center gap-1 cursor-pointer"
                    onClick={() => onSpeak(msg.content)}
                    title="Play message aloud"
                  >
                    🔊 Read
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-200 leading-relaxed font-sans">{msg.content}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};
