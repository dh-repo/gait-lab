// Module Barrel: src/lib/gait/index.ts

// Core Types
export * from "./types";

// Fall Risk & Anomaly Predictive Engine Core
export {
  computeFallRiskModelA,
  computeFallRiskModelB,
  evaluatePredictiveAgreement,
  computePatientBaseline,
  detectAcuteWeaknessAnomalies,
} from "./fallrisk";

// Analysis Coordinator (avoiding BiometricSignature duplicate export collision)
export {
  detectViewAngle,
  computeGaitMetrics,
  computeBiometricSignature,
  biometricDistance,
  humanLikenessScore,
  isLikelyHumanTrack,
  matchPeople,
  mergeFragmentedTracks,
  trackPriorityScore,
  tracksToPeople,
  computeDualTaskCost,
  analyzeGait,
  type PersonTrack,
} from "./analysis";

// Joint Kinematics & 2D Angles
export * from "./angles";

// Kinematic Gait Events
export * from "./events";

// Zifchock Symmetry Angle & Inter-Limb Asymmetry
export * from "./symmetry";

// Dual-Task Effect & Cognitive-Motor Interference
export * from "./dte";

// Educated Guesses & Determination Ladder
export * from "./guesses";

// Persistence Layer & Patient Historical Sessions
export * from "./persistence";

// Functional Ratings & Clinical Scoring
export * from "./ratings";

// Digital Signal Processing & Butterworth Filtering (avoiding LandmarkFrame duplicate export collision)
export {
  olsDetrend,
  butterworthLowPass,
  zeroPhaseButterworth,
  savitzkyGolay5,
  kalmanFilter1D,
  smoothPoseFrames,
} from "./signal";

// MediaPipe Geometry & Landmark Utilities
export * from "./landmarks";

// Floor Calibration & Scaling
export * from "./calibration";

// 2D Planar Homography
export * from "./homography";

// Pose Landmarker Loading & Fallbacks
export * from "./pose";

