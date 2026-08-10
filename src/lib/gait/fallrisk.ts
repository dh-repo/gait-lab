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
  kinematicsScore: number; // 0–100 (weight 0.30 default / 0.40 single-task)
  kinematics: number;
  trunkSwayScore: number; // 0–100 (weight 0.25 default / 0.33 single-task)
  trunkSway: number;
  dteScore: number | null; // 0–100 (weight 0.25 default / 0.00 single-task)
  dualTaskCost: number | null;
  variabilityScore: number; // 0–100 (weight 0.20 default / 0.27 single-task)
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
 * Model A: CDC STEADI / Tinetti Clinical Cutoffs
 * Evaluates gait speed (<0.80 m/s), step time CV (>6.0% / 0.06), double support time (>35.0%),
 * and Zifchock symmetry angle (>10.0%).
 * Dynamically handles null/missing metrics (e.g. frontal view clips) without throwing errors or returning NaN.
 */
export function computeFallRiskModelA(metrics: GaitMetrics): FallRiskModelAResult {
  // Extract or estimate gait speed (m/s)
  const rawSpeed = (metrics as { gaitSpeedMps?: number | null; gaitSpeed?: number | null; speed?: number | null }).gaitSpeedMps ??
                   (metrics as { gaitSpeed?: number | null; speed?: number | null }).gaitSpeed ??
                   (metrics as { speed?: number | null }).speed;
  let gaitSpeedMps: number | null = null;

  if (rawSpeed !== undefined && rawSpeed !== null && !isNaN(rawSpeed)) {
    gaitSpeedMps = rawSpeed;
  } else if (metrics.cadenceSpm && metrics.cadenceSpm > 0) {
    // Standard biomechanical estimate: speed (m/s) = cadence * 0.012 m/s per spm
    gaitSpeedMps = Number((metrics.cadenceSpm * 0.012).toFixed(2));
  } else if (metrics.series && metrics.series.length > 1) {
    const first = metrics.series[0];
    const last = metrics.series[metrics.series.length - 1];
    const dt = last.t - first.t;
    if (dt > 0) {
      const dx = last.midHipX - first.midHipX;
      const dy = last.midHipY - first.midHipY;
      const distImg = Math.sqrt(dx * dx + dy * dy);
      const distMeters = distImg * 1.7; // Adult height scaling proxy
      gaitSpeedMps = Number((distMeters / dt).toFixed(2));
    }
  }

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

  // 1. Gait Speed Cutoff (<0.80 m/s high risk)
  let gaitSpeedRisk = false;
  if (gaitSpeedMps !== null && !isNaN(gaitSpeedMps)) {
    evaluatedCount++;
    if (gaitSpeedMps < 0.80) {
      gaitSpeedRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (gaitSpeedMps < 1.00) {
      points += 0.5;
    }
  }

  // 2. Step Time CV Cutoff (>6.0%)
  let stepTimeCvRisk = false;
  if (stepTimeCvPct !== null && !isNaN(stepTimeCvPct)) {
    evaluatedCount++;
    if (stepTimeCvPct > 6.0) {
      stepTimeCvRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (stepTimeCvPct > 4.0) {
      points += 0.5;
    }
  }

  // 3. Double Support Time Cutoff (>35.0%)
  let doubleSupportRisk = false;
  if (doubleSupportPct !== null && !isNaN(doubleSupportPct)) {
    evaluatedCount++;
    if (doubleSupportPct > 35.0) {
      doubleSupportRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (doubleSupportPct > 25.0) {
      points += 0.5;
    }
  }

  // 4. Symmetry Angle Cutoff (>10.0%)
  let symmetryRisk = false;
  if (symmetryAnglePct !== null && !isNaN(symmetryAnglePct)) {
    evaluatedCount++;
    if (symmetryAnglePct > 10.0) {
      symmetryRisk = true;
      breachedCount++;
      points += 1.0;
    } else if (symmetryAnglePct > 5.0) {
      points += 0.5;
    }
  }

  const score = evaluatedCount > 0 ? Math.round(clamp((points / evaluatedCount) * 100, 0, 100)) : 0;

  let category: FallRiskCategory = "low";
  if (breachedCount >= 3 || (gaitSpeedRisk && breachedCount >= 2) || score >= 66) {
    category = "high";
  } else if (breachedCount === 2 || (breachedCount === 1 && (gaitSpeedRisk || stepTimeCvRisk || doubleSupportRisk)) || (score >= 33 && score < 66)) {
    category = "moderate";
  } else {
    category = "low";
  }

  const reasons: string[] = [];
  if (gaitSpeedRisk) reasons.push(`Slow gait speed (${gaitSpeedMps?.toFixed(2)} m/s < 0.80 m/s threshold)`);
  if (stepTimeCvRisk) reasons.push(`High step time variability (${stepTimeCvPct.toFixed(1)}% > 6.0% threshold)`);
  if (doubleSupportRisk) reasons.push(`Elevated double support phase (${doubleSupportPct?.toFixed(1)}% > 35.0% threshold)`);
  if (symmetryRisk) reasons.push(`Significant gait asymmetry (Zifchock SA = ${symmetryAnglePct?.toFixed(1)}% > 10.0% threshold)`);
  if (reasons.length === 0) reasons.push("All CDC STEADI gait parameters within normal clinical bounds");

  const clinicalSummary = `Model A (CDC STEADI): ${category.toUpperCase()} fall risk (${breachedCount}/${evaluatedCount} criteria breached, score ${score}/100). ${reasons.join(". ")}.`;

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
 * Combines joint kinematics, trunk sway, dual-task cost (DTE), and spatio-temporal variability.
 * Supports single-task re-normalization (40% kinematics, 33% trunk sway, 27% variability) when dualTaskCost is absent.
 * Uses frontal view fallback (pelvic obliquity variance & vertical bounce amplitude) when joint flexion is suppressed.
 * Risk mapping: <30 low, 30–60 moderate, >=60 high.
 */
export function computeFallRiskModelB(
  metrics: GaitMetrics,
  dualTaskCost?: DualTaskCost,
  angleAnalysis?: GaitAngleAnalysis,
  cameraView?: "sagittal" | "frontal" | "follow_cam" | string,
): FallRiskModelBResult {
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

  // Domain weights:
  // Dual-Task mode: Kinematics 30%, Trunk Sway 25%, DTE 25%, Variability 20%
  // Single-Task mode: Kinematics 40%, Trunk Sway ~33.3%, DTE 0%, Variability ~26.7%
  let wKinematics = 0.30;
  let wTrunkSway = 0.25;
  let wDte = 0.25;
  let wVariability = 0.20;

  if (isSingleTaskRenormalized) {
    wKinematics = 0.40;
    wTrunkSway = 1 / 3; // 0.3333333333333333
    wDte = 0.00;
    wVariability = 4 / 15; // 0.26666666666666666
  }

  // Sub-Score 1: Kinematics (0–100)
  let kinematicsScore = 0;
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

    const dKnee = Math.max(0, (55.0 - kneeRom) / 55.0) * 100;
    const dHip = Math.max(0, (35.0 - hipRom) / 35.0) * 100;
    const dAnkle = Math.max(0, (25.0 - ankleRom) / 25.0) * 100;

    kinematicsScore = clamp(0.50 * dKnee + 0.30 * dHip + 0.20 * dAnkle, 0, 100);
  } else {
    // Frontal view / missing joint angles fallback: pelvic obliquity variance & vertical bounce amplitude
    isFrontalFallback = true;
    const pelvicVar = metrics.pelvicObliquityVar ?? (metrics.pelvicObliquity !== null ? Math.pow(metrics.pelvicObliquity, 2) : 0.02);
    const vertBounce = metrics.verticalBounce ?? 0.03;

    const dPelvicVar = clamp((pelvicVar / 0.08) * 100, 0, 100);
    const dVertBounce = clamp(((vertBounce - 0.02) / (0.08 - 0.02)) * 100, 0, 100);

    kinematicsScore = clamp(0.60 * dPelvicVar + 0.40 * dVertBounce, 0, 100);
  }

  // Sub-Score 2: Trunk Sway (0–100)
  const sway = metrics.lateralSway ?? (metrics.verticalBounce ? metrics.verticalBounce * 0.5 : 0.04);
  const trunkSwayScore = clamp(((sway - 0.05) / (0.15 - 0.05)) * 100, 0, 100);

  // Sub-Score 3: Dual-Task Cost DTE (0–100)
  let dteScore: number | null = null;
  if (isDualTask && dualTaskCost) {
    const cadenceCost = Math.max(0, dualTaskCost.cadenceDTE !== undefined ? -dualTaskCost.cadenceDTE : Math.abs(dualTaskCost.cadenceCostPct ?? 0));
    const cvCost = Math.max(0, dualTaskCost.stepTimeCvDTE !== undefined ? -dualTaskCost.stepTimeCvDTE : Math.abs(dualTaskCost.stepTimeCvCostPct ?? 0));
    const costMax = Math.max(cadenceCost, cvCost);
    dteScore = clamp((costMax / 20.0) * 100, 0, 100);
  }

  // Sub-Score 4: Spatio-Temporal Variability (0–100)
  const rawCv = metrics.stepTimeCV ?? 0;
  const cvPct = rawCv > 0 && rawCv <= 1.0 ? rawCv * 100 : rawCv;
  const variabilityScore = clamp(((cvPct - 3.0) / (8.0 - 3.0)) * 100, 0, 100);

  const compositeScore = Number(
    clamp(
      wKinematics * kinematicsScore +
        wTrunkSway * trunkSwayScore +
        wDte * (dteScore ?? 0) +
        wVariability * variabilityScore,
      0,
      100,
    ).toFixed(1),
  );

  let category: FallRiskCategory = "low";
  if (compositeScore >= 60.0) {
    category = "high";
  } else if (compositeScore >= 30.0) {
    category = "moderate";
  } else {
    category = "low";
  }

  const reasons: string[] = [];
  if (kinematicsScore > 50) reasons.push(isFrontalFallback ? `High pelvic obliquity & vertical bounce variation (${Math.round(kinematicsScore)}/100)` : `Joint flexion ROM deficit (${Math.round(kinematicsScore)}/100)`);
  if (trunkSwayScore > 50) reasons.push(`Excessive lateral trunk sway (${Math.round(trunkSwayScore)}/100)`);
  if (dteScore !== null && dteScore > 50) reasons.push(`Substantial Dual-Task Cost DTE deficit (${Math.round(dteScore)}/100)`);
  if (variabilityScore > 50) reasons.push(`Elevated step time variability (${Math.round(variabilityScore)}/100)`);
  if (reasons.length === 0) reasons.push("All multi-domain kinematic and postural stability scores within normal limits");

  const clinicalSummary = `Model B (Composite Index): ${category.toUpperCase()} fall risk (score ${compositeScore.toFixed(1)}/100). Mode: ${isDualTask ? "Dual-Task" : "Single-Task (Re-normalized)"}${isFrontalFallback ? " [Frontal Fallback]" : ""}. Key factors: ${reasons.join(". ")}.`;

  return {
    compositeScore,
    score: compositeScore,
    category,
    isDualTask,
    isSingleTaskRenormalized,
    isFrontalFallback,
    subScores: {
      kinematicsScore: Math.round(kinematicsScore),
      kinematics: Math.round(kinematicsScore),
      trunkSwayScore: Math.round(trunkSwayScore),
      trunkSway: Math.round(trunkSwayScore),
      dteScore: dteScore !== null ? Math.round(dteScore) : null,
      dualTaskCost: dteScore !== null ? Math.round(dteScore) : null,
      variabilityScore: Math.round(variabilityScore),
      variability: Math.round(variabilityScore),
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

  // Linear weighted agreement (k = 3 categories, max dist = 2)
  const po = 1 - distance / 2;
  const percentageAgreement = Number((po * 100).toFixed(1));

  let pe = 1 / 3; // Default uniform chance prior (0.3333)

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
      divergenceFactors.push("Model B using frontal view fallback metrics (pelvic obliquity & vertical bounce)");
    }
    if (modelA.flags.gaitSpeedRisk && modelB.subScores.kinematics < 40) {
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
    const speed = (m as { gaitSpeedMps?: number; gaitSpeed?: number; speed?: number }).gaitSpeedMps ??
                  (m as { gaitSpeed?: number; speed?: number }).gaitSpeed ??
                  (m as { speed?: number }).speed ??
                  (m.cadenceSpm ? m.cadenceSpm * 0.012 : 1.1);
    const cv = m.stepTimeCV < 1.0 && m.stepTimeCV > 0 ? m.stepTimeCV * 100 : m.stepTimeCV;
    const sway = m.lateralSway ?? (m.verticalBounce ? m.verticalBounce * 0.5 : 0.04);
    const sym = m.symmetryAngle ?? m.stepTimeAsymmetry ?? 2.5;
    const ds = m.doubleSupportPct ?? (m.doubleSupportHint ? m.doubleSupportHint * 100 : 22.0);

    speeds.push(speed);
    cadences.push(m.cadenceSpm || 110);
    cvs.push(cv);
    sways.push(sway);
    symmetries.push(sym);
    doubleSupports.push(ds);
  }

  const calcStats = (vals: number[], normStdRatio = 0.15): MetricBaselineStats => {
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

  const rawSpeed = (currentMetrics as { gaitSpeedMps?: number; gaitSpeed?: number; speed?: number }).gaitSpeedMps ??
                   (currentMetrics as { gaitSpeed?: number; speed?: number }).gaitSpeed ??
                   (currentMetrics as { speed?: number }).speed;
  const currentSpeed = rawSpeed ?? (currentMetrics.cadenceSpm ? currentMetrics.cadenceSpm * 0.012 : 1.1);
  const currentCv = currentMetrics.stepTimeCV < 1.0 && currentMetrics.stepTimeCV > 0 ? currentMetrics.stepTimeCV * 100 : currentMetrics.stepTimeCV;
  const currentSway = currentMetrics.lateralSway ?? (currentMetrics.verticalBounce ? currentMetrics.verticalBounce * 0.5 : 0.04);
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
  const bSway = baseline.metrics.lateralSway;
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
