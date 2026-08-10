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
      "bg-[#F1F3F4] text-[#5F6368] border-[#DADCE0]",
    primary:
      "bg-[#E8F0FE] text-[#1967D2] border-[#D2E3FC]",
    accent:
      "bg-[#E8F0FE] text-[#1967D2] border-[#D2E3FC]",
    warn:
      "bg-[#FEF7E0] text-[#B06000] border-[#FCE8E6]",
    danger:
      "bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]",
    success:
      "bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]",
    info:
      "bg-[#E8F0FE] text-[#1967D2] border-[#D2E3FC]",
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
