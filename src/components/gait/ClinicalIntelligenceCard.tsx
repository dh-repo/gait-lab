"use client";

import React, { useState, useMemo } from "react";
import type { AnalysisResult, PatientMetadata } from "@/lib/gait/types";
import { synthesizeClinicalIntelligence, type ClinicalIntelligenceReport } from "@/lib/gait/clinicalDiagnostics";
import { detectPhaseMicroFaults, type PhaseFaultAnalysisResult } from "@/lib/gait/phaseFaults";
import { classifyGaitAnomalies } from "@/lib/gait/anomalies";
import { computeFullGPSAndMAP } from "@/lib/gait/gpsNormatives";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Brain,
  Stethoscope,
  Target,
  FileCheck,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  ChevronRight,
  HelpCircle,
  Clock,
  Layers,
  HeartHandshake,
} from "lucide-react";

export interface ClinicalIntelligenceCardProps {
  analysis: AnalysisResult;
  patientMeta?: PatientMetadata;
  className?: string;
  defaultViewMode?: "clinician" | "patient";
}

export function ClinicalIntelligenceCard({
  analysis,
  patientMeta,
  className,
  defaultViewMode = "clinician",
}: ClinicalIntelligenceCardProps) {
  const [viewMode, setViewMode] = useState<"clinician" | "patient">(defaultViewMode);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"impressions" | "faults" | "goals">("impressions");

  const meta = patientMeta || analysis.patientMeta;
  const anomalies = useMemo(() => classifyGaitAnomalies(analysis.metrics, analysis.angleAnalysis), [analysis]);
  const phaseFaults = useMemo(() => detectPhaseMicroFaults(analysis.angleAnalysis, analysis.metrics, meta), [analysis, meta]);
  const gpsResult = useMemo(() => computeFullGPSAndMAP(analysis.angleAnalysis, meta), [analysis, meta]);

  const report: ClinicalIntelligenceReport = useMemo(() => {
    return synthesizeClinicalIntelligence(
      analysis.metrics,
      anomalies,
      analysis.angleAnalysis,
      phaseFaults,
      gpsResult,
      analysis.dualTaskCost,
      meta
    );
  }, [analysis, anomalies, phaseFaults, gpsResult, meta]);

  const handleCopySynthesis = async () => {
    try {
      await navigator.clipboard.writeText(report.fullClinicalSynthesis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <Card
      data-testid="clinical-intelligence-card"
      className={cn(
        "overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] shadow-md rounded-2xl",
        className
      )}
    >
      <CardHeader className="bg-[var(--color-surface-2)]/70 px-6 py-4 border-b border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Brain className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-bold text-[var(--color-fg)]">
                  Clinical Intelligence &amp; Differential Synthesis
                </CardTitle>
                <Badge tone="accent" className="text-[10px] uppercase font-bold">
                  AI Biomechanics
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Multi-domain evidence synthesis across kinematics, Perry phases, and dual-task telemetry
              </p>
            </div>
          </div>

          {/* Mode Selector & Action Buttons */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode("clinician")}
                className={cn(
                  "px-3 py-1 font-semibold rounded-md transition-colors",
                  viewMode === "clinician"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                Clinician Specialist
              </button>
              <button
                type="button"
                onClick={() => setViewMode("patient")}
                className={cn(
                  "px-3 py-1 font-semibold rounded-md transition-colors",
                  viewMode === "patient"
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                Patient Translation
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySynthesis}
              className="h-8 gap-1.5 text-xs"
              aria-label="Copy full clinical synthesis"
            >
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              <span>{copied ? "Copied" : "Copy Note"}</span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {viewMode === "patient" ? (
          /* =========================================================================
             PATIENT TRANSLATION MODE
             ========================================================================= */
          <div className="space-y-6" data-testid="patient-translation-view">
            <div className="p-5 rounded-xl border border-sky-500/30 bg-sky-500/10 space-y-3">
              <div className="flex items-center gap-2">
                <HeartHandshake className="size-5 text-sky-400" />
                <h3 className="text-sm font-bold text-sky-200">
                  What Your Walking Assessment Means
                </h3>
              </div>
              <p className="text-sm text-sky-100/90 leading-relaxed">
                {report.laymanExplanation.summary}
              </p>
              <div className="pt-2 border-t border-sky-500/20 text-xs text-sky-200/80">
                <span className="font-semibold text-sky-300">Key Takeaway: </span>
                {report.laymanExplanation.keyTakeaway}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)] space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                Next Steps &amp; Practical Advice
              </h4>
              <p className="text-xs text-[var(--color-fg)] leading-relaxed">
                {report.laymanExplanation.actionableAdvice}
              </p>
            </div>
          </div>
        ) : (
          /* =========================================================================
             CLINICIAN SPECIALIST MODE
             ========================================================================= */
          <div className="space-y-6" data-testid="clinician-specialist-view">
            {/* Primary Clinical Impression Banner */}
            <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/10 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                    Primary Diagnostic Impression
                  </span>
                  <Badge tone="accent" className="text-[10px] font-mono">
                    ICD-10: {report.primaryIcd10Code}
                  </Badge>
                </div>
                <h3 className="text-sm font-bold text-[var(--color-fg)]">
                  {report.primaryImpression}
                </h3>
              </div>
              <div className="text-right">
                <span className="text-xs text-[var(--color-muted)]">Model Confidence</span>
                <div className="text-base font-extrabold text-violet-400">
                  {report.primaryImpressionConfidence}%
                </div>
              </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("impressions")}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  activeTab === "impressions"
                    ? "bg-[var(--color-surface-2)] text-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                Differential Diagnoses ({report.differentialDiagnoses.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("faults")}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  activeTab === "faults"
                    ? "bg-[var(--color-surface-2)] text-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                Perry Phase Micro-Faults ({phaseFaults.faultCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("goals")}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors",
                  activeTab === "goals"
                    ? "bg-[var(--color-surface-2)] text-[var(--color-primary)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                )}
              >
                SMART PT Goals ({report.smartGoals.length})
              </button>
            </div>

            {/* TAB CONTENT: Differentials */}
            {activeTab === "impressions" && (
              <div className="space-y-3" data-testid="differentials-tab">
                {report.differentialDiagnoses.map((diff, idx) => (
                  <div
                    key={diff.icd10Code + idx}
                    className="p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)] space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)]">
                          {diff.icd10Code}
                        </span>
                        <h4 className="text-xs font-bold text-[var(--color-fg)]">
                          {diff.conditionName}
                        </h4>
                      </div>
                      <Badge
                        tone={diff.likelihood === "high" ? "danger" : diff.likelihood === "moderate" ? "warn" : "info"}
                        className="text-[10px] font-semibold uppercase"
                      >
                        {diff.likelihood} Likelihood ({diff.confidenceScore}%)
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="font-semibold text-emerald-400">Supporting Evidence:</span>
                        <ul className="list-disc list-inside text-[var(--color-muted)] mt-1 space-y-0.5">
                          {diff.supportingEvidence.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="font-semibold text-sky-400">Recommended Workup:</span>
                        <ul className="list-disc list-inside text-[var(--color-muted)] mt-1 space-y-0.5">
                          {diff.recommendedFurtherWorkup.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB CONTENT: Perry Phase Micro-Faults */}
            {activeTab === "faults" && (
              <div className="space-y-3" data-testid="phase-faults-tab">
                {phaseFaults.faults.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[var(--color-surface-2)] text-center text-xs text-[var(--color-muted)]">
                    No phase-specific kinematic micro-faults detected across the 8 Perry gait sub-phases.
                  </div>
                ) : (
                  phaseFaults.faults.map((fault) => (
                    <div
                      key={fault.id}
                      className="p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)] space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge tone="warn" className="text-[10px] uppercase font-mono">
                            {fault.phaseName} ({fault.cycleIntervalPct[0]}%–{fault.cycleIntervalPct[1]}%)
                          </Badge>
                          <h4 className="text-xs font-bold text-[var(--color-fg)]">
                            {fault.clinicalTitle}
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-semibold text-[var(--color-primary)]">
                          {fault.observedValueDeg}° (Target: {fault.normativeTargetDeg}°)
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                        {fault.biomechanicalMechanism}
                      </p>
                      <div className="p-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[11px] text-[var(--color-fg)]">
                        <span className="font-semibold text-emerald-400">Clinical Cue: </span>
                        {fault.correctiveClinicalCue}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: SMART Goals */}
            {activeTab === "goals" && (
              <div className="space-y-3" data-testid="smart-goals-tab">
                {report.smartGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="p-4 rounded-xl bg-[var(--color-surface-2)]/60 border border-[var(--color-border)] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Target className="size-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                          {goal.timeframeWeeks}-Week Rehabilitation Goal
                        </span>
                      </div>
                      <Badge tone="neutral" className="text-[10px]">
                        {goal.category.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs font-medium text-[var(--color-fg)] leading-relaxed">
                      {goal.statement}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-muted)] pt-1">
                      <span>Baseline: {goal.baselineMetric} → Target: {goal.targetMetric}</span>
                      <span className="italic text-[10px] text-[var(--color-subtle)]">{goal.evidenceBaseCitation}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
