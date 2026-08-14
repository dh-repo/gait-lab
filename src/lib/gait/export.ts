/**
 * Raw Kinematic Telemetry & Biomechanical Data Exporter
 *
 * Supports exporting session data to:
 * 1. Standard Clinical / Research JSON Schema
 * 2. Spatio-Temporal Metrics Summary CSV
 * 3. Frame-by-Frame Joint Coordinate & Angle Time-Series CSV
 */

import type { AnalysisResult, GaitMetrics, PatientMetadata } from "./types";

/**
 * Helper to safely format numeric metric values.
 * Returns "N/A" if value is null, undefined, or NaN.
 */
function formatMetric(
  val: number | null | undefined,
  decimals: number,
  scale: number = 1
): string {
  if (val == null || Number.isNaN(val)) {
    return "N/A";
  }
  return (val * scale).toFixed(decimals);
}

/**
 * Helper to safely format composite score values.
 * Returns "N/A" if value is null, undefined, or NaN.
 */
function formatScore(val: number | null | undefined): string {
  if (val == null || Number.isNaN(val)) {
    return "N/A";
  }
  return Math.round(val).toString();
}

/**
 * Serializes an entire gait analysis session into a structured research JSON.
 */
export function exportGaitSessionAsJson(
  result: AnalysisResult,
  patientMeta?: PatientMetadata
): string {
  const exportPayload = {
    metadata: {
      exportedAt: new Date().toISOString(),
      generator: "Gait Lab Quantitative Biomechanics Suite v2.0",
      patient: patientMeta || {
        patientId: "ANONYMOUS",
        assessmentDate: new Date().toISOString().split("T")[0],
        assessmentCondition: "Single-Task Walk",
        clinicianNotes: "",
      },
    },
    metrics: result.metrics,
    guesses: result.guesses,
    angleAnalysis: result.angleAnalysis,
    dualTaskCost: result.dualTaskCost,
    analyzedFrames: result.analyzedFrames,
    taskMode: result.taskMode,
  };

  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Converts high-level spatio-temporal metrics into tabular CSV format.
 * Exports 32 key biomechanical parameters with safe "N/A" null fallbacks.
 */
export function exportGaitMetricsAsCsv(metrics: GaitMetrics): string {
  const headers = [
    "Parameter",
    "Value",
    "Unit",
    "Reference Range",
  ];

  const doubleSupportVal =
    metrics.doubleSupportPct != null && !Number.isNaN(metrics.doubleSupportPct)
      ? metrics.doubleSupportPct
      : metrics.doubleSupportHint != null && !Number.isNaN(metrics.doubleSupportHint)
      ? metrics.doubleSupportHint * 100
      : null;

  const rows: [string, string, string, string][] = [
    // 1. Primary Spatio-Temporal Metrics
    ["Gait Speed", formatMetric(metrics.gaitSpeedMps, 2), "m/s", "1.10 - 1.40"],
    ["Cadence", formatMetric(metrics.cadenceSpm, 0), "spm", "100 - 120"],
    ["Duration", formatMetric(metrics.durationSec, 2), "s", "-"],
    ["Step Count", formatMetric(metrics.stepCount, 0), "steps", "-"],
    ["Avg Step Time", formatMetric(metrics.avgStepTimeSec, 3), "s", "0.45 - 0.60"],
    ["Step Time CV", formatMetric(metrics.stepTimeCV, 2, 100), "%", "< 3.5%"],
    ["Stride Time CV", formatMetric(metrics.strideTimeCV, 2, 100), "%", "< 3.0%"],

    // 2. Phase & Timing Distribution
    ["Left Stance Phase", formatMetric(metrics.leftStancePct, 1), "%", "58 - 62%"],
    ["Right Stance Phase", formatMetric(metrics.rightStancePct, 1), "%", "58 - 62%"],
    ["Left Swing Phase", formatMetric(metrics.leftSwingPct, 1), "%", "38 - 42%"],
    ["Right Swing Phase", formatMetric(metrics.rightSwingPct, 1), "%", "38 - 42%"],
    ["Double Support Phase", formatMetric(doubleSupportVal, 1), "%", "15 - 22%"],

    // 3. Symmetry & Asymmetry Metrics
    ["Zifchock Symmetry Angle", formatMetric(metrics.symmetryAngle, 2), "%", "< 5.0%"],
    ["Step Time Asymmetry", formatMetric(metrics.stepTimeAsymmetry, 3), "s", "< 0.03 s"],
    ["Stride Asymmetry", formatMetric(metrics.strideAsymmetry, 3), "s", "< 0.03 s"],

    // 4. Spatial & Kinematic Displacement
    ["Mean Step Width", formatMetric(metrics.meanStepWidth, 1, 100), "cm", "8.0 - 12.0"],
    ["Lateral Trunk Sway", formatMetric(metrics.lateralSway, 3), "m", "< 0.05 m"],
    ["Vertical CoM Bounce", formatMetric(metrics.verticalBounce, 3), "m", "0.02 - 0.05 m"],

    // 5. Pelvic Kinematics
    ["Pelvic Obliquity", formatMetric(metrics.pelvicObliquity, 2), "deg", "< 4.0 deg"],
    ["Pelvic Obliquity Var", formatMetric(metrics.pelvicObliquityVar, 3), "deg²", "-"],

    // 6. Upper & Lower Limb Kinematics / ROM
    ["Left Arm Swing Amplitude", formatMetric(metrics.armSwingLeft, 2), "m", "0.15 - 0.35 m"],
    ["Right Arm Swing Amplitude", formatMetric(metrics.armSwingRight, 2), "m", "0.15 - 0.35 m"],
    ["Arm Swing Asymmetry", formatMetric(metrics.armSwingAsymmetry, 3), "m", "< 0.05 m"],
    ["Left Knee ROM", formatMetric(metrics.kneeFlexLeft, 1), "deg", "55 - 65 deg"],
    ["Right Knee ROM", formatMetric(metrics.kneeFlexRight, 1), "deg", "55 - 65 deg"],
    ["Knee Flexion Asymmetry", formatMetric(metrics.kneeAsymmetry, 2), "deg", "< 3.0 deg"],

    // 7. Composite Functional Scores
    ["Overall Score", formatScore(metrics.overallScore), "/100", ">= 75"],
    ["Stability Score", formatScore(metrics.stabilityScore), "/100", ">= 75"],
    ["Mobility Score", formatScore(metrics.mobilityScore), "/100", ">= 75"],
    ["Symmetry Score", formatScore(metrics.symmetryScore), "/100", ">= 75"],
    ["Rhythm Score", formatScore(metrics.rhythmScore), "/100", ">= 75"],
    ["Automaticity Score", formatScore(metrics.automaticityScore), "/100", ">= 75"],
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
  ];

  return csvLines.join("\n");
}

/**
 * Converts continuous frame time-series kinematics into CSV format.
 * Safely formats numbers and handles alternate property aliases.
 */
export function exportTimeSeriesKinematicsAsCsv(
  series?: Array<Partial<GaitMetrics["series"][number]>> | GaitMetrics["series"]
): string {
  const headers = [
    "Timestamp_s",
    "MidHip_X",
    "MidHip_Y",
    "LeftAnkle_Y",
    "RightAnkle_Y",
    "LeftWrist_X",
    "RightWrist_X",
    "LeftKnee_Angle_Deg",
    "RightKnee_Angle_Deg",
  ];

  const formatNum = (val: number | null | undefined, digits: number): string =>
    val != null && !Number.isNaN(val) ? val.toFixed(digits) : "";

  const rows = (series || []).map((pt) => [
    formatNum(pt?.t, 4),
    formatNum(pt?.midHipX, 4),
    formatNum(pt?.midHipY, 4),
    formatNum(pt?.leftAnkleY, 4),
    formatNum(pt?.rightAnkleY, 4),
    formatNum(pt?.leftWristX, 4),
    formatNum(pt?.rightWristX, 4),
    formatNum(pt?.leftKneeAngle ?? pt?.kneeAngleLeft, 2),
    formatNum(pt?.rightKneeAngle ?? pt?.kneeAngleRight, 2),
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map((r) => r.join(",")),
  ];

  return csvLines.join("\n");
}

/**
 * Triggers a browser download of text content with a given filename and MIME type.
 * Safely exits when window or document is undefined (SSR environment).
 */
export function downloadBlob(content: string, filename: string, mimeType: string = "text/plain") {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
