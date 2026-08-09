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
      "bg-[color-mix(in_oklab,var(--color-primary)_10%,white)] text-[var(--color-primary)] border-[color-mix(in_oklab,var(--color-primary)_28%,var(--color-border))]",
    accent:
      "bg-[color-mix(in_oklab,var(--color-accent)_10%,white)] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_28%,var(--color-border))]",
    warn:
      "bg-[#fffbeb] text-[var(--color-warn)] border-[#fde68a]",
    danger:
      "bg-[#fef2f2] text-[var(--color-danger)] border-[#fecaca]",
    success:
      "bg-[#ecfdf5] text-[var(--color-success)] border-[#a7f3d0]",
    info:
      "bg-[#f0f9ff] text-[var(--color-info)] border-[#bae6fd]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
