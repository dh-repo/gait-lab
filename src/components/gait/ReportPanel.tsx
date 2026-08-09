import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Star,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  bandTone,
  buildStructuredReport,
  type DomainRating,
  type HypothesisRating,
  type MetricRating,
  type RatingBand,
} from "@/lib/gait/ratings";
import type { AnalysisResult } from "@/lib/gait/types";
import { cn } from "@/lib/utils";

export function ReportPanel({ result }: { result: AnalysisResult }) {
  const report = useMemo(
    () =>
      buildStructuredReport(result.metrics, result.guesses, {
        taskMode: result.taskMode,
        analyzedFrames: result.analyzedFrames,
        dualTaskCost: result.dualTaskCost,
      }),
    [result],
  );

  const [openDomain, setOpenDomain] = useState<string | null>("overall");
  const [metricGroup, setMetricGroup] = useState<string>("all");
  const [hypFilter, setHypFilter] = useState<"all" | "elevated" | "moderate" | "low">("all");

  const groups = useMemo(() => {
    const g = new Set(report.metrics.map((m) => m.group));
    return ["all", ...Array.from(g)];
  }, [report.metrics]);

  const filteredMetrics = report.metrics.filter(
    (m) => metricGroup === "all" || m.group === metricGroup,
  );

  const filteredHyps = report.hypotheses.filter(
    (h) => hypFilter === "all" || h.severity === hypFilter,
  );

  const overall = report.domains.find((d) => d.key === "overall")!;

  return (
    <div className="flex flex-col gap-4">
      {/* Executive summary */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-subtle)]">
                Structured report
              </p>
              <h2 className="text-xl font-semibold tracking-tight">{report.headline}</h2>
              <p className="max-w-xl text-sm leading-relaxed text-[var(--color-muted)]">
                {report.oneLiner}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Stars value={overall.stars} size="lg" />
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge tone={bandTone(overall.band)}>{overall.bandLabel}</Badge>
                <Badge tone="neutral">
                  {report.taskMode === "dual" ? "Walk + cognitive" : "Walk only"}
                </Badge>
                <Badge tone="primary">
                  {report.viewAngle} · {(report.viewConfidence * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <CardContent className="p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
            Domain ratings
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.domains.map((d) => (
              <DomainChip
                key={d.key}
                domain={d}
                active={openDomain === d.key}
                onClick={() => setOpenDomain(openDomain === d.key ? null : d.key)}
              />
            ))}
          </div>
          {openDomain && (
            <DomainDetail domain={report.domains.find((d) => d.key === openDomain)!} />
          )}
          {report.qualityNotes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-[var(--color-border)] pt-3">
              {report.qualityNotes.map((n) => (
                <li key={n} className="text-xs text-[var(--color-warn)]">
                  · {n}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Zeni Kinematic Gait Cycle Phase Breakdown */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-sm">Gait Cycle Phase Breakdown (Zeni Kinematics)</CardTitle>
            <Badge tone="primary">SA: {(result.metrics.symmetryAngle ?? 0).toFixed(1)}%</Badge>
          </div>
          <CardDescription>
            Stance phase, swing phase, and double support timing derived from foot AP position relative to pelvis (Zeni et al. 2008).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium">
              <span>Left Stance / Swing</span>
              <span>{(result.metrics.leftStancePct ?? 60).toFixed(1)}% / {(result.metrics.leftSwingPct ?? 40).toFixed(1)}%</span>
            </div>
            <Progress value={result.metrics.leftStancePct ?? 60} className="h-2" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium">
              <span>Right Stance / Swing</span>
              <span>{(result.metrics.rightStancePct ?? 60).toFixed(1)}% / {(result.metrics.rightSwingPct ?? 40).toFixed(1)}%</span>
            </div>
            <Progress value={result.metrics.rightStancePct ?? 60} className="h-2" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium">
              <span>Double Support Time</span>
              <span>{(result.metrics.doubleSupportPct ?? 20).toFixed(1)}% stride</span>
            </div>
            <Progress value={result.metrics.doubleSupportPct ?? 20} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Dual-task block */}
      {report.dualTask && (
        <Card className="border-[color-mix(in_oklab,var(--color-accent)_35%,var(--color-border))]">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm">Dual-task cost rating</CardTitle>
              <div className="flex items-center gap-2">
                <Stars value={report.dualTask.stars} />
                <Badge tone={bandTone(report.dualTask.band)}>
                  {bandLabelLocal(report.dualTask.band)}
                </Badge>
              </div>
            </div>
            <CardDescription>{report.dualTask.blurb}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RatingStat
              label="Cadence cost"
              value={`${report.dualTask.cost.cadenceCostPct.toFixed(0)}%`}
            />
            <RatingStat
              label="Variability cost"
              value={`${report.dualTask.cost.stepTimeCvCostPct.toFixed(0)}%`}
            />
            <RatingStat
              label="Stability Δ"
              value={`${report.dualTask.cost.stabilityCostPts.toFixed(0)} pts`}
            />
            <RatingStat
              label="Automaticity Δ"
              value={`${report.dualTask.cost.automaticityCostPts.toFixed(0)} pts`}
            />
          </CardContent>
        </Card>
      )}

      {/* Metric ratings table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Metric ratings</CardTitle>
          <CardDescription>
            Each metric has a favorability band (not a medical grade). Higher favorability ≈ more
            typical / regular for casual walking in this clip.
          </CardDescription>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setMetricGroup(g)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  metricGroup === g
                    ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2 p-5 pt-2">
          {filteredMetrics.map((m) => (
            <MetricRow key={m.id} metric={m} />
          ))}
        </CardContent>
      </Card>

      {/* Hypotheses ranked */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Hypothesis board</CardTitle>
          <CardDescription>
            Educated guesses ranked by severity, then confidence. Confidence stars ≠ diagnosis
            probability of a disease.
          </CardDescription>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {(["all", "elevated", "moderate", "low"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setHypFilter(f)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  hypFilter === f
                    ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                    : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-5 pt-2">
          {filteredHyps.map((h, idx) => (
            <HypothesisRow key={h.id} hyp={h} rank={idx + 1} />
          ))}
        </CardContent>
      </Card>

      <Card className="border-[color-mix(in_oklab,var(--color-warn)_40%,var(--color-border))]">
        <CardContent className="flex gap-2 p-4 text-xs leading-relaxed text-[var(--color-muted)]">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-warn)]" />
          <p>{report.disclaimer}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function bandLabelLocal(band: RatingBand) {
  switch (band) {
    case "strong":
      return "Strong";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "watch":
      return "Watch";
    case "elevated":
      return "Elevated concern";
  }
}

function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  const n = Math.max(1, Math.min(5, value));
  const cls = size === "lg" ? "size-4" : "size-3";
  return (
    <div className="flex items-center gap-0.5" aria-label={`${n} of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            cls,
            i < n ? "fill-[var(--color-warn)] text-[var(--color-warn)]" : "text-[var(--color-border-strong)]",
          )}
        />
      ))}
    </div>
  );
}

function DomainChip({
  domain,
  active,
  onClick,
}: {
  domain: DomainRating;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-surface))]"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)]",
      )}
    >
      <div className="min-w-[3rem] text-center">
        <p className="tabular text-lg font-semibold leading-none">{Math.round(domain.score)}</p>
        <p className="mt-1 text-[9px] uppercase tracking-wide text-[var(--color-subtle)]">/100</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{domain.label}</p>
          {active ? (
            <ChevronDown className="size-3.5 shrink-0 text-[var(--color-subtle)]" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-[var(--color-subtle)]" />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={domain.score} className="h-1.5 flex-1" />
          <Badge tone={bandTone(domain.band)} className="shrink-0">
            {domain.bandLabel}
          </Badge>
        </div>
        <div className="mt-1">
          <Stars value={domain.stars} />
        </div>
      </div>
    </button>
  );
}

function DomainDetail({ domain }: { domain: DomainRating }) {
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <p className="text-sm text-[var(--color-muted)]">{domain.blurb}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {domain.drivers.map((d) => (
          <div
            key={d.label}
            className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5"
          >
            <span className="text-xs text-[var(--color-subtle)]">{d.label}</span>
            <span
              className={cn(
                "tabular text-xs font-medium",
                d.hint === "down" && "text-[var(--color-danger)]",
                d.hint === "up" && "text-[var(--color-success)]",
                (!d.hint || d.hint === "neutral") && "text-[var(--color-fg)]",
              )}
            >
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ metric }: { metric: MetricRating }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{metric.label}</p>
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-subtle)]">
              {metric.group}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-subtle)]">{metric.note}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="tabular text-base font-semibold leading-none">
              {metric.display}
              {metric.unit ? (
                <span className="ml-1 text-[10px] font-normal text-[var(--color-subtle)]">
                  {metric.unit}
                </span>
              ) : null}
            </p>
          </div>
          <Badge tone={bandTone(metric.band)}>{bandLabelLocal(metric.band)}</Badge>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] text-[var(--color-subtle)]">Favorability</span>
        <Progress value={metric.favorability} className="h-1.5 flex-1" />
        <span className="tabular w-8 text-right text-[10px] text-[var(--color-muted)]">
          {Math.round(metric.favorability)}
        </span>
      </div>
    </div>
  );
}

function HypothesisRow({ hyp, rank }: { hyp: HypothesisRating; rank: number }) {
  const tone =
    hyp.severity === "elevated" ? "danger" : hyp.severity === "moderate" ? "warn" : "success";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[10px] font-semibold text-[var(--color-muted)]">
            {rank}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">{hyp.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={tone}>{hyp.severity}</Badge>
              <Badge tone="neutral">{hyp.bandLabel}</Badge>
              <Badge tone="primary">{hyp.category.replace("_", " ")}</Badge>
              {hyp.patternTag && <Badge tone="accent">{hyp.patternTag}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Stars value={hyp.stars} />
          <span className="text-[10px] text-[var(--color-subtle)]">
            {Math.round(hyp.confidence * 100)}% conf.
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted)]">{hyp.summary}</p>
      <div className="mt-2 grid gap-1 border-t border-[var(--color-border)] pt-2 sm:grid-cols-2">
        {hyp.evidence.map((e) => (
          <p key={e} className="tabular text-[11px] text-[var(--color-subtle)]">
            · {e}
          </p>
        ))}
      </div>
      {hyp.alternatives && hyp.alternatives.length > 0 && (
        <p className="mt-2 text-[11px] text-[var(--color-subtle)]">
          <span className="font-medium text-[var(--color-muted)]">Also consider: </span>
          {hyp.alternatives.join(" · ")}
        </p>
      )}
    </div>
  );
}

function RatingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <p className="text-[10px] text-[var(--color-subtle)]">{label}</p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  );
}
