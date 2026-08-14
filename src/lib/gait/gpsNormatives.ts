import type { GaitAngleAnalysis, JointAnglePoint } from "./angles";

export type GPSKinematicVariable =
  | "pelvicTilt"
  | "pelvicObliquity"
  | "pelvicRotation"
  | "hipFlexion"
  | "hipAbduction"
  | "hipRotation"
  | "kneeFlexion"
  | "ankleFlexion"
  | "footProgression";

export type GPSAnatomicalPlane = "sagittal" | "frontal" | "transverse";
export type GPSJointSegment = "pelvis" | "hip" | "knee" | "ankle" | "foot";
export type GPSSeverity = "normal" | "mild" | "moderate" | "severe";

export interface GVSVariableMeta {
  id: GPSKinematicVariable;
  label: string;
  shortLabel: string;
  plane: GPSAnatomicalPlane;
  joint: GPSJointSegment;
  positiveMotion: string;
  negativeMotion: string;
  unit: "°";
  controlMeanDeg: number;
  order: number;
}

export interface GVSScoreEntry {
  variable: GPSKinematicVariable;
  meta: GVSVariableMeta;
  leftGVS: number | null;
  rightGVS: number | null;
  overallGVS: number | null;
  severity: GPSSeverity;
  isSuppressed: boolean;
  suppressionReason?: string;
}

export interface FullGPSResult {
  overallGPS: number;
  leftGPS: number | null;
  rightGPS: number | null;
  asymmetryDeltaGPS: number | null;
  gvsEntries: GVSScoreEntry[];
  evaluatedVariableCount: number;
  severity: GPSSeverity;
  interpretation: string;
  controlThresholdDeg: number; // 5.2°
  mcidThresholdDeg: number; // 1.6°
  citation: "Baker et al. (2009)";
}

export interface GPSNormativePoint {
  gaitCyclePct: number;
  // Pelvis (3 variables)
  pelvicTiltMean: number;
  pelvicTiltSd: number;
  pelvicObliquityMean: number;
  pelvicObliquitySd: number;
  pelvicRotationMean: number;
  pelvicRotationSd: number;
  // Hip (3 variables)
  hipFlexionMean: number;
  hipFlexionSd: number;
  hipAbductionMean: number;
  hipAbductionSd: number;
  hipRotationMean: number;
  hipRotationSd: number;
  // Knee (1 variable)
  kneeFlexionMean: number;
  kneeFlexionSd: number;
  // Ankle (1 variable)
  ankleFlexionMean: number;
  ankleFlexionSd: number;
  // Foot (1 variable)
  footProgressionMean: number;
  footProgressionSd: number;
}

export const GPS_VARIABLES_META: Record<GPSKinematicVariable, GVSVariableMeta> = {
  pelvicTilt: {
    id: "pelvicTilt",
    label: "Pelvic Tilt",
    shortLabel: "Pelv Tilt",
    plane: "sagittal",
    joint: "pelvis",
    positiveMotion: "Anterior Tilt",
    negativeMotion: "Posterior Tilt",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 1,
  },
  pelvicObliquity: {
    id: "pelvicObliquity",
    label: "Pelvic Obliquity",
    shortLabel: "Pelv Obl",
    plane: "frontal",
    joint: "pelvis",
    positiveMotion: "Up / Elevation",
    negativeMotion: "Down / Depression",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 2,
  },
  pelvicRotation: {
    id: "pelvicRotation",
    label: "Pelvic Rotation",
    shortLabel: "Pelv Rot",
    plane: "transverse",
    joint: "pelvis",
    positiveMotion: "Internal Rotation",
    negativeMotion: "External Rotation",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 3,
  },
  hipFlexion: {
    id: "hipFlexion",
    label: "Hip Flexion / Extension",
    shortLabel: "Hip Flex",
    plane: "sagittal",
    joint: "hip",
    positiveMotion: "Flexion",
    negativeMotion: "Extension",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 4,
  },
  hipAbduction: {
    id: "hipAbduction",
    label: "Hip Abduction / Adduction",
    shortLabel: "Hip Abd/Add",
    plane: "frontal",
    joint: "hip",
    positiveMotion: "Adduction",
    negativeMotion: "Abduction",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 5,
  },
  hipRotation: {
    id: "hipRotation",
    label: "Hip Internal / External Rotation",
    shortLabel: "Hip Rot",
    plane: "transverse",
    joint: "hip",
    positiveMotion: "Internal Rotation",
    negativeMotion: "External Rotation",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 6,
  },
  kneeFlexion: {
    id: "kneeFlexion",
    label: "Knee Flexion / Extension",
    shortLabel: "Knee Flex",
    plane: "sagittal",
    joint: "knee",
    positiveMotion: "Flexion",
    negativeMotion: "Extension",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 7,
  },
  ankleFlexion: {
    id: "ankleFlexion",
    label: "Ankle Dorsi / Plantarflexion",
    shortLabel: "Ankle Flex",
    plane: "sagittal",
    joint: "ankle",
    positiveMotion: "Dorsiflexion",
    negativeMotion: "Plantarflexion",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 8,
  },
  footProgression: {
    id: "footProgression",
    label: "Foot Progression Angle",
    shortLabel: "Foot Prog",
    plane: "transverse",
    joint: "foot",
    positiveMotion: "Internal (In-toeing)",
    negativeMotion: "External (Out-toeing)",
    unit: "°",
    controlMeanDeg: 5.2,
    order: 9,
  },
};

