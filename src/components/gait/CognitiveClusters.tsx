import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Activity, Layers, Zap, Brain, AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { JointAnglesChart } from "./JointAnglesChart";
import type { GaitMetrics, DualTaskCost, TaskMode } from "@/lib/gait/types";
import { resolveDteValues } from "@/lib/gait/guesses";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";
import { classifyGaitAnomalies, type AnomalyFinding } from "@/lib/gait/anomalies";
import { generateHomeExerciseProgram } from "@/lib/gait/rehab/generator";
import { HepEditorModal } from "./rehab/HepEditorModal";
import { cn } from "@/lib/utils";

export interface CognitiveClustersProps {
  metrics: GaitMetrics;
  dualTaskCost?: DualTaskCost;
  /**
   * How the clip was recorded. Without it, an absent dualTaskCost is ambiguous:
   * it could be a single-task baseline, OR a dual-task run with no baseline to
   * pair against. The chip previously asserted the former in both cases.
   */
  taskMode?: TaskMode;
  angleAnalysis?: GaitAngleAnalysis;
  currentGaitCyclePct?: number;
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

function MaterialStatusBadge({
  status,
  label,
  testId,
}: {
  status: ClinicalStatus | null;
  label: string;
  testId: string;
}) {
  const tone =
    status === "Normal" ? "success" : status === "Borderline" ? "warn" : status === "Pathological" ? "danger" : "neutral";

  return (
    <Badge tone={tone} data-testid={testId} className="rounded-full h-6 text-[12px] px-3">
      {label}
    </Badge>
  );
}

export function CognitiveClusters({
  metrics,
  dualTaskCost,
  taskMode,
  angleAnalysis,
  currentGaitCyclePct,
  className,
}: CognitiveClustersProps) {
  // All sections open for a scannable clinical table view (tests also assert dual-task copy in-DOM)
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
  const saVal = metrics.symmetryAngle ?? null;
  const symmetryStatus: ClinicalStatus | null =
    saVal == null ? null : saVal < 3.0 ? "Normal" : saVal <= 6.0 ? "Borderline" : "Pathological";

  // 3. Trunk stability status
  const stabilityStatus: ClinicalStatus =
    metrics.stabilityScore >= 75 && metrics.pathSmoothness >= 0.85
      ? "Normal"
      : metrics.stabilityScore >= 55
        ? "Borderline"
        : "Pathological";

  // 4. Dual-task cost status
  const dte = dualTaskCost ? resolveDteValues(dualTaskCost) : null;
  const dteCadence = dte ? dte.cadenceDte : null;
  const dteStepTimeCv = dte ? dte.stepTimeCvDte : null;
  const dualTaskStatus: ClinicalStatus | null =
    dteCadence == null
      ? null
      : Math.abs(dteCadence) < 5.0
        ? "Normal"
        : Math.abs(dteCadence) <= 12.0
          ? "Borderline"
          : "Pathological";

  const anomalies = classifyGaitAnomalies(metrics, derivedAngleAnalysis);
  const [isHepModalOpen, setIsHepModalOpen] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyFinding | null>(null);

  const hepProgram = useMemo(() => {
    const targetAnomalies = selectedAnomaly ? [selectedAnomaly] : anomalies;
    return generateHomeExerciseProgram(metrics, targetAnomalies, derivedAngleAnalysis);
  }, [metrics, selectedAnomaly, anomalies, derivedAngleAnalysis]);

  return (
    <section
      role="region"
      aria-label="Gait metric findings by cluster"
      data-testid="cognitive-clusters"
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {/* Evidence-Backed Clinical Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="border-b border-[var(--color-border)] bg-amber-950/20 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
              <AlertTriangle className="size-4" />
              <span>Automated Clinical Anomaly Screening ({anomalies.length} Flagged)</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedAnomaly(null);
                setIsHepModalOpen(true);
              }}
              className="h-7 text-xs border-amber-600/60 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 gap-1"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Generate Exercise Prescription</span>
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {anomalies.map((a) => (
              <div key={a.id} className="p-3 rounded-lg border border-amber-500/30 bg-slate-950/60 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-200">{a.name}</span>
                  <Badge tone={a.severity === "severe" ? "danger" : "warn"} className="text-[10px] h-4 px-1.5 uppercase">
                    {a.severity}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-300">{a.clinicalSignificance}</p>
                <p className="text-[10px] text-slate-400 font-mono">Citation: {a.literatureCitation}</p>
                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20">
                  <p className="text-[10px] text-slate-500 italic">Target: {a.therapeuticTarget}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedAnomaly(a);
                      setIsHepModalOpen(true);
                    }}
                    className="h-5 px-1.5 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-950/40"
                  >
                    Prescribe Exercise →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Embedded HEP Editor Modal */}
      <HepEditorModal
        initialProgram={hepProgram}
        metrics={metrics}
        anomalies={selectedAnomaly ? [selectedAnomaly] : anomalies}
        angleAnalysis={derivedAngleAnalysis}
        isOpen={isHepModalOpen}
        onClose={() => {
          setIsHepModalOpen(false);
          setSelectedAnomaly(null);
        }}
      />

      {/* CLUSTER 1: Spatiotemporal Pace */}
      <div
        data-testid="cluster-spatiotemporal"
        className="border-b border-[var(--color-border)]"
      >
        <div
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.spatiotemporal}
          aria-controls="cluster-content-spatiotemporal"
          id="cluster-header-spatiotemporal"
          aria-label="1. Spatiotemporal Pace cluster accordion toggle"
          onClick={() => toggleCluster("spatiotemporal")}
          onKeyDown={(e) => handleHeaderKeyDown("spatiotemporal", e)}
          data-testid="cluster-header-0"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 hover:bg-[var(--color-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Activity className="size-5 text-[var(--color-primary)]" />
              <div>
                <h3 className="text-base font-medium text-[var(--color-fg)]">1. Spatiotemporal Pace</h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Cadence, stride time, & step interval variability
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MaterialStatusBadge
                  status={paceStatus}
                  label={STATUS_LABEL[paceStatus]}
                  testId="status-badge-pace"
                />
                <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    {cadence.toFixed(0)} spm
                  </span>
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    CV: {stepTimeCvPct}%
                  </span>
                </div>
              </div>
              {openClusters.spatiotemporal ? (
                <ChevronUp className="size-4 text-[var(--color-muted)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-muted)]" />
              )}
            </div>
          </div>
        </div>

        {openClusters.spatiotemporal && (
          <div
            id="cluster-content-spatiotemporal"
            role="region"
            aria-labelledby="cluster-header-spatiotemporal"
            className="p-4 space-y-4"
          >
            <div className="clinical-table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="clinical-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] font-medium border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Parameter</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Value</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Interpretation / Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Cadence</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {cadence.toFixed(0)} <span className="font-normal text-xs text-[var(--color-muted)]">spm</span>
                    </td>
                    <td className="px-3 py-1 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
                      {metrics.confidenceIntervals?.["cadence"]
                        ? `95% CI: [${metrics.confidenceIntervals["cadence"].ci95Lower?.toFixed(0)} – ${metrics.confidenceIntervals["cadence"].ci95Upper?.toFixed(0)}]`
                        : "Steps per minute"}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Stride Time</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {strideTimeSec != null ? `${strideTimeSec.toFixed(2)} s` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {strideTimeSec != null ? "Mean step interval x 2" : "No step intervals detected"}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Step Time</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {metrics.avgStepTimeSec > 0 ? `${metrics.avgStepTimeSec.toFixed(2)} s` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {metrics.avgStepTimeSec > 0 ? "Mean step interval" : "No step intervals detected"}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Step Time CV</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {stepTimeCvPct}%
                    </td>
                    <td className="px-3 py-1 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
                      {metrics.confidenceIntervals?.["stepTimeCV"]
                        ? `95% CI: [${(metrics.confidenceIntervals["stepTimeCV"].ci95Lower! * 100).toFixed(1)}% – ${(metrics.confidenceIntervals["stepTimeCV"].ci95Upper! * 100).toFixed(1)}%]`
                        : "Lower = More Regular"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CLUSTER 2: Inter-limb Symmetry & ROM */}
      <div
        data-testid="cluster-symmetry"
        className="border-b border-[var(--color-border)] last:border-b-0"
      >
        <div
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.symmetry}
          aria-controls="cluster-content-symmetry"
          id="cluster-header-symmetry"
          aria-label="2. Inter-limb Symmetry & ROM cluster accordion toggle"
          onClick={() => toggleCluster("symmetry")}
          onKeyDown={(e) => handleHeaderKeyDown("symmetry", e)}
          data-testid="cluster-header-1"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 hover:bg-[var(--color-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Layers className="size-5 text-[var(--color-success)]" />
              <div>
                <h3 className="text-base font-medium text-[var(--color-fg)]">2. Inter-limb Symmetry & ROM</h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Zifchock SA %, step-time asymmetry, stance/swing ratio, & joint kinematics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MaterialStatusBadge
                  status={symmetryStatus}
                  label={symmetryStatus ? STATUS_LABEL[symmetryStatus] : "Not assessed"}
                  testId="status-badge-symmetry"
                />
                <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    SA: {symmetryAngleText}
                  </span>
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    Asym: {(metrics.stepTimeAsymmetry * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              {openClusters.symmetry ? (
                <ChevronUp className="size-4 text-[var(--color-muted)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-muted)]" />
              )}
            </div>
          </div>
        </div>

        {openClusters.symmetry && (
          <div
            id="cluster-content-symmetry"
            role="region"
            aria-labelledby="cluster-header-symmetry"
            className="p-4 space-y-4"
          >
            <div className="clinical-table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="clinical-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] font-medium border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Parameter</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Value</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Reference / Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Symmetry Angle (SA)</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">{symmetryAngleText}</td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Zifchock et al. (0% = perfect)</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Step-Time Asymmetry</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">{(metrics.stepTimeAsymmetry * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">L/R timing difference ratio</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Stance / Swing Ratio</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {metrics.leftStancePct != null && metrics.leftSwingPct != null
                        ? (metrics.leftStancePct / metrics.leftSwingPct).toFixed(2)
                        : "N/A (Requires Side View)"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Normal ~1.50 (60% / 40%)</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Double Support</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {metrics.doubleSupportPct != null ? `${metrics.doubleSupportPct.toFixed(1)}%` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Percent of stride phase</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Zeni Kinematic Gait Phase Progress Bars */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg)]">
                Zeni Kinematic Gait Phase Breakdown
              </h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
                    <span>Left Stance Phase</span>
                    <span className="tabular-nums font-mono">{metrics.leftStancePct != null ? `${metrics.leftStancePct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.leftStancePct != null ? (
                    <Progress
                      value={metrics.leftStancePct}
                      className="h-1.5 bg-[var(--color-border)] [&>div]:bg-[var(--color-fg)]"
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
                  <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
                    <span>Right Stance Phase</span>
                    <span className="tabular-nums font-mono">{metrics.rightStancePct != null ? `${metrics.rightStancePct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.rightStancePct != null ? (
                    <Progress
                      value={metrics.rightStancePct}
                      className="h-1.5 bg-[var(--color-border)] [&>div]:bg-[var(--color-fg)]"
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
                  <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
                    <span>Double Support Time</span>
                    <span className="tabular-nums font-mono">{metrics.doubleSupportPct != null ? `${metrics.doubleSupportPct.toFixed(1)}%` : "N/A"}</span>
                  </div>
                  {metrics.doubleSupportPct != null ? (
                    <Progress
                      value={metrics.doubleSupportPct}
                      className="h-1.5 bg-[var(--color-border)] [&>div]:bg-[var(--color-fg)]"
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
            <JointAnglesChart angleAnalysis={derivedAngleAnalysis} currentGaitCyclePct={currentGaitCyclePct} />
          </div>
        )}
      </div>

      {/* CLUSTER 3: Trunk Stability & Smoothness */}
      <div
        data-testid="cluster-stability"
        className="border-b border-[var(--color-border)] last:border-b-0"
      >
        <div
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.stability}
          aria-controls="cluster-content-stability"
          id="cluster-header-stability"
          aria-label="3. Trunk Stability & Smoothness cluster accordion toggle"
          onClick={() => toggleCluster("stability")}
          onKeyDown={(e) => handleHeaderKeyDown("stability", e)}
          data-testid="cluster-header-2"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 hover:bg-[var(--color-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Zap className="size-5 text-[var(--color-warn-text,#b06000)]" />
              <div>
                <h3 className="text-base font-medium text-[var(--color-fg)]">3. Trunk Stability & Smoothness</h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Lateral sway, vertical CoM bounce, pelvic obliquity, & trajectory smoothness
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MaterialStatusBadge
                  status={stabilityStatus}
                  label={STATUS_LABEL[stabilityStatus]}
                  testId="status-badge-stability"
                />
                <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    Smooth: {(metrics.pathSmoothness * 100).toFixed(0)}%
                  </span>
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    Auto: {metrics.automaticityScore.toFixed(0)}/100
                  </span>
                </div>
              </div>
              {openClusters.stability ? (
                <ChevronUp className="size-4 text-[var(--color-muted)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-muted)]" />
              )}
            </div>
          </div>
        </div>

        {openClusters.stability && (
          <div
            id="cluster-content-stability"
            role="region"
            aria-labelledby="cluster-header-stability"
            className="p-4 space-y-4"
          >
            <div className="clinical-table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="clinical-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] font-medium border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Parameter</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Value</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Lateral Sway</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {metrics.lateralSway != null ? metrics.lateralSway.toFixed(3) : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Normalized CoM side displacement</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Vertical Bounce</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">{metrics.verticalBounce.toFixed(3)}</td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Up-down CoM oscillation index</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Pelvic Obliquity</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {metrics.pelvicObliquity != null ? metrics.pelvicObliquity.toFixed(3) : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Mean hip tilt index</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Path Smoothness</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">{(metrics.pathSmoothness * 100).toFixed(0)}%</td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Linear progression score</td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Automaticity</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">{metrics.automaticityScore.toFixed(0)} / 100</td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">Composite motor index</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CLUSTER 4: Dual-Task Cognitive Cost */}
      <div
        data-testid="cluster-dualtask"
        className="border-b border-[var(--color-border)] last:border-b-0"
      >
        <div
          tabIndex={0}
          role="button"
          aria-expanded={openClusters.dualtask}
          aria-controls="cluster-content-dualtask"
          id="cluster-header-dualtask"
          aria-label="4. Dual-Task Cognitive Cost cluster accordion toggle"
          onClick={() => toggleCluster("dualtask")}
          onKeyDown={(e) => handleHeaderKeyDown("dualtask", e)}
          data-testid="cluster-header-3"
          className="cursor-pointer select-none border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 hover:bg-[var(--color-surface-2)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Brain className="size-5 text-[var(--color-info)]" />
              <div>
                <h3 className="text-base font-medium text-[var(--color-fg)]">4. Dual-Task Cognitive Cost</h3>
                <p className="text-xs text-[var(--color-muted)]">
                  Cadence & variability Dual-Task Effect (DTE), stability delta, & CMI classification
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <MaterialStatusBadge
                  status={dualTaskStatus}
                  label={dualTaskStatus ? STATUS_LABEL[dualTaskStatus] : "Not assessed"}
                  testId="status-badge-dualtask"
                />
                <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)]">
                    DTE: {dteCadence != null ? `${dteCadence.toFixed(1)}%` : "N/A"}
                  </span>
                  <span className="rounded-md bg-[var(--color-surface)] px-2.5 py-1 border border-[var(--color-border)] text-[var(--color-fg)] capitalize">
                    {dualTaskCost?.cmiClassification
                      ? dualTaskCost.cmiClassification.replace(/_/g, " ")
                      : taskMode === "dual"
                        ? "No baseline recorded"
                        : taskMode === "single"
                          ? "Single-Task Baseline"
                          : "Task mode not recorded"}
                  </span>
                </div>
              </div>
              {openClusters.dualtask ? (
                <ChevronUp className="size-4 text-[var(--color-muted)]" />
              ) : (
                <ChevronDown className="size-4 text-[var(--color-muted)]" />
              )}
            </div>
          </div>
        </div>

        {openClusters.dualtask && (
          <div
            id="cluster-content-dualtask"
            role="region"
            aria-labelledby="cluster-header-dualtask"
            className="p-4 space-y-4"
          >
            <div className="clinical-table-scroll rounded-lg border border-[var(--color-border)]">
              <table className="clinical-table w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-2)] text-[var(--color-muted)] font-medium border-b border-[var(--color-border)]">
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Parameter</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Value</th>
                    <th className="px-3 py-2 border-b border-[var(--color-border)] font-medium text-[var(--color-muted)]">Basis / Citation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Cadence DTE</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {dteCadence != null ? `${dteCadence.toFixed(1)}%` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {dteCadence != null ? "Plummer & Eskes (2015) DTE formula" : NOT_ASSESSED_CAPTION}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Step Time CV DTE</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {dteStepTimeCv != null ? `${dteStepTimeCv.toFixed(1)}%` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {dteStepTimeCv != null ? "Secondary task variability impact" : NOT_ASSESSED_CAPTION}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">Stability DTE</td>
                    <td className="px-3 py-1 font-mono font-semibold tabular-nums text-[var(--color-fg)]">
                      {dte ? `${dte.stabilityDte.toFixed(1)} pts` : "N/A"}
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {dualTaskCost ? "Trunk stability point shift" : NOT_ASSESSED_CAPTION}
                    </td>
                  </tr>
                  <tr className="h-[32px] border-b border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">CMI Classification</td>
                    <td className="px-3 py-1 font-medium text-[var(--color-fg)]">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--color-info-bg)] text-[var(--color-info)] border border-[color-mix(in_srgb,var(--color-info)_25%,transparent)] capitalize">
                        {dualTaskCost?.cmiClassification
                          ? dualTaskCost.cmiClassification.replace(/_/g, " ")
                          : "Single-Task Walk Baseline"}
                      </span>
                    </td>
                    <td className="px-3 py-1 text-[11px] text-[var(--color-muted)]">
                      {dualTaskCost ? "Kelly et al. (2010) cognitive interference" : NOT_ASSESSED_CAPTION}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {dualTaskCost?.summary && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-muted)]">
                <p className="font-medium text-[var(--color-fg)] mb-0.5">Dual-Task Interference Summary:</p>
                <p>{dualTaskCost.summary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
