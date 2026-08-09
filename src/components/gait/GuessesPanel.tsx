import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DualTaskCost, EducatedGuess } from "@/lib/gait/types";
import { cn } from "@/lib/utils";

export function GuessesPanel({
  guesses,
  dualTaskCost,
}: {
  guesses: EducatedGuess[];
  dualTaskCost?: DualTaskCost;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="border-[color-mix(in_oklab,var(--color-warn)_40%,var(--color-border))]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[var(--color-warn)]">
            <ShieldAlert className="size-4" />
            Determine ≠ diagnose
          </CardTitle>
          <CardDescription className="text-[var(--color-muted)]">
            Below are <strong className="text-[var(--color-fg)]">educated guesses</strong> from
            pose kinematics — measures and pattern hypotheses only. Not a medical diagnosis,
            cognitive test, fall-risk certificate, or clinical gait lab. See the{" "}
            <strong className="text-[var(--color-fg)]">Guide</strong> tab for the full ladder.
          </CardDescription>
        </CardHeader>
      </Card>

      {dualTaskCost && (
        <Card className="border-[color-mix(in_oklab,var(--color-accent)_35%,var(--color-border))]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Dual-task cost (paired session)</CardTitle>
            <CardDescription>{dualTaskCost.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <DtcStat label="Cadence cost" value={`${dualTaskCost.cadenceCostPct.toFixed(0)}%`} />
            <DtcStat
              label="Variability cost"
              value={`${dualTaskCost.stepTimeCvCostPct.toFixed(0)}%`}
            />
            <DtcStat
              label="Stability Δ"
              value={`${dualTaskCost.stabilityCostPts.toFixed(0)} pts`}
            />
            <DtcStat
              label="Automaticity Δ"
              value={`${dualTaskCost.automaticityCostPts.toFixed(0)} pts`}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {guesses.map((g) => (
          <GuessCard key={g.id} guess={g} />
        ))}
      </div>
    </div>
  );
}

function DtcStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <p className="text-[10px] text-[var(--color-subtle)]">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  );
}

function GuessCard({ guess }: { guess: EducatedGuess }) {
  const tone =
    guess.severity === "elevated" ? "danger" : guess.severity === "moderate" ? "warn" : "success";
  const Icon =
    guess.severity === "elevated"
      ? AlertTriangle
      : guess.severity === "moderate"
        ? Info
        : CheckCircle2;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-start gap-2 text-[15px] leading-snug">
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                tone === "danger" && "text-[var(--color-danger)]",
                tone === "warn" && "text-[var(--color-warn)]",
                tone === "success" && "text-[var(--color-success)]",
              )}
            />
            {guess.title}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={tone}>{guess.severity}</Badge>
            <Badge tone="neutral">{Math.round(guess.confidence * 100)}% conf.</Badge>
            <Badge tone="primary">{guess.category.replace("_", " ")}</Badge>
            {guess.patternTag && <Badge tone="accent">{guess.patternTag}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--color-muted)]">{guess.summary}</p>
        <ul className="space-y-1 border-t border-[var(--color-border)] pt-3">
          {guess.evidence.map((e) => (
            <li key={e} className="flex gap-2 text-xs text-[var(--color-subtle)]">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-border-strong)]" />
              <span className="tabular">{e}</span>
            </li>
          ))}
        </ul>
        {guess.alternatives && guess.alternatives.length > 0 && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
              Also consider
            </p>
            <p className="text-xs text-[var(--color-muted)]">{guess.alternatives.join(" · ")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
