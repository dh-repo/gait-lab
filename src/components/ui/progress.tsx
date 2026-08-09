import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  className?: string;
}

export function Progress({
  value,
  className,
  ...props
}: ProgressProps) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]",
        className,
      )}
      {...props}
    >
      <div
        className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
