import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FallRiskGaugeDial } from "./FallRiskGaugeDial";
import { AcuteWeaknessCard } from "./AcuteWeaknessCard";
import { BaselineSparkline } from "./BaselineSparkline";
import {
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
  type PatientBaseline,
} from "@/lib/gait/fallrisk";
import type { AnalysisResult } from "@/lib/gait/types";
import type { GaitSessionRecord } from "@/lib/gait/persistence";
import { cn } from "@/lib/utils";
import { ShieldAlert, CheckCircle, Scale, AlertTriangle, Layers } from "lucide-react";

export interface FallRiskPanelProps {
  result: AnalysisResult;
  baseline?: PatientBaseline | null;
  historicalSessions?: GaitSessionRecord[];
  activeModelToggle?: "modelA" | "modelB" | "comparison";
  onToggleChange?: (toggle: "modelA" | "modelB" | "comparison") => void;
  className?: string;
}

export function FallRiskPanel({
  result,
  baseline,
  historicalSessions = [],
  activeModelToggle: externalToggle,
  onToggleChange,
  className,
}: FallRiskPanelProps) {
  const [internalToggle, setInternalToggle] = useState<"modelA" | "modelB" | "comparison">(
    "comparison"
  );

  const activeToggle = externalToggle !== undefined ? externalToggle : internalToggle;

  const handleToggle = (mode: "modelA" | "modelB" | "comparison") => {
    setInternalToggle(mode);
    onToggleChange?.(mode);
  };

  // Compute Dual Fall Risk Analysis
  const modelA = useMemo(() => computeFallRiskModelA(result.metrics), [result.metrics]);

  const modelB = useMemo(
    () =>
      computeFallRiskModelB(
        result.metrics,
        result.dualTaskCost,
        result.angleAnalysis,
        result.metrics.viewAngle
      ),
    [result.metrics, result.dualTaskCost, result.angleAnalysis]
  );

  const agreement = useMemo(
    () => evaluatePredictiveAgreement(modelA, modelB, historicalSessions),
    [modelA, modelB, historicalSessions]
  );

  // Compute Baseline & Acute Weakness Anomalies
  const activeBaseline = useMemo(() => {
    if (baseline) return baseline;
    return computePatientBaseline(historicalSessions, result.patientMeta?.patientId || "PT-UNKNOWN");
  }, [baseline, historicalSessions, result.patientMeta?.patientId]);

  const acuteWeakness = useMemo(
    () =>
      detectAcuteWeaknessAnomalies(
        result.metrics,
        activeBaseline,
        result.patientMeta?.assessmentCondition
      ),
    [result.metrics, activeBaseline, result.patientMeta?.assessmentCondition]
  );

  const isDivergent = agreement.alignmentStatus !== "concordant";

  return (
    <div data-testid="fall-risk-panel" className={cn("flex flex-col gap-6 max-w-6xl mx-auto w-full", className)}>
      {/* Header & Model Comparison Toggle Rail */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card overflow-hidden">
        <CardHeader className="bg-[var(--color-bg)] px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="size-5 text-[var(--color-primary)]" />
                <CardTitle className="text-lg font-bold text-[var(--color-fg)]">
                  Fall Risk &amp; Acute Motor Weakness Engine
                </CardTitle>
              </div>
              <CardDescription className="text-xs text-[var(--color-muted)] mt-0.5">
                Dual Predictive Modeling (CDC STEADI Cutoffs vs Dynamic Multi-Factor Composite Index) &amp; Longitudinal Baseline Anomaly Detection
              </CardDescription>
            </div>

            {/* Model Comparison Toggle Buttons */}
            <div data-testid="model-comparison-toggle" className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-[var(--shadow-card)]">
              <button
                type="button"
                data-testid="toggle-comparison"
                onClick={() => handleToggle("comparison")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  activeToggle === "comparison"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
                )}
              >
                Comparison View
              </button>
              <button
                type="button"
                data-testid="toggle-model-a"
                onClick={() => handleToggle("modelA")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  activeToggle === "modelA"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
                )}
              >
                Model A (STEADI)
              </button>
              <button
                type="button"
                data-testid="toggle-model-b"
                onClick={() => handleToggle("modelB")}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                  activeToggle === "modelB"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-[var(--shadow-card)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]"
                )}
              >
                Model B (Composite Index)
              </button>
            </div>
          </div>
        </CardHeader>

        {/* Predictive Agreement Badge Bar */}
        <CardContent className="p-4 bg-[var(--color-bg)]/50 border-b border-[var(--color-border)]">
          <div data-testid="predictive-agreement-badge" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <Scale className={cn("size-5", isDivergent ? "text-[var(--color-warn-text)]" : "text-[#188038]")} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-fg)]">Inter-Model Concordance</span>
                  <Badge
                    tone={agreement.alignmentStatus === "concordant" ? "success" : agreement.alignmentStatus === "mild_divergence" ? "warn" : "danger"}
                    className="capitalize text-[10px]"
                  >
                    {agreement.alignmentStatus.replace("_", " ")}
                  </Badge>
                </div>
                <p data-testid="divergence-explanation" className="text-xs text-[var(--color-muted)] mt-0.5">
                  {agreement.divergenceExplanation}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[10px] uppercase font-semibold text-[#70757A]">Percentage Agreement</span>
                <p data-testid="percent-agreement" className="tabular text-base font-bold text-[var(--color-fg)]">
                  {agreement.percentAgreement}%
                </p>
              </div>
              <div className="border-l border-[var(--color-border)] pl-4">
                <span className="text-[10px] uppercase font-semibold text-[#70757A]">Cohen's Kappa (κ)</span>
                <p data-testid="cohens-kappa" className="tabular text-base font-bold text-[var(--color-fg)]">
                  {agreement.cohensKappa.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Cards Grid (Model A & Model B) */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Model A Card */}
        {(activeToggle === "comparison" || activeToggle === "modelA") && (
          <Card data-testid="model-a-card" className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card flex flex-col">
            <CardHeader className="bg-[var(--color-bg)] pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-[var(--color-fg)]">
                  Model A: CDC STEADI Cutoffs
                </CardTitle>
                <Badge
                  tone={modelA.category === "high" ? "danger" : modelA.category === "moderate" ? "warn" : "success"}
                  className="uppercase text-xs"
                >
                  {modelA.category} Risk ({modelA.score}/100)
                </Badge>
              </div>
              <CardDescription className="text-xs text-[var(--color-muted)]">
                Rule-based clinical cutoffs derived from CDC STEADI and Tinetti POMA parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
              {/* STEADI Cutoff Criteria Checklist */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-[var(--color-fg)] block">Clinical Criteria Checklist</span>

                {/* 1. Gait Speed */}
                <div data-testid="criterion-gait-speed" className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs">
                  <div className="flex items-center gap-2">
                    {modelA.flags.gaitSpeedRisk ? (
                      <AlertTriangle className="size-4 text-[#D93025]" />
                    ) : (
                      <CheckCircle className="size-4 text-[#188038]" />
                    )}
                    <span>Gait Speed (&lt;0.80 m/s)</span>
                  </div>
                  <span className="tabular font-semibold">
                    {modelA.flagValues.gaitSpeedMps != null ? `${modelA.flagValues.gaitSpeedMps.toFixed(2)} m/s` : "N/A"}
                  </span>
                </div>

                {/* 2. Step Time CV */}
                <div data-testid="criterion-step-cv" className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs">
                  <div className="flex items-center gap-2">
                    {modelA.flags.stepTimeCvRisk ? (
                      <AlertTriangle className="size-4 text-[#D93025]" />
                    ) : (
                      <CheckCircle className="size-4 text-[#188038]" />
                    )}
                    <span>Step Time CV (&gt;6.0%)</span>
                  </div>
                  <span className="tabular font-semibold">
                    {modelA.flagValues.stepTimeCvPct.toFixed(1)}%
                  </span>
                </div>

                {/* 3. Double Support Time */}
                <div data-testid="criterion-double-support" className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs">
                  <div className="flex items-center gap-2">
                    {modelA.flags.doubleSupportRisk ? (
                      <AlertTriangle className="size-4 text-[#D93025]" />
                    ) : (
                      <CheckCircle className="size-4 text-[#188038]" />
                    )}
                    <span>Double Support Time (&gt;35.0%)</span>
                  </div>
                  <span className="tabular font-semibold">
                    {modelA.flagValues.doubleSupportPct != null ? `${modelA.flagValues.doubleSupportPct.toFixed(1)}%` : "N/A (Frontal)"}
                  </span>
                </div>

                {/* 4. Symmetry Angle */}
                <div data-testid="criterion-symmetry-angle" className="flex items-center justify-between rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2 text-xs">
                  <div className="flex items-center gap-2">
                    {modelA.flags.symmetryRisk ? (
                      <AlertTriangle className="size-4 text-[#D93025]" />
                    ) : (
                      <CheckCircle className="size-4 text-[#188038]" />
                    )}
                    <span>Symmetry Angle (&gt;10.0%)</span>
                  </div>
                  <span className="tabular font-semibold">
                    {modelA.flagValues.symmetryAnglePct != null ? `${modelA.flagValues.symmetryAnglePct.toFixed(1)}%` : "N/A"}
                  </span>
                </div>
              </div>

              {/* Model A Summary Bar */}
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs flex justify-between items-center">
                <span className="text-[var(--color-muted)]">Raw Risk Points:</span>
                <span data-testid="model-a-points" className="tabular font-bold text-[var(--color-fg)] text-sm">
                  {modelA.points.toFixed(1)} / 4.0 pts
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Model B Card */}
        {(activeToggle === "comparison" || activeToggle === "modelB") && (
          <Card data-testid="model-b-card" className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card flex flex-col">
            <CardHeader className="bg-[var(--color-bg)] pb-3 border-b border-[var(--color-border)]">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-[var(--color-fg)]">
                  Model B: Composite Index
                </CardTitle>
                <Badge
                  tone={modelB.category === "high" ? "danger" : modelB.category === "moderate" ? "warn" : "success"}
                  className="uppercase text-xs"
                >
                  {modelB.category} Risk
                </Badge>
              </div>
              <CardDescription className="text-xs text-[var(--color-muted)]">
                Continuous 0–100 weighted index combining kinematics, trunk sway, DTE, and variability
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
              {/* Gauge Dial View */}
              <div className="py-2">
                <FallRiskGaugeDial score={modelB.compositeScore} category={modelB.category} size={150} />
              </div>

              {/* Sub-Scores Domain Breakdown */}
              <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                <span className="text-xs font-bold text-[var(--color-fg)] block">Domain Sub-Scores &amp; Weights</span>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
                    <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
                      <span>Kinematics</span>
                      <span>{(modelB.weights.kinematics * 100).toFixed(0)}%</span>
                    </div>
                    <span data-testid="subscore-kinematics" className="tabular text-sm font-bold text-[var(--color-fg)] block mt-0.5">
                      {modelB.subScores.kinematicsScore} / 100
                    </span>
                  </div>

                  <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
                    <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
                      <span>Trunk Sway</span>
                      <span>{(modelB.weights.trunkSway * 100).toFixed(0)}%</span>
                    </div>
                    <span data-testid="subscore-sway" className="tabular text-sm font-bold text-[var(--color-fg)] block mt-0.5">
                      {modelB.subScores.trunkSwayScore} / 100
                    </span>
                  </div>

                  <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
                    <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
                      <span>Dual-Task DTE</span>
                      <span>{(modelB.weights.dte * 100).toFixed(0)}%</span>
                    </div>
                    <span data-testid="subscore-dte" className="tabular text-sm font-bold text-[var(--color-fg)] block mt-0.5">
                      {modelB.subScores.dteScore} / 100
                    </span>
                  </div>

                  <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
                    <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
                      <span>Variability</span>
                      <span>{(modelB.weights.variability * 100).toFixed(0)}%</span>
                    </div>
                    <span data-testid="subscore-variability" className="tabular text-sm font-bold text-[var(--color-fg)] block mt-0.5">
                      {modelB.subScores.variabilityScore} / 100
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Acute Motor Weakness & Diagnostic Anomaly Warning Cards */}
      <section data-testid="acute-weakness-section" className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-[var(--color-primary)]" />
          <h3 className="text-base font-bold text-[var(--color-fg)]">
            Acute Neuromuscular &amp; Metabolic Weakness Diagnostics
          </h3>
          {acuteWeakness.hasAcuteWeakness && (
            <Badge tone="danger" className="ml-auto text-xs">
              Acute Deterioration Triggered ({acuteWeakness.spikeFlags.length} Flags)
            </Badge>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {acuteWeakness.warningCards.map((card) => (
            <AcuteWeaknessCard key={card.id} card={card} />
          ))}
        </div>
      </section>

      {/* Longitudinal Baseline Sparklines Section */}
      <section data-testid="baseline-sparklines-section" className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-[var(--color-primary)]" />
            <h3 className="text-base font-bold text-[var(--color-fg)]">
              Longitudinal Patient Baseline Deviation Sparklines
            </h3>
          </div>
          <span className="text-xs text-[var(--color-muted)]">
            Patient ID: {activeBaseline.patientId} · Sessions Analyzed: {activeBaseline.sessionCount}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BaselineSparkline
            metricName="gaitSpeed"
            label="Gait Speed"
            currentValue={(result.metrics as { gaitSpeed?: number; speed?: number }).gaitSpeed ?? (result.metrics.cadenceSpm ? result.metrics.cadenceSpm * 0.012 : 1.1)}
            baselineStats={activeBaseline.metrics.gaitSpeed}
            unit="m/s"
          />

          <BaselineSparkline
            metricName="stepTimeCV"
            label="Step Time CV"
            currentValue={result.metrics.stepTimeCV < 1.0 && result.metrics.stepTimeCV > 0 ? result.metrics.stepTimeCV * 100 : result.metrics.stepTimeCV}
            baselineStats={activeBaseline.metrics.stepTimeCV}
            unit="%"
          />

          <BaselineSparkline
            metricName="lateralSway"
            label="Lateral Trunk Sway"
            currentValue={result.metrics.lateralSway ?? (result.metrics.verticalBounce ? result.metrics.verticalBounce * 0.5 : 0.04)}
            baselineStats={activeBaseline.metrics.lateralSway}
            unit="norm"
          />

          <BaselineSparkline
            metricName="doubleSupportPct"
            label="Double Support Time"
            currentValue={result.metrics.doubleSupportPct ?? (result.metrics.doubleSupportHint ? result.metrics.doubleSupportHint * 100 : 22.0)}
            baselineStats={activeBaseline.metrics.doubleSupportPct}
            unit="%"
          />

          <BaselineSparkline
            metricName="symmetryAngle"
            label="Symmetry Angle (SA)"
            currentValue={result.metrics.symmetryAngle ?? result.metrics.stepTimeAsymmetry ?? 2.5}
            baselineStats={activeBaseline.metrics.symmetryAngle}
            unit="%"
          />

          <BaselineSparkline
            metricName="cadenceSpm"
            label="Cadence"
            currentValue={result.metrics.cadenceSpm || 110}
            baselineStats={activeBaseline.metrics.cadenceSpm}
            unit="spm"
          />
        </div>
      </section>
    </div>
  );
}
