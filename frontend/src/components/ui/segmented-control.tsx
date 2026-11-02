import * as React from "react";
import { cn } from "../../lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "md";
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "flex items-center bg-[#080D1A] border border-blue-500/15 rounded-[10px] p-1 gap-1",
        size === "sm" ? "h-[36px]" : "h-[42px]",
        className
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 h-full flex items-center justify-center font-semibold rounded-lg transition-all duration-200 select-none whitespace-nowrap",
              size === "sm" ? "text-xs px-2" : "text-[13px] px-2.5",
              isSelected
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/40"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
