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
    <div className="md:col-span-4 bg-card border border-border hover:border-border-strong rounded-xl p-6 shadow-editorial flex flex-col justify-between transition-colors">
      <div className="mb-3.5 pb-2.5 border-b border-border">
        <span className="text-[11px] font-mono font-bold text-accent-deep tracking-wider uppercase block mb-0.5">
          NOTES GROUNDING
        </span>
        <h3 className="font-serif text-base font-semibold text-ink">Session Telemetry</h3>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Interview Progress</span>
            <strong className="text-ink font-semibold font-mono">
              {answeredCount} / {plan.estimated_turns} Turns ({progressPercent}%)
            </strong>
          </div>
          <div className="w-full bg-muted border border-border h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-accent h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/70 border border-border p-2.5 rounded-lg">
            <span className="text-[10px] font-mono text-ink-muted block uppercase">Role</span>
            <strong className="text-ink text-xs font-semibold block truncate mt-0.5">{config.role}</strong>
          </div>
          <div className="bg-muted/70 border border-border p-2.5 rounded-lg">
            <span className="text-[10px] font-mono text-ink-muted block uppercase">Track</span>
            <strong className="text-ink text-xs font-semibold block truncate mt-0.5">
              {config.difficulty} · {config.mode}
            </strong>
          </div>
          <div className="bg-muted/70 border border-border p-2.5 rounded-lg">
            <span className="text-[10px] font-mono text-ink-muted block uppercase">Engine</span>
            <strong className="text-ink text-xs font-semibold font-mono block truncate mt-0.5">{provider.toUpperCase()}</strong>
          </div>
          <div className="bg-muted/70 border border-border p-2.5 rounded-lg">
            <span className="text-[10px] font-mono text-ink-muted block uppercase">Notes</span>
            <strong className="text-ink text-xs font-semibold font-mono block truncate mt-0.5">
              {studyGuideLength.toLocaleString()} chars
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