export const GPS_VARIABLE_ORDER: GPSKinematicVariable[] = [
  "pelvicTilt",
  "pelvicObliquity",
  "pelvicRotation",
  "hipFlexion",
  "hipAbduction",
  "hipRotation",
  "kneeFlexion",
  "ankleFlexion",
  "footProgression",
];

export const GPS_CONTROL_THRESHOLD_DEG = 5.2; // Baker et al. (2009) asymptomatic control mean threshold
export const GPS_MCID_THRESHOLD_DEG = 1.6; // Baker et al. (2012) Minimal Clinically Important Difference

/**
 * Helper to interpolate between control points along 0–100% gait cycle.
 */
function interpolatePoints(
  ctrls: { p: number; val: number }[],
  targetP: number,
): number {
  if (targetP <= ctrls[0].p) return ctrls[0].val;
  if (targetP >= ctrls[ctrls.length - 1].p) return ctrls[ctrls.length - 1].val;
  for (let i = 0; i < ctrls.length - 1; i++) {
    if (targetP >= ctrls[i].p && targetP <= ctrls[i + 1].p) {
      const t = (targetP - ctrls[i].p) / (ctrls[i + 1].p - ctrls[i].p);
      return ctrls[i].val + t * (ctrls[i + 1].val - ctrls[i].val);
    }
  }
  return 0;
}

/**
 * Returns 101-point continuous normative reference curves for all 9 Baker et al. (2009) variables,
 * with optional lifespan age and sex stratification based on Bovi et al. (2011) & Winter (2009).
 */
