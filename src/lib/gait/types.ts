import type { GaitEvent } from "./events";
import type { DTEAnalysis } from "./dte";

export type ViewAngle = "sagittal" | "frontal" | "oblique" | "unknown";

export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

export type PoseFrame = {
  timeMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

export type TrackedPerson = {
  id: number;
  color: string;
  sampleBox: { x: number; y: number; w: number; h: number };
  sampleFrameIndex: number;
  frameCount: number;
};

/** How the user labeled the recording protocol. */
export type TaskMode = "single" | "dual";

export interface ReliabilityBounds {
  value: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  splitHalfDiff: number | null;
  se?: number | null;
  half1?: number | null;
  half2?: number | null;
}

export type GaitMetrics = {
  viewAngle: ViewAngle;
  viewConfidence: number;
  durationSec: number;
  fpsEffective: number;
  stepCount: number;
  cadenceSpm: number;
  avgStepTimeSec: number;
  stepTimeAsymmetry: number;
  strideAsymmetry: number | null;
  lateralSway: number | null;
  verticalBounce: number;
  armSwingLeft: number;
  armSwingRight: number;
  armSwingAsymmetry: number;
  kneeFlexLeft: number | null;
  kneeFlexRight: number | null;
  kneeAsymmetry: number | null;
  stepWidthVariability: number | null;
  doubleSupportHint: number;
  /** Zeni Gait Phase Breakdown (Stance % and Swing %) — null in frontal view */
  leftStancePct?: number | null;
  rightStancePct?: number | null;
  leftSwingPct?: number | null;
  rightSwingPct?: number | null;
  doubleSupportPct?: number | null;
  /** Zifchock Symmetry Angle (SA) in % [0, 50]% (0% = perfect symmetry) */
  symmetryAngle?: number | null;
  /** Trunk Harmonic Ratios via FFT */
  harmonicRatioVertical?: number | null;
  harmonicRatioLateral?: number | null;
  harmonicRatio?: number | null;
  /** Coefficient of variation of step intervals (std/mean) — key research marker. */
  stepTimeCV: number;
  /** Same-side stride interval CV when available. */
  strideTimeCV: number;
  /** Mean absolute hip height L–R difference / torso (Trendelenburg-ish proxy) — null in sagittal view. */
  pelvicObliquity: number | null;
  /** Variability of pelvic obliquity over time — null in sagittal view. */
  pelvicObliquityVar: number | null;
  /** Mean step width / torso — null in sagittal view. */
  meanStepWidth: number | null;
  /** Relative path smoothness 0–1 (1 = smooth linear progress). */
  pathSmoothness: number;
  /** 95% Confidence intervals from split-half reliability testing */
  confidenceIntervals?: Record<string, ReliabilityBounds>;
  /** Secondary exploratory composite scores (demoted, non-diagnostic) */
  stabilityScore: number;
  rhythmScore: number;
  symmetryScore: number;
  mobilityScore: number;
  /** Research-style composite from variability + sway (not a clinical scale). */
  automaticityScore: number;
  overallScore: number;
  series: {
    t: number;
    midHipX: number;
    midHipY: number;
    leftAnkleY: number;
    rightAnkleY: number;
    leftWristX: number;
    rightWristX: number;
    leftKneeAngle: number;
    rightKneeAngle: number;
  }[];
  /** Classified gait events (Heel Strike & Toe Off) with side and timestamp */
  stepEvents: GaitEvent[];
};

export type GuessSeverity = "low" | "moderate" | "elevated";

export type GuessCategory =
  | "stability"
  | "symmetry"
  | "neuromotor"
  | "pain"
  | "general"
  | "view"
  | "variability"
  | "cognitive_adjacent"
  | "pattern";

export type EducatedGuess = {
  id: string;
  title: string;
  summary: string;
  evidence: string[];
  confidence: number;
  severity: GuessSeverity;
  category: GuessCategory;
  /** Research / clinical pattern language tag (soft). */
  patternTag?: string;
  alternatives?: string[];
};

export type DualTaskCost = {
  cadenceCostPct: number;
  stepTimeCvCostPct: number;
  stabilityCostPts: number;
  automaticityCostPts: number;
  summary: string;
  /** Standardized DTE metrics (Plummer & Eskes 2015, Kelly et al. 2010) */
  cadenceDTE?: number;
  stepTimeCvDTE?: number;
  symmetryDTE?: number;
  cmiClassification?: DTEAnalysis["cmiClassification"];
};

export type AnalysisResult = {
  metrics: GaitMetrics;
  guesses: EducatedGuess[];
  personId: number;
  analyzedFrames: number;
  notes: string[];
  taskMode: TaskMode;
  dualTaskCost?: DualTaskCost;
};

export type AnalysisProgress = {
  stage: "loading_model" | "scanning" | "analyzing" | "done" | "error";
  progress: number;
  message: string;
};

/** Static ladder content for the UI. */
export type DeterminationLayer = {
  id: string;
  title: string;
  can: string[];
  cannot: string[];
};
