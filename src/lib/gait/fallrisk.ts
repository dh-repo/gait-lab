import type { GaitMetrics, DualTaskCost } from "./types";
import type { GaitAngleAnalysis } from "./angles";
import type { GaitSessionRecord } from "./persistence";

export type FallRiskCategory = "low" | "moderate" | "high";
export type RiskCategory = "low" | "moderate" | "high";

// ==========================================
// R1: Dual Fall Risk Predictive Engine Types
// ==========================================

export interface FallRiskModelAFlags {
  gaitSpeedRisk: boolean;
  stepTimeCvRisk: boolean;
  doubleSupportRisk: boolean;
  symmetryRisk: boolean;
}

export interface FallRiskModelAFlagValues {
  gaitSpeedMps: number | null;
  stepTimeCvPct: number;
  doubleSupportPct: number | null;
  symmetryAnglePct: number | null;
}

export interface FallRiskModelAResult {
  score: number; // 0–100 continuous score
  category: FallRiskCategory;
  points: number; // STEADI risk points (0.0 – 4.0)
  breachedCount: number;
  evaluatedCount: number;
  flags: FallRiskModelAFlags;
  flagValues: FallRiskModelAFlagValues;
  clinicalSummary: string;
  reasons: string[];
  cutoffsMet: {
    slowSpeed: boolean;       // gaitSpeed < 0.8 m/s
    highStepTimeCV: boolean;  // stepTimeCV > 6%
    highDoubleSupport: boolean; // doubleSupportPct > 35%
    highAsymmetry: boolean;   // symmetryAngle > 10%
  };
  metricsEvaluated: {
    gaitSpeed: number | null;
    stepTimeCV: number;
    doubleSupportPct?: number | null;
    symmetryAngle?: number | null;
  };
}

export interface FallRiskModelBSubScores {
  kinematicsScore: number | null; // 0–100 continuous score or null if unevaluated
  kinematics: number;
  trunkSwayScore: number | null; // 0–100 continuous score or null if unevaluated
  trunkSway: number;
  dteScore: number | null; // 0–100 or null if single-task
  dualTaskCost: number | null;
  variabilityScore: number; // 0–100
  variability: number;
}

export interface FallRiskModelBWeights {
  kinematics: number;
  trunkSway: number;
  dte: number;
  dualTaskCost: number;
  variability: number;
}

export interface FallRiskModelBResult {
  compositeScore: number; // 0–100 continuous multi-domain risk score
  score: number;
  category: FallRiskCategory;
  isDualTask: boolean;
  isSingleTaskRenormalized: boolean;
  isFrontalFallback: boolean;
  subScores: FallRiskModelBSubScores;
  weights: FallRiskModelBWeights;
  clinicalSummary: string;
  reasons: string[];
}

export type AgreementClassification = "concordant" | "mild_divergence" | "stark_divergence";
export type AgreementStatus = AgreementClassification;

export interface PredictiveAgreementResult {
  cohenKappa: number; // -1.0 to 1.0
  cohensKappa: number;
  percentageAgreement: number; // 0.0 to 100.0 (%)
  percentAgreement: number;
  classification: AgreementClassification;
  alignmentStatus: AgreementClassification;
  modelACategory: FallRiskCategory;
  modelBCategory: FallRiskCategory;
  scoreDifference: number;
  summary: string;
  divergenceExplanation: string;
  divergenceFactors: string[];
}

export interface FallRiskAnalysis {
  modelA: FallRiskModelAResult;
  modelB: FallRiskModelBResult;
  agreement: PredictiveAgreementResult;
  activeModelToggle: "modelA" | "modelB" | "comparison";
  timestamp: string;
}

// ==================================================
// R2: Acute Weakness & Anomaly Detector Types
// ==================================================

export interface MetricBaselineStats {
  mean: number;
  std: number;
  sampleCount: number;
}

export interface PatientBaseline {
  patientId: string;
  sessionCount: number;
  lastUpdated: string;
  isLowConfidenceBaseline: boolean;
  metrics: {
    gaitSpeed: MetricBaselineStats;
    cadenceSpm: MetricBaselineStats;
    stepTimeCV: MetricBaselineStats;
    lateralSway: MetricBaselineStats;
    symmetryAngle: MetricBaselineStats;
    doubleSupportPct: MetricBaselineStats;
  };
}

export type AcuteSpikeRuleId =
  | "SPEED_DROP_ACUTE"
  | "SWAY_SPIKE_ACUTE"
  | "IRREGULARITY_BURST_ACUTE"
  | "DOUBLE_SUPPORT_ESCALATION"
  | "ASYMMETRY_SPIKE_ACUTE";

export interface AcuteDeteriorationFlag {
  ruleId: AcuteSpikeRuleId;
  metricName: string;
  currentValue: number;
  baselineValue: number;
  percentChange: number;
  zScore: number;
  thresholdBreached: string;
  clinicalSignificance: string;
}

export type CardSeverity = "critical" | "warning" | "info";

export interface ClinicalWarningCard {
  id: string;
  severity: CardSeverity;
  title: string;
  primaryFlag: string;
  detectedAnomalies: AcuteDeteriorationFlag[];
  differentialDiagnoses: string[];
  providerRecommendations: string[];
}

export interface AcuteWeaknessAnomalyResult {
  hasAcuteWeakness: boolean;
  deteriorationScore: number; // 0–100 severity
  spikeFlags: AcuteDeteriorationFlag[];
  warningCards: ClinicalWarningCard[];
  baselineUsed: PatientBaseline | null;
}

// Helper to clamp a number to [min, max]
function clamp(val: number, min: number, max: number): number {
  if (isNaN(val)) return min;
  return Math.min(max, Math.max(min, val));
}

/**
 * Requirement R10 Item 1: Height-adjusted and step-length-based gait speed proxy calculation.
 * Replaces hardcoded `cadence * 0.012` with:
 * 1. Height-adjusted formula `(cadence * (0.414 * heightMeters) * 2) / 60` when patient height is available.
 * 2. Step length formula `(cadence * stepLength * 2) / 60` when step length is available.
 * 3. Trajectory series tracking fallback.
 * 4. Cadence proxy with default adult height (1.70m) when only cadence is available.
 */
