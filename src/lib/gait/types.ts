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

export type GaitMetrics = {
  viewAngle: ViewAngle;
  viewConfidence: number;
  durationSec: number;
  fpsEffective: number;
  stepCount: number;
  cadenceSpm: number;
  avgStepTimeSec: number;
  stepTimeAsymmetry: number;
  strideAsymmetry: number;
  lateralSway: number;
  verticalBounce: number;
  armSwingLeft: number;
  armSwingRight: number;
  armSwingAsymmetry: number;
  kneeFlexLeft: number;
  kneeFlexRight: number;
  kneeAsymmetry: number;
  stepWidthVariability: number;
  doubleSupportHint: number;
  /** Coefficient of variation of step intervals (std/mean) — key research marker. */
  stepTimeCV: number;
  /** Same-side stride interval CV when available. */
  strideTimeCV: number;
  /** Mean absolute hip height L–R difference / torso (Trendelenburg-ish proxy). */
  pelvicObliquity: number;
  /** Variability of pelvic obliquity over time. */
  pelvicObliquityVar: number;
  /** Mean step width / torso. */
  meanStepWidth: number;
  /** Relative path smoothness 0–1 (1 = smooth linear progress). */
  pathSmoothness: number;
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
  stepEvents: { t: number; side: "L" | "R" }[];
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
