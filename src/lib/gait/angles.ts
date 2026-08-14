import type { Landmark, PoseFrame, ViewAngle } from "./types";
import type { GaitEvent } from "./events";
import { LM, angleDeg, mean, mid } from "./landmarks";
import { zeroPhaseButterworth, olsDetrend } from "./signal";

export interface JointAnglePoint {
  /** Gait cycle percentage (0.0 to 100.0%) */
  gaitCyclePct: number;
  kneeAngleLeft: number | null;
  kneeAngleRight: number | null;
  hipAngleLeft: number | null;
  hipAngleRight: number | null;
  ankleAngleLeft: number | null;
  ankleAngleRight: number | null;
}

export interface NormativeRangePoint {
  gaitCyclePct: number;
  kneeMean: number;
  kneeMin: number;
  kneeMax: number;
  hipMean: number;
  hipMin: number;
  hipMax: number;
  ankleMean: number;
  ankleMin: number;
  ankleMax: number;
}

export interface JointAngleMetrics {
  kneeRomLeft: number | null;
  kneeRomRight: number | null;
  kneePeakFlexionLeft: number | null;
  kneePeakFlexionRight: number | null;
  kneeAsymmetryPct: number | null;

  hipRomLeft: number | null;
  hipRomRight: number | null;
  hipPeakFlexionLeft: number | null;
  hipPeakExtensionLeft: number | null;
  hipPeakFlexionRight: number | null;
  hipPeakExtensionRight: number | null;
  hipAsymmetryPct: number | null;

  ankleRomLeft: number | null;
  ankleRomRight: number | null;
  anklePeakDorsiflexionLeft: number | null;
  anklePeakDorsiflexionRight: number | null;
  anklePeakPlantarflexionLeft: number | null;
  anklePeakPlantarflexionRight: number | null;
  ankleAsymmetryPct: number | null;
}

export interface NormalizedGaitCycle {
  side: "left" | "right";
  strideIndex: number;
  startTimeSec: number;
  endTimeSec: number;
  toeOffPct: number | null;
  points: JointAnglePoint[];
}

export interface ArmSwingAsymmetryResult {
  leftAmplitude: number;
  rightAmplitude: number;
  asymmetryIndex: number;
  phaseCorrelation: number;
}

export interface TrunkSwayResult {
  lateralExcursionDeg: number;
  sagittalExcursionDeg: number;
  harmonicRatio: number;
}

export interface GaitAngleAnalysis {
  isSuppressed: boolean;
  suppressionReason?: string;
  normalizedPoints: JointAnglePoint[];
  leftStrides: NormalizedGaitCycle[];
  rightStrides: NormalizedGaitCycle[];
  metrics: JointAngleMetrics;
  normativeData: NormativeRangePoint[];
  armSwing?: ArmSwingAsymmetryResult;
  armSwingAsymmetry?: ArmSwingAsymmetryResult;
  trunkSway?: TrunkSwayResult;
}

/**
 * Calculates 2D 3-point knee flexion angle in degrees (Hip-Knee-Ankle).
 * 0° represents full extension (collinear leg).
 */
export function calculateKneeFlexion(
  hip: Landmark | undefined | null,
  knee: Landmark | undefined | null,
  ankle: Landmark | undefined | null,
): number {
  if (!hip || !knee || !ankle) return 0;
  if (
    (hip.visibility ?? 1) < 0.3 ||
    (knee.visibility ?? 1) < 0.3 ||
    (ankle.visibility ?? 1) < 0.3
  ) {
    return 0;
  }
  const interior = angleDeg(hip, knee, ankle);
  const flexion = 180 - interior;
  return Number.isFinite(flexion) ? Math.max(0, flexion) : 0;
}

/**
 * Calculates signed 2D hip flexion/extension angle in degrees (Shoulder-Hip-Knee).
 * Signed relative to trunk vector and walking direction:
 * + = Flexion (anterior swing)
 * - = Extension (posterior stance)
 */