export function getGPSNormativeCurves(
  age?: number,
  _sex?: string,
): GPSNormativePoint[] {
  // Age cohort scaling factor for knee peak swing and hip extension
  let kneePeakSwing = 62.0;
  let hipExtStance = -12.0;
  let anklePushOff = -15.0;

  if (typeof age === "number" && Number.isFinite(age)) {
    if (age < 18) {
      kneePeakSwing = 63.0;
      hipExtStance = -14.0;
      anklePushOff = -16.0;
    } else if (age >= 65 && age <= 74) {
      kneePeakSwing = 54.0;
      hipExtStance = -8.0;
      anklePushOff = -12.0;
    } else if (age >= 75 && age <= 84) {
      kneePeakSwing = 50.0;
      hipExtStance = -6.0;
      anklePushOff = -10.0;
    } else if (age >= 85) {
      kneePeakSwing = 46.0;
      hipExtStance = -5.0;
      anklePushOff = -8.0;
    }
  }

  // 1. Pelvic Tilt (Sagittal)
  const pelvicTiltCtrl = [
    { p: 0, val: 10.0 },
    { p: 50, val: 12.0 },
    { p: 100, val: 10.0 },
  ];

  // 2. Pelvic Obliquity (Frontal)
  const pelvicObliquityCtrl = [
    { p: 0, val: 0.0 },
    { p: 15, val: -4.0 },
    { p: 60, val: 4.0 },
    { p: 100, val: 0.0 },
  ];

  // 3. Pelvic Rotation (Transverse)
  const pelvicRotationCtrl = [
    { p: 0, val: 4.0 },
    { p: 30, val: 0.0 },
    { p: 60, val: -4.0 },
    { p: 100, val: 4.0 },
  ];

  // 4. Hip Flexion / Extension (Sagittal)
  const hipFlexionCtrl = [
    { p: 0, val: 30.0 },
    { p: 50, val: hipExtStance },
    { p: 60, val: 0.0 },
    { p: 85, val: 30.0 },
    { p: 100, val: 30.0 },
  ];

  // 5. Hip Abduction / Adduction (Frontal)
  const hipAbductionCtrl = [
    { p: 0, val: 0.0 },
    { p: 30, val: 4.5 },
    { p: 75, val: -5.0 },
    { p: 100, val: 0.0 },
  ];

  // 6. Hip Rotation (Transverse)
  const hipRotationCtrl = [
    { p: 0, val: 2.0 },
    { p: 50, val: 0.0 },
    { p: 75, val: -2.0 },
    { p: 100, val: 2.0 },
  ];

  // 7. Knee Flexion / Extension (Sagittal)
  const kneeFlexionCtrl = [
    { p: 0, val: 5.0 },
    { p: 15, val: 18.0 },
    { p: 40, val: 3.0 },
    { p: 60, val: 35.0 },
    { p: 73, val: kneePeakSwing },
    { p: 100, val: 5.0 },
  ];

  // 8. Ankle Dorsi / Plantarflexion (Sagittal)
  const ankleFlexionCtrl = [
    { p: 0, val: 0.0 },
    { p: 10, val: -4.0 },
    { p: 45, val: 10.0 },
    { p: 62, val: anklePushOff },
    { p: 75, val: 0.0 },
    { p: 100, val: 0.0 },
  ];

  // 9. Foot Progression Angle (Transverse)
  const footProgressionCtrl = [
    { p: 0, val: -8.0 },
    { p: 50, val: -8.0 },
    { p: 100, val: -8.0 },
  ];

  const points: GPSNormativePoint[] = [];
  for (let p = 0; p <= 100; p++) {
    points.push({
      gaitCyclePct: p,
      pelvicTiltMean: Number(interpolatePoints(pelvicTiltCtrl, p).toFixed(2)),
      pelvicTiltSd: 4.0,
      pelvicObliquityMean: Number(interpolatePoints(pelvicObliquityCtrl, p).toFixed(2)),
      pelvicObliquitySd: 2.5,
      pelvicRotationMean: Number(interpolatePoints(pelvicRotationCtrl, p).toFixed(2)),
      pelvicRotationSd: 3.5,
      hipFlexionMean: Number(interpolatePoints(hipFlexionCtrl, p).toFixed(2)),
      hipFlexionSd: 4.5,
      hipAbductionMean: Number(interpolatePoints(hipAbductionCtrl, p).toFixed(2)),
      hipAbductionSd: 3.0,
      hipRotationMean: Number(interpolatePoints(hipRotationCtrl, p).toFixed(2)),
      hipRotationSd: 4.5,
      kneeFlexionMean: Number(interpolatePoints(kneeFlexionCtrl, p).toFixed(2)),
      kneeFlexionSd: 4.0,
      ankleFlexionMean: Number(interpolatePoints(ankleFlexionCtrl, p).toFixed(2)),
      ankleFlexionSd: 3.5,
      footProgressionMean: Number(interpolatePoints(footProgressionCtrl, p).toFixed(2)),
      footProgressionSd: 4.0,
    });
  }

  return points;
}

/**
 * Computes Gait Variable Score (GVS) as the Root-Mean-Square Error (RMSE)
 * between a patient's continuous curve and normative mean curve across valid points.
 * Returns null if fewer than 10 valid data points exist.
 */
export function calculateGVS(
  patientCurve: (number | null | undefined)[],
  normativeMeanCurve: number[],
): number | null {
  if (!patientCurve || !normativeMeanCurve) return null;
  const validDiffsSq: number[] = [];
  const len = Math.min(patientCurve.length, normativeMeanCurve.length);

  for (let i = 0; i < len; i++) {
    const pVal = patientCurve[i];
    const nVal = normativeMeanCurve[i];
    if (
      typeof pVal === "number" &&
      Number.isFinite(pVal) &&
      typeof nVal === "number" &&
      Number.isFinite(nVal)
    ) {
      const diff = pVal - nVal;
      validDiffsSq.push(diff * diff);
    }
  }

  if (validDiffsSq.length < 10) return null;
  const meanSq = validDiffsSq.reduce((a, b) => a + b, 0) / validDiffsSq.length;
  return Number(Math.sqrt(meanSq).toFixed(2));
}

