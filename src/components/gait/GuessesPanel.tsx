import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DualTaskCost, EducatedGuess } from "@/lib/gait/types";
import { resolveDteValues } from "@/lib/gait/guesses";
import { cn } from "@/lib/utils";

export function GuessesPanel({
  guesses,
  dualTaskCost,
}: {
  guesses: EducatedGuess[];
  dualTaskCost?: DualTaskCost;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-fg)]">
          <ShieldAlert className="size-4 text-[var(--color-warn-text,#b06000)]" />
          Pattern hypotheses — not a diagnosis
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
          Ranked pattern hypotheses from pose kinematics only. Not a medical diagnosis.
          See the Guide tab for the determination ladder.
        </p>
      </div>

      {dualTaskCost && <DualTaskCard dualTaskCost={dualTaskCost} />}

      <div className="flex flex-col gap-3">
        {guesses.map((g) => (
          <GuessCard key={g.id} guess={g} />
        ))}
      </div>
    </div>
  );
}

function DualTaskCard({ dualTaskCost }: { dualTaskCost: DualTaskCost }) {
  const { cadenceDte, stepTimeCvDte, stabilityDte, automaticityDte } =
    resolveDteValues(dualTaskCost);
  return (
    <Card className="border border-[#DADCE0] bg-[#E8F0FE]/20 rounded-xl shadow-xs">
      <CardHeader className="pb-3 border-b border-[#F1F3F4]">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <CardTitle className="text-sm font-medium text-[#202124]">Dual-task cost (paired session)</CardTitle>
          {dualTaskCost.cmiClassification && (
            <Badge className="bg-[#E8F0FE] text-[#1967D2] border border-[#D2E3FC] text-xs font-medium capitalize">
              CMI: {dualTaskCost.cmiClassification.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs text-[#5F6368] mt-1">{dualTaskCost.summary}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 pt-4">
        <DtcStat label="Cadence DTE" value={`${cadenceDte.toFixed(1)}%`} />
        <DtcStat label="Step Time CV DTE" value={`${stepTimeCvDte.toFixed(1)}%`} />
        <DtcStat
          label="Stability DTE"
          value={`${stabilityDte.toFixed(0)} pts`}
        />
        <DtcStat
          label="Automaticity DTE"
          value={`${automaticityDte.toFixed(0)} pts`}
        />
      </CardContent>
    </Card>
  );
}

function DtcStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#DADCE0] bg-white p-2.5 shadow-2xs">
      <p className="text-[10px] text-[#5F6368] font-medium">{label}</p>
      <p className="tabular-nums font-mono text-sm font-semibold text-[#202124] mt-0.5">{value}</p>
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

  let severityBadgeClass = "bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]";
  if (tone === "danger") {
    severityBadgeClass = "bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]";
  } else if (tone === "warn") {
    severityBadgeClass = "bg-[#FEF7E0] text-[#B06000] border-[#FCE8E6]";
  }

  return (
    <Card className="border border-[#DADCE0] bg-white rounded-xl shadow-xs hover:shadow-sm transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-start gap-2 text-sm font-medium text-[#202124] leading-snug">
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                tone === "danger" && "text-[#C5221F]",
                tone === "warn" && "text-[#B06000]",
                tone === "success" && "text-[#137333]",
              )}
            />
            {guess.title}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge className={cn("text-xs font-medium border capitalize", severityBadgeClass)}>
              {guess.severity}
            </Badge>
            <Badge className="bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0] text-xs font-medium">
              {Math.round(guess.confidence * 100)}% conf.
            </Badge>
            <Badge className="bg-[#E8F0FE] text-[#1967D2] border border-[#D2E3FC] text-xs font-medium capitalize">
              {guess.category.replace(/_/g, " ")}
            </Badge>
            {guess.patternTag && (
              <Badge className="bg-[#FEF7E0] text-[#B06000] border border-[#FCE8E6] text-xs font-medium">
                {guess.patternTag}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <p className="text-xs leading-relaxed text-[#5F6368]">{guess.summary}</p>
        <ul className="space-y-1.5 border-t border-[#DADCE0] pt-3">
          {guess.evidence.map((e) => (
            <li key={e} className="flex gap-2 text-xs text-[#3C4043]">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#5F6368]" />
              <span className="tabular-nums font-mono">{e}</span>
            </li>
          ))}
        </ul>
        {guess.alternatives && guess.alternatives.length > 0 && (
          <div className="rounded-lg border border-[#DADCE0] bg-[#F8F9FA] p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#5F6368]">
              Also consider
            </p>
            <p className="text-xs text-[#3C4043]">{guess.alternatives.join(" · ")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
