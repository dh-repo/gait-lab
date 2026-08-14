import type { GaitMetrics, AnalysisResult, PatientMetadata, TaskMode, EducatedGuess } from "@/lib/gait/types";
import type { GaitAngleAnalysis } from "@/lib/gait/angles";
import type { DualTaskCost } from "@/lib/gait/types";

export type DisclosureTier = "level1_patient" | "level2_biomechanics" | "level3_specialist";

export interface TierConfig {
  id: DisclosureTier;
  levelNumber?: 1 | 2 | 3;
  label: string;
  badge: string;
  shortBadge?: string;
  description: string;
  targetAudience: string;
}

export const DISCLOSURE_TIERS: Record<DisclosureTier, TierConfig> = {
  level1_patient: {
    id: "level1_patient",
    levelNumber: 1,
    label: "Patient Overview",
    badge: "Friendly",
    shortBadge: "Friendly",
    description: "Visual 3D avatar, simplified movement scores, and home exercises.",
    targetAudience: "Family members, caregivers, and wellness review",
  },
  level2_biomechanics: {
    id: "level2_biomechanics",
    levelNumber: 2,
    label: "Biomechan Waveforms",
    badge: "Provider",
    shortBadge: "Provider",
    description: "Joint angle curves, Perry 8-phase cycle breakdown, symmetry angles, and spatio-temporal table.",
    targetAudience: "PTs, prosthetists, and providers",
  },
  level3_specialist: {
    id: "level3_specialist",
    levelNumber: 3,
    label: "Specialist Workstation",
    badge: "Advanced",
    shortBadge: "Advanced",
    description: "Baker GPS / MAP profile, 3D camera homography calibration, and raw export tools.",
    targetAudience: "Doctors, surgeons, and team",
  },
};

export const DEFAULT_TIERS: TierConfig[] = Object.values(DISCLOSURE_TIERS);

export type TakeawayType = "positive" | "warning" | "info";

export interface TakeawayItem {
  id: string;
  type: TakeawayType;
  title?: string;
  text: string;
  laymanExplanation: string;
  domain?: "pace" | "symmetry" | "smoothness" | "posture" | "fallrisk" | "cognitive";
  metricReference?: string;
}

export type ReadinessClassification = "Excellent" | "Good" | "Fair" | "Needs Attention";

export interface MobilitySummaryData {
  overallScore: number;
  readinessLabel: ReadinessClassification;
  readinessTone?: "success" | "info" | "warn" | "danger";
  readinessDescription?: string;
  symmetryScore: number;
  smoothnessScore: number;
  paceScore: number;
  cadenceSpm?: number;
  speedMps?: number | null;
  stepTimeCVPct?: number;
  symmetryAnglePct?: number | null;
  fallRiskScore?: number;
  confidenceScore?: number;
  stepCount?: number;
  strideCount?: number;
  dualTaskEffectPct?: number | null;
  keyTakeaways?: any[];
  takeaways?: any[];
}

/**
 * Calculates human-centered mobility summary and converts dense telemetry
 * into approachable layman takeaways.
 */