export function estimateGaitSpeed(
  metrics: GaitMetrics,
  patientMeta?: { age?: number; heightCm?: number } | any
): number | null {
  const rawSpeed = (metrics as { gaitSpeedMps?: number | null; gaitSpeed?: number | null; speed?: number | null }).gaitSpeedMps ??
                   (metrics as { gaitSpeed?: number | null; speed?: number | null }).gaitSpeed ??
                   (metrics as { speed?: number | null }).speed;
  if (rawSpeed !== undefined && rawSpeed !== null && !isNaN(rawSpeed) && rawSpeed > 0) {
    return Number(rawSpeed.toFixed(2));
  }

  const cadence = metrics.cadenceSpm;
  const hasCadence = cadence !== undefined && cadence !== null && !isNaN(cadence) && cadence > 0;

  const age = patientMeta?.age ?? (metrics as any).age ?? (metrics as any).patientAge;

  const heightMeters = (patientMeta?.heightCm ? patientMeta.heightCm / 100 : null) ??
                       (metrics as any).heightMeters ??
                       ((metrics as any).heightCm ? (metrics as any).heightCm / 100 : null) ??
                       ((metrics as any).patientHeight ? (metrics as any).patientHeight / 100 : null) ??
                       ((metrics as any).height ? ((metrics as any).height > 3 ? (metrics as any).height / 100 : (metrics as any).height) : null);

  const stepLength = metrics.stepLength ??
                     ((metrics.stepLengthLeft && metrics.stepLengthRight) ? (metrics.stepLengthLeft + metrics.stepLengthRight) / 2 : (metrics.stepLengthLeft ?? metrics.stepLengthRight ?? null));

  if (hasCadence && heightMeters !== null && heightMeters > 0 && !isNaN(heightMeters)) {
    const estStepLen = 0.414 * heightMeters;
    const speed = (cadence * estStepLen * 2) / 60;
    return Number(speed.toFixed(2));
  }

  if (hasCadence && stepLength !== null && stepLength > 0 && !isNaN(stepLength)) {
    const speed = (cadence * stepLength * 2) / 60;
    return Number(speed.toFixed(2));
  }

  // Age-stratified median stature when explicit height is not recorded (CDC/WHO growth charts)
  let defaultHeight = 1.70;
  if (age !== undefined && age !== null && !isNaN(age)) {
    if (age <= 5) defaultHeight = 1.10;
    else if (age <= 7) defaultHeight = 1.22;
    else if (age <= 10) defaultHeight = 1.38;
    else if (age <= 12) defaultHeight = 1.50;
    else if (age <= 14) defaultHeight = 1.62;
  }

  if (metrics.series && metrics.series.length > 1) {
    const first = metrics.series[0];
    const last = metrics.series[metrics.series.length - 1];
    const dt = last.t - first.t;
    if (dt > 0) {
      const dx = last.midHipX - first.midHipX;
      const dy = last.midHipY - first.midHipY;
      const distImg = Math.sqrt(dx * dx + dy * dy);
      const distMeters = distImg * defaultHeight;
      if (distMeters > 0) {
        return Number((distMeters / dt).toFixed(2));
      }
    }
  }

  if (hasCadence) {
    const speed = (cadence * (0.414 * defaultHeight) * 2) / 60;
    return Number(speed.toFixed(2));
  }

  return null;
}

/**
 * Model A: CDC STEADI / Tinetti Clinical Cutoffs with Pediatric Developmental Stratification
 * Evaluates gait speed (<0.80 m/s adult), step time CV (>6.0% adult), double support time (>35.0%),
 * and Zifchock symmetry angle (>10.0%).
 * Pediatric individuals (<18yo) utilize Sutherland (1988) and Hausdorff (1999) developmental normatives.
 */
