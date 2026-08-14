import { useMemo } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScoreRing } from "./ScoreRing";
import { JointAnglesChart } from "./JointAnglesChart";
import {
  bandTone,
  buildStructuredReport,
} from "@/lib/gait/ratings";
import { computeGaitAngleAnalysis, type GaitAngleAnalysis } from "@/lib/gait/angles";
import type { AnalysisResult } from "@/lib/gait/types";
import { resolveDteValues } from "@/lib/gait/guesses";
import { cn } from "@/lib/utils";
import { ShieldAlert, UserCheck, Printer } from "lucide-react";
import {
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
  type FallRiskAnalysis,
  type AcuteWeaknessAnomalyResult,
  type PatientBaseline,
} from "@/lib/gait/fallrisk";
import { FallRiskGaugeDial } from "./FallRiskGaugeDial";
import { AcuteWeaknessCard } from "./AcuteWeaknessCard";
import { MovementAnalysisProfile } from "./MovementAnalysisProfile";
import { computeFullGPSAndMAP } from "@/lib/gait/gpsNormatives";

export type PatientMetadata = {
  patientId: string;
  clinicianNotes: string;
  assessmentDate: string;
  assessmentCondition: string;
};

export interface ClinicalReportViewProps {
  result: AnalysisResult;
  patientMeta: PatientMetadata;
  angleAnalysis?: GaitAngleAnalysis;
  fallRiskAnalysis?: FallRiskAnalysis;
  acuteWeaknessAnalysis?: AcuteWeaknessAnomalyResult;
  baseline?: PatientBaseline;
  onUpdateMeta?: (meta: Partial<PatientMetadata>) => void;
  onPrint?: () => void;
  className?: string;
}