export function deriveMobilitySummaryData(
  metrics: GaitMetrics,
  angleAnalysis?: GaitAngleAnalysis,
  guesses?: EducatedGuess[],
  dualTaskCost?: DualTaskCost,
): MobilitySummaryData {
  const pace = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        metrics.mobilityScore != null && metrics.mobilityScore !== 80
          ? metrics.mobilityScore
          : metrics.overallScore != null && metrics.overallScore < 50
            ? metrics.overallScore - 8
            : 70
      )
    )
  );

  const symmetry = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        metrics.symmetryScore ??
          (metrics.symmetryAngle != null
            ? Math.max(0, 100 - metrics.symmetryAngle * 3)
            : 80)
      )
    )
  );

  const smoothness = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        metrics.stabilityScore ??
          (metrics.pathSmoothness
            ? metrics.pathSmoothness * 100
            : 75)
      )
    )
  );

  let overall: number;
  if (metrics.overallScore != null) {
    overall = Math.max(0, Math.min(100, Math.round(metrics.overallScore)));
  } else {
    overall = Math.max(
      0,
      Math.min(100, Math.round(pace * 0.35 + symmetry * 0.35 + smoothness * 0.30))
    );
  }

  let readinessLabel: ReadinessClassification = "Good";
  let readinessTone: "success" | "info" | "warn" | "danger" = "success";
  let readinessDescription = "Generally favorable locomotion and stable walking mechanics.";

  const forcedLabel = (metrics as any).readinessLabel as ReadinessClassification | undefined;
  if (forcedLabel) {
    readinessLabel = forcedLabel;
    readinessTone =
      forcedLabel === "Excellent"
        ? "success"
        : forcedLabel === "Good"
          ? "info"
          : forcedLabel === "Fair"
            ? "warn"
            : "danger";
  } else if (overall >= 80) {
    readinessLabel = "Excellent";
    readinessTone = "success";
    readinessDescription = "Optimal walking quality, balanced symmetry, and smooth rhythm.";
  } else if (overall >= 60) {
    readinessLabel = "Good";
    readinessTone = "info";
    readinessDescription = "Functional walking pattern with minor variations within normal limits.";
  } else if (overall >= 45 && (metrics.symmetryAngle == null || metrics.symmetryAngle < 10.0)) {
    readinessLabel = "Fair";
    readinessTone = "warn";
    readinessDescription = "Moderate gait deviations or slight asymmetry detected. Review recommended exercises.";
  } else {
    readinessLabel = "Needs Attention";
    readinessTone = "danger";
    readinessDescription = "Notable asymmetry, variability, or reduced walking pace observed. Consultation advised.";
  }

  const takeaways: TakeawayItem[] = [];

  // 1. Cadence & Pace takeaway
  const cadence = metrics.cadenceSpm ?? 100;
  if (cadence >= 100 && cadence <= 125) {
    takeaways.push({
      id: "pace-optimal",
      type: "positive",
      title: "Healthy Walking Cadence",
      text: "Walking speed and step tempo are within normal active range.",
      laymanExplanation: "Your walking tempo is steady and supports smooth daily endurance.",
      domain: "pace",
      metricReference: "Active Tempo",
    });
  } else if (cadence < 95) {
    takeaways.push({
      id: "pace-slow",
      type: "warning",
      title: "Reduced Walking Cadence",
      text: "Walking tempo is below typical brisk baseline.",
      laymanExplanation: "A slower walking pace can indicate cautious stepping or lower limb muscle fatigue.",
      domain: "pace",
      metricReference: `${cadence.toFixed(0)} spm`,
    });
  }

  // 2. Symmetry takeaway
  const sa = metrics.symmetryAngle;
  if (sa != null && sa < 5.0) {
    takeaways.push({
      id: "symmetry-balanced",
      type: "positive",
      title: "Balanced Left-Right Symmetry",
      text: "Both limbs show equal step distribution within the normal balanced zone.",
      laymanExplanation: "Both legs are sharing the walking effort evenly, minimizing joint stress.",
      domain: "symmetry",
      metricReference: "Balanced SA",
    });
  } else if (sa != null && sa >= 5.0) {
    takeaways.push({
      id: "symmetry-asymmetric",
      type: "warning",
      title: "Side-to-Side Asymmetry Detected",
      text: "Step distribution indicates unequal step timing or joint motion between limbs.",
      laymanExplanation: "One leg is spending slightly more time bearing weight than the other.",
      domain: "symmetry",
      metricReference: "Asymmetric SA",
    });
  }

  // 3. Smoothness / Rhythm takeaway
  const cvPct = (metrics.stepTimeCV ?? 0) * 100;
  if (cvPct < 3.5) {
    takeaways.push({
      id: "smoothness-consistent",
      type: "positive",
      title: "Consistent Step Timing",
      text: `Step time variability is ${cvPct.toFixed(1)}%, demonstrating strong rhythmic consistency.`,
      laymanExplanation: "Every step follows a predictable rhythm, reflecting stable balance control.",
      domain: "smoothness",
      metricReference: `CV: ${cvPct.toFixed(1)}%`,
    });
  } else if (cvPct > 0) {
    takeaways.push({
      id: "smoothness-variable",
      type: "info",
      title: "Step Rhythm Variation",
      text: `Step time variability is ${cvPct.toFixed(1)}%.`,
      laymanExplanation: "Some variation between consecutive steps was observed.",
      domain: "smoothness",
      metricReference: `CV: ${cvPct.toFixed(1)}%`,
    });
  }

  // 4. Knee Angle takeaway if angle analysis present
  if (angleAnalysis && !angleAnalysis.isSuppressed && angleAnalysis.metrics) {
    const kneeAsym = angleAnalysis.metrics.kneeAsymmetryPct;
    if (kneeAsym != null && kneeAsym > 10) {
      takeaways.push({
        id: "knee-asymmetry",
        type: "warning",
        title: "Knee Bend Difference",
        text: `Knee range of motion asymmetry is ${kneeAsym.toFixed(1)}%.`,
        laymanExplanation: "One knee bends slightly more than the other while swinging forward.",
        domain: "posture",
        metricReference: `Knee Asymmetry: ${kneeAsym.toFixed(1)}%`,
      });
    }
  }

  // 5. Dual-Task takeaway
  let dualTaskEffectPct: number | null = null;
  if (dualTaskCost && dualTaskCost.cadenceCostPct != null) {
    dualTaskEffectPct = dualTaskCost.cadenceCostPct;
    if (Math.abs(dualTaskEffectPct) > 5) {
      takeaways.push({
        id: "dual-task-cost",
        type: "info",
        title: "Cognitive Load Effect",
        text: `Dual-tasking altered walking cadence by ${dualTaskEffectPct.toFixed(1)}%.`,
        laymanExplanation: "Walking while thinking simultaneously slightly adjusted your natural walking rhythm.",
        domain: "cognitive",
        metricReference: `DTE: ${dualTaskEffectPct.toFixed(1)}%`,
      });
    }
  }

  return {
    overallScore: overall,
    readinessLabel,
    readinessTone,
    readinessDescription,
    symmetryScore: symmetry,
    smoothnessScore: smoothness,
    paceScore: pace,
    cadenceSpm: cadence,
    speedMps: metrics.gaitSpeedMps ?? null,
    symmetryAnglePct: sa ?? null,
    stepTimeCVPct: cvPct,
    stepCount: metrics.stepCount ?? 0,
    keyTakeaways: takeaways,
    takeaways,
  };
}

export const deriveMobilitySummary = deriveMobilitySummaryData;
