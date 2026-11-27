import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { Message, Plan } from "../../types";

interface ConceptChecklistTileProps {
  plan: Plan;
  messages: Message[];
  currentAnswer: string;
}

export const ConceptChecklistTile: React.FC<ConceptChecklistTileProps> = ({
  plan,
  messages,
  currentAnswer,
}) => {
  const candidateCorpus = messages
    .filter((m) => m.role === "candidate")
    .map((m) => m.content)
    .concat([currentAnswer])
    .join(" ")
    .toLowerCase();

  return (
    <div className="md:col-span-4 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between transition-colors">
      <div className="mb-3.5 pb-2.5 border-b border-border">
        <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block mb-0.5">
          TOPIC COVERAGE
        </span>
        <h3 className="font-serif text-base font-semibold text-ink">Key Engineering Concepts</h3>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto max-h-[220px]">
        {plan.focus_areas.map((area, idx) => {
          const keywords = area.toLowerCase().split(/\s+/);
          const isDiscussed = keywords.some((kw) => kw.length > 3 && candidateCorpus.includes(kw));

          return (
            <div
              key={idx}
              className={`flex items-center justify-between gap-2 p-2.5 rounded-lg text-xs border transition-colors ${
                isDiscussed
                  ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                  : "bg-muted/70 border-border text-ink-muted"
              }`}
            >
              {isDiscussed ? (
                <CheckCircle2 className="w-4 h-4 text-verified-deep shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 text-ink-muted/50 shrink-0" aria-hidden="true" />
              )}
              <span className="flex-1 font-medium">{area}</span>
              <span
                className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                  isDiscussed ? "text-verified-deep" : "text-ink-muted"
                }`}
              >
                {isDiscussed ? "TOUCHED" : "PENDING"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