export function ClinicalReportView({
  result,
  patientMeta,
  angleAnalysis,
  fallRiskAnalysis: externalFallRisk,
  acuteWeaknessAnalysis: externalAcuteWeakness,
  baseline: externalBaseline,
  onUpdateMeta,
  onPrint,
  className,
}: ClinicalReportViewProps) {
  const report = useMemo(
    () =>
      buildStructuredReport(result.metrics, result.guesses, {
        taskMode: result.taskMode,
        analyzedFrames: result.analyzedFrames,
        dualTaskCost: result.dualTaskCost,
      }),
    [result],
  );

  const derivedAngleAnalysis = useMemo(() => {
    if (angleAnalysis) return angleAnalysis;
    if (result.angleAnalysis) return result.angleAnalysis;
    return computeGaitAngleAnalysis(
      [],
      result.metrics.stepEvents || [],
      result.metrics.viewAngle || "unknown",
    );
  }, [angleAnalysis, result]);

  const derivedFallRisk = useMemo(() => {
    if (externalFallRisk) return externalFallRisk;
    const modelA = computeFallRiskModelA(result.metrics);
    const modelB = computeFallRiskModelB(
      result.metrics,
      result.dualTaskCost,
      derivedAngleAnalysis,
      result.metrics.viewAngle
    );
    const agreement = evaluatePredictiveAgreement(modelA, modelB);
    return {
      modelA,
      modelB,
      agreement,
      activeModelToggle: "comparison" as const,
      timestamp: new Date().toISOString(),
    };
  }, [externalFallRisk, result.metrics, result.dualTaskCost, derivedAngleAnalysis]);

  const derivedBaseline = useMemo(() => {
    if (externalBaseline) return externalBaseline;
    return computePatientBaseline([], patientMeta.patientId || "PT-N/A");
  }, [externalBaseline, patientMeta.patientId]);

  const derivedAcuteWeakness = useMemo(() => {
    if (externalAcuteWeakness) return externalAcuteWeakness;
    return detectAcuteWeaknessAnomalies(
      result.metrics,
      derivedBaseline,
      patientMeta.assessmentCondition
    );
  }, [externalAcuteWeakness, result.metrics, derivedBaseline, patientMeta.assessmentCondition]);

  const radarData = useMemo(() => {
    return [
      {
        domain: "Pace (Mobility)",
        score: Math.round(result.metrics.mobilityScore ?? 0),
        fullMark: 100,
      },
      {
        domain: "Symmetry",
        score: Math.round(result.metrics.symmetryScore ?? 0),
        fullMark: 100,
      },
      {
        domain: "Smoothness",
        score: Math.round(result.metrics.automaticityScore ?? 0),
        fullMark: 100,
      },
      {
        domain: "Rhythmicity",
        score: Math.round(result.metrics.rhythmScore ?? 0),
        fullMark: 100,
      },
      {
        domain: "Stability",
        score: Math.round(result.metrics.stabilityScore ?? 0),
        fullMark: 100,
      },
    ];
  }, [result.metrics]);

  const fullGPS = useMemo(() => {
    return computeFullGPSAndMAP(derivedAngleAnalysis, patientMeta as any);
  }, [derivedAngleAnalysis, patientMeta]);

  const romMetrics = derivedAngleAnalysis.metrics;

  return (
    <section
      role="region"
      aria-label="Clinical Gait Assessment Report"
      data-testid="clinical-report-view"
      className={cn("flex flex-col gap-6 print:gap-4 print:text-black max-w-5xl mx-auto w-full print:[margin:24mm_18mm]", className)}
    >
      {/* Google Workspace A4 Document Banner */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card overflow-hidden print-card print:border-none print:shadow-none">
        <CardHeader className="px-6 py-5 print:px-0 print:py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--color-fg)] font-sans">
                Gait Lab
              </h1>
              <div className="mt-2 h-0.5 w-12 bg-[var(--color-primary)]" />
              <p className="mt-2 text-xs text-[var(--color-muted)] print:text-gray-600">
                Clinical Gait Assessment · Patient ID: {patientMeta.patientId || "N/A"} · {new Date().toLocaleDateString()}
              </p>
            </div>
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                aria-label="Print or Export PDF Report"
                className="no-print print:hidden inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-fg)] shadow hover:bg-[var(--color-primary-active)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                <Printer className="size-4" />
                Print / Export PDF
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 bg-[var(--color-bg)] print:bg-[var(--color-surface)] print:p-2 border-t border-b border-[var(--color-border)]">
          {/* Patient Metadata Form Card Container */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="patient-id-input" className="text-xs text-[var(--color-muted)] print:text-gray-700">
                Patient ID
              </label>
              <input
                id="patient-id-input"
                type="text"
                value={patientMeta.patientId}
                onChange={(e) => onUpdateMeta?.({ patientId: e.target.value })}
                placeholder="e.g. PT-84920"
                data-testid="patient-id-input"
                aria-label="Patient ID"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] print:border-gray-300 print:bg-[var(--color-surface)] print:text-black"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="assessment-date-input" className="text-xs text-[var(--color-muted)] print:text-gray-700">
                Assessment Date
              </label>
              <input
                id="assessment-date-input"
                type="date"
                value={patientMeta.assessmentDate}
                onChange={(e) => onUpdateMeta?.({ assessmentDate: e.target.value })}
                data-testid="assessment-date-input"
                aria-label="Assessment Date"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] print:border-gray-300 print:bg-[var(--color-surface)] print:text-black"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="assessment-condition-input" className="text-xs text-[var(--color-muted)] print:text-gray-700">
                Assessment Condition
              </label>
              <input
                id="assessment-condition-input"
                type="text"
                value={patientMeta.assessmentCondition}
                onChange={(e) => onUpdateMeta?.({ assessmentCondition: e.target.value })}
                placeholder="e.g. Single-Task Walk"
                data-testid="assessment-condition-input"
                aria-label="Assessment Condition"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] print:border-gray-300 print:bg-[var(--color-surface)] print:text-black"
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <label htmlFor="clinician-notes-input" className="text-xs text-[var(--color-muted)] print:text-gray-700">
                Clinician Notes
              </label>
              <textarea
                id="clinician-notes-input"
                value={patientMeta.clinicianNotes}
                onChange={(e) => onUpdateMeta?.({ clinicianNotes: e.target.value })}
                placeholder="Enter clinician observations, medical history, or referral notes..."
                rows={2}
                data-testid="clinician-notes-input"
                aria-label="Clinician Notes"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] print:border-gray-300 print:bg-[var(--color-surface)] print:text-black"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary & 5-Domain Gait Health Radar Chart */}
      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        {/* Executive Summary & Overall Score */}
        <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
          <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
            <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">Executive Summary</CardTitle>
            <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">Overall Gait Health & Assessment Highlights</CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center gap-6">
              <div data-testid="overall-score-ring">
                <ScoreRing
                  score={Math.round(result.metrics.overallScore)}
                  label="Overall Gait Score"
                  size={92}
                />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold leading-tight text-[var(--color-fg)]">{report.headline}</h2>
                <p className="text-xs leading-relaxed text-[var(--color-muted)] print:text-gray-700">
                  {report.oneLiner}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge tone={bandTone(report.domains.find((d) => d.key === "overall")?.band ?? "good")}>
                    {report.domains.find((d) => d.key === "overall")?.bandLabel}
                  </Badge>
                  <Badge
                    data-testid="report-gps-badge"
                    tone={fullGPS.severity === "normal" ? "success" : fullGPS.severity === "mild" ? "warn" : "danger"}
                  >
                    GPS: {fullGPS.overallGPS.toFixed(1)}° ({fullGPS.severity.toUpperCase()})
                  </Badge>
                  <Badge tone="neutral" className="bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-border)]">
                    {result.taskMode === "dual" ? "Walk + cognitive" : "Walk only"}
                  </Badge>
                  <Badge tone="primary" className="bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[#1967D2]/20">
                    View: {result.metrics.viewAngle} ({(result.metrics.viewConfidence * 100).toFixed(0)}%)
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5-Domain Radar Chart */}
        <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
          <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
            <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">5-Domain Gait Health Radar</CardTitle>
            <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">Pace, Symmetry, Smoothness, Rhythmicity, & Stability</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div data-testid="radar-chart-container" className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="#E8EAED" gridType="polygon" />
                  <PolarAngleAxis
                    dataKey="domain"
                    tick={{ fill: "#5F6368", fontSize: 11, fontFamily: "Roboto, sans-serif" }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: "#70757A", fontSize: 9 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Gait Health"
                    dataKey="score"
                    stroke="#1A73E8"
                    fill="#1A73E8"
                    fillOpacity={0.15}
                    dot={false}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fall Risk & Acute Weakness Evaluation Section */}
      <Card data-testid="report-fall-risk-section" className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">
              Fall Risk &amp; Acute Motor Weakness Evaluation
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge
                data-testid="report-model-a-badge"
                tone={derivedFallRisk.modelA.category === "high" ? "danger" : derivedFallRisk.modelA.category === "moderate" ? "warn" : "success"}
              >
                Model A: {derivedFallRisk.modelA.category.toUpperCase()} ({derivedFallRisk.modelA.score}/100)
              </Badge>
              <Badge
                data-testid="report-model-b-badge"
                tone={derivedFallRisk.modelB.category === "high" ? "danger" : derivedFallRisk.modelB.category === "moderate" ? "warn" : "success"}
              >
                Model B: {derivedFallRisk.modelB.category.toUpperCase()} ({derivedFallRisk.modelB.compositeScore}/100)
              </Badge>
            </div>
          </div>
          <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">
            Comparative fall risk classification (CDC STEADI cutoffs vs Composite Index) and longitudinal acute weakness anomaly detection.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {/* Agreement Badge */}
          <div data-testid="report-predictive-agreement" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 print:bg-[var(--color-surface)]">
            <div>
              <span className="text-xs font-bold text-[var(--color-fg)]">
                Predictive Concordance: {derivedFallRisk.agreement.percentAgreement}% (κ = {derivedFallRisk.agreement.cohensKappa.toFixed(2)})
              </span>
              <p data-testid="report-divergence-explanation" className="text-xs text-[var(--color-muted)]">
                {derivedFallRisk.agreement.divergenceExplanation}
              </p>
            </div>
            <Badge
              tone={derivedFallRisk.agreement.alignmentStatus === "concordant" ? "success" : derivedFallRisk.agreement.alignmentStatus === "mild_divergence" ? "warn" : "danger"}
              className="capitalize text-xs"
            >
              {derivedFallRisk.agreement.alignmentStatus.replace("_", " ")}
            </Badge>
          </div>

          {/* Model B Gauge Dial & Sub-scores */}
          <div className="grid gap-4 sm:grid-cols-2 items-center">
            <div className="flex justify-center p-2">
              <FallRiskGaugeDial score={derivedFallRisk.modelB.compositeScore} category={derivedFallRisk.modelB.category} size={140} />
            </div>

            <div className="space-y-2 text-xs">
              <span className="font-bold text-[var(--color-fg)]">Model B Composite Sub-Scores</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
                  <span className="text-[10px] text-[var(--color-muted)] block">Kinematics</span>
                  <span className="font-bold text-[var(--color-fg)]">{derivedFallRisk.modelB.subScores.kinematicsScore} / 100</span>
                </div>
                <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
                  <span className="text-[10px] text-[var(--color-muted)] block">Trunk Sway</span>
                  <span className="font-bold text-[var(--color-fg)]">{derivedFallRisk.modelB.subScores.trunkSwayScore} / 100</span>
                </div>
                <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
                  <span className="text-[10px] text-[var(--color-muted)] block">Dual-Task DTE</span>
                  <span className="font-bold text-[var(--color-fg)]">{derivedFallRisk.modelB.subScores.dteScore} / 100</span>
                </div>
                <div className="rounded border border-[var(--color-border)] p-2 bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
                  <span className="text-[10px] text-[var(--color-muted)] block">Variability</span>
                  <span className="font-bold text-[var(--color-fg)]">{derivedFallRisk.modelB.subScores.variabilityScore} / 100</span>
                </div>
              </div>
            </div>
          </div>

          {/* Acute Weakness Warning Cards in Report */}
          {derivedAcuteWeakness.warningCards.length > 0 && (
            <div data-testid="report-acute-weakness-cards" className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <span className="text-xs font-bold text-[var(--color-fg)]">Acute Motor Weakness Clinical Warnings</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {derivedAcuteWeakness.warningCards.map((card) => (
                  <AcuteWeaknessCard key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zeni Kinematic Gait Cycle Phase Breakdown */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">Zeni Kinematic Gait Phase Breakdown</CardTitle>
            <Badge tone="primary" className="bg-[var(--color-info-bg)] text-[var(--color-info-text)] border-[#1967D2]/20">
              SA:{" "}
              {result.metrics.symmetryAngle != null
                ? `${result.metrics.symmetryAngle.toFixed(1)}%`
                : "N/A"}
            </Badge>
          </div>
          <CardDescription className="text-xs text-[var(--color-muted)]">
            Stance phase, swing phase, and double support timing derived from foot AP position relative to pelvis (Zeni et al. 2008).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
              <span>Left Stance / Swing</span>
              <span>
                {result.metrics.leftStancePct != null && result.metrics.leftSwingPct != null
                  ? `${result.metrics.leftStancePct.toFixed(1)}% / ${result.metrics.leftSwingPct.toFixed(1)}%`
                  : "N/A (Requires Side View)"}
              </span>
            </div>
            {result.metrics.leftStancePct != null ? (
              <Progress
                value={result.metrics.leftStancePct}
                className="h-2"
                role="progressbar"
                aria-valuenow={result.metrics.leftStancePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Left stance percentage"
              />
            ) : (
              <div className="h-2 rounded bg-[var(--color-border)] text-[10px] text-center leading-none text-[var(--color-subtle)]">View Suppressed</div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
              <span>Right Stance / Swing</span>
              <span>
                {result.metrics.rightStancePct != null && result.metrics.rightSwingPct != null
                  ? `${result.metrics.rightStancePct.toFixed(1)}% / ${result.metrics.rightSwingPct.toFixed(1)}%`
                  : "N/A (Requires Side View)"}
              </span>
            </div>
            {result.metrics.rightStancePct != null ? (
              <Progress
                value={result.metrics.rightStancePct}
                className="h-2"
                role="progressbar"
                aria-valuenow={result.metrics.rightStancePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Right stance percentage"
              />
            ) : (
              <div className="h-2 rounded bg-[var(--color-border)] text-[10px] text-center leading-none text-[var(--color-subtle)]">View Suppressed</div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-medium text-[var(--color-fg)]">
              <span>Double Support Time</span>
              <span>
                {result.metrics.doubleSupportPct != null
                  ? `${result.metrics.doubleSupportPct.toFixed(1)}% stride`
                  : "N/A (Requires Side View)"}
              </span>
            </div>
            {result.metrics.doubleSupportPct != null ? (
              <Progress
                value={result.metrics.doubleSupportPct}
                className="h-2"
                role="progressbar"
                aria-valuenow={result.metrics.doubleSupportPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Double support percentage"
              />
            ) : (
              <div className="h-2 rounded bg-[var(--color-border)] text-[10px] text-center leading-none text-[var(--color-subtle)]">View Suppressed</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Joint Trajectory ROM Summary Table & Joint Angles Chart */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-gray-100">
          <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">Joint Trajectory Range of Motion (ROM) Summary</CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">
            Sagittal joint kinematic excursions and asymmetry metrics compared against Perry &amp; Burnfield (2010) normative reference bounds.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="overflow-x-auto">
            <table data-testid="rom-summary-table" className="clinical-table" aria-label="Joint Trajectory ROM Summary">
              <thead>
                <tr>
                  <th scope="col">Joint</th>
                  <th scope="col">Left Peak ROM</th>
                  <th scope="col">Right Peak ROM</th>
                  <th scope="col">Peak Flexion / Dorsiflexion (L / R)</th>
                  <th scope="col">Peak Extension / Plantarflexion (L / R)</th>
                  <th scope="col">ROM Asymmetry %</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="font-medium text-[var(--color-fg)]">Knee</th>
                  <td className="tabular">{romMetrics.kneeRomLeft != null ? `${romMetrics.kneeRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">{romMetrics.kneeRomRight != null ? `${romMetrics.kneeRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">
                    L {romMetrics.kneePeakFlexionLeft != null ? `${romMetrics.kneePeakFlexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.kneePeakFlexionRight != null ? `${romMetrics.kneePeakFlexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular">
                    L {romMetrics.kneePeakFlexionLeft != null && romMetrics.kneeRomLeft != null ? `${(romMetrics.kneePeakFlexionLeft - romMetrics.kneeRomLeft).toFixed(1)}°` : "—"} / R {romMetrics.kneePeakFlexionRight != null && romMetrics.kneeRomRight != null ? `${(romMetrics.kneePeakFlexionRight - romMetrics.kneeRomRight).toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular font-semibold text-[var(--color-fg)]">
                    {romMetrics.kneeAsymmetryPct != null ? `${romMetrics.kneeAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="font-medium text-[var(--color-fg)]">Hip</th>
                  <td className="tabular">{romMetrics.hipRomLeft != null ? `${romMetrics.hipRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">{romMetrics.hipRomRight != null ? `${romMetrics.hipRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">
                    L {romMetrics.hipPeakFlexionLeft != null ? `${romMetrics.hipPeakFlexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.hipPeakFlexionRight != null ? `${romMetrics.hipPeakFlexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular">
                    L {romMetrics.hipPeakExtensionLeft != null ? `${romMetrics.hipPeakExtensionLeft.toFixed(1)}°` : "—"} / R {romMetrics.hipPeakExtensionRight != null ? `${romMetrics.hipPeakExtensionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular font-semibold text-[var(--color-fg)]">
                    {romMetrics.hipAsymmetryPct != null ? `${romMetrics.hipAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="font-medium text-[var(--color-fg)]">Ankle</th>
                  <td className="tabular">{romMetrics.ankleRomLeft != null ? `${romMetrics.ankleRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">{romMetrics.ankleRomRight != null ? `${romMetrics.ankleRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="tabular">
                    L {romMetrics.anklePeakDorsiflexionLeft != null ? `${romMetrics.anklePeakDorsiflexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.anklePeakDorsiflexionRight != null ? `${romMetrics.anklePeakDorsiflexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular">
                    L {romMetrics.anklePeakPlantarflexionLeft != null ? `${romMetrics.anklePeakPlantarflexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.anklePeakPlantarflexionRight != null ? `${romMetrics.anklePeakPlantarflexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="tabular font-semibold text-[var(--color-fg)]">
                    {romMetrics.ankleAsymmetryPct != null ? `${romMetrics.ankleAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <JointAnglesChart angleAnalysis={derivedAngleAnalysis} />
        </CardContent>
      </Card>

      {/* Movement Analysis Profile (MAP) & Gait Profile Score (GPS) */}
      <MovementAnalysisProfile
        gpsResult={fullGPS}
        angleAnalysis={derivedAngleAnalysis}
        patientMeta={patientMeta as any}
      />

      {/* Dual-Task Cost Block (if applicable) */}
      {result.dualTaskCost && (
        <Card className="border-[var(--color-primary)]/40 bg-[var(--color-surface)] shadow-card print-card">
          <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-info-bg)]/50 print:bg-gray-100">
            <CardTitle className="text-base font-semibold text-[var(--color-primary)]">Dual-Task Cost Rating</CardTitle>
            <CardDescription className="text-xs text-[var(--color-muted)]">{result.dualTaskCost.summary}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-bg)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-muted)] uppercase font-semibold">Cadence DTE</p>
              <p className="tabular text-base font-bold text-[var(--color-fg)]">
                {resolveDteValues(result.dualTaskCost).cadenceDte.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-bg)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-muted)] uppercase font-semibold">Step Time CV DTE</p>
              <p className="tabular text-base font-bold text-[var(--color-fg)]">
                {resolveDteValues(result.dualTaskCost).stepTimeCvDte.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-bg)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-muted)] uppercase font-semibold">Stability DTE</p>
              <p className="tabular text-base font-bold text-[var(--color-fg)]">{resolveDteValues(result.dualTaskCost).stabilityDte.toFixed(0)} pts</p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-3 bg-[var(--color-bg)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-muted)] uppercase font-semibold">Automaticity DTE</p>
              <p className="tabular text-base font-bold text-[var(--color-fg)]">{resolveDteValues(result.dualTaskCost).automaticityDte.toFixed(0)} pts</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Gait Metric Ratings & 95% Confidence Intervals */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
          <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">Key Gait Metric Ratings &amp; 95% Confidence Intervals</CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">
            Measured quantitative spatial-temporal metrics and favorability bands derived from split-half reliability testing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-2.5">
          {report.metrics.map((m) => {
            const ci = result.metrics.confidenceIntervals?.[m.id];
            const hasCI = ci && ci.ci95Lower != null && ci.ci95Upper != null;
            return (
              <div
                key={m.id}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3 print:bg-[var(--color-surface)] print:border-gray-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-[var(--color-fg)]">{m.label}</span>
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--color-subtle)]">
                      ({m.group})
                    </span>
                    <p className="text-[11px] text-[var(--color-muted)] print:text-gray-600">{m.note}</p>
                  </div>
                  <div className="text-right">
                    <span className="tabular text-sm font-bold text-[var(--color-fg)]">
                      {m.display} {m.unit}
                    </span>
                    {hasCI && (
                      <p className="tabular text-[10px] text-[var(--color-muted)] font-medium">
                        [95% CI: {ci.ci95Lower?.toFixed(1)} – {ci.ci95Upper?.toFixed(1)}]
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Hypotheses Board */}
      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
          <CardTitle className="text-base font-semibold text-[var(--color-fg)] border-l-[3px] border-[var(--color-primary)] pl-2">Ranked Clinical Hypotheses &amp; Evidence Board</CardTitle>
          <CardDescription className="text-xs text-[var(--color-muted)] pl-[11px]">
            Pattern hypotheses ranked by severity and confidence algorithmically identified from biomechanical markers.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex flex-col gap-3">
          {report.hypotheses.map((h, idx) => (
            <div
              key={h.id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3.5 print:bg-[var(--color-surface)] print:border-gray-200"
            >
              <div className="flex items-start gap-3">
                <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-info-bg)] text-[var(--color-info-text)] text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-fg)]">{h.title}</span>
                    <Badge tone={h.severity === "elevated" ? "danger" : h.severity === "moderate" ? "warn" : "success"}>
                      {h.severity}
                    </Badge>
                    {h.patternTag && <Badge tone="accent" className="bg-[var(--color-info-bg)] text-[var(--color-info-text)]">{h.patternTag}</Badge>}
                    <span className="ml-auto text-xs text-[var(--color-muted)] font-medium">
                      {(h.confidence * 100).toFixed(0)}% conf.
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)] print:text-gray-700">{h.summary}</p>
                  {h.evidence.length > 0 && (
                    <ul className="mt-2 space-y-0.5 border-t border-[var(--color-border)] pt-2 text-[11px] text-[var(--color-muted)]">
                      {h.evidence.map((e) => (
                        <li key={e}>· {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Clinician Sign-off Block */}
      <Card data-testid="clinician-signoff-block" className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-card print-card">
        <CardHeader className="pb-2 border-b border-[var(--color-border)] bg-[var(--color-bg)] print:bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <UserCheck className="size-5 text-[var(--color-primary)]" />
            <CardTitle className="text-base font-semibold text-[var(--color-fg)]">Clinician Verification &amp; Sign-Off</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-6 sm:grid-cols-3 pt-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">Clinician Signature</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">Date</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-[var(--color-muted)]">License / NPI #</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
          </div>

          <div className="flex gap-2 rounded-md border border-[#F9AB00] bg-[var(--color-warn-bg)] p-3 text-xs leading-relaxed text-[var(--color-warn-text)] print:bg-gray-100 print:text-black">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-warn-text)]" />
            <p>
              <strong>DISCLAIMER:</strong> This report is generated by Gait Lab using browser-based computer vision pose estimation. It is intended for biomechanical research and clinical screening assistance only, and does not constitute a diagnostic medical decision.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
