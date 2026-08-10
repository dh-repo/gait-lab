import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "accent" | "warn" | "danger" | "success" | "info";
}) {
  const tones = {
    neutral:
      "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]",
    primary:
      "bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[color-mix(in_srgb,var(--color-info)_20%,transparent)]",
    accent:
      "bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[color-mix(in_srgb,var(--color-info)_20%,transparent)]",
    warn:
      "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[color-mix(in_srgb,var(--color-warn)_28%,transparent)]",
    danger:
      "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)] border-[color-mix(in_srgb,var(--color-danger)_22%,transparent)]",
    success:
      "bg-[var(--color-success-bg)] text-[var(--color-success-text)] border-[color-mix(in_srgb,var(--color-success)_22%,transparent)]",
    info:
      "bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[color-mix(in_srgb,var(--color-info)_20%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