export function calculateHipFlexion(
  shoulder: Landmark | undefined | null,
  hip: Landmark | undefined | null,
  knee: Landmark | undefined | null,
  walkDir = 1,
): number {
  if (!shoulder || !hip || !knee) return 0;
  if (
    (shoulder.visibility ?? 1) < 0.3 ||
    (hip.visibility ?? 1) < 0.3 ||
    (knee.visibility ?? 1) < 0.3
  ) {
    return 0;
  }
  const interior = angleDeg(shoulder, hip, knee);
  const rawMag = 180 - interior;
  if (!Number.isFinite(rawMag) || rawMag < 1e-4) return 0;

  const dx = (knee.x - hip.x) * (walkDir >= 0 ? 1 : -1);
  const sign = dx >= 0 ? 1 : -1;
  return sign * rawMag;
}

/**
 * Calculates 2D ankle angle in degrees (Knee-Ankle-Toe) relative to 90° neutral standing.
 * + = Dorsiflexion (toes pulled up)
 * - = Plantarflexion (toes pointed down)
 * Gracefully falls back to heel landmark vector if toe visibility is below 0.3.
 */
export function calculateAnkleAngle(
  knee: Landmark | undefined | null,
  ankle: Landmark | undefined | null,
  toe: Landmark | undefined | null,
  _walkDir = 1,
  heel?: Landmark | undefined | null,
): number {
  if (!knee || !ankle) return 0;
  if ((knee.visibility ?? 1) < 0.3 || (ankle.visibility ?? 1) < 0.3) {
    return 0;
  }

  let effectiveToe: Landmark | null = null;
  if (toe && (toe.visibility ?? 1) >= 0.3) {
    effectiveToe = toe;
  } else if (heel && (heel.visibility ?? 1) >= 0.3) {
    // Reflect heel across ankle to construct synthetic toe vector pointing anteriorly
    effectiveToe = {
      x: 2 * ankle.x - heel.x,
      y: 2 * ankle.y - heel.y,
      z: 2 * (ankle.z ?? 0) - (heel.z ?? 0),
      visibility: heel.visibility,
    };
  }

  if (!effectiveToe) return 0;

  const interior = angleDeg(knee, ankle, effectiveToe);
  if (!Number.isFinite(interior)) return 0;

  const angle = 90 - interior;
  return Number.isFinite(angle) ? angle : 0;
}

