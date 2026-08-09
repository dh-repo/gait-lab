import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "primary" | "accent" | "warn" | "danger" | "success";
}) {
  const tones = {
    neutral: "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]",
    primary: "bg-[color-mix(in_oklab,var(--color-primary)_18%,transparent)] text-[var(--color-primary)] border-[color-mix(in_oklab,var(--color-primary)_35%,transparent)]",
    accent: "bg-[color-mix(in_oklab,var(--color-accent)_16%,transparent)] text-[var(--color-accent)] border-[color-mix(in_oklab,var(--color-accent)_35%,transparent)]",
    warn: "bg-[color-mix(in_oklab,var(--color-warn)_16%,transparent)] text-[var(--color-warn)] border-[color-mix(in_oklab,var(--color-warn)_35%,transparent)]",
    danger: "bg-[color-mix(in_oklab,var(--color-danger)_16%,transparent)] text-[var(--color-danger)] border-[color-mix(in_oklab,var(--color-danger)_35%,transparent)]",
    success: "bg-[color-mix(in_oklab,var(--color-success)_16%,transparent)] text-[var(--color-success)] border-[color-mix(in_oklab,var(--color-success)_35%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
