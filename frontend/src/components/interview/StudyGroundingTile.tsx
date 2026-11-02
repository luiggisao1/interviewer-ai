import React from "react";
import type { InterviewConfig, Message, Plan } from "../../types";

interface StudyGroundingTileProps {
  plan: Plan;
  config: InterviewConfig;
  provider: string;
  messages: Message[];
  studyGuideLength: number;
}

export const StudyGroundingTile: React.FC<StudyGroundingTileProps> = ({
  plan,
  config,
  provider,
  messages,
  studyGuideLength,
}) => {
  const answeredCount = messages.filter((m) => m.role === "candidate").length;
  const progressPercent = Math.min(100, Math.round((answeredCount / plan.estimated_turns) * 100));

  return (
    <div className="md:col-span-4 bg-[#0E1626] border border-blue-500/15 hover:border-blue-500/35 rounded-[18px] p-6 shadow-2xl flex flex-col justify-between transition-colors">
      <div className="mb-3.5">
        <span className="text-[10px] font-mono font-bold text-sky-400 tracking-wider block mb-1">
          NOTES GROUNDING
        </span>
        <h4 className="text-sm font-bold text-white">Session Telemetry</h4>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Interview Progress</span>
            <strong className="text-white font-semibold">
              {answeredCount} / {plan.estimated_turns} Turns ({progressPercent}%)
            </strong>
          </div>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
            <div
              className="bg-sky-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#080D1A] border border-blue-500/10 p-2.5 rounded-lg">
            <span className="text-[10px] text-slate-500 block uppercase">Role</span>
            <strong className="text-white text-xs block truncate">{config.role}</strong>
          </div>
          <div className="bg-[#080D1A] border border-blue-500/10 p-2.5 rounded-lg">
            <span className="text-[10px] text-slate-500 block uppercase">Track</span>
            <strong className="text-white text-xs block truncate">
              {config.difficulty} · {config.mode}
            </strong>
          </div>
          <div className="bg-[#080D1A] border border-blue-500/10 p-2.5 rounded-lg">
            <span className="text-[10px] text-slate-500 block uppercase">Engine</span>
            <strong className="text-white text-xs block truncate">{provider.toUpperCase()}</strong>
          </div>
          <div className="bg-[#080D1A] border border-blue-500/10 p-2.5 rounded-lg">
            <span className="text-[10px] text-slate-500 block uppercase">Notes</span>
            <strong className="text-white text-xs block truncate">
              {studyGuideLength.toLocaleString()} chars
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
