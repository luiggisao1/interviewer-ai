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
        "flex items-center bg-muted border border-border rounded-lg p-1 gap-1",
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
              "flex-1 h-full flex items-center justify-center font-semibold rounded-md transition-all duration-150 select-none whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              size === "sm" ? "text-xs px-2" : "text-[13px] px-2.5",
              isSelected
                ? "bg-ink text-white shadow-sm"
                : "text-ink-muted hover:text-ink hover:bg-card/80"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