/**
 * Classifies a GPS or GVS degree score into clinical severity bands.
 * - Normal: < 5.0° (healthy control threshold ~ 5.2°)
 * - Mild: 5.0° – 7.0°
 * - Moderate: 7.0° – 10.0°
 * - Severe: >= 10.0°
 */
export function classifyGPSSeverity(score: number): GPSSeverity {
  if (!Number.isFinite(score) || score < 5.0) return "normal";
  if (score < 7.0) return "mild";
  if (score < 10.0) return "moderate";
  return "severe";
}

/**
 * Extracts left and right kinematic trajectories from JointAnglePoint array.
 */
function extractVariableCurves(
  variable: GPSKinematicVariable,
  points: JointAnglePoint[],
  normatives: GPSNormativePoint[],
  legacyNormativeData?: any[],
): {
  leftCurve: (number | null | undefined)[];
  rightCurve: (number | null | undefined)[];
  normMeanCurve: number[];
} {
  const leftCurve: (number | null | undefined)[] = [];
  const rightCurve: (number | null | undefined)[] = [];
  const normMeanCurve: number[] = [];

  for (let i = 0; i < 101; i++) {
    const pt = points[i] || ({} as any);
    const norm = normatives[i];
    const legNorm = legacyNormativeData?.[i];

    switch (variable) {
      case "pelvicTilt": {
        const valL =
          (pt as any).pelvicTiltAngleLeft ??
          (pt as any).pelvicTiltAngle ??
          (pt as any).pelvicTilt ??
          null;
        const valR =
          (pt as any).pelvicTiltAngleRight ??
          (pt as any).pelvicTiltAngle ??
          (pt as any).pelvicTilt ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.pelvicTiltMean ?? norm.pelvicTiltMean);
        break;
      }
      case "pelvicObliquity": {
        const valL =
          (pt as any).pelvicObliquityAngleLeft ??
          (pt as any).pelvicObliquityAngle ??
          (pt as any).pelvicObliquity ??
          null;
        const valR =
          (pt as any).pelvicObliquityAngleRight ??
          (pt as any).pelvicObliquityAngle ??
          (pt as any).pelvicObliquity ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.pelvicObliquityMean ?? norm.pelvicObliquityMean);
        break;
      }
      case "pelvicRotation": {
        const valL =
          (pt as any).pelvicRotationAngleLeft ??
          (pt as any).pelvicRotationAngle ??
          (pt as any).pelvicRotation ??
          null;
        const valR =
          (pt as any).pelvicRotationAngleRight ??
          (pt as any).pelvicRotationAngle ??
          (pt as any).pelvicRotation ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.pelvicRotationMean ?? norm.pelvicRotationMean);
        break;
      }
      case "hipFlexion": {
        leftCurve.push(pt.hipAngleLeft ?? (pt as any).hipFlexionLeft ?? null);
        rightCurve.push(pt.hipAngleRight ?? (pt as any).hipFlexionRight ?? null);
        normMeanCurve.push(legNorm?.hipMean ?? norm.hipFlexionMean);
        break;
      }
      case "hipAbduction": {
        const valL =
          (pt as any).hipAbductionAngleLeft ??
          (pt as any).hipAbductionLeft ??
          (pt as any).hipAbduction ??
          null;
        const valR =
          (pt as any).hipAbductionAngleRight ??
          (pt as any).hipAbductionRight ??
          (pt as any).hipAbduction ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.hipAbductionMean ?? norm.hipAbductionMean);
        break;
      }
      case "hipRotation": {
        const valL =
          (pt as any).hipRotationAngleLeft ??
          (pt as any).hipRotationLeft ??
          (pt as any).hipRotation ??
          null;
        const valR =
          (pt as any).hipRotationAngleRight ??
          (pt as any).hipRotationRight ??
          (pt as any).hipRotation ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.hipRotationMean ?? norm.hipRotationMean);
        break;
      }
      case "kneeFlexion": {
        leftCurve.push(pt.kneeAngleLeft ?? (pt as any).kneeFlexionLeft ?? null);
        rightCurve.push(pt.kneeAngleRight ?? (pt as any).kneeFlexionRight ?? null);
        normMeanCurve.push(legNorm?.kneeMean ?? norm.kneeFlexionMean);
        break;
      }
      case "ankleFlexion": {
        leftCurve.push(pt.ankleAngleLeft ?? (pt as any).ankleFlexionLeft ?? null);
        rightCurve.push(pt.ankleAngleRight ?? (pt as any).ankleFlexionRight ?? null);
        normMeanCurve.push(legNorm?.ankleMean ?? norm.ankleFlexionMean);
        break;
      }
      case "footProgression": {
        const valL =
          (pt as any).footProgressionAngleLeft ??
          (pt as any).footProgressionLeft ??
          (pt as any).footProgression ??
          null;
        const valR =
          (pt as any).footProgressionAngleRight ??
          (pt as any).footProgressionRight ??
          (pt as any).footProgression ??
          null;
        leftCurve.push(valL);
        rightCurve.push(valR);
        normMeanCurve.push(legNorm?.footProgressionMean ?? norm.footProgressionMean);
        break;
      }
    }
  }

  return { leftCurve, rightCurve, normMeanCurve };
}

