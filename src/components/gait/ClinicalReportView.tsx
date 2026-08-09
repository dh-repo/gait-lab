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
import { cn } from "@/lib/utils";
import { Activity, ShieldAlert, UserCheck, Printer } from "lucide-react";

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
  onUpdateMeta?: (meta: Partial<PatientMetadata>) => void;
  onPrint?: () => void;
  className?: string;
}

export function ClinicalReportView({
  result,
  patientMeta,
  angleAnalysis,
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

  const romMetrics = derivedAngleAnalysis.metrics;

  return (
    <section
      role="region"
      aria-label="Clinical Gait Assessment Report"
      data-testid="clinical-report-view"
      className={cn("flex flex-col gap-6 print:gap-4 print:text-black", className)}
    >
      {/* Clinic Header */}
      <Card className="border-[var(--color-border)] print-card">
        <CardHeader className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-6 py-4 print:bg-white print:border-gray-300">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-white print:bg-blue-600">
                <Activity className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight print:text-black">
                  Gait analysis summary
                </h1>
                <p className="text-xs text-[var(--color-muted)] print:text-gray-600">
                  Gait Lab · Research / educational analysis · Not a medical device ·{" "}
                  {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                aria-label="Print or Export PDF Report"
                className="no-print print:hidden inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              >
                <Printer className="size-4" />
                Print / Export PDF
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6 print:p-4">
          {/* Patient Metadata Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="patient-id-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] print:text-gray-700">
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
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] print:border-gray-300 print:bg-white print:text-black"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="assessment-date-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] print:text-gray-700">
                Assessment Date
              </label>
              <input
                id="assessment-date-input"
                type="date"
                value={patientMeta.assessmentDate}
                onChange={(e) => onUpdateMeta?.({ assessmentDate: e.target.value })}
                data-testid="assessment-date-input"
                aria-label="Assessment Date"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] print:border-gray-300 print:bg-white print:text-black"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <label htmlFor="assessment-condition-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] print:text-gray-700">
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
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] print:border-gray-300 print:bg-white print:text-black"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <label htmlFor="clinician-notes-input" className="text-xs font-semibold uppercase tracking-wider text-[var(--color-subtle)] print:text-gray-700">
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
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] print:border-gray-300 print:bg-white print:text-black"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executive Summary & 5-Domain Gait Health Radar Chart */}
      <div className="grid gap-6 lg:grid-cols-2 print:grid-cols-2 print:gap-4">
        {/* Executive Summary & Overall Score */}
        <Card className="print-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Executive Summary</CardTitle>
            <CardDescription>Overall Gait Health & Assessment Highlights</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-6">
              <div data-testid="overall-score-ring">
                <ScoreRing
                  score={Math.round(result.metrics.overallScore)}
                  label="Overall Gait Score"
                  size={92}
                />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold leading-tight">{report.headline}</h2>
                <p className="text-xs leading-relaxed text-[var(--color-muted)] print:text-gray-700">
                  {report.oneLiner}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Badge tone={bandTone(report.domains.find((d) => d.key === "overall")?.band ?? "good")}>
                    {report.domains.find((d) => d.key === "overall")?.bandLabel}
                  </Badge>
                  <Badge tone="neutral">
                    {result.taskMode === "dual" ? "Walk + cognitive" : "Walk only"}
                  </Badge>
                  <Badge tone="primary">
                    View: {result.metrics.viewAngle} ({(result.metrics.viewConfidence * 100).toFixed(0)}%)
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 5-Domain Radar Chart */}
        <Card className="print-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">5-Domain Gait Health Radar</CardTitle>
            <CardDescription>Pace, Symmetry, Smoothness, Rhythmicity, & Stability</CardDescription>
          </CardHeader>
          <CardContent>
            <div data-testid="radar-chart-container" className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                  <PolarGrid stroke="var(--color-border)" opacity={0.6} />
                  <PolarAngleAxis
                    dataKey="domain"
                    tick={{ fill: "var(--color-fg)", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: "var(--color-subtle)", fontSize: 9 }}
                  />
                  <Radar
                    name="Gait Health"
                    dataKey="score"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zeni Kinematic Gait Cycle Phase Breakdown */}
      <Card className="print-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Zeni Kinematic Gait Phase Breakdown</CardTitle>
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
            <div className="flex justify-between text-xs font-medium">
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
            <div className="flex justify-between text-xs font-medium">
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
      <Card className="print-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Joint Trajectory Range of Motion (ROM) Summary</CardTitle>
          <CardDescription>
            Sagittal joint kinematic excursions and asymmetry metrics compared against Perry & Burnfield (2010) normative reference bounds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table data-testid="rom-summary-table" className="w-full text-left text-xs border-collapse" aria-label="Joint Trajectory ROM Summary">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] print:bg-gray-100 print:text-black">
                  <th scope="col" className="p-2.5 font-semibold">Joint</th>
                  <th scope="col" className="p-2.5 font-semibold">Left Peak ROM</th>
                  <th scope="col" className="p-2.5 font-semibold">Right Peak ROM</th>
                  <th scope="col" className="p-2.5 font-semibold">Peak Flexion / Dorsiflexion (L / R)</th>
                  <th scope="col" className="p-2.5 font-semibold">Peak Extension / Plantarflexion (L / R)</th>
                  <th scope="col" className="p-2.5 font-semibold">ROM Asymmetry %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)] print:divide-gray-300">
                <tr>
                  <th scope="row" className="p-2.5 font-medium">Knee</th>
                  <td className="p-2.5 tabular">{romMetrics.kneeRomLeft != null ? `${romMetrics.kneeRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">{romMetrics.kneeRomRight != null ? `${romMetrics.kneeRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.kneePeakFlexionLeft != null ? `${romMetrics.kneePeakFlexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.kneePeakFlexionRight != null ? `${romMetrics.kneePeakFlexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.kneePeakFlexionLeft != null && romMetrics.kneeRomLeft != null ? `${(romMetrics.kneePeakFlexionLeft - romMetrics.kneeRomLeft).toFixed(1)}°` : "—"} / R {romMetrics.kneePeakFlexionRight != null && romMetrics.kneeRomRight != null ? `${(romMetrics.kneePeakFlexionRight - romMetrics.kneeRomRight).toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular font-medium">
                    {romMetrics.kneeAsymmetryPct != null ? `${romMetrics.kneeAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="p-2.5 font-medium">Hip</th>
                  <td className="p-2.5 tabular">{romMetrics.hipRomLeft != null ? `${romMetrics.hipRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">{romMetrics.hipRomRight != null ? `${romMetrics.hipRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.hipPeakFlexionLeft != null ? `${romMetrics.hipPeakFlexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.hipPeakFlexionRight != null ? `${romMetrics.hipPeakFlexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.hipPeakExtensionLeft != null ? `${romMetrics.hipPeakExtensionLeft.toFixed(1)}°` : "—"} / R {romMetrics.hipPeakExtensionRight != null ? `${romMetrics.hipPeakExtensionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular font-medium">
                    {romMetrics.hipAsymmetryPct != null ? `${romMetrics.hipAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="p-2.5 font-medium">Ankle</th>
                  <td className="p-2.5 tabular">{romMetrics.ankleRomLeft != null ? `${romMetrics.ankleRomLeft.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">{romMetrics.ankleRomRight != null ? `${romMetrics.ankleRomRight.toFixed(1)}°` : "—"}</td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.anklePeakDorsiflexionLeft != null ? `${romMetrics.anklePeakDorsiflexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.anklePeakDorsiflexionRight != null ? `${romMetrics.anklePeakDorsiflexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular">
                    L {romMetrics.anklePeakPlantarflexionLeft != null ? `${romMetrics.anklePeakPlantarflexionLeft.toFixed(1)}°` : "—"} / R {romMetrics.anklePeakPlantarflexionRight != null ? `${romMetrics.anklePeakPlantarflexionRight.toFixed(1)}°` : "—"}
                  </td>
                  <td className="p-2.5 tabular font-medium">
                    {romMetrics.ankleAsymmetryPct != null ? `${romMetrics.ankleAsymmetryPct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <JointAnglesChart angleAnalysis={derivedAngleAnalysis} />
        </CardContent>
      </Card>

      {/* Dual-Task Cost Block (if applicable) */}
      {result.dualTaskCost && (
        <Card className="border-[color-mix(in_oklab,var(--color-accent)_35%,var(--color-border))] print-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Dual-Task Cost Rating</CardTitle>
            <CardDescription>{result.dualTaskCost.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-[var(--color-border)] p-2.5 bg-[var(--color-surface-2)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-subtle)]">Cadence Cost</p>
              <p className="tabular text-sm font-semibold">{result.dualTaskCost.cadenceCostPct.toFixed(0)}%</p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-2.5 bg-[var(--color-surface-2)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-subtle)]">Variability Cost</p>
              <p className="tabular text-sm font-semibold">{result.dualTaskCost.stepTimeCvCostPct.toFixed(0)}%</p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-2.5 bg-[var(--color-surface-2)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-subtle)]">Stability Δ</p>
              <p className="tabular text-sm font-semibold">{result.dualTaskCost.stabilityCostPts.toFixed(0)} pts</p>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-2.5 bg-[var(--color-surface-2)] print:bg-gray-50">
              <p className="text-[10px] text-[var(--color-subtle)]">Automaticity Δ</p>
              <p className="tabular text-sm font-semibold">{result.dualTaskCost.automaticityCostPts.toFixed(0)} pts</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Ratings Table with 95% CIs */}
      <Card className="print-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Key Gait Metric Ratings & 95% Confidence Intervals</CardTitle>
          <CardDescription>
            Measured quantitative spatial-temporal metrics and favorability bands derived from split-half reliability testing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.metrics.map((m) => {
            const ci = result.metrics.confidenceIntervals?.[m.id];
            const hasCI = ci && ci.ci95Lower != null && ci.ci95Upper != null;
            return (
              <div
                key={m.id}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 print:bg-white print:border-gray-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="ml-2 text-[10px] uppercase text-[var(--color-subtle)]">
                      ({m.group})
                    </span>
                    <p className="text-[11px] text-[var(--color-subtle)] print:text-gray-600">{m.note}</p>
                  </div>
                  <div className="text-right">
                    <span className="tabular text-sm font-bold">
                      {m.display} {m.unit}
                    </span>
                    {hasCI && (
                      <p className="tabular text-[10px] text-[var(--color-subtle)] font-medium">
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
      <Card className="print-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Ranked Clinical Hypotheses & Evidence Board</CardTitle>
          <CardDescription>
            Pattern hypotheses ranked by severity and confidence algorithmically identified from biomechanical markers.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {report.hypotheses.map((h, idx) => (
            <div
              key={h.id}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 print:bg-white print:border-gray-200"
            >
              <div className="flex items-start gap-2">
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-[10px] font-bold">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{h.title}</span>
                    <Badge tone={h.severity === "elevated" ? "danger" : h.severity === "moderate" ? "warn" : "success"}>
                      {h.severity}
                    </Badge>
                    {h.patternTag && <Badge tone="accent">{h.patternTag}</Badge>}
                    <span className="ml-auto text-xs text-[var(--color-subtle)] font-medium">
                      {(h.confidence * 100).toFixed(0)}% conf.
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)] print:text-gray-700">{h.summary}</p>
                  {h.evidence.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-[var(--color-border)] pt-1.5 text-[11px] text-[var(--color-subtle)]">
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
      <Card data-testid="clinician-signoff-block" className="border-[var(--color-border)] print-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <UserCheck className="size-5 text-[var(--color-primary)]" />
            <CardTitle className="text-base font-semibold">Clinician Verification & Sign-Off</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid gap-6 sm:grid-cols-3 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-[var(--color-subtle)]">Clinician Signature</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-[var(--color-subtle)]">Date</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-[var(--color-subtle)]">License / NPI #</p>
              <div className="h-10 border-b-2 border-dashed border-[var(--color-border)] print:border-black" />
            </div>
          </div>

          <div className="flex gap-2 rounded-md border border-[color-mix(in_oklab,var(--color-warn)_40%,var(--color-border))] bg-[color-mix(in_oklab,var(--color-warn)_10%,transparent)] p-3 text-xs leading-relaxed text-[var(--color-muted)] print:bg-gray-100 print:text-black">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--color-warn)]" />
            <p>
              <strong>DISCLAIMER:</strong> This report is generated by Gait Lab using browser-based computer vision pose estimation. It is intended for biomechanical research and clinical screening assistance only, and does not constitute a diagnostic medical decision.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
