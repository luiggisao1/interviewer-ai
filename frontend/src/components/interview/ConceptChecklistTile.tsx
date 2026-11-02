import React from "react";
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
  // Aggregate candidate text to detect discussed topics
  const candidateCorpus = messages
    .filter((m) => m.role === "candidate")
    .map((m) => m.content)
    .concat([currentAnswer])
    .join(" ")
    .toLowerCase();

  return (
    <div className="md:col-span-4 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between transition-colors">
      <div className="mb-3.5">
        <span className="text-[10px] font-mono font-bold text-sky-400 tracking-wider block mb-1">
          TOPIC COVERAGE
        </span>
        <h4 className="text-sm font-bold text-white">Key Engineering Concepts</h4>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto max-h-[220px]">
        {plan.focus_areas.map((area, idx) => {
          const keywords = area.toLowerCase().split(/\s+/);
          const isDiscussed = keywords.some((kw) => kw.length > 3 && candidateCorpus.includes(kw));

          return (
            <div
              key={idx}
              className={`flex items-center justify-between p-2.5 rounded-lg text-xs transition-colors ${
                isDiscussed
                  ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-300"
                  : "bg-[#080D1A] border border-blue-500/10 text-slate-400"
              }`}
            >
              <span className="font-bold mr-2">{isDiscussed ? "✓" : "○"}</span>
              <span className="flex-1 font-medium">{area}</span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                {isDiscussed ? "TOUCHED" : "PENDING"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
