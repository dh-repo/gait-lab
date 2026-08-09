import React, { useState } from "react";
import { ChevronDown, ChevronUp, Activity, Layers, Zap, Brain } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { JointAnglesChart } from "./JointAnglesChart";
import type { GaitMetrics, DualTaskCost } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";
import { cn } from "@/lib/utils";

export interface CognitiveClustersProps {
  metrics: GaitMetrics;
  dualTaskCost?: DualTaskCost;
  angleAnalysis?: GaitAngleAnalysis;
  className?: string;
}

/** Internal band keys (thresholds unchanged). Display labels are clinical plain language. */
export type ClinicalStatus = "Normal" | "Borderline" | "Pathological";

const STATUS_LABEL: Record<ClinicalStatus, string> = {
  Normal: "Within expected range",
  Borderline: "Borderline",
  Pathological: "Outside typical range",
};

/** Shown wherever dual-task values are unavailable because no paired recording exists. */
const NOT_ASSESSED_CAPTION =
  "Requires a paired single-task and dual-task recording";

export function CognitiveClusters({
  metrics,
  dualTaskCost,
  angleAnalysis,
  className,
}: CognitiveClustersProps) {
  // All clusters open by default so key metrics remain scannable without extra clicks
  const [openClusters, setOpenClusters] = useState<Record<string, boolean>>({
    spatiotemporal: true,
    symmetry: true,
    stability: true,
    dualtask: true,
  });

  const toggleCluster = (key: string) => {
    setOpenClusters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleHeaderKeyDown = (key: string, e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCluster(key);
    }
  };

  const derivedAngleAnalysis =
    angleAnalysis ||
    computeGaitAngleAnalysis(
      [],
      metrics.stepEvents || [],
      metrics.viewAngle || "unknown",
    );

  // Derived metrics calculations
  const cadence = metrics.cadenceSpm || 0;
  // No `|| 0.5` fallback: analysis.ts sets avgStepTimeSec to 0 when no step
  // intervals were recovered, and a 0.5 substitution rendered a hard "1.00 s"
  // stride time that no measurement produced. Null means unmeasured, and the
  // tile says so — the same N/A convention MetricsPanel already uses.
  const strideTimeSec =
    metrics.avgStepTimeSec > 0 ? metrics.avgStepTimeSec * 2 : null;
  const stepTimeCvPct = (metrics.stepTimeCV * 100).toFixed(1);
  const symmetryAngleText =
    metrics.symmetryAngle != null ? `${metrics.symmetryAngle.toFixed(1)}%` : "N/A";

  // 1. Spatiotemporal status
  const paceStatus: ClinicalStatus =
    metrics.stepTimeCV < 0.04 && cadence >= 95 && cadence <= 130
      ? "Normal"
      : metrics.stepTimeCV <= 0.08
        ? "Borderline"
        : "Pathological";

  // 2. Symmetry status
  const saVal = metrics.symmetryAngle ?? (metrics.stepTimeAsymmetry * 100);
  const symmetryStatus: ClinicalStatus =
    saVal < 3.0 ? "Normal" : saVal <= 6.0 ? "Borderline" : "Pathological";

  // 3. Trunk stability status
  const stabilityStatus: ClinicalStatus =
    metrics.stabilityScore >= 75 && metrics.pathSmoothness >= 0.85
      ? "Normal"
      : metrics.stabilityScore >= 55
        ? "Borderline"
        : "Pathological";

  // 4. Dual-task cost status
  // `cadenceCostPct` is the negated DTE in analysis.ts, so flip its sign when used as fallback.
  const dteCadence = dualTaskCost
    ? (dualTaskCost.cadenceDTE ?? -dualTaskCost.cadenceCostPct)
    : null;
  const dteStepTimeCv = dualTaskCost
    ? (dualTaskCost.stepTimeCvDTE ?? -dualTaskCost.stepTimeCvCostPct)
    : null;
  const dualTaskStatus: ClinicalStatus | null =
    dteCadence == null
      ? null
      : Math.abs(dteCadence) < 5.0
        ? "Normal"
        : Math.abs(dteCadence) <= 12.0
          ? "Borderline"
          : "Pathological";

  const statusTone = (status: ClinicalStatus): "success" | "warn" | "info" => {
    switch (status) {
      case "Normal":
        return "success";
      case "Borderline":
        return "warn";
      case "Pathological":
        // Outside-range is attention, not a system error — avoid danger red
        return "info";
    }
  };

  return (
    <section
      role="region"
      aria-label="Gait metric findings by cluster"
      data-testid="cognitive-clusters"
      className={cn("flex flex-col gap-4 w-full", className)}
    >
      {/* CLUSTER 1: Spatiotemporal Pace */}
      <Card
        data-testid="cluster-spatiotemporal"
        className="border-[var(--color-border)] overflow-hidden transition-colors"
      >
        <CardHeader
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.spatiotemporal}
          aria-controls="cluster-content-spatiotemporal"
          id="cluster-header-spatiotemporal"
          aria-label="1. Spatiotemporal Pace cluster accordion toggle"
          onClick={() => toggleCluster("spatiotemporal")}
          onKeyDown={(e) => handleHeaderKeyDown("spatiotemporal", e)}
          data-testid="cluster-header-0"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Activity className="size-5 text-[var(--color-primary)]" />
              <div>
                <CardTitle className="text-base font-semibold">1. Spatiotemporal Pace</CardTitle>
                <p className="text-xs text-[var(--color-muted)]">
                  Cadence, stride time, & step interval variability
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(paceStatus)} data-testid="status-badge-pace">
                  {STATUS_LABEL[paceStatus]}
                </Badge>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular">
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    {cadence.toFixed(0)} spm
                  </span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    CV: {stepTimeCvPct}%
                  </span>
                </div>
              </div>
              {openClusters.spatiotemporal ? (
                <ChevronUp className="size-4 text-[var(--color-subtle)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-subtle)]" />
              )}
            </div>
          </div>
        </CardHeader>

        {openClusters.spatiotemporal && (
          <CardContent
            id="cluster-content-spatiotemporal"
            role="region"
            aria-labelledby="cluster-header-spatiotemporal"
            className="p-4 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Cadence</p>
                <p className="tabular text-lg font-bold mt-0.5">{cadence.toFixed(0)} <span className="text-xs font-normal text-[var(--color-muted)]">spm</span></p>
                {metrics.confidenceIntervals?.["cadence"] && (
                  <p className="tabular text-[10px] text-[var(--color-subtle)] mt-1">
                    95% CI: [{metrics.confidenceIntervals["cadence"].ci95Lower?.toFixed(0)} – {metrics.confidenceIntervals["cadence"].ci95Upper?.toFixed(0)}]
                  </p>
                )}
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Stride Time</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {strideTimeSec != null ? (
                    <>
                      {strideTimeSec.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-[var(--color-muted)]">s</span>
                    </>
                  ) : (
                    "N/A"
                  )}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {strideTimeSec != null ? "Mean step interval x 2" : "No step intervals detected"}
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Step Time</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {metrics.avgStepTimeSec > 0 ? (
                    <>
                      {metrics.avgStepTimeSec.toFixed(2)}{" "}
                      <span className="text-xs font-normal text-[var(--color-muted)]">s</span>
                    </>
                  ) : (
                    "N/A"
                  )}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {metrics.avgStepTimeSec > 0 ? "Mean step interval" : "No step intervals detected"}
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Step Time CV</p>
                <p className="tabular text-lg font-bold mt-0.5">{stepTimeCvPct}%</p>
                {metrics.confidenceIntervals?.["stepTimeCV"] ? (
                  <p className="tabular text-[10px] text-[var(--color-subtle)] mt-1">
                    95% CI: [{(metrics.confidenceIntervals["stepTimeCV"].ci95Lower! * 100).toFixed(1)}% – {(metrics.confidenceIntervals["stepTimeCV"].ci95Upper! * 100).toFixed(1)}%]
                  </p>
                ) : (
                  <p className="text-[10px] text-[var(--color-subtle)] mt-1">Lower = More Regular</p>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* CLUSTER 2: Inter-limb Symmetry & ROM */}
      <Card
        data-testid="cluster-symmetry"
        className="border-[var(--color-border)] overflow-hidden transition-colors"
      >
        <CardHeader
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.symmetry}
          aria-controls="cluster-content-symmetry"
          id="cluster-header-symmetry"
          aria-label="2. Inter-limb Symmetry & ROM cluster accordion toggle"
          onClick={() => toggleCluster("symmetry")}
          onKeyDown={(e) => handleHeaderKeyDown("symmetry", e)}
          data-testid="cluster-header-1"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="size-5 text-[var(--color-accent)]" />
              <div>
                <CardTitle className="text-base font-semibold">2. Inter-limb Symmetry & ROM</CardTitle>
                <p className="text-xs text-[var(--color-muted)]">
                  Zifchock SA %, step-time asymmetry, stance/swing ratio, & joint kinematics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(symmetryStatus)} data-testid="status-badge-symmetry">
                  {STATUS_LABEL[symmetryStatus]}
                </Badge>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular">
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    SA: {symmetryAngleText}
                  </span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    Asym: {(metrics.stepTimeAsymmetry * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              {openClusters.symmetry ? (
                <ChevronUp className="size-4 text-[var(--color-subtle)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-subtle)]" />
              )}
            </div>
          </div>
        </CardHeader>

        {openClusters.symmetry && (
          <CardContent
            id="cluster-content-symmetry"
            role="region"
            aria-labelledby="cluster-header-symmetry"
            className="p-4 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Symmetry Angle (SA)</p>
                <p className="tabular text-lg font-bold mt-0.5">{symmetryAngleText}</p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Zifchock et al. (0% = perfect)</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Step-Time Asymmetry</p>
                <p className="tabular text-lg font-bold mt-0.5">{(metrics.stepTimeAsymmetry * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">L/R timing difference ratio</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Stance / Swing Ratio</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {metrics.leftStancePct != null && metrics.leftSwingPct != null
                    ? (metrics.leftStancePct / metrics.leftSwingPct).toFixed(2)
                    : "N/A (Requires Side View)"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Normal ~1.50 (60% / 40%)</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Double Support</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {metrics.doubleSupportPct != null ? `${metrics.doubleSupportPct.toFixed(1)}%` : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Percent of stride phase</p>
              </div>
            </div>

            {/* Zeni Kinematic Gait Phase Progress Bars */}
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg)]">
                Zeni Kinematic Gait Phase Breakdown
              </h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Left Stance Phase</span>
                    <span className="tabular">{metrics.leftStancePct != null ? `${metrics.leftStancePct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.leftStancePct != null ? (
                    <Progress
                      value={metrics.leftStancePct}
                      className="h-2"
                      role="progressbar"
                      aria-valuenow={metrics.leftStancePct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Left stance phase percentage"
                    />
                  ) : (
                    <div className="h-2 rounded bg-[var(--color-border)]" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Right Stance Phase</span>
                    <span className="tabular">{metrics.rightStancePct != null ? `${metrics.rightStancePct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.rightStancePct != null ? (
                    <Progress
                      value={metrics.rightStancePct}
                      className="h-2"
                      role="progressbar"
                      aria-valuenow={metrics.rightStancePct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Right stance phase percentage"
                    />
                  ) : (
                    <div className="h-2 rounded bg-[var(--color-border)]" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Double Support Time</span>
                    <span className="tabular">{metrics.doubleSupportPct != null ? `${metrics.doubleSupportPct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.doubleSupportPct != null ? (
                    <Progress
                      value={metrics.doubleSupportPct}
                      className="h-2"
                      role="progressbar"
                      aria-valuenow={metrics.doubleSupportPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Double support time percentage"
                    />
                  ) : (
                    <div className="h-2 rounded bg-[var(--color-border)]" />
                  )}
                </div>
              </div>
            </div>

            {/* Expandable Joint Angles Chart ROM Waveforms */}
            <JointAnglesChart angleAnalysis={derivedAngleAnalysis} />
          </CardContent>
        )}
      </Card>

      {/* CLUSTER 3: Trunk Stability & Smoothness */}
      <Card
        data-testid="cluster-stability"
        className="border-[var(--color-border)] overflow-hidden transition-colors"
      >
        <CardHeader
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.stability}
          aria-controls="cluster-content-stability"
          id="cluster-header-stability"
          aria-label="3. Trunk Stability & Smoothness cluster accordion toggle"
          onClick={() => toggleCluster("stability")}
          onKeyDown={(e) => handleHeaderKeyDown("stability", e)}
          data-testid="cluster-header-2"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Zap className="size-5 text-[var(--color-warn)]" />
              <div>
                <CardTitle className="text-base font-semibold">3. Trunk Stability & Smoothness</CardTitle>
                <p className="text-xs text-[var(--color-muted)]">
                  Lateral sway, vertical CoM bounce, pelvic obliquity, & trajectory smoothness
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(stabilityStatus)} data-testid="status-badge-stability">
                  {STATUS_LABEL[stabilityStatus]}
                </Badge>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular">
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    Smooth: {(metrics.pathSmoothness * 100).toFixed(0)}%
                  </span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    Auto: {metrics.automaticityScore.toFixed(0)}/100
                  </span>
                </div>
              </div>
              {openClusters.stability ? (
                <ChevronUp className="size-4 text-[var(--color-subtle)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-subtle)]" />
              )}
            </div>
          </div>
        </CardHeader>

        {openClusters.stability && (
          <CardContent
            id="cluster-content-stability"
            role="region"
            aria-labelledby="cluster-header-stability"
            className="p-4 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Lateral Sway</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {metrics.lateralSway != null ? metrics.lateralSway.toFixed(3) : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Normalized CoM side displacement</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Vertical Bounce</p>
                <p className="tabular text-lg font-bold mt-0.5">{metrics.verticalBounce.toFixed(3)}</p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Up-down CoM oscillation index</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Pelvic Obliquity</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {metrics.pelvicObliquity != null ? metrics.pelvicObliquity.toFixed(3) : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Mean hip tilt index</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Path Smoothness</p>
                <p className="tabular text-lg font-bold mt-0.5">{(metrics.pathSmoothness * 100).toFixed(0)}%</p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Linear progression score</p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Automaticity</p>
                <p className="tabular text-lg font-bold mt-0.5">{metrics.automaticityScore.toFixed(0)} / 100</p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">Composite motor index</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* CLUSTER 4: Dual-Task Cognitive Cost */}
      <Card
        data-testid="cluster-dualtask"
        className="border-[var(--color-border)] overflow-hidden transition-colors"
      >
        <CardHeader
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.dualtask}
          aria-controls="cluster-content-dualtask"
          id="cluster-header-dualtask"
          aria-label="4. Dual-Task Cognitive Cost cluster accordion toggle"
          onClick={() => toggleCluster("dualtask")}
          onKeyDown={(e) => handleHeaderKeyDown("dualtask", e)}
          data-testid="cluster-header-3"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 hover:bg-[var(--color-surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Brain className="size-5 text-[var(--color-info)]" />
              <div>
                <CardTitle className="text-base font-semibold">4. Dual-Task Cognitive Cost</CardTitle>
                <p className="text-xs text-[var(--color-muted)]">
                  Cadence & variability Dual-Task Effect (DTE), stability delta, & CMI classification
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge
                  tone={dualTaskStatus ? statusTone(dualTaskStatus) : "info"}
                  data-testid="status-badge-dualtask"
                >
                  {dualTaskStatus ? STATUS_LABEL[dualTaskStatus] : "Not assessed"}
                </Badge>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tabular">
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)]">
                    DTE: {dteCadence != null ? `${dteCadence.toFixed(1)}%` : "N/A"}
                  </span>
                  <span className="rounded bg-[var(--color-surface)] px-2 py-1 border border-[var(--color-border)] capitalize">
                    {dualTaskCost?.cmiClassification
                      ? dualTaskCost.cmiClassification.replace(/_/g, " ")
                      : "Single-Task Baseline"}
                  </span>
                </div>
              </div>
              {openClusters.dualtask ? (
                <ChevronUp className="size-4 text-[var(--color-subtle)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-subtle)]" />
              )}
            </div>
          </div>
        </CardHeader>

        {openClusters.dualtask && (
          <CardContent
            id="cluster-content-dualtask"
            role="region"
            aria-labelledby="cluster-header-dualtask"
            className="p-4 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Cadence DTE</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {dteCadence != null ? `${dteCadence.toFixed(1)}%` : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {dteCadence != null
                    ? "Plummer & Eskes (2015) DTE formula"
                    : NOT_ASSESSED_CAPTION}
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Step Time CV DTE</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {dteStepTimeCv != null ? `${dteStepTimeCv.toFixed(1)}%` : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {dteStepTimeCv != null
                    ? "Secondary task variability impact"
                    : NOT_ASSESSED_CAPTION}
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">Stability DTE</p>
                <p className="tabular text-lg font-bold mt-0.5">
                  {/* DTE-signed (negative = worse), matching the sibling DTE tiles. */}
                  {dualTaskCost ? `${(-(dualTaskCost.stabilityCostPts ?? 0)).toFixed(1)} pts` : "N/A"}
                </p>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {dualTaskCost ? "Trunk stability point shift" : NOT_ASSESSED_CAPTION}
                </p>
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 flex flex-col justify-between">
                <div>
                  <p className="text-[11px] text-[var(--color-subtle)] font-medium uppercase tracking-wide">CMI Classification</p>
                  <div className="mt-1">
                    <Badge tone="accent" className="capitalize text-xs">
                      {dualTaskCost?.cmiClassification
                        ? dualTaskCost.cmiClassification.replace(/_/g, " ")
                        : "Single-Task Walk Baseline"}
                    </Badge>
                  </div>
                </div>
                <p className="text-[10px] text-[var(--color-subtle)] mt-1">
                  {dualTaskCost
                    ? "Kelly et al. (2010) cognitive interference"
                    : NOT_ASSESSED_CAPTION}
                </p>
              </div>
            </div>

            {dualTaskCost?.summary && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-muted)]">
                <p className="font-semibold text-[var(--color-fg)] mb-0.5">Dual-Task Interference Summary:</p>
                <p>{dualTaskCost.summary}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </section>
  );
}
