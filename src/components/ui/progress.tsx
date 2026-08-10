import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  tone?: "primary" | "success" | "warn" | "danger";
  className?: string;
}

export function Progress({
  value,
  tone = "primary",
  className,
  ...props
}: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));

  const toneColors = {
    primary: "bg-[#1A73E8]",
    success: "bg-[#188038]",
    warn: "bg-[#F9AB00]",
    danger: "bg-[#D93025]",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[#E8EAED]",
        className,
      )}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", toneColors[tone])}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