function interpolateControlPoints(
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
 * Generates Perry & Burnfield (2010) normative joint kinematic reference bounds
 * over 101 uniform percentage points of the gait cycle (0% to 100%).
 */
export function getNormativeGaitCurves(): NormativeRangePoint[] {
  const kneeMeanCtrl = [
    { p: 0, val: 5.0 },
    { p: 15, val: 18.0 },
    { p: 40, val: 3.0 },
    { p: 60, val: 35.0 },
    { p: 73, val: 62.0 },
    { p: 100, val: 5.0 },
  ];
  const kneeMinCtrl = [
    { p: 0, val: 0.0 },
    { p: 15, val: 12.0 },
    { p: 40, val: 0.0 },
    { p: 60, val: 28.0 },
    { p: 73, val: 55.0 },
    { p: 100, val: 0.0 },
  ];
  const kneeMaxCtrl = [
    { p: 0, val: 10.0 },
    { p: 15, val: 24.0 },
    { p: 40, val: 8.0 },
    { p: 60, val: 42.0 },
    { p: 73, val: 70.0 },
    { p: 100, val: 10.0 },
  ];

  const hipMeanCtrl = [
    { p: 0, val: 30.0 },
    { p: 50, val: -12.0 },
    { p: 60, val: 0.0 },
    { p: 85, val: 30.0 },
    { p: 100, val: 30.0 },
  ];
  const hipMinCtrl = [
    { p: 0, val: 22.0 },
    { p: 50, val: -18.0 },
    { p: 60, val: -5.0 },
    { p: 85, val: 22.0 },
    { p: 100, val: 22.0 },
  ];
  const hipMaxCtrl = [
    { p: 0, val: 38.0 },
    { p: 50, val: -6.0 },
    { p: 60, val: 5.0 },
    { p: 85, val: 38.0 },
    { p: 100, val: 38.0 },
  ];

  const ankleMeanCtrl = [
    { p: 0, val: 0.0 },
    { p: 10, val: -4.0 },
    { p: 45, val: 10.0 },
    { p: 62, val: -15.0 },
    { p: 75, val: 0.0 },
    { p: 100, val: 0.0 },
  ];
  const ankleMinCtrl = [
    { p: 0, val: -4.0 },
    { p: 10, val: -8.0 },
    { p: 45, val: 5.0 },
    { p: 62, val: -22.0 },
    { p: 75, val: -4.0 },
    { p: 100, val: -4.0 },
  ];
  const ankleMaxCtrl = [
    { p: 0, val: 4.0 },
    { p: 10, val: 0.0 },
    { p: 45, val: 15.0 },
    { p: 62, val: -8.0 },
    { p: 75, val: 4.0 },
    { p: 100, val: 4.0 },
  ];

  const result: NormativeRangePoint[] = [];
  for (let p = 0; p <= 100; p++) {
    result.push({
      gaitCyclePct: p,
      kneeMean: Number(interpolateControlPoints(kneeMeanCtrl, p).toFixed(1)),
      kneeMin: Number(interpolateControlPoints(kneeMinCtrl, p).toFixed(1)),
      kneeMax: Number(interpolateControlPoints(kneeMaxCtrl, p).toFixed(1)),
      hipMean: Number(interpolateControlPoints(hipMeanCtrl, p).toFixed(1)),
      hipMin: Number(interpolateControlPoints(hipMinCtrl, p).toFixed(1)),
      hipMax: Number(interpolateControlPoints(hipMaxCtrl, p).toFixed(1)),
      ankleMean: Number(interpolateControlPoints(ankleMeanCtrl, p).toFixed(1)),
      ankleMin: Number(interpolateControlPoints(ankleMinCtrl, p).toFixed(1)),
      ankleMax: Number(interpolateControlPoints(ankleMaxCtrl, p).toFixed(1)),
    });
  }
  return result;
}

function interpolateSeriesAtTime(
  times: number[],
  values: number[],
  tTarget: number,
): number {
  if (!times.length || !values.length) return 0;
  if (tTarget <= times[0]) return values[0];
  if (tTarget >= times[times.length - 1]) return values[values.length - 1];

  for (let i = 0; i < times.length - 1; i++) {
    if (tTarget >= times[i] && tTarget <= times[i + 1]) {
      const dt = times[i + 1] - times[i];
      if (dt < 1e-6) return values[i];
      const frac = (tTarget - times[i]) / dt;
      return values[i] + frac * (values[i + 1] - values[i]);
    }
  }
  return values[values.length - 1];
}

/**
 * Master calculation function for gait cycle joint angle kinematics.
 * Processes continuous pose frames, segments into strides via same-side heel strike events,
 * resamples each stride to 101 points, computes mean trajectories, Peak ROM, and asymmetry metrics.
 */
export function computeGaitAngleAnalysis(
  frames: PoseFrame[],
  events: GaitEvent[],
  viewAngle: ViewAngle,
  walkDir = 1,
): GaitAngleAnalysis {
  const isSuppressed = viewAngle === "frontal";
  const suppressionReason = isSuppressed
    ? "Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view."
    : undefined;

  const normativeData = getNormativeGaitCurves();

  if (!frames || frames.length === 0) {
    const emptyPoints: JointAnglePoint[] = Array.from({ length: 101 }, (_, i) => ({
      gaitCyclePct: i,
      kneeAngleLeft: null,
      kneeAngleRight: null,
      hipAngleLeft: null,
      hipAngleRight: null,
      ankleAngleLeft: null,
      ankleAngleRight: null,
    }));
    return {
      isSuppressed,
      suppressionReason,
      normalizedPoints: emptyPoints,
      leftStrides: [],
      rightStrides: [],
      metrics: {
        kneeRomLeft: null,
        kneeRomRight: null,
        kneePeakFlexionLeft: null,
        kneePeakFlexionRight: null,
        kneeAsymmetryPct: null,
        hipRomLeft: null,
        hipRomRight: null,
        hipPeakFlexionLeft: null,
        hipPeakExtensionLeft: null,
        hipPeakFlexionRight: null,
        hipPeakExtensionRight: null,
        hipAsymmetryPct: null,
        ankleRomLeft: null,
        ankleRomRight: null,
        anklePeakDorsiflexionLeft: null,
        anklePeakDorsiflexionRight: null,
        anklePeakPlantarflexionLeft: null,
        anklePeakPlantarflexionRight: null,
        ankleAsymmetryPct: null,
      },
      normativeData,
    };
  }

  const times = frames.map((f) => f.timeMs / 1000);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const duration = tMax - tMin;
  const fps = frames.length > 1 && duration > 0 ? (frames.length - 1) / duration : 30;

  const rawKneeL = frames.map((f) =>
    calculateKneeFlexion(f.landmarks[LM.L_HIP], f.landmarks[LM.L_KNEE], f.landmarks[LM.L_ANKLE]),
  );
  const rawKneeR = frames.map((f) =>
    calculateKneeFlexion(f.landmarks[LM.R_HIP], f.landmarks[LM.R_KNEE], f.landmarks[LM.R_ANKLE]),
  );

  const rawHipL = frames.map((f) =>
    calculateHipFlexion(
      f.landmarks[LM.L_SHOULDER],
      f.landmarks[LM.L_HIP],
      f.landmarks[LM.L_KNEE],
      walkDir,
    ),
  );
  const rawHipR = frames.map((f) =>
    calculateHipFlexion(
      f.landmarks[LM.R_SHOULDER],
      f.landmarks[LM.R_HIP],
      f.landmarks[LM.R_KNEE],
      walkDir,
    ),
  );

  const rawAnkleL = frames.map((f) =>
    calculateAnkleAngle(
      f.landmarks[LM.L_KNEE],
      f.landmarks[LM.L_ANKLE],
      f.landmarks[LM.L_FOOT],
      walkDir,
      f.landmarks[LM.L_HEEL],
    ),
  );
  const rawAnkleR = frames.map((f) =>
    calculateAnkleAngle(
      f.landmarks[LM.R_KNEE],
      f.landmarks[LM.R_ANKLE],
      f.landmarks[LM.R_FOOT],
      walkDir,
      f.landmarks[LM.R_HEEL],
    ),
  );

  const kneeL = frames.length >= 10 ? zeroPhaseButterworth(rawKneeL, fps, 6.0) : rawKneeL;
  const kneeR = frames.length >= 10 ? zeroPhaseButterworth(rawKneeR, fps, 6.0) : rawKneeR;
  const hipL = frames.length >= 10 ? zeroPhaseButterworth(rawHipL, fps, 6.0) : rawHipL;
  const hipR = frames.length >= 10 ? zeroPhaseButterworth(rawHipR, fps, 6.0) : rawHipR;
  const ankleL = frames.length >= 10 ? zeroPhaseButterworth(rawAnkleL, fps, 6.0) : rawAnkleL;
  const ankleR = frames.length >= 10 ? zeroPhaseButterworth(rawAnkleR, fps, 6.0) : rawAnkleR;

  const eventList = Array.isArray(events) ? events : [];
  const leftHS = eventList
    .filter((e) => e.type === "heel_strike" && e.side === "left")
    .sort((a, b) => a.timeSec - b.timeSec);
  const rightHS = eventList
    .filter((e) => e.type === "heel_strike" && e.side === "right")
    .sort((a, b) => a.timeSec - b.timeSec);
  const leftTO = eventList.filter((e) => e.type === "toe_off" && e.side === "left");
  const rightTO = eventList.filter((e) => e.type === "toe_off" && e.side === "right");

  const buildStridesForSide = (
    side: "left" | "right",
    hsEvents: GaitEvent[],
    toEvents: GaitEvent[],
    kArr: number[],
    hArr: number[],
    aArr: number[],
  ): NormalizedGaitCycle[] => {
    const strides: NormalizedGaitCycle[] = [];
    if (hsEvents.length < 2) return strides;

    for (let i = 0; i < hsEvents.length - 1; i++) {
      const tStart = hsEvents[i].timeSec;
      const tEnd = hsEvents[i + 1].timeSec;
      if (tEnd - tStart < 0.2) continue;

      const toeOffEvent = toEvents.find((e) => e.timeSec >= tStart && e.timeSec <= tEnd);
      const toeOffPct = toeOffEvent
        ? Math.round(((toeOffEvent.timeSec - tStart) / (tEnd - tStart)) * 100)
        : null;

      const points: JointAnglePoint[] = [];
      for (let p = 0; p <= 100; p++) {
        const tTarget = tStart + (p / 100) * (tEnd - tStart);
        const kVal = interpolateSeriesAtTime(times, kArr, tTarget);
        const hVal = interpolateSeriesAtTime(times, hArr, tTarget);
        const aVal = interpolateSeriesAtTime(times, aArr, tTarget);

        points.push({
          gaitCyclePct: p,
          kneeAngleLeft: side === "left" ? Number(kVal.toFixed(2)) : null,
          kneeAngleRight: side === "right" ? Number(kVal.toFixed(2)) : null,
          hipAngleLeft: side === "left" ? Number(hVal.toFixed(2)) : null,
          hipAngleRight: side === "right" ? Number(hVal.toFixed(2)) : null,
          ankleAngleLeft: side === "left" ? Number(aVal.toFixed(2)) : null,
          ankleAngleRight: side === "right" ? Number(aVal.toFixed(2)) : null,
        });
      }

      strides.push({
        side,
        strideIndex: i,
        startTimeSec: tStart,
        endTimeSec: tEnd,
        toeOffPct,
        points,
      });
    }

    return strides;
  };

  const leftStrides = buildStridesForSide("left", leftHS, leftTO, kneeL, hipL, ankleL);
  const rightStrides = buildStridesForSide("right", rightHS, rightTO, kneeR, hipR, ankleR);

  // Compute 101-point mean trajectory
  const normalizedPoints: JointAnglePoint[] = [];

  for (let p = 0; p <= 100; p++) {
    let kL: number;
    let kR: number;
    let hL: number;
    let hR: number;
    let aL: number;
    let aR: number;

    if (leftStrides.length > 0) {
      kL = mean(leftStrides.map((s) => s.points[p].kneeAngleLeft!));
      hL = mean(leftStrides.map((s) => s.points[p].hipAngleLeft!));
      aL = mean(leftStrides.map((s) => s.points[p].ankleAngleLeft!));
    } else {
      const tTarget = tMin + (p / 100) * (tMax - tMin);
      kL = interpolateSeriesAtTime(times, kneeL, tTarget);
      hL = interpolateSeriesAtTime(times, hipL, tTarget);
      aL = interpolateSeriesAtTime(times, ankleL, tTarget);
    }

    if (rightStrides.length > 0) {
      kR = mean(rightStrides.map((s) => s.points[p].kneeAngleRight!));
      hR = mean(rightStrides.map((s) => s.points[p].hipAngleRight!));
      aR = mean(rightStrides.map((s) => s.points[p].ankleAngleRight!));
    } else {
      const tTarget = tMin + (p / 100) * (tMax - tMin);
      kR = interpolateSeriesAtTime(times, kneeR, tTarget);
      hR = interpolateSeriesAtTime(times, hipR, tTarget);
      aR = interpolateSeriesAtTime(times, ankleR, tTarget);
    }

    normalizedPoints.push({
      gaitCyclePct: p,
      kneeAngleLeft: Number(kL.toFixed(2)),
      kneeAngleRight: Number(kR.toFixed(2)),
      hipAngleLeft: Number(hL.toFixed(2)),
      hipAngleRight: Number(hR.toFixed(2)),
      ankleAngleLeft: Number(aL.toFixed(2)),
      ankleAngleRight: Number(aR.toFixed(2)),
    });
  }

  // Calculate Metrics from normalizedPoints
  const kLArr = normalizedPoints.map((pt) => pt.kneeAngleLeft!);
  const kRArr = normalizedPoints.map((pt) => pt.kneeAngleRight!);
  const hLArr = normalizedPoints.map((pt) => pt.hipAngleLeft!);
  const hRArr = normalizedPoints.map((pt) => pt.hipAngleRight!);
  const aLArr = normalizedPoints.map((pt) => pt.ankleAngleLeft!);
  const aRArr = normalizedPoints.map((pt) => pt.ankleAngleRight!);

  const kLMax = Math.max(...kLArr);
  const kLMin = Math.min(...kLArr);
  const kLRom = kLMax - kLMin;

  const kRMax = Math.max(...kRArr);
  const kRMin = Math.min(...kRArr);
  const kRRom = kRMax - kRMin;

  const kMaxRom = Math.max(kLRom, kRRom);
  const kneeAsymmetryPct = kMaxRom > 0 ? (Math.abs(kLRom - kRRom) / kMaxRom) * 100 : 0;

  const hLMax = Math.max(...hLArr);
  const hLMin = Math.min(...hLArr);
  const hLRom = hLMax - hLMin;

  const hRMax = Math.max(...hRArr);
  const hRMin = Math.min(...hRArr);
  const hRRom = hRMax - hRMin;

  const hMaxRom = Math.max(hLRom, hRRom);
  const hipAsymmetryPct = hMaxRom > 0 ? (Math.abs(hLRom - hRRom) / hMaxRom) * 100 : 0;

  const aLMax = Math.max(...aLArr);
  const aLMin = Math.min(...aLArr);
  const aLRom = aLMax - aLMin;

  const aRMax = Math.max(...aRArr);
  const aRMin = Math.min(...aRArr);
  const aRRom = aRMax - aRMin;

  const aMaxRom = Math.max(aLRom, aRRom);
  const ankleAsymmetryPct = aMaxRom > 0 ? (Math.abs(aLRom - aRRom) / aMaxRom) * 100 : 0;

  const metrics: JointAngleMetrics = {
    kneeRomLeft: Number(kLRom.toFixed(2)),
    kneeRomRight: Number(kRRom.toFixed(2)),
    kneePeakFlexionLeft: Number(kLMax.toFixed(2)),
    kneePeakFlexionRight: Number(kRMax.toFixed(2)),
    kneeAsymmetryPct: Number(kneeAsymmetryPct.toFixed(2)),

    hipRomLeft: Number(hLRom.toFixed(2)),
    hipRomRight: Number(hRRom.toFixed(2)),
    hipPeakFlexionLeft: Number(hLMax.toFixed(2)),
    hipPeakExtensionLeft: Number(hLMin.toFixed(2)),
    hipPeakFlexionRight: Number(hRMax.toFixed(2)),
    hipPeakExtensionRight: Number(hRMin.toFixed(2)),
    hipAsymmetryPct: Number(hipAsymmetryPct.toFixed(2)),

    ankleRomLeft: Number(aLRom.toFixed(2)),
    ankleRomRight: Number(aRRom.toFixed(2)),
    anklePeakDorsiflexionLeft: Number(aLMax.toFixed(2)),
    anklePeakPlantarflexionLeft: Number(aLMin.toFixed(2)),
    anklePeakDorsiflexionRight: Number(aRMax.toFixed(2)),
    anklePeakPlantarflexionRight: Number(aRMin.toFixed(2)),
    ankleAsymmetryPct: Number(ankleAsymmetryPct.toFixed(2)),
  };

  const landmarks = frames.map((f) => f.landmarks);
  const armSwing = calculateArmSwingAsymmetry(landmarks, events);
  const trunkSway = calculateTrunkSway(landmarks);

  return {
    isSuppressed,
    suppressionReason,
    normalizedPoints,
    leftStrides,
    rightStrides,
    metrics,
    normativeData,
    armSwing,
    armSwingAsymmetry: armSwing,
    trunkSway,
  };
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (!xs || !ys || xs.length !== ys.length || xs.length === 0) return 0;
  const n = xs.length;
  const meanX = mean(xs);
  const meanY = mean(ys);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den < 1e-8 ? 0 : Math.max(-1, Math.min(1, num / den));
}

/**
 * R6: Arm Swing Asymmetry Index (ASA)
 * Computes peak-to-peak swing amplitude per arm across gait cycles,
 * asymmetry index ASA = |Amp_L - Amp_R| / max(Amp_L, Amp_R) * 100,
 * and phase correlation between arm swing and contralateral leg.
 */
export function calculateArmSwingAsymmetry(
  landmarks: Landmark[][],
  _events?: { heelStrikes?: GaitEvent[] } | GaitEvent[],
): ArmSwingAsymmetryResult {
  if (!landmarks || landmarks.length === 0) {
    return { leftAmplitude: 0, rightAmplitude: 0, asymmetryIndex: 0, phaseCorrelation: 0 };
  }

  const n = landmarks.length;
  const leftArmAngles = new Array<number>(n);
  const rightArmAngles = new Array<number>(n);
  const leftLegAngles = new Array<number>(n);
  const rightLegAngles = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const frame = landmarks[i];
    if (!frame || frame.length < 27) {
      leftArmAngles[i] = 0;
      rightArmAngles[i] = 0;
      leftLegAngles[i] = 0;
      rightLegAngles[i] = 0;
      continue;
    }

    const lShoulder = frame[LM.L_SHOULDER];
    const rShoulder = frame[LM.R_SHOULDER];
    const lWrist = frame[LM.L_WRIST];
    const rWrist = frame[LM.R_WRIST];
    const lHip = frame[LM.L_HIP];
    const rHip = frame[LM.R_HIP];
    const lKnee = frame[LM.L_KNEE];
    const rKnee = frame[LM.R_KNEE];

    leftArmAngles[i] =
      lShoulder && lWrist && (lShoulder.visibility ?? 1) >= 0.3 && (lWrist.visibility ?? 1) >= 0.3
        ? (Math.atan2(lWrist.x - lShoulder.x, lWrist.y - lShoulder.y) * 180) / Math.PI
        : 0;

    rightArmAngles[i] =
      rShoulder && rWrist && (rShoulder.visibility ?? 1) >= 0.3 && (rWrist.visibility ?? 1) >= 0.3
        ? (Math.atan2(rWrist.x - rShoulder.x, rWrist.y - rShoulder.y) * 180) / Math.PI
        : 0;

    leftLegAngles[i] =
      lHip && lKnee && (lHip.visibility ?? 1) >= 0.3 && (lKnee.visibility ?? 1) >= 0.3
        ? (Math.atan2(lKnee.x - lHip.x, lKnee.y - lHip.y) * 180) / Math.PI
        : 0;

    rightLegAngles[i] =
      rHip && rKnee && (rHip.visibility ?? 1) >= 0.3 && (rKnee.visibility ?? 1) >= 0.3
        ? (Math.atan2(rKnee.x - rHip.x, rKnee.y - rHip.y) * 180) / Math.PI
        : 0;
  }

  const fps = 30;
  const filteredArmL = n >= 10 ? zeroPhaseButterworth(leftArmAngles, fps, 6.0) : leftArmAngles;
  const filteredArmR = n >= 10 ? zeroPhaseButterworth(rightArmAngles, fps, 6.0) : rightArmAngles;
  const filteredLegL = n >= 10 ? zeroPhaseButterworth(leftLegAngles, fps, 6.0) : leftLegAngles;
  const filteredLegR = n >= 10 ? zeroPhaseButterworth(rightLegAngles, fps, 6.0) : rightLegAngles;

  const leftAmplitude = Number(Math.max(0, Math.max(...filteredArmL) - Math.min(...filteredArmL)).toFixed(2));
  const rightAmplitude = Number(Math.max(0, Math.max(...filteredArmR) - Math.min(...filteredArmR)).toFixed(2));

  const maxAmp = Math.max(leftAmplitude, rightAmplitude);
  const asymmetryIndex = maxAmp > 0
    ? Number(((Math.abs(leftAmplitude - rightAmplitude) / maxAmp) * 100).toFixed(2))
    : 0;

  const corrL = pearsonCorrelation(filteredArmL, filteredLegR);
  const corrR = pearsonCorrelation(filteredArmR, filteredLegL);
  const phaseCorrelation = Number(((corrL + corrR) / 2).toFixed(3));

  return { leftAmplitude, rightAmplitude, asymmetryIndex, phaseCorrelation };
}