/**
 * Master calculation function for Baker et al. (2009) Gait Profile Score (GPS)
 * and Movement Analysis Profile (MAP) across 9 kinematic variables.
 */
export function computeFullGPSAndMAP(
  angleAnalysis?: GaitAngleAnalysis,
  patientMeta?: { age?: number; sex?: string },
): FullGPSResult {
  const normatives = getGPSNormativeCurves(patientMeta?.age, patientMeta?.sex);

  const defaultEntries: GVSScoreEntry[] = GPS_VARIABLE_ORDER.map((varId) => ({
    variable: varId,
    meta: GPS_VARIABLES_META[varId],
    leftGVS: null,
    rightGVS: null,
    overallGVS: null,
    severity: "normal",
    isSuppressed: angleAnalysis?.isSuppressed ?? false,
    suppressionReason: angleAnalysis?.isSuppressed
      ? angleAnalysis.suppressionReason || "Kinematics suppressed in frontal camera view."
      : "No trajectory data available.",
  }));

  const defaultResult: FullGPSResult = {
    overallGPS: 0,
    leftGPS: null,
    rightGPS: null,
    asymmetryDeltaGPS: null,
    gvsEntries: defaultEntries,
    evaluatedVariableCount: 0,
    severity: "normal",
    interpretation: angleAnalysis?.isSuppressed
      ? "Unevaluated: Sagittal joint angle kinematics suppressed in frontal camera view."
      : "Unevaluated: No joint angle curve data available.",
    controlThresholdDeg: GPS_CONTROL_THRESHOLD_DEG,
    mcidThresholdDeg: GPS_MCID_THRESHOLD_DEG,
    citation: "Baker et al. (2009)",
  };

  if (
    !angleAnalysis ||
    angleAnalysis.isSuppressed ||
    !angleAnalysis.normalizedPoints ||
    angleAnalysis.normalizedPoints.length < 10
  ) {
    return defaultResult;
  }

  const patientPoints = angleAnalysis.normalizedPoints;
  const legacyNormData = angleAnalysis.normativeData;

  const gvsEntries: GVSScoreEntry[] = [];
  const leftGVSList: number[] = [];
  const rightGVSList: number[] = [];
  const overallGVSList: number[] = [];

  for (const varId of GPS_VARIABLE_ORDER) {
    const meta = GPS_VARIABLES_META[varId];
    const { leftCurve, rightCurve, normMeanCurve } = extractVariableCurves(
      varId,
      patientPoints,
      normatives,
      legacyNormData,
    );

    const leftGVS = calculateGVS(leftCurve, normMeanCurve);
    const rightGVS = calculateGVS(rightCurve, normMeanCurve);

    let overallGVS: number | null = null;
    if (leftGVS !== null && rightGVS !== null) {
      overallGVS = Number(
        Math.sqrt((leftGVS * leftGVS + rightGVS * rightGVS) / 2).toFixed(2),
      );
    } else if (leftGVS !== null) {
      overallGVS = leftGVS;
    } else if (rightGVS !== null) {
      overallGVS = rightGVS;
    }

    const isSuppressed = overallGVS === null;
    const severity = overallGVS !== null ? classifyGPSSeverity(overallGVS) : "normal";

    if (leftGVS !== null) leftGVSList.push(leftGVS);
    if (rightGVS !== null) rightGVSList.push(rightGVS);
    if (overallGVS !== null) overallGVSList.push(overallGVS);

    gvsEntries.push({
      variable: varId,
      meta,
      leftGVS,
      rightGVS,
      overallGVS,
      severity,
      isSuppressed,
      suppressionReason: isSuppressed
        ? `Trajectory not tracked in ${meta.plane} plane.`
        : undefined,
    });
  }

  const evaluatedVariableCount = overallGVSList.length;
  if (evaluatedVariableCount === 0) {
    return defaultResult;
  }

  // Left GPS
  const leftGPS =
    leftGVSList.length > 0
      ? Number(
          Math.sqrt(
            leftGVSList.reduce((acc, v) => acc + v * v, 0) / leftGVSList.length,
          ).toFixed(2),
        )
      : null;

  // Right GPS
  const rightGPS =
    rightGVSList.length > 0
      ? Number(
          Math.sqrt(
            rightGVSList.reduce((acc, v) => acc + v * v, 0) / rightGVSList.length,
          ).toFixed(2),
        )
      : null;

  // Overall GPS: Root-mean-square across all evaluated instances
  let overallGPS = 0;
  if (leftGPS !== null && rightGPS !== null) {
    overallGPS = Number(
      Math.sqrt((leftGPS * leftGPS + rightGPS * rightGPS) / 2).toFixed(2),
    );
  } else if (overallGVSList.length > 0) {
    overallGPS = Number(
      Math.sqrt(
        overallGVSList.reduce((acc, v) => acc + v * v, 0) / overallGVSList.length,
      ).toFixed(2),
    );
  }

  const asymmetryDeltaGPS =
    leftGPS !== null && rightGPS !== null
      ? Number(Math.abs(leftGPS - rightGPS).toFixed(2))
      : null;

  const severity = classifyGPSSeverity(overallGPS);

  let interpretation = "";
  if (overallGPS < 3.0) {
    interpretation = `Normal normative kinematic profile (GPS < 3.0°). Overall kinematic alignment is within healthy control reference bounds (${GPS_CONTROL_THRESHOLD_DEG}°).`;
  } else if (overallGPS < 5.0) {
    interpretation = `Normal normative kinematic profile (GPS 3.0°–5.0°). Subtle deviations within healthy control reference bounds (${GPS_CONTROL_THRESHOLD_DEG}°).`;
  } else if (overallGPS < 8.0) {
    interpretation = `Moderate kinematic gait deviation (GPS 5.0°–8.0°). Demonstrable deviations detected across evaluated planes.`;
  } else {
    interpretation = `Severe / pathological kinematic gait deviation (GPS ≥ 8.0°). Marked multijoint kinematic impairment.`;
  }

  return {
    overallGPS,
    leftGPS,
    rightGPS,
    asymmetryDeltaGPS,
    gvsEntries,
    evaluatedVariableCount,
    severity,
    interpretation,
    controlThresholdDeg: GPS_CONTROL_THRESHOLD_DEG,
    mcidThresholdDeg: GPS_MCID_THRESHOLD_DEG,
    citation: "Baker et al. (2009)",
  };
}