export function computeFallRiskModelA(
  metrics: GaitMetrics,
  patientMeta?: { age?: number; sex?: string; heightCm?: number } | any
): FallRiskModelAResult {
  const age = patientMeta?.age ?? (metrics as any).age ?? (metrics as any).patientAge;
  const isPediatric = age !== undefined && age !== null && !isNaN(age) && age < 18;

  const gaitSpeedMps = estimateGaitSpeed(metrics, patientMeta);

  // Extract Step Time CV (%)
  const rawCv = metrics.stepTimeCV ?? 0;
  const stepTimeCvPct = rawCv > 0 && rawCv <= 1.0 ? rawCv * 100 : rawCv;

  // Extract Double Support Time (%) — null in frontal view clips
  const doubleSupportPct = metrics.viewAngle === "frontal" ? null : (metrics.doubleSupportPct ?? (metrics.doubleSupportHint !== undefined && metrics.doubleSupportHint !== null && !isNaN(metrics.doubleSupportHint) ? metrics.doubleSupportHint * 100 : null));

  // Extract Symmetry Angle (%) — null in frontal view when explicitly suppressed
  const symmetryAnglePct = metrics.symmetryAngle ?? (metrics.viewAngle !== "frontal" && metrics.stepTimeAsymmetry !== undefined && metrics.stepTimeAsymmetry !== null ? (metrics.stepTimeAsymmetry <= 1.0 ? metrics.stepTimeAsymmetry * 100 : metrics.stepTimeAsymmetry) : null);

  let evaluatedCount = 0;
  let breachedCount = 0;
  let points = 0;

  // Age-stratified thresholds
  let speedSlowCutoff = 0.80;
  let speedWarnCutoff = 1.00;
  let cvHighCutoff = 6.0;
  let cvModCutoff = 4.0;
  let dsHighCutoff = 35.0;
  let dsModCutoff = 25.0;
  let symHighCutoff = 10.0;
  let symModCutoff = 5.0;

  if (isPediatric) {
    if (age <= 6) {
      speedSlowCutoff = 0.45;
      speedWarnCutoff = 0.60;
      cvHighCutoff = 12.0;
      cvModCutoff = 8.5;
      dsHighCutoff = 42.0;
      dsModCutoff = 32.0;
    } else if (age <= 10) {
      speedSlowCutoff = 0.55;
      speedWarnCutoff = 0.75;
      cvHighCutoff = 9.5;
      cvModCutoff = 7.0;
      dsHighCutoff = 40.0;
      dsModCutoff = 30.0;
    } else if (age <= 14) {
      speedSlowCutoff = 0.65;
      speedWarnCutoff = 0.85;
      cvHighCutoff = 8.0;
      cvModCutoff = 6.0;
      dsHighCutoff = 38.0;
      dsModCutoff = 28.0;
    } else {
      speedSlowCutoff = 0.75;
      speedWarnCutoff = 0.95;
      cvHighCutoff = 6.5;
      cvModCutoff = 4.5;
      dsHighCutoff = 35.0;
      dsModCutoff = 25.0;
    }
  }

  // 1. Gait Speed Cutoff
  let gaitSpeedRisk = false;
  if (gaitSpeedMps !== null && !isNaN(gaitSpeedMps)) {
    evaluatedCount++;
    if (gaitSpeedMps < speedSlowCutoff) {
      gaitSpeedRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (gaitSpeedMps < speedWarnCutoff) {
      points += 0.5;
    }
  }

  // 2. Step Time CV Cutoff
  let stepTimeCvRisk = false;
  if (stepTimeCvPct !== null && !isNaN(stepTimeCvPct)) {
    evaluatedCount++;
    if (stepTimeCvPct > cvHighCutoff) {
      stepTimeCvRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (stepTimeCvPct > cvModCutoff) {
      points += 0.5;
    }
  }

  // 3. Double Support Time Cutoff
  let doubleSupportRisk = false;
  if (doubleSupportPct !== null && !isNaN(doubleSupportPct)) {
    evaluatedCount++;
    if (doubleSupportPct > dsHighCutoff) {
      doubleSupportRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (doubleSupportPct > dsModCutoff) {
      points += 0.5;
    }
  }

  // 4. Symmetry Angle Cutoff
  let symmetryRisk = false;
  if (symmetryAnglePct !== null && !isNaN(symmetryAnglePct)) {
    evaluatedCount++;
    if (symmetryAnglePct > symHighCutoff) {
      symmetryRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (symmetryAnglePct > symModCutoff) {
      points += 0.5;
    }
  }

  let score = evaluatedCount > 0 ? Math.round(clamp((points / evaluatedCount) * 100, 0, 100)) : 0;

  // Requirement R10 Item 2: Dynamic threshold by evaluatedCount
  const highRiskBreachThreshold = Math.ceil(0.6 * evaluatedCount);
  const modRiskBreachThreshold = Math.ceil(0.3 * evaluatedCount);

  let category: FallRiskCategory = "low";
  if (isPediatric) {
    // In pediatric populations without acute neuromuscular pathology, geriatric STEADI fall risk is non-applicable
    if (symmetryRisk && symmetryAnglePct !== null && symmetryAnglePct > 18.0) {
      category = "moderate";
      score = Math.min(score, 40);
    } else {
      category = "low";
      score = Math.min(score, 15);
    }
  } else if (
    evaluatedCount > 0 &&
    (breachedCount >= highRiskBreachThreshold || (gaitSpeedRisk && breachedCount >= Math.max(1, highRiskBreachThreshold - 1)) || score >= 66)
  ) {
    category = "high";
  } else if (
    evaluatedCount > 0 &&
    (breachedCount >= modRiskBreachThreshold || (breachedCount >= 1 && (gaitSpeedRisk || stepTimeCvRisk || doubleSupportRisk)) || (score >= 33 && score < 66))
  ) {
    category = "moderate";
  } else {
    category = "low";
  }

  const reasons: string[] = [];
  if (isPediatric) {
    reasons.push(`Pediatric Developmental Profile (Age ${age}): Evaluated against pediatric normatives (Sutherland 1988, Hausdorff 1999)`);
    if (gaitSpeedRisk) reasons.push(`Gait speed below developmental cutoff (${gaitSpeedMps?.toFixed(2)} m/s < ${speedSlowCutoff} m/s)`);
    if (stepTimeCvRisk) reasons.push(`Step variability above developmental threshold (${stepTimeCvPct.toFixed(1)}% > ${cvHighCutoff}%)`);
    if (symmetryRisk) reasons.push(`Bilateral asymmetry (SA = ${symmetryAnglePct?.toFixed(1)}% > 10.0%)`);
    if (!gaitSpeedRisk && !stepTimeCvRisk && !doubleSupportRisk && !symmetryRisk) {
      reasons.push("All developmental gait parameters within normal pediatric bounds (Zero geriatric fall risk)");
    }
  } else {
    if (gaitSpeedRisk) reasons.push(`Slow gait speed (${gaitSpeedMps?.toFixed(2)} m/s < 0.80 m/s threshold)`);
    if (stepTimeCvRisk) reasons.push(`High step time variability (${stepTimeCvPct.toFixed(1)}% > 6.0% threshold)`);
    if (doubleSupportRisk) reasons.push(`Elevated double support phase (${doubleSupportPct?.toFixed(1)}% > 35.0% threshold)`);
    if (symmetryRisk) reasons.push(`Significant gait asymmetry (Zifchock SA = ${symmetryAnglePct?.toFixed(1)}% > 10.0% threshold)`);
    if (reasons.length === 0) reasons.push("All CDC STEADI gait parameters within normal clinical bounds");
  }

  const clinicalSummary = isPediatric
    ? `Pediatric Assessment (Age ${age}): LOW fall risk (${breachedCount}/${evaluatedCount} criteria flagged, developmental score ${score}/100). Developmental normatives applied (Sutherland 1988, Hausdorff 1999). Geriatric CDC STEADI cutoffs are non-applicable.`
    : `Model A (CDC STEADI): ${category.toUpperCase()} fall risk (${breachedCount}/${evaluatedCount} criteria breached, score ${score}/100). ${reasons.join(". ")}.`;

  return {
    score,
    category,
    points: Number(points.toFixed(1)),
    breachedCount,
    evaluatedCount,
    flags: {
      gaitSpeedRisk,
      stepTimeCvRisk,
      doubleSupportRisk,
      symmetryRisk,
    },
    flagValues: {
      gaitSpeedMps,
      stepTimeCvPct: Number(stepTimeCvPct.toFixed(2)),
      doubleSupportPct: doubleSupportPct !== null ? Number(doubleSupportPct.toFixed(2)) : null,
      symmetryAnglePct: symmetryAnglePct !== null ? Number(symmetryAnglePct.toFixed(2)) : null,
    },
    clinicalSummary,
    reasons,
    cutoffsMet: {
      slowSpeed: gaitSpeedRisk,
      highStepTimeCV: stepTimeCvRisk,
      highDoubleSupport: doubleSupportRisk,
      highAsymmetry: symmetryRisk,
    },
    metricsEvaluated: {
      gaitSpeed: gaitSpeedMps,
      stepTimeCV: Number(stepTimeCvPct.toFixed(2)),
      doubleSupportPct,
      symmetryAngle: symmetryAnglePct,
    },
  };
}

/**
 * Model B: Dynamic Multi-Factor Composite Index (0–100 Weighted Score)
 * Requirement R10 Item 3: Exclude missing metrics from sub-score calculation and re-normalize weights.
 * Requirement R10 Item 4: Do not substitute vertical bounce for lateral sway (orthogonal planes Y vs X) — mark as unevaluated.
 */
export function computeFallRiskModelB(
  metrics: GaitMetrics,
  dualTaskCost?: DualTaskCost,
  angleAnalysis?: GaitAngleAnalysis,
  cameraView?: "sagittal" | "frontal" | "follow_cam" | string,
  patientMeta?: { age?: number; sex?: string; heightCm?: number } | any
): FallRiskModelBResult {
  const age = patientMeta?.age ?? (metrics as any).age ?? (metrics as any).patientAge;
  const isPediatric = age !== undefined && age !== null && !isNaN(age) && age < 18;

  const effectiveView = cameraView || metrics.viewAngle;
  const isFrontal =
    effectiveView === "frontal" ||
    metrics.viewAngle === "frontal" ||
    Boolean(angleAnalysis?.isSuppressed);

  const isDualTask =
    dualTaskCost !== undefined &&
    dualTaskCost !== null &&
    (Math.abs(dualTaskCost.cadenceCostPct ?? 0) > 0 ||
      Math.abs(dualTaskCost.stepTimeCvCostPct ?? 0) > 0 ||
      dualTaskCost.cadenceDTE !== undefined ||
      dualTaskCost.stepTimeCvDTE !== undefined ||
      dualTaskCost.cmiClassification !== undefined);

  const isSingleTaskRenormalized = !isDualTask;

  // Sub-Score 1: Kinematics (0–100 or null if unevaluated)
  let kinematicsScore: number | null = null;
  let isFrontalFallback = false;

  const hasJointAngleMetrics = angleAnalysis && !angleAnalysis.isSuppressed && (angleAnalysis.metrics || (angleAnalysis as any).jointROM);

  if (!isFrontal && hasJointAngleMetrics) {
    const romMetrics: any = angleAnalysis.metrics || (angleAnalysis as any).jointROM || {};
    const kneeRom = romMetrics.kneeRomLeft && romMetrics.kneeRomRight
      ? (romMetrics.kneeRomLeft + romMetrics.kneeRomRight) / 2
      : romMetrics.kneeRomLeft || romMetrics.kneeRomRight || romMetrics.kneeFlexion || 45;
    const hipRom = romMetrics.hipRomLeft && romMetrics.hipRomRight
      ? (romMetrics.hipRomLeft + romMetrics.hipRomRight) / 2
      : romMetrics.hipRomLeft || romMetrics.hipRomRight || romMetrics.hipFlexion || 30;
    const ankleRom = romMetrics.ankleRomLeft && romMetrics.ankleRomRight
      ? (romMetrics.ankleRomLeft + romMetrics.ankleRomRight) / 2
      : romMetrics.ankleRomLeft || romMetrics.ankleRomRight || romMetrics.ankleFlexion || 20;

    const targetKnee = isPediatric ? 50.0 : 55.0;
    const targetHip = isPediatric ? 32.0 : 35.0;
    const targetAnkle = isPediatric ? 22.0 : 25.0;

    const dKnee = Math.max(0, (targetKnee - kneeRom) / targetKnee) * 100;
    const dHip = Math.max(0, (targetHip - hipRom) / targetHip) * 100;
    const dAnkle = Math.max(0, (targetAnkle - ankleRom) / targetAnkle) * 100;

    kinematicsScore = clamp(0.50 * dKnee + 0.30 * dHip + 0.20 * dAnkle, 0, 100);
  } else {
    // Frontal view / missing joint angles fallback
    isFrontalFallback = true;
    const pelvicVar = metrics.pelvicObliquityVar;
    if (pelvicVar !== null && pelvicVar !== undefined && !isNaN(pelvicVar)) {
      const dPelvicVar = clamp((pelvicVar / (isPediatric ? 0.12 : 0.08)) * 100, 0, 100);
      kinematicsScore = dPelvicVar;
    } else {
      kinematicsScore = null;
    }
  }

  // Sub-Score 2: Trunk Sway (0–100 or null if unevaluated)
  let trunkSwayScore: number | null = null;
  if (angleAnalysis?.trunkSway) {
    const latDeg = angleAnalysis.trunkSway.lateralExcursionDeg;
    trunkSwayScore = clamp(((latDeg - 3.0) / (12.0 - 3.0)) * 100, 0, 100);
  } else if (metrics.lateralSway !== null && metrics.lateralSway !== undefined && !isNaN(metrics.lateralSway)) {
    const swayMax = isPediatric ? 0.18 : 0.15;
    trunkSwayScore = clamp(((metrics.lateralSway - 0.05) / (swayMax - 0.05)) * 100, 0, 100);
  } else {
    trunkSwayScore = null;
  }

  // Sub-Score 3: Dual-Task Cost DTE (0–100 or null if single-task)
  let dteScore: number | null = null;
  if (isDualTask && dualTaskCost) {
    const cadenceCost = Math.max(0, dualTaskCost.cadenceDTE !== undefined ? -dualTaskCost.cadenceDTE : Math.abs(dualTaskCost.cadenceCostPct ?? 0));
    const cvCost = Math.max(0, dualTaskCost.stepTimeCvDTE !== undefined ? -dualTaskCost.stepTimeCvDTE : Math.abs(dualTaskCost.stepTimeCvCostPct ?? 0));
    const costMax = Math.max(cadenceCost, cvCost);
    dteScore = clamp((costMax / 20.0) * 100, 0, 100);
  }

  // Sub-Score 4: Spatio-Temporal Variability (0–100 or null if unevaluated)
  let variabilityScore: number | null = null;
  const rawCv = metrics.stepTimeCV;
  if (rawCv !== null && rawCv !== undefined && !isNaN(rawCv)) {
    const cvPct = rawCv > 0 && rawCv <= 1.0 ? rawCv * 100 : rawCv;
    const cvBase = isPediatric ? (age <= 10 ? 5.0 : 4.0) : 3.0;
    const cvMax = isPediatric ? (age <= 10 ? 11.0 : 9.0) : 8.0;
    variabilityScore = clamp(((cvPct - cvBase) / (cvMax - cvBase)) * 100, 0, 100);
  }

  // Requirement R10 Item 3: Dynamic weight re-normalization excluding missing/unevaluated domains
  const baseWeights = {
    kinematics: 0.30,
    trunkSway: 0.25,
    dte: isDualTask ? 0.25 : 0.00,
    variability: 0.20,
  };

  const isKinValid = kinematicsScore !== null;
  const isSwayValid = trunkSwayScore !== null;
  const isDteValid = dteScore !== null;
  const isVarValid = variabilityScore !== null;

  const validWeightSum =
    (isKinValid ? baseWeights.kinematics : 0) +
    (isSwayValid ? baseWeights.trunkSway : 0) +
    (isDteValid ? baseWeights.dte : 0) +
    (isVarValid ? baseWeights.variability : 0);

  const wKinematics = isKinValid && validWeightSum > 0 ? baseWeights.kinematics / validWeightSum : 0;
  const wTrunkSway = isSwayValid && validWeightSum > 0 ? baseWeights.trunkSway / validWeightSum : 0;
  const wDte = isDteValid && validWeightSum > 0 ? baseWeights.dte / validWeightSum : 0;
  const wVariability = isVarValid && validWeightSum > 0 ? baseWeights.variability / validWeightSum : 0;

  let rawCompositeScore = validWeightSum > 0
    ? Number(
        clamp(
          wKinematics * (kinematicsScore ?? 0) +
            wTrunkSway * (trunkSwayScore ?? 0) +
            wDte * (dteScore ?? 0) +
            wVariability * (variabilityScore ?? 0),
          0,
          100,
        ).toFixed(1),
      )
    : 0;

  let compositeScore = rawCompositeScore;
  let category: FallRiskCategory = "low";

  if (isPediatric) {
    // In pediatric populations without acute neurological asymmetry, scale composite score to pediatric low
    compositeScore = Number(Math.min(rawCompositeScore * 0.4, 20).toFixed(1));
    category = "low";
  } else if (compositeScore >= 60.0) {
    category = "high";
  } else if (compositeScore >= 30.0) {
    category = "moderate";
  } else {
    category = "low";
  }

  const reasons: string[] = [];
  if (isPediatric) {
    reasons.push(`Pediatric Developmental Profile (Age ${age}): Evaluated against pediatric developmental motor normatives`);
    if (kinematicsScore !== null && kinematicsScore > 60) reasons.push("Joint range of motion variation");
    if (trunkSwayScore !== null && trunkSwayScore > 60) reasons.push("Trunk lateral sway variation");
    if (reasons.length === 1) reasons.push("All evaluated developmental kinematic and postural stability scores within normal limits");
  } else {
    if (kinematicsScore !== null && kinematicsScore > 50) reasons.push(isFrontalFallback ? `High pelvic obliquity variation (${Math.round(kinematicsScore)}/100)` : `Joint flexion ROM deficit (${Math.round(kinematicsScore)}/100)`);
    if (trunkSwayScore !== null && trunkSwayScore > 50) reasons.push(`Excessive lateral trunk sway (${Math.round(trunkSwayScore)}/100)`);
    if (dteScore !== null && dteScore > 50) reasons.push(`Substantial Dual-Task Cost DTE deficit (${Math.round(dteScore)}/100)`);
    if (variabilityScore !== null && variabilityScore > 50) reasons.push(`Elevated step time variability (${Math.round(variabilityScore)}/100)`);
    if (reasons.length === 0) reasons.push("All evaluated multi-domain kinematic and postural stability scores within normal limits");
  }

  const clinicalSummary = isPediatric
    ? `Model B (Composite Index): LOW fall risk (score ${compositeScore.toFixed(1)}/100, Age ${age}). Pediatric developmental normatives applied.`
    : `Model B (Composite Index): ${category.toUpperCase()} fall risk (score ${compositeScore.toFixed(1)}/100). Mode: ${isDualTask ? "Dual-Task" : "Single-Task (Re-normalized)"}${isFrontalFallback ? " [Frontal Fallback]" : ""}. Key factors: ${reasons.join(". ")}.`;

  return {
    compositeScore,
    score: compositeScore,
    category,
    isDualTask,
    isSingleTaskRenormalized,
    isFrontalFallback,
    subScores: {
      kinematicsScore: kinematicsScore !== null ? Math.round(kinematicsScore) : null,
      kinematics: kinematicsScore !== null ? Math.round(kinematicsScore) : 0,
      trunkSwayScore: trunkSwayScore !== null ? Math.round(trunkSwayScore) : null,
      trunkSway: trunkSwayScore !== null ? Math.round(trunkSwayScore) : 0,
      dteScore: dteScore !== null ? Math.round(dteScore) : null,
      dualTaskCost: dteScore !== null ? Math.round(dteScore) : null,
      variabilityScore: variabilityScore !== null ? Math.round(variabilityScore) : 0,
      variability: variabilityScore !== null ? Math.round(variabilityScore) : 0,
    },
    weights: {
      kinematics: Number(wKinematics.toFixed(2)),
      trunkSway: Number(wTrunkSway.toFixed(2)),
      dte: Number(wDte.toFixed(2)),
      dualTaskCost: Number(wDte.toFixed(2)),
      variability: Number(wVariability.toFixed(2)),
    },
    clinicalSummary,
    reasons,
  };
}

/**
 * Evaluates predictive agreement between Model A and Model B using Cohen's Kappa (κ) and Percentage Agreement (Pa).
 * Ordinal categories: low=0, moderate=1, high=2.
 * Categorizes agreement into "concordant" (κ >= 0.6 or exact match), "mild_divergence" (0.2 <= κ < 0.6), "stark_divergence" (κ < 0.2).
 */
export function evaluatePredictiveAgreement(
  modelA: FallRiskModelAResult,
  modelB: FallRiskModelBResult,
  historicalSessions?: GaitSessionRecord[],
): PredictiveAgreementResult {
  const categoryRank: Record<FallRiskCategory, number> = {
    low: 0,
    moderate: 1,
    high: 2,
  };

  const rankA = categoryRank[modelA.category];
  const rankB = categoryRank[modelB.category];
  const distance = Math.abs(rankA - rankB);

  const po = 1 - distance / 2;
  const percentageAgreement = Number((po * 100).toFixed(1));

  let pe = 1 / 3;

  if (historicalSessions && historicalSessions.length >= 3) {
    let lowA = 0, modA = 0, highA = 0;
    let lowB = 0, modB = 0, highB = 0;
    const n = historicalSessions.length;

    for (const session of historicalSessions) {
      const mA = computeFallRiskModelA(session.metricsJson);
      const mB = computeFallRiskModelB(session.metricsJson, session.dualTaskJson, session.angleAnalysisJson);
      if (mA.category === "low") lowA++;
      else if (mA.category === "moderate") modA++;
      else highA++;

      if (mB.category === "low") lowB++;
      else if (mB.category === "moderate") modB++;
      else highB++;
    }

    pe = (lowA / n) * (lowB / n) + (modA / n) * (modB / n) + (highA / n) * (highB / n);
  }

  let rawKappa = 1.0;
  if (distance === 0) {
    rawKappa = 1.0;
  } else if (pe < 1.0) {
    rawKappa = (po - pe) / (1 - pe);
  }

  const cohenKappa = Number(rawKappa.toFixed(3));
  const scoreDifference = Number(Math.abs(modelA.score - modelB.score).toFixed(1));

  let classification: AgreementClassification = "concordant";
  if (distance === 0 || cohenKappa >= 0.6) {
    classification = "concordant";
  } else if (cohenKappa >= 0.2) {
    classification = "mild_divergence";
  } else {
    classification = "stark_divergence";
  }

  const divergenceFactors: string[] = [];
  if (distance > 0) {
    if (modelB.isSingleTaskRenormalized) {
      divergenceFactors.push("Model B operating in single-task re-normalized mode (DTE weighted 0%)");
    }
    if (modelB.isFrontalFallback) {
      divergenceFactors.push("Model B using frontal view fallback metrics (pelvic obliquity)");
    }
    if (modelA.flags.gaitSpeedRisk && (modelB.subScores.kinematicsScore ?? 0) < 40) {
      divergenceFactors.push("Model A triggered STEADI slow gait speed cutoff (<0.8m/s) while Model B kinematics subscore remains low");
    }
    if (modelB.subScores.dteScore !== null && modelB.subScores.dteScore > 60 && !modelA.flags.stepTimeCvRisk) {
      divergenceFactors.push("Model B detected severe Dual-Task Cost (DTE) not captured by discrete STEADI cutoffs");
    }
    if (divergenceFactors.length === 0) {
      divergenceFactors.push(`Model A cutoff-based category (${modelA.category}) differs from Model B composite index category (${modelB.category})`);
    }
  }

  const summary =
    classification === "concordant"
      ? `High predictive agreement (κ=${cohenKappa}, Pa=${percentageAgreement}%). Both models categorize patient as ${modelA.category} fall risk.`
      : classification === "mild_divergence"
      ? `Mild inter-model divergence (κ=${cohenKappa}, Pa=${percentageAgreement}%). Model A indicates ${modelA.category} risk while Model B indicates ${modelB.category} risk.`
      : `Stark inter-model divergence (κ=${cohenKappa}, Pa=${percentageAgreement}%). Model A indicates ${modelA.category} risk vs Model B ${modelB.category} risk. Clinical review recommended.`;

  return {
    cohenKappa,
    cohensKappa: cohenKappa,
    percentageAgreement,
    percentAgreement: percentageAgreement,
    classification,
    alignmentStatus: classification,
    modelACategory: modelA.category,
    modelBCategory: modelB.category,
    scoreDifference,
    summary,
    divergenceExplanation: summary,
    divergenceFactors,
  };
}

/**
 * Computes patient historical baseline statistics across K sessions.
 * Handled fallback for K=1 and K=0.
 */
export function computePatientBaseline(
  historicalSessions: GaitSessionRecord[],
  patientId: string = "patient_default",
): PatientBaseline {
  const K = historicalSessions.length;

  if (K === 0) {
    return {
      patientId,
      sessionCount: 0,
      lastUpdated: new Date().toISOString(),
      isLowConfidenceBaseline: true,
      metrics: {
        gaitSpeed: { mean: 1.10, std: 0.15, sampleCount: 0 },
        cadenceSpm: { mean: 110.0, std: 10.0, sampleCount: 0 },
        stepTimeCV: { mean: 3.5, std: 0.8, sampleCount: 0 },
        lateralSway: { mean: 0.04, std: 0.01, sampleCount: 0 },
        symmetryAngle: { mean: 2.5, std: 0.8, sampleCount: 0 },
        doubleSupportPct: { mean: 22.0, std: 3.0, sampleCount: 0 },
      },
    };
  }

  const speeds: number[] = [];
  const cadences: number[] = [];
  const cvs: number[] = [];
  const sways: number[] = [];
  const symmetries: number[] = [];
  const doubleSupports: number[] = [];

  for (const s of historicalSessions) {
    const m = s.metricsJson;
    const speed = estimateGaitSpeed(m) ?? 1.10;
    const cv = m.stepTimeCV < 1.0 && m.stepTimeCV > 0 ? m.stepTimeCV * 100 : m.stepTimeCV;
    const sym = m.symmetryAngle ?? m.stepTimeAsymmetry ?? 2.5;
    const ds = m.doubleSupportPct ?? (m.doubleSupportHint ? m.doubleSupportHint * 100 : 22.0);

    speeds.push(speed);
    cadences.push(m.cadenceSpm || 110);
    cvs.push(cv);
    if (m.lateralSway !== null && m.lateralSway !== undefined && !isNaN(m.lateralSway)) {
      sways.push(m.lateralSway);
    }
    symmetries.push(sym);
    doubleSupports.push(ds);
  }

  const calcStats = (vals: number[], normStdRatio = 0.15): MetricBaselineStats => {
    if (vals.length === 0) {
      return { mean: 0.04, std: 0.01, sampleCount: 0 };
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    let std = 0;
    if (vals.length >= 2) {
      const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (vals.length - 1);
      std = Math.sqrt(variance);
    } else {
      std = Math.max(0.01, mean * normStdRatio);
    }
    const flooredStd = Math.max(std, Math.abs(mean * 0.05), 0.01);
    return {
      mean: Number(mean.toFixed(3)),
      std: Number(flooredStd.toFixed(3)),
      sampleCount: vals.length,
    };
  };

  return {
    patientId,
    sessionCount: K,
    lastUpdated: historicalSessions[0]?.createdAt || new Date().toISOString(),
    isLowConfidenceBaseline: K < 2,
    metrics: {
      gaitSpeed: calcStats(speeds, 0.15),
      cadenceSpm: calcStats(cadences, 0.10),
      stepTimeCV: calcStats(cvs, 0.20),
      lateralSway: calcStats(sways, 0.20),
      symmetryAngle: calcStats(symmetries, 0.25),
      doubleSupportPct: calcStats(doubleSupports, 0.15),
    },
  };
}

/**
 * Detects acute neuromuscular & metabolic weakness anomalies by comparing current session metrics
 * against longitudinal patient baseline across 5 specific deterioration rules.
 */
export function detectAcuteWeaknessAnomalies(
  currentMetrics: GaitMetrics,
  baseline: PatientBaseline,
  assessmentCondition?: string,
): AcuteWeaknessAnomalyResult {
  const spikeFlags: AcuteDeteriorationFlag[] = [];

  const currentSpeed = estimateGaitSpeed(currentMetrics) ?? 1.1;
  const currentCv = currentMetrics.stepTimeCV < 1.0 && currentMetrics.stepTimeCV > 0 ? currentMetrics.stepTimeCV * 100 : currentMetrics.stepTimeCV;
  const currentSway = currentMetrics.lateralSway;
  const currentDs = currentMetrics.doubleSupportPct ?? (currentMetrics.doubleSupportHint ? currentMetrics.doubleSupportHint * 100 : 22.0);
  const currentSym = currentMetrics.symmetryAngle ?? currentMetrics.stepTimeAsymmetry ?? 2.5;

  const isSlowWalkProtocol = assessmentCondition === "slow_walk";

  // Rule 1: SPEED_DROP_ACUTE (>20% drop OR Z < -2.0, AND speed < 0.85 m/s)
  const bSpeed = baseline.metrics.gaitSpeed;
  const speedPctChange = ((currentSpeed - bSpeed.mean) / bSpeed.mean) * 100;
  const speedZScore = bSpeed.std > 0 ? (currentSpeed - bSpeed.mean) / bSpeed.std : 0;

  if (
    !isSlowWalkProtocol &&
    (speedPctChange <= -20.0 || speedZScore <= -2.0) &&
    currentSpeed < 0.85
  ) {
    spikeFlags.push({
      ruleId: "SPEED_DROP_ACUTE",
      metricName: "gaitSpeed",
      currentValue: Number(currentSpeed.toFixed(2)),
      baselineValue: Number(bSpeed.mean.toFixed(2)),
      percentChange: Number(speedPctChange.toFixed(1)),
      zScore: Number(speedZScore.toFixed(2)),
      thresholdBreached: "Gait speed drop >20% below baseline with absolute speed <0.85 m/s",
      clinicalSignificance: "Indicates acute systemic motor fatigue, infectious response, or acute lethargy.",
    });
  }

  // Rule 2: SWAY_SPIKE_ACUTE (>30% spike OR Z > +2.5, AND sway > 0.08)
  // Requirement R10 Item 4: Only evaluated when lateralSway is non-null
  const bSway = baseline.metrics.lateralSway;
  if (currentSway !== null && currentSway !== undefined && !isNaN(currentSway) && bSway.sampleCount > 0) {
    const swayPctChange = ((currentSway - bSway.mean) / bSway.mean) * 100;
    const swayZScore = bSway.std > 0 ? (currentSway - bSway.mean) / bSway.std : 0;

    if ((swayPctChange >= 30.0 || swayZScore >= 2.5) && currentSway > 0.08) {
      spikeFlags.push({
        ruleId: "SWAY_SPIKE_ACUTE",
        metricName: "lateralSway",
        currentValue: Number(currentSway.toFixed(3)),
        baselineValue: Number(bSway.mean.toFixed(3)),
        percentChange: Number(swayPctChange.toFixed(1)),
        zScore: Number(swayZScore.toFixed(2)),
        thresholdBreached: "Lateral sway spike >30% above baseline with absolute sway >0.08",
        clinicalSignificance: "Indicates acute cerebellar ataxia, severe hyponatremia/electrolyte imbalance, or acute delirium.",
      });
    }
  }

  // Rule 3: IRREGULARITY_BURST_ACUTE (>50% step CV jump AND CV > 7.0%)
  const bCv = baseline.metrics.stepTimeCV;
  const cvPctChange = ((currentCv - bCv.mean) / bCv.mean) * 100;
  const cvZScore = bCv.std > 0 ? (currentCv - bCv.mean) / bCv.std : 0;

  if (cvPctChange >= 50.0 && currentCv > 7.0) {
    spikeFlags.push({
      ruleId: "IRREGULARITY_BURST_ACUTE",
      metricName: "stepTimeCV",
      currentValue: Number(currentCv.toFixed(1)),
      baselineValue: Number(bCv.mean.toFixed(1)),
      percentChange: Number(cvPctChange.toFixed(1)),
      zScore: Number(cvZScore.toFixed(2)),
      thresholdBreached: "Step time CV jump >50% above baseline with absolute CV >7.0%",
      clinicalSignificance: "Indicates encephalopathy, UTI-induced delirium in older adults, or acute motor discoordination.",
    });
  }

  // Rule 4: DOUBLE_SUPPORT_ESCALATION (>25% DST escalation AND DST > 35.0%)
  const bDs = baseline.metrics.doubleSupportPct;
  const dsPctChange = ((currentDs - bDs.mean) / bDs.mean) * 100;
  const dsZScore = bDs.std > 0 ? (currentDs - bDs.mean) / bDs.std : 0;

  if (dsPctChange >= 25.0 && currentDs > 35.0) {
    spikeFlags.push({
      ruleId: "DOUBLE_SUPPORT_ESCALATION",
      metricName: "doubleSupportPct",
      currentValue: Number(currentDs.toFixed(1)),
      baselineValue: Number(bDs.mean.toFixed(1)),
      percentChange: Number(dsPctChange.toFixed(1)),
      zScore: Number(dsZScore.toFixed(2)),
      thresholdBreached: "Double support time escalation >25% above baseline with absolute DST >35.0%",
      clinicalSignificance: "Indicates severe postural instability, fear of falling, profound orthostatic hypotension, or dehydration.",
    });
  }

  // Rule 5: ASYMMETRY_SPIKE_ACUTE (>4.0% absolute SA increase OR >100% relative increase)
  const bSym = baseline.metrics.symmetryAngle;
  const symAbsChange = currentSym - bSym.mean;
  const symPctChange = ((currentSym - bSym.mean) / bSym.mean) * 100;
  const symZScore = bSym.std > 0 ? (currentSym - bSym.mean) / bSym.std : 0;

  if (symAbsChange >= 4.0 || symPctChange >= 100.0) {
    spikeFlags.push({
      ruleId: "ASYMMETRY_SPIKE_ACUTE",
      metricName: "symmetryAngle",
      currentValue: Number(currentSym.toFixed(1)),
      baselineValue: Number(bSym.mean.toFixed(1)),
      percentChange: Number(symPctChange.toFixed(1)),
      zScore: Number(symZScore.toFixed(2)),
      thresholdBreached: "Symmetry angle increase >4.0% absolute or >100% relative above baseline",
      clinicalSignificance: "Indicates acute focal neurological deficit (TIA / acute stroke), acute radiculopathy, or unilateral trauma.",
    });
  }

  // Synthesize Diagnostic Clinical Warning Cards
  const warningCards: ClinicalWarningCard[] = [];
  const hasSpeedDrop = spikeFlags.some(f => f.ruleId === "SPEED_DROP_ACUTE");
  const hasSwaySpike = spikeFlags.some(f => f.ruleId === "SWAY_SPIKE_ACUTE");
  const hasCvBurst = spikeFlags.some(f => f.ruleId === "IRREGULARITY_BURST_ACUTE");
  const hasDstEscalation = spikeFlags.some(f => f.ruleId === "DOUBLE_SUPPORT_ESCALATION");
  const hasAsymmetrySpike = spikeFlags.some(f => f.ruleId === "ASYMMETRY_SPIKE_ACUTE");

  if (hasSpeedDrop && hasDstEscalation) {
    warningCards.push({
      id: "card_uti_sepsis_dehydration",
      severity: "critical",
      title: "Acute Systemic Motor Weakness Warning",
      primaryFlag: `Sudden Gait Speed Collapse (${spikeFlags.find(f => f.ruleId === "SPEED_DROP_ACUTE")?.percentChange}% vs Baseline)`,
      detectedAnomalies: spikeFlags.filter(f => f.ruleId === "SPEED_DROP_ACUTE" || f.ruleId === "DOUBLE_SUPPORT_ESCALATION"),
      differentialDiagnoses: [
        "1. Acute Urinary Tract Infection (UTI)",
        "2. Severe Dehydration / Orthostatic Hypotension",
        "3. Early Sepsis / Systemic Infection",
      ],
      providerRecommendations: [
        "• Urgent Vitals: Temp, BP, HR, SpO2",
        "• Urinalysis & Urine Culture",
        "• Basic Metabolic Panel (Electrolytes, BUN, Cr)",
        "• Assist-of-1 fall precautions",
      ],
    });
  }

  if (hasSwaySpike && hasCvBurst) {
    warningCards.push({
      id: "card_metabolic_delirium",
      severity: "critical",
      title: "Acute Ataxic Delirium / Metabolic Warning",
      primaryFlag: `Severe Lateral Trunk Sway Spike (${spikeFlags.find(f => f.ruleId === "SWAY_SPIKE_ACUTE")?.percentChange}% vs Baseline)`,
      detectedAnomalies: spikeFlags.filter(f => f.ruleId === "SWAY_SPIKE_ACUTE" || f.ruleId === "IRREGULARITY_BURST_ACUTE"),
      differentialDiagnoses: [
        "1. Metabolic Disturbance (Hyponatremia, Hypoglycemia)",
        "2. Medication Toxicity / Adverse Event",
        "3. Acute Delirium / Encephalopathy",
      ],
      providerRecommendations: [
        "• Stat Blood Glucose & BMP",
        "• Medication Audit (Sedatives, Antihypertensives)",
        "• Neurological Examination",
        "• Bedside safety rails",
      ],
    });
  }

  if (hasAsymmetrySpike) {
    warningCards.push({
      id: "card_tia_stroke_asymmetry",
      severity: "warning",
      title: "Acute Asymmetric Motor Deficit Flag",
      primaryFlag: `Sudden Inter-Limb Asymmetry Spike (SA = ${currentSym.toFixed(1)}%)`,
      detectedAnomalies: spikeFlags.filter(f => f.ruleId === "ASYMMETRY_SPIKE_ACUTE"),
      differentialDiagnoses: [
        "1. Transient Ischemic Attack (TIA) / Acute Stroke",
        "2. Acute Focal Radiculopathy",
        "3. Acute Unilateral Joint Pain / Trauma",
      ],
      providerRecommendations: [
        "• Stat NIH Stroke Scale Assessment",
        "• Bilateral Strength & Reflex Exam",
        "• Urgent Neurological Consult",
      ],
    });
  }

  if (hasSpeedDrop && !hasDstEscalation && warningCards.length === 0) {
    warningCards.push({
      id: "card_isolated_speed_drop",
      severity: "warning",
      title: "Sub-Acute Lethargy / Fatigue Warning",
      primaryFlag: `Moderate Speed Decline (${spikeFlags.find(f => f.ruleId === "SPEED_DROP_ACUTE")?.percentChange}% vs Baseline)`,
      detectedAnomalies: spikeFlags.filter(f => f.ruleId === "SPEED_DROP_ACUTE"),
      differentialDiagnoses: [
        "1. Sub-acute infection / malaise",
        "2. Sleep deprivation / fatigue",
        "3. Mild dehydration",
      ],
      providerRecommendations: [
        "• Encourage oral fluid intake",
        "• Re-assess gait in 24 hours",
        "• Monitor temperature",
      ],
    });
  }

  if (warningCards.length === 0) {
    warningCards.push({
      id: "card_baseline_concordant",
      severity: "info",
      title: "Baseline Concordant Gait Profile",
      primaryFlag: "No Acute Motor Anomalies Detected",
      detectedAnomalies: [],
      differentialDiagnoses: ["Normal longitudinal stability"],
      providerRecommendations: ["Continue routine gait monitoring"],
    });
  }

  const hasAcuteWeakness = spikeFlags.length > 0;
  const deteriorationScore = Math.min(100, Math.round(spikeFlags.length * 25));

  return {
    hasAcuteWeakness,
    deteriorationScore,
    spikeFlags,
    warningCards,
    baselineUsed: baseline,
  };
}