/**
 * R7: Trunk Sway Quantification
 * Computes C7/mid-shoulder to mid-hip vector tilt angle per frame,
 * peak-to-peak lateral & sagittal angular excursion, and FFT-based Harmonic Ratio.
 */
export function calculateTrunkSway(landmarks: Landmark[][]): TrunkSwayResult {
  if (!landmarks || landmarks.length === 0) {
    return { lateralExcursionDeg: 0, sagittalExcursionDeg: 0, harmonicRatio: 1.0 };
  }

  const n = landmarks.length;
  const lateralTilt = new Array<number>(n);
  const sagittalTilt = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const frame = landmarks[i];
    if (!frame || frame.length < 25) {
      lateralTilt[i] = 0;
      sagittalTilt[i] = 0;
      continue;
    }

    const lShoulder = frame[LM.L_SHOULDER];
    const rShoulder = frame[LM.R_SHOULDER];
    const lHip = frame[LM.L_HIP];
    const rHip = frame[LM.R_HIP];

    if (!lShoulder || !rShoulder || !lHip || !rHip) {
      lateralTilt[i] = 0;
      sagittalTilt[i] = 0;
      continue;
    }

    const midShoulder = mid(lShoulder, rShoulder);
    const midHip = mid(lHip, rHip);

    const dx = midShoulder.x - midHip.x;
    const dy = midShoulder.y - midHip.y;
    const dz = (midShoulder.z ?? 0) - (midHip.z ?? 0);

    lateralTilt[i] = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const sagittalDisp = Math.abs(dz) > 1e-4 ? dz : dx;
    sagittalTilt[i] = (Math.atan2(sagittalDisp, -dy) * 180) / Math.PI;
  }

  const fps = 30;
  const filteredLat = n >= 10 ? zeroPhaseButterworth(lateralTilt, fps, 6.0) : lateralTilt;
  const filteredSag = n >= 10 ? zeroPhaseButterworth(sagittalTilt, fps, 6.0) : sagittalTilt;

  const lateralExcursionDeg = Number(Math.max(0, Math.max(...filteredLat) - Math.min(...filteredLat)).toFixed(2));
  const sagittalExcursionDeg = Number(Math.max(0, Math.max(...filteredSag) - Math.min(...filteredSag)).toFixed(2));
  const harmonicRatio = computeHarmonicRatio(filteredLat);

  return { lateralExcursionDeg, sagittalExcursionDeg, harmonicRatio };
}

function computeHarmonicRatio(signal: number[]): number {
  if (!signal || signal.length < 8) return 1.0;
  const detrended = olsDetrend(signal);
  const M = detrended.length;
  let evenSum = 0;
  let oddSum = 0;

  for (let k = 1; k <= 10; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < M; n++) {
      const angle = (2 * Math.PI * k * n) / M;
      re += detrended[n] * Math.cos(angle);
      im -= detrended[n] * Math.sin(angle);
    }
    const amp = Math.sqrt(re * re + im * im);
    if (k % 2 === 0) evenSum += amp;
    else oddSum += amp;
  }

  if (oddSum < 1e-6) return 1.0;
  return Number((evenSum / oddSum).toFixed(2));
}