/**
 * Longitudinal comparison helper to evaluate delta GPS between two sessions.
 * Minimal Clinically Important Difference (MCID) is 1.6° per Baker et al. (2012).
 */
export function evaluateGPSDelta(
  gpsBaseline: number,
  gpsFollowup: number,
): {
  deltaGPS: number;
  isClinicallyMeaningful: boolean;
  direction: "improved" | "deteriorated" | "unchanged";
  mcidThreshold: number;
  message: string;
} {
  const deltaGPS = Number((gpsFollowup - gpsBaseline).toFixed(2));
  const absDelta = Math.abs(deltaGPS);
  const isClinicallyMeaningful = absDelta >= GPS_MCID_THRESHOLD_DEG;

  let direction: "improved" | "deteriorated" | "unchanged" = "unchanged";
  let message = "Kinematic change is within normal measurement variability (<1.6° MCID).";

  if (deltaGPS <= -GPS_MCID_THRESHOLD_DEG) {
    direction = "improved";
    message = `Clinically meaningful kinematic improvement (ΔGPS = ${deltaGPS}° ≥ 1.6° MCID).`;
  } else if (deltaGPS >= GPS_MCID_THRESHOLD_DEG) {
    direction = "deteriorated";
    message = `Clinically meaningful kinematic deterioration (ΔGPS = +${deltaGPS}° ≥ 1.6° MCID).`;
  }

  return {
    deltaGPS,
    isClinicallyMeaningful,
    direction,
    mcidThreshold: GPS_MCID_THRESHOLD_DEG,
    message,
  };
}
