import { cn } from "@/lib/utils";

/**
 * Circular score display. Color is intentionally calm: clinical blue for mid/high
 * scores and slate for low scores. Red is reserved for system errors elsewhere —
 * composite research scores must not alarm as "danger".
 */
export function ScoreRing({
  score,
  label,
  size = 88,
  className,
}: {
  score: number;
  label: string;
  size?: number;
  className?: string;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 70
      ? "var(--color-primary)"
      : pct >= 45
        ? "var(--color-subtle)"
        : "var(--color-border-strong)";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <svg width={size} height={size} viewBox="0 0 88 88" className="block">
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="7"
        />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
        />
        <text
          x="44"
          y="48"
          textAnchor="middle"
          className="tabular"
          fill="var(--color-fg)"
          fontSize="18"
          fontWeight="600"
          fontFamily="var(--font-mono)"
        >
          {Math.round(pct)}
        </text>
      </svg>
      <span className="text-xs font-medium text-[var(--color-muted)]">{label}</span>
    </div>
  );
}
