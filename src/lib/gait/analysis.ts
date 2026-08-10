import { olsDetrend, zeroPhaseButterworth, smoothPoseFrames } from "./signal";
import { detectGaitEventsZeni, refinePeakTimestamp, type GaitEvent } from "./events";
import { symmetryAngle } from "./symmetry";
import { calculateDTE } from "./dte";
import { computeGaitAngleAnalysis } from "./angles";
import { buildEducatedGuesses } from "./guesses";
import {
  LM,
  angleDeg,
  boundingBox,
  clamp,
  dist,
  hipCenter,
  mean,
  mid,
  range,
  std,
  torsoHeight,
} from "./landmarks";
import type {
  AnalysisResult,
  DualTaskCost,
  GaitAnalysisOptions,
  GaitMetrics,
  Landmark,
  PatientMetadata,
  PoseFrame,
  ReliabilityBounds,
  SmoothingMethod,
  TaskMode,
  TrackedPerson,
  ViewAngle,
} from "./types";
import { PERSON_COLORS } from "./landmarks";

function smooth(values: number[], window = 5): number[] {
  if (values.length < 3) return values.slice();
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) {
        s += values[j];
        n++;
      }
    }
    return s / n;
  });
}

function findPeaks(series: number[], minDist: number, prominence: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i] >= series[i - 1] && series[i] > series[i + 1]) {
      if (peaks.length && i - peaks[peaks.length - 1] < minDist) {
        if (series[i] > series[peaks[peaks.length - 1]]) {
          peaks[peaks.length - 1] = i;
        }
        continue;
      }
      const left = Math.max(0, i - minDist);
      const right = Math.min(series.length - 1, i + minDist);
      const base = Math.min(...series.slice(left, right + 1).filter((_, k) => left + k !== i));
      if (series[i] - base >= prominence) peaks.push(i);
    }
  }
  return peaks;
}

function asymmetryRatio(a: number, b: number): number {
  const aa = Math.abs(a);
  const bb = Math.abs(b);
  if (aa < 1e-3 && bb < 1e-3) return 0;
  const max = Math.max(aa, bb, 1e-6);
  return Math.abs(aa - bb) / max;
}

export function detectViewAngle(frames: PoseFrame[]): { angle: ViewAngle; confidence: number } {
  if (frames.length < 4) return { angle: "unknown", confidence: 0.2 };

  const shoulderWidths: number[] = [];
  const hipDepths: number[] = [];
  const lateralMoves: number[] = [];
  const verticalLimbSep: number[] = [];

  for (const f of frames) {
    const lm = f.landmarks;
    const th = torsoHeight(lm);
    const sw = dist(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]) / th;
    const hipZ = Math.abs((lm[LM.L_HIP].z ?? 0) - (lm[LM.R_HIP].z ?? 0));
    shoulderWidths.push(sw);
    hipDepths.push(hipZ);
    verticalLimbSep.push(
      Math.abs(lm[LM.L_ANKLE].y - lm[LM.R_ANKLE].y) / th +
        Math.abs(lm[LM.L_KNEE].y - lm[LM.R_KNEE].y) / th,
    );
  }

  for (let i = 1; i < frames.length; i++) {
    const a = hipCenter(frames[i - 1].landmarks);
    const b = hipCenter(frames[i].landmarks);
    lateralMoves.push(Math.abs(b.x - a.x));
  }

  const avgShoulder = mean(shoulderWidths);
  const avgHipZ = mean(hipDepths);
  const totalLateral = mean(lateralMoves);
  const avgLimbSep = mean(verticalLimbSep);

  let frontalScore = 0;
  let sagittalScore = 0;

  if (avgShoulder > 0.55) frontalScore += 0.35;
  else if (avgShoulder < 0.4) sagittalScore += 0.35;
  else {
    frontalScore += 0.15;
    sagittalScore += 0.15;
  }

  if (avgHipZ > 0.08) sagittalScore += 0.25;
  else frontalScore += 0.15;

  if (totalLateral > 0.01) frontalScore += 0.2;
  if (avgLimbSep > 0.35) sagittalScore += 0.25;
  else frontalScore += 0.1;

  const first = hipCenter(frames[0].landmarks);
  const last = hipCenter(frames[frames.length - 1].landmarks);
  const dx = Math.abs(last.x - first.x);
  const dy = Math.abs(last.y - first.y);
  if (dx > dy * 1.4) frontalScore += 0.15;
  if (dx < dy * 0.6) sagittalScore += 0.1;

  const total = frontalScore + sagittalScore + 1e-6;
  const fNorm = frontalScore / total;
  const sNorm = sagittalScore / total;

  if (Math.abs(fNorm - sNorm) < 0.12) {
    return { angle: "oblique", confidence: 0.45 + Math.abs(fNorm - sNorm) };
  }
  if (fNorm > sNorm) return { angle: "frontal", confidence: clamp(fNorm, 0.4, 0.95) };
  return { angle: "sagittal", confidence: clamp(sNorm, 0.4, 0.95) };
}

/** Autocorrelation-based step estimate from a 1D signal (hip bounce / ankle). */
function estimateStepsFromOscillation(
  signal: number[],
  times: number[],
  durationSec: number,
): GaitEvent[] {
  if (signal.length < 12 || durationSec < 1.5) return [];
  const s = detrend(smooth(signal, 5));
  const n = s.length;
  const meanS = mean(s);
  const x = s.map((v) => v - meanS);
  const dt = durationSec / Math.max(1, n - 1);
  const lag0 = Math.max(2, Math.floor(0.35 / dt));
  const lag1 = Math.min(n - 3, Math.ceil(1.2 / dt));
  let bestLag = lag0;
  let bestCorr = -Infinity;
  for (let lag = lag0; lag <= lag1; lag++) {
    let num = 0;
    let d0 = 0;
    let d1 = 0;
    for (let i = 0; i < n - lag; i++) {
      num += x[i] * x[i + lag];
      d0 += x[i] * x[i];
      d1 += x[i + lag] * x[i + lag];
    }
    const den = Math.sqrt(d0 * d1) || 1;
    const c = num / den;
    if (c > bestCorr) {
      bestCorr = c;
      bestLag = lag;
    }
  }
  if (bestCorr < 0.15) return [];
  const period = bestLag * dt;
  const events: GaitEvent[] = [];
  const peaks = findPeaks(s.map((v) => -v), Math.max(2, Math.floor(bestLag * 0.55)), 0);
  const peaks2 = findPeaks(s, Math.max(2, Math.floor(bestLag * 0.55)), 0);
  const use = peaks.length >= peaks2.length ? peaks : peaks2;
  let side: "left" | "right" = "left";
  for (const i of use) {
    const baseTime = times[i] ?? i * dt;
    const timeSec = refinePeakTimestamp(s, i, baseTime, 1 / dt);
    events.push({
      frame: i,
      timeSec,
      type: "heel_strike",
      side,
    });
    side = side === "left" ? "right" : "left";
  }
  if (events.length < Math.max(4, durationSec / period - 1)) {
    events.length = 0;
    side = "left";
    for (let t = period * 0.5; t < durationSec - 0.1; t += period) {
      events.push({
        frame: Math.round(t / dt),
        timeSec: t,
        type: "heel_strike",
        side,
      });
      side = side === "left" ? "right" : "left";
    }
  }
  return events;
}

function buildReliabilityBounds(
  val: number | null | undefined,
  m1Val: number | null | undefined,
  m2Val: number | null | undefined,
  allowNegative = false,
): ReliabilityBounds {
  if (val == null || m1Val == null || m2Val == null || isNaN(val) || isNaN(m1Val) || isNaN(m2Val)) {
    return {
      value: val ?? null,
      ci95Lower: null,
      ci95Upper: null,
      splitHalfDiff: null,
      se: null,
      half1: m1Val ?? null,
      half2: m2Val ?? null,
    };
  }
  const diff = Math.abs(m1Val - m2Val);
  const se = diff / Math.sqrt(2);
  const ci95Lower = allowNegative ? val - 1.96 * se : Math.max(0, val - 1.96 * se);
  const ci95Upper = val + 1.96 * se;
  return {
    value: Number(val.toFixed(3)),
    ci95Lower: Number(ci95Lower.toFixed(3)),
    ci95Upper: Number(ci95Upper.toFixed(3)),
    splitHalfDiff: Number(diff.toFixed(3)),
    se: Number(se.toFixed(3)),
    half1: Number(m1Val.toFixed(3)),
    half2: Number(m2Val.toFixed(3)),
  };
}

function computeGaitMetricsCore(
  rawFrames: PoseFrame[],
  smoothingMethod: SmoothingMethod = "savitzky-golay",
): GaitMetrics {
  if (rawFrames.length < 5) {
    return emptyMetrics(rawFrames);
  }

  const frames =
    smoothingMethod === "none"
      ? rawFrames
      : smoothPoseFrames(rawFrames, smoothingMethod);

  const { angle, confidence } = detectViewAngle(frames);
  const t0 = frames[0].timeMs;
  const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (frames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  const series = frames.map((f) => {
    const lm = f.landmarks;
    const th = torsoHeight(lm);
    const hip = hipCenter(lm);
    return {
      t: (f.timeMs - t0) / 1000,
      midHipX: hip.x,
      midHipY: hip.y,
      leftAnkleY: lm[LM.L_ANKLE].y,
      rightAnkleY: lm[LM.R_ANKLE].y,
      leftWristX: lm[LM.L_WRIST].x,
      rightWristX: lm[LM.R_WRIST].x,
      leftKneeAngle: angleDeg(lm[LM.L_HIP], lm[LM.L_KNEE], lm[LM.L_ANKLE]),
      rightKneeAngle: angleDeg(lm[LM.R_HIP], lm[LM.R_KNEE], lm[LM.R_ANKLE]),
      torso: th,
      leftAnkleX: lm[LM.L_ANKLE].x,
      rightAnkleX: lm[LM.R_ANKLE].x,
      leftWristRel: (lm[LM.L_WRIST].x - hip.x) / th,
      rightWristRel: (lm[LM.R_WRIST].x - hip.x) / th,
      shoulderY: mid(lm[LM.L_SHOULDER], lm[LM.R_SHOULDER]).y,
      hipDrop: (lm[LM.L_HIP].y - lm[LM.R_HIP].y) / th,
      stepWidth: Math.abs(lm[LM.L_ANKLE].x - lm[LM.R_ANKLE].x) / th,
    };
  });

  // Zero-phase 4th-order Butterworth low-pass filtering (fc = 6.0 Hz) on landmark trajectories
  const midHipX = zeroPhaseButterworth(series.map((s) => s.midHipX), fps, 6.0);
  const midHipY = zeroPhaseButterworth(series.map((s) => s.midHipY), fps, 6.0);
  const leftWristRel = zeroPhaseButterworth(series.map((s) => s.leftWristRel), fps, 6.0);
  const rightWristRel = zeroPhaseButterworth(series.map((s) => s.rightWristRel), fps, 6.0);
  const leftKneeAngle = zeroPhaseButterworth(series.map((s) => s.leftKneeAngle), fps, 6.0);
  const rightKneeAngle = zeroPhaseButterworth(series.map((s) => s.rightKneeAngle), fps, 6.0);

  // Execute Zeni Kinematic Gait Event Detection
  const zeniBreakdown = detectGaitEventsZeni(frames, fpsEffective);

  // Camera view angle geometry validity flags
  const isFrontal = angle === "frontal";
  const isSagittal = angle === "sagittal";

  // Sagittal-only metrics: invalid (null) in frontal view
  const leftStancePct = !isFrontal ? zeniBreakdown.leftStancePct : null;
  const rightStancePct = !isFrontal ? zeniBreakdown.rightStancePct : null;
  const leftSwingPct = !isFrontal ? zeniBreakdown.leftSwingPct : null;
  const rightSwingPct = !isFrontal ? zeniBreakdown.rightSwingPct : null;
  const doubleSupportPct = !isFrontal ? zeniBreakdown.doubleSupportPct : null;
  const doubleSupportHint = Number(((doubleSupportPct ?? zeniBreakdown.doubleSupportPct) / 100).toFixed(2));

  let stepEvents: GaitEvent[] = zeniBreakdown.stepEvents;

  // Fallback for short/stationary clips if Zeni returns fewer than 4 events
  if (stepEvents.length < 4) {
    const times = series.map((s) => s.t);
    stepEvents = estimateStepsFromOscillation(midHipY, times, durationSec);
  }

  // Frontal: choose between Zeni and hip-Y oscillation by how close cadence is to walk band.
  if (isFrontal) {
    const times = series.map((s) => s.t);
    const zeniHs = stepEvents.filter((e) => e.type === "heel_strike");
    const osc = estimateStepsFromOscillation(midHipY, times, durationSec);
    const oscHs = osc.filter((e) => e.type === "heel_strike");
    const cad = (n: number) => (durationSec > 0 ? (n / durationSec) * 60 : 0);
    const zCad = cad(zeniHs.length);
    const oCad = cad(oscHs.length);
    const walkFit = (c: number) => {
      if (c < 40 || c > 140) return -1e9;
      // peak preference ~100–115 spm
      return -Math.abs(c - 108);
    };
    if (oscHs.length >= 4 && walkFit(oCad) > walkFit(zCad)) {
      stepEvents = osc;
    }
  }

  // Calculate step and stride timing statistics from Heel Strikes
  // Drop physiologically impossible double-fires (< 0.15s ≈ >400 spm)
  const MIN_STEP_SEC = 0.15;
  let heelStrikes = stepEvents
    .filter((e) => e.type === "heel_strike")
    .sort((a, b) => a.timeSec - b.timeSec);
  {
    const deduped: typeof heelStrikes = [];
    for (const e of heelStrikes) {
      if (deduped.length === 0 || e.timeSec - deduped[deduped.length - 1].timeSec >= MIN_STEP_SEC) {
        deduped.push(e);
      }
    }
    heelStrikes = deduped;
  }
  const stepCount = heelStrikes.length;

  const stepIntervals: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    stepIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
  }
  const { steadyStrides } = filterSteadyStateStrides(stepIntervals);
  const cvIntervals = steadyStrides.length >= 2 ? steadyStrides : stepIntervals;
  const avgStepTimeSec = mean(cvIntervals.length >= 2 ? cvIntervals : stepIntervals) || 0;
  // Prefer interval-based cadence (ignores lead-in/out standing); fall back to count/duration
  const cadenceFromIntervals = avgStepTimeSec > 0.2 && avgStepTimeSec <= 2.5 ? 60 / avgStepTimeSec : 0;
  const cadenceFromCount = durationSec > 0 ? (stepCount / durationSec) * 60 : 0;
  const cadenceSpm =
    cadenceFromIntervals > 0
      ? cadenceFromIntervals
      : cadenceFromCount;
  const stepTimeCV = avgStepTimeSec > 1e-6 ? std(cvIntervals) / avgStepTimeSec : 0;

  // Separate left and right step time intervals for Zifchock's Symmetry Angle (SA)
  const leftIntervals: number[] = [];
  const rightIntervals: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    const dt = heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec;
    if (heelStrikes[i].side === "left") leftIntervals.push(dt);
    else rightIntervals.push(dt);
  }
  const meanLeftStepTime = mean(leftIntervals) || avgStepTimeSec;
  const meanRightStepTime = mean(rightIntervals) || avgStepTimeSec;

  const stepTimeSA = symmetryAngle(meanLeftStepTime, meanRightStepTime);

  const armSwingLeft = range(leftWristRel);
  const armSwingRight = range(rightWristRel);
  const armSwingSA = symmetryAngle(armSwingLeft, armSwingRight);

  // Knee flexion is valid in sagittal/oblique views, null in frontal view
  const kneeFlexLeft = !isFrontal ? range(leftKneeAngle) : null;
  const kneeFlexRight = !isFrontal ? range(rightKneeAngle) : null;
  const kneeFlexSA = (kneeFlexLeft != null && kneeFlexRight != null) ? symmetryAngle(kneeFlexLeft, kneeFlexRight) : 0;

  // Overall composite Zifchock Symmetry Angle (SA) [0, 100]%
  const symmetryAngleVal = Number(((stepTimeSA + armSwingSA + kneeFlexSA) / (kneeFlexLeft != null ? 3 : 2)).toFixed(2));

  // Legacy percentage asymmetries retained for compatibility
  const stepTimeAsymmetry = asymmetryRatio(meanLeftStepTime, meanRightStepTime);
  const armSwingAsymmetry = asymmetryRatio(armSwingLeft, armSwingRight);
  const kneeAsymmetry = (kneeFlexLeft != null && kneeFlexRight != null) ? asymmetryRatio(kneeFlexLeft, kneeFlexRight) : null;

  // Contralateral step distance (step length)
  const leftStep: number[] = [];
  const rightStep: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    if (heelStrikes[i].side !== heelStrikes[i - 1].side) {
      const i0 = nearestIndex(series.map((s) => s.t), heelStrikes[i - 1].timeSec);
      const i1 = nearestIndex(series.map((s) => s.t), heelStrikes[i].timeSec);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (heelStrikes[i].side === "left") leftStep.push(travel);
      else rightStep.push(travel);
    }
  }

  // Ipsilateral stride length: hip travel between consecutive same-side steps (valid in sagittal/oblique)
  const leftStride: number[] = [];
  const rightStride: number[] = [];
  for (const side of ["left", "right"] as const) {
    const sideStrikes = heelStrikes.filter((e) => e.side === side);
    for (let i = 1; i < sideStrikes.length; i++) {
      const i0 = nearestIndex(series.map((s) => s.t), sideStrikes[i - 1].timeSec);
      const i1 = nearestIndex(series.map((s) => s.t), sideStrikes[i].timeSec);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (side === "left") leftStride.push(travel);
      else rightStride.push(travel);
    }
  }
  const strideAsymmetry = !isFrontal ? asymmetryRatio(mean(leftStride) || 0, mean(rightStride) || 0) : null;

  // Frontal-only metrics: invalid (null) in sagittal view
  const torsoS = series.map((s) => s.torso);
  const hipXNorm = midHipX.map((x, i) => x / Math.max(torsoS[i], 0.05));
  const hipYNorm = midHipY.map((y, i) => y / Math.max(torsoS[i], 0.05));
  const ma = (arr: number[], w: number) =>
    arr.map((_, i) => {
      const a = Math.max(0, i - w);
      const b = Math.min(arr.length, i + w + 1);
      return mean(arr.slice(a, b));
    });
  const win = Math.max(2, Math.floor(fpsEffective * 0.6));
  const maHipX = ma(hipXNorm, win);
  const maHipY = ma(hipYNorm, win);
  const latRes = hipXNorm.map((v, i) => v - maHipX[i]);
  const vertRes = hipYNorm.map((v, i) => v - maHipY[i]);
  // Report true residual magnitudes (soft-cap only for display sanity, not floor)
  const rawLateralSway = Number(Math.min(std(latRes), 0.35).toFixed(4));
  const verticalBounce = Number(Math.min(std(vertRes), 0.3).toFixed(4));
  const rawStepWidthVariability = std(series.map((s) => s.stepWidth));

  const lateralSway = !isSagittal ? rawLateralSway : null;
  const stepWidthVariability = !isSagittal ? rawStepWidthVariability : null;

  // Same-side stride intervals (L→L, R→R)
  const strideIntervals: number[] = [];
  for (const side of ["left", "right"] as const) {
    const ts = heelStrikes.filter((e) => e.side === side).map((e) => e.timeSec);
    for (let i = 1; i < ts.length; i++) strideIntervals.push(ts[i] - ts[i - 1]);
  }
  const meanStride = mean(strideIntervals);
  const strideTimeCV = meanStride > 1e-6 ? std(strideIntervals) / meanStride : stepTimeCV;

  const hipDrops = series.map((s) => s.hipDrop);
  const rawPelvicObliquity = mean(hipDrops.map(Math.abs));
  const rawPelvicObliquityVar = std(hipDrops);
  const rawMeanStepWidth = mean(series.map((s) => s.stepWidth));

  const pelvicObliquity = !isSagittal ? rawPelvicObliquity : null;
  const pelvicObliquityVar = !isSagittal ? rawPelvicObliquityVar : null;
  const meanStepWidth = !isSagittal ? rawMeanStepWidth : null;

  // Trunk harmonic ratio removed: HR is defined on body-fixed trunk ACCELERATIONS with
  // per-stride segmentation (Menz 2003; Bellanca 2013; Pasciuto 2017). It measures
  // step-to-step symmetry, not rhythmicity, and no published work computes it from
  // camera-derived image-coordinate landmarks. It also depends on harmonics 10-20
  // (~9-18 Hz), which this pipeline's 6 Hz low-pass deletes before the FFT sees them.

  // Path smoothness along dominant progress axis (frontal approach → hip Y / size; sagittal → X)
  const rangeX = range(midHipX);
  const rangeY = range(midHipY);
  const prog = rangeX >= rangeY * 0.85 ? midHipX : midHipY;
  // Also use torso scale growth as progress for pure frontal approach (subject fills frame)
  const torsoProg = torsoS;
  const rangeTorso = range(torsoProg);
  const progPrimary =
    isFrontal && rangeTorso > range(prog) * 0.5 ? torsoProg : prog;
  const det = detrend(progPrimary);
  const pathSmoothness = Number(
    clamp(1 - std(det) / Math.max(range(progPrimary), 0.02), 0, 1).toFixed(2),
  );

  // Secondary exploratory composite scores (demoted indices, non-diagnostic)
  // Soft-saturate sway/bounce so frontal residual caps don't floor automaticity
  const softSway = Math.min(1, (lateralSway ?? rawLateralSway) / 0.08);
  const softBounce = Math.min(1, verticalBounce / 0.06);
  const effStepWidthVar = stepWidthVariability ?? rawStepWidthVariability;
  const effKneeFlexL = kneeFlexLeft ?? 45;
  const effKneeFlexR = kneeFlexRight ?? 45;
  const cvForScore = Math.min(stepTimeCV, 0.35);
  const strideCvForScore = Math.min(strideTimeCV, 0.4);

  const stabilityScore = clamp(
    100 - (softSway * 28 + softBounce * 22 + Math.min(effStepWidthVar, 0.25) * 35),
    8,
    98,
  );
  const rhythmScore = clamp(
    100 - cvForScore * 120 - Math.abs(cadenceSpm - 110) * 0.25,
    5,
    98,
  );
  const symmetryScore = clamp(
    100 - symmetryAngleVal * 1.8 - stepTimeSA * 0.8 - stepTimeAsymmetry * 15,
    8,
    98,
  );
  const mobilityScore = clamp(
    40 +
      Math.min(cadenceSpm, 130) * 0.25 +
      Math.min(armSwingLeft + armSwingRight, 2) * 12 +
      Math.min((effKneeFlexL + effKneeFlexR) / 2, 70) * 0.25 -
      doubleSupportHint * 25,
    5,
    98,
  );
  const automaticityScore = clamp(
    100 - cvForScore * 140 - strideCvForScore * 60 - softSway * 18 - (1 - pathSmoothness) * 20,
    5,
    98,
  );
  const overallScore = clamp(
    stabilityScore * 0.25 +
      rhythmScore * 0.15 +
      symmetryScore * 0.25 +
      mobilityScore * 0.15 +
      automaticityScore * 0.2,
    5,
    98,
  );

  const res: GaitMetrics = {
    viewAngle: angle,
    viewConfidence: confidence,
    durationSec,
    fpsEffective,
    stepCount,
    cadenceSpm,
    avgStepTimeSec,
    stepTimeAsymmetry,
    strideAsymmetry,
    lateralSway,
    verticalBounce,
    armSwingLeft,
    armSwingRight,
    armSwingAsymmetry,
    kneeFlexLeft,
    kneeFlexRight,
    kneeAsymmetry,
    stepWidthVariability,
    doubleSupportHint,
    leftStancePct,
    rightStancePct,
    leftSwingPct,
    rightSwingPct,
    doubleSupportPct,
    symmetryAngle: symmetryAngleVal,
    stepTimeCV,
    strideTimeCV,
    pelvicObliquity,
    pelvicObliquityVar,
    meanStepWidth,
    pathSmoothness,
    stabilityScore,
    rhythmScore,
    symmetryScore,
    mobilityScore,
    automaticityScore,
    overallScore,
    series: series.map((s) => ({
      t: s.t,
      midHipX: s.midHipX,
      midHipY: s.midHipY,
      leftAnkleY: s.leftAnkleY,
      rightAnkleY: s.rightAnkleY,
      leftWristX: s.leftWristX,
      rightWristX: s.rightWristX,
      leftKneeAngle: s.leftKneeAngle,
      rightKneeAngle: s.rightKneeAngle,
    })),
    stepEvents,
  };
  (res as Record<string, unknown>).samplingFps = fpsEffective;
  return res;
}

export function computeGaitMetrics(
  frames: PoseFrame[],
  options?: GaitAnalysisOptions | SmoothingMethod,
): GaitMetrics {
  const smoothingMethod: SmoothingMethod =
    typeof options === "string"
      ? options
      : options?.smoothingMethod ?? "savitzky-golay";

  const full = computeGaitMetricsCore(frames, smoothingMethod);
  if (frames.length < 10) {
    return full;
  }

  const halfN = Math.floor(frames.length / 2);
  const half1Frames = frames.slice(0, halfN);
  const half2Frames = frames.slice(halfN);

  const m1 = computeGaitMetricsCore(half1Frames, "none");
  const m2 = computeGaitMetricsCore(half2Frames, "none");

  const ci: Record<string, ReliabilityBounds> = {
    cadenceSpm: buildReliabilityBounds(full.cadenceSpm, m1.cadenceSpm, m2.cadenceSpm),
    cadence: buildReliabilityBounds(full.cadenceSpm, m1.cadenceSpm, m2.cadenceSpm),
    stepTimeCV: buildReliabilityBounds(full.stepTimeCV, m1.stepTimeCV, m2.stepTimeCV),
    symmetryAngle: buildReliabilityBounds(full.symmetryAngle, m1.symmetryAngle, m2.symmetryAngle),
    symmetryIndex: buildReliabilityBounds(full.symmetryAngle, m1.symmetryAngle, m2.symmetryAngle),
    strideTimeCV: buildReliabilityBounds(full.strideTimeCV, m1.strideTimeCV, m2.strideTimeCV),
    leftStancePct: buildReliabilityBounds(full.leftStancePct, m1.leftStancePct, m2.leftStancePct),
    rightStancePct: buildReliabilityBounds(full.rightStancePct, m1.rightStancePct, m2.rightStancePct),
    doubleSupportPct: buildReliabilityBounds(full.doubleSupportPct, m1.doubleSupportPct, m2.doubleSupportPct),
    kneeFlexLeft: buildReliabilityBounds(full.kneeFlexLeft, m1.kneeFlexLeft, m2.kneeFlexLeft),
    kneeFlexRight: buildReliabilityBounds(full.kneeFlexRight, m1.kneeFlexRight, m2.kneeFlexRight),
    lateralSway: buildReliabilityBounds(full.lateralSway, m1.lateralSway, m2.lateralSway),
    meanStepWidth: buildReliabilityBounds(full.meanStepWidth, m1.meanStepWidth, m2.meanStepWidth),
    pelvicObliquity: buildReliabilityBounds(full.pelvicObliquity, m1.pelvicObliquity, m2.pelvicObliquity),
  };

  full.confidenceIntervals = ci;
  return full;
}

function emptyMetrics(frames: PoseFrame[]): GaitMetrics {
  const res: GaitMetrics = {
    viewAngle: "unknown",
    viewConfidence: 0,
    durationSec: frames.length ? (frames[frames.length - 1].timeMs - frames[0].timeMs) / 1000 : 0,
    fpsEffective: 0,
    stepCount: 0,
    cadenceSpm: 0,
    avgStepTimeSec: 0,
    stepTimeAsymmetry: 0,
    strideAsymmetry: null,
    lateralSway: null,
    verticalBounce: 0,
    armSwingLeft: 0,
    armSwingRight: 0,
    armSwingAsymmetry: 0,
    kneeFlexLeft: null,
    kneeFlexRight: null,
    kneeAsymmetry: null,
    stepWidthVariability: null,
    doubleSupportHint: 0,
    leftStancePct: null,
    rightStancePct: null,
    leftSwingPct: null,
    rightSwingPct: null,
    doubleSupportPct: null,
    symmetryAngle: 0.0,
    stepTimeCV: 0,
    strideTimeCV: 0,
    pelvicObliquity: null,
    pelvicObliquityVar: null,
    meanStepWidth: null,
    pathSmoothness: 0,
    confidenceIntervals: {},
    stabilityScore: 0,
    rhythmScore: 0,
    symmetryScore: 0,
    mobilityScore: 0,
    automaticityScore: 0,
    overallScore: 0,
    series: [],
    stepEvents: [],
  };
  (res as Record<string, unknown>).samplingFps = 0;
  return res;
}

function detrend(xs: number[]): number[] {
  return olsDetrend(xs);
}

function nearestIndex(ts: number[], t: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ts.length; i++) {
    const d = Math.abs(ts[i] - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}



export type BiometricSignature = {
  aspectRatio: number;
  torsoLegRatio: number;
  shoulderHipRatio: number;
  meanVisibility?: number;
};

export type PersonTrack = {
  id: number;
  firstHip?: Landmark;
  lastHip: Landmark;
  frames: number;
  box: ReturnType<typeof boundingBox>;
  /** Sum of bbox areas for mean size ranking */
  areaSum: number;
  /** Sum of hip y (image coords) — lower/more bottom of frame often = nearer subject */
  hipYSum: number;
  /** Velocity vector for motion extrapolation (dx, dy per sample frame step) */
  velocity?: { vx: number; vy: number };
  /** Biometric signature derived from pose landmarks */
  biometrics?: BiometricSignature;
  /** Tracked sample frame indices */
  frameIndices?: number[];
  firstFrameIndex?: number;
  lastFrameIndex?: number;
};

export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature | undefined {
  if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 29) {
    return undefined;
  }

  // Required keypoints: 11 (L shoulder), 12 (R shoulder), 23 (L hip), 24 (R hip), 27 (L ankle), 28 (R ankle)
  const REQUIRED_INDICES = [11, 12, 23, 24, 27, 28];
  let visSum = 0;

  for (const idx of REQUIRED_INDICES) {
    const lm = landmarks[idx];
    if (!lm || typeof lm.x !== "number" || typeof lm.y !== "number" || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
      return undefined;
    }
    const vis = typeof lm.visibility === "number" && Number.isFinite(lm.visibility) ? lm.visibility : 1.0;
    if (vis < 0.4) {
      return undefined;
    }
    visSum += vis;
  }

  const meanVisibility = visSum / REQUIRED_INDICES.length;

  const box = boundingBox(landmarks);
  const h = Math.max(0.01, Number.isFinite(box.h) ? box.h : 0.01);
  const w = Math.max(0.01, Number.isFinite(box.w) ? box.w : 0.01);
  const aspectRatio = w / h;

  if (!Number.isFinite(aspectRatio)) {
    return undefined;
  }

  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const sMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const sMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const hMidX = (leftHip.x + rightHip.x) / 2;
  const hMidY = (leftHip.y + rightHip.y) / 2;

  const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);
  if (!Number.isFinite(torsoLen)) {
    return undefined;
  }

  const aMidX = (leftAnkle.x + rightAnkle.x) / 2;
  const aMidY = (leftAnkle.y + rightAnkle.y) / 2;
  const legLen = Math.max(0.01, Math.hypot(hMidX - aMidX, hMidY - aMidY));

  const torsoLegRatio = torsoLen / legLen;
  if (!Number.isFinite(torsoLegRatio)) {
    return undefined;
  }

  const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
  const hipW = Math.max(0.01, Math.hypot(leftHip.x - rightHip.x, leftHip.y - rightHip.y));
  const shoulderHipRatio = shoulderW / hipW;

  if (!Number.isFinite(shoulderHipRatio)) {
    return undefined;
  }

  return { aspectRatio, torsoLegRatio, shoulderHipRatio, meanVisibility };
}

export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
  if (!a || !b) return 0;

  if (
    !Number.isFinite(a.aspectRatio) ||
    !Number.isFinite(a.torsoLegRatio) ||
    !Number.isFinite(a.shoulderHipRatio) ||
    !Number.isFinite(b.aspectRatio) ||
    !Number.isFinite(b.torsoLegRatio) ||
    !Number.isFinite(b.shoulderHipRatio)
  ) {
    return 0;
  }

  const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
  const dTorsoLeg = Math.abs(a.torsoLegRatio - b.torsoLegRatio) / Math.max(0.1, a.torsoLegRatio, b.torsoLegRatio);
  const dShoulderHip = Math.abs(a.shoulderHipRatio - b.shoulderHipRatio) / Math.max(0.1, a.shoulderHipRatio, b.shoulderHipRatio);

  const isSagittal = a.aspectRatio < 0.35 && b.aspectRatio < 0.35;
  const wAspect = isSagittal ? 0.475 : 0.35;
  const wTorsoLeg = isSagittal ? 0.475 : 0.35;
  const wShoulderHip = isSagittal ? 0.05 : 0.30;

  const distVal = dAspect * wAspect + dTorsoLeg * wTorsoLeg + dShoulderHip * wShoulderHip;
  return Number.isFinite(distVal) ? distVal : 0;
}

/**
 * Likelihood that a detection is a standing human (vs pet / furniture noise).
 * aspectRatio is bbox width/height — upright bipeds are taller than wide (~0.2–0.7).
 * Pets and ground-level detections are typically wider relative to height.
 * Returns 0..1.
 */
export function humanLikenessScore(
  bio?: BiometricSignature,
  box?: { w: number; h: number },
): number {
  const ar = bio?.aspectRatio ?? (box ? box.w / Math.max(0.01, box.h) : 0.5);
  // Peak score for upright human frontal/sagittal; penalize square/wide (dogs, chairs)
  let arScore = 0;
  if (ar >= 0.18 && ar <= 0.62) arScore = 1;
  else if (ar > 0.62 && ar <= 0.85) arScore = 1 - (ar - 0.62) / 0.35;
  else if (ar > 0.85 && ar <= 1.15) arScore = 0.25;
  else if (ar < 0.18 && ar >= 0.1) arScore = ar / 0.18;
  else arScore = 0.05;

  const tl = bio?.torsoLegRatio ?? 0.55;
  // Human torso/leg ~0.3–1.0; extreme values are non-biped or broken landmarks
  let tlScore = 0.4;
  if (tl >= 0.28 && tl <= 1.05) tlScore = 1;
  else if (tl > 1.05 && tl <= 1.6) tlScore = 0.5;
  else if (tl >= 0.15 && tl < 0.28) tlScore = 0.55;

  const sh = bio?.shoulderHipRatio ?? 1.1;
  let shScore = 0.5;
  if (sh >= 0.7 && sh <= 1.8) shScore = 1;
  else if (sh > 1.8 && sh <= 2.5) shScore = 0.45;

  // Prefer larger subjects in frame (primary walker vs distant pet)
  const area = box ? box.w * box.h : 0.08;
  const areaScore = Math.min(1, Math.max(0.15, area / 0.12));

  return clamp(arScore * 0.45 + tlScore * 0.3 + shScore * 0.1 + areaScore * 0.15, 0, 1);
}

/** True when biometrics/box look like a walking human rather than a pet. */
export function isLikelyHumanTrack(
  bio?: BiometricSignature,
  box?: { w: number; h: number },
  minScore = 0.42,
): boolean {
  return humanLikenessScore(bio, box) >= minScore;
}

/**
 * Hungarian (Kuhn-Munkres) Algorithm for Minimum Cost Bipartite Matching.
 * Solves optimal assignment for a square K x K cost matrix in O(K^3) time.
 *
 * @param costMatrix Square K x K matrix of costs.
 * @returns Array where result[i] is the column index assigned to row i.
 */
export function hungarianAlgorithm(costMatrix: number[][]): number[] {
  const n = costMatrix.length;
  if (n === 0) return [];
  const m = costMatrix[0].length;

  const u = new Float64Array(n + 1);
  const v = new Float64Array(m + 1);
  const p = new Int32Array(m + 1);
  const way = new Int32Array(m + 1);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(m + 1).fill(Infinity);
    const used = new Uint8Array(m + 1).fill(0);

    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = costMatrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const result = new Int32Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) {
      result[p[j] - 1] = j - 1;
    }
  }

  return Array.from(result);
}

/** Multi-person tracking via velocity motion extrapolation, biometric signature matching, and Hungarian optimal assignment. */
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
  frameIndex?: number,
): number[] {
  const M = detections.length;
  const N = tracks.length;
  const assigned = new Array(M).fill(-1);
  if (M === 0) return [];

  const currentFrame = frameIndex ?? (tracks.length > 0 ? Math.max(...tracks.map(t => t.lastFrameIndex ?? 0)) + 1 : 0);

  if (N === 0) {
    for (let di = 0; di < M; di++) {
      const id = nextId.value++;
      assigned[di] = id;
      const box = boundingBox(detections[di]);
      const hip = hipCenter(detections[di]);
      const bio = computeBiometricSignature(detections[di]);
      tracks.push({
        id,
        firstHip: hip,
        lastHip: hip,
        frames: 1,
        box,
        areaSum: box.w * box.h,
        hipYSum: hip.y,
        biometrics: bio,
        firstFrameIndex: currentFrame,
        lastFrameIndex: currentFrame,
        frameIndices: [currentFrame],
        velocity: { vx: 0, vy: 0 },
      });
    }
    return assigned;
  }

  const SENTINEL_COST = 1e9;
  const K = Math.max(N, M);
  const costMatrix: number[][] = Array.from({ length: K }, () => new Array(K).fill(SENTINEL_COST));

  interface PairMeta {
    cost: number;
    spatialDist: number;
    bioDist: number;
    isDirectionFlip: boolean;
    maxAllowedDist: number;
    maxAllowedCost: number;
    isValid: boolean;
  }

  const metaMatrix: PairMeta[][] = Array.from({ length: N }, () => new Array(M));

  for (let ti = 0; ti < N; ti++) {
    const trk = tracks[ti];
    const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));
    const vx = trk.velocity?.vx ?? 0;
    const vy = trk.velocity?.vy ?? 0;
    const speed = Math.hypot(vx, vy);

    const predHip = {
      x: trk.lastHip.x + vx * gap,
      y: trk.lastHip.y + vy * gap,
      z: 0,
    };

    for (let di = 0; di < M; di++) {
      const hip = hipCenter(detections[di]);
      const bio = computeBiometricSignature(detections[di]);

      const distPred = dist(hip, predHip);
      const distLast = dist(hip, trk.lastHip);
      const minDist = Math.min(distPred, distLast);
      const isDirectionFlip = distLast < distPred * 0.8;
      const bioDist = trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0;

      const cost = minDist + bioDist * 0.25;

      const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (bioDist < 0.25 ? 0.08 : 0);
      const maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10);

      const isValid = minDist <= maxAllowedDist && cost <= maxAllowedCost;

      metaMatrix[ti][di] = {
        cost,
        spatialDist: minDist,
        bioDist,
        isDirectionFlip,
        maxAllowedDist,
        maxAllowedCost,
        isValid,
      };

      costMatrix[ti][di] = isValid ? cost : SENTINEL_COST;
    }
  }

  const assignments = hungarianAlgorithm(costMatrix);

  for (let ti = 0; ti < N; ti++) {
    const di = assignments[ti];
    if (di < 0 || di >= M) continue;

    const meta = metaMatrix[ti][di];
    if (!meta.isValid || costMatrix[ti][di] >= 1e8) continue;

    const trk = tracks[ti];
    const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));

    assigned[di] = trk.id;

    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);

    const stepVx = (hip.x - trk.lastHip.x) / gap;
    const stepVy = (hip.y - trk.lastHip.y) / gap;
    const oldVx = trk.velocity?.vx ?? 0;
    const oldVy = trk.velocity?.vy ?? 0;

    const dotProduct = oldVx * stepVx + oldVy * stepVy;
    const isReversal = dotProduct < 0 || meta.isDirectionFlip;
    const oldWeight = isReversal ? 0.2 : 0.5;
    const stepWeight = 1.0 - oldWeight;

    trk.velocity = {
      vx: oldWeight * oldVx + stepWeight * stepVx,
      vy: oldWeight * oldVy + stepWeight * stepVy,
    };

    if (bio) {
      if (trk.biometrics) {
        const meanVis = typeof bio.meanVisibility === "number" && Number.isFinite(bio.meanVisibility) ? bio.meanVisibility : 1.0;
        const alpha = Math.min(0.5, Math.max(0.05, 0.30 * meanVis));
        const oldW = 1.0 - alpha;

        const updatedAspect = oldW * trk.biometrics.aspectRatio + alpha * bio.aspectRatio;
        const updatedTorsoLeg = oldW * trk.biometrics.torsoLegRatio + alpha * bio.torsoLegRatio;
        const updatedShoulderHip = oldW * trk.biometrics.shoulderHipRatio + alpha * bio.shoulderHipRatio;
        const updatedVis = oldW * (trk.biometrics.meanVisibility ?? 1.0) + alpha * meanVis;

        if (Number.isFinite(updatedAspect) && Number.isFinite(updatedTorsoLeg) && Number.isFinite(updatedShoulderHip)) {
          trk.biometrics = {
            aspectRatio: updatedAspect,
            torsoLegRatio: updatedTorsoLeg,
            shoulderHipRatio: updatedShoulderHip,
            meanVisibility: updatedVis,
          };
        }
      } else {
        trk.biometrics = bio;
      }
    }

    trk.lastHip = hip;
    trk.frames += 1;
    trk.box = box;
    trk.areaSum += box.w * box.h;
    trk.hipYSum += hip.y;
    trk.lastFrameIndex = currentFrame;
    if (!trk.frameIndices) trk.frameIndices = [];
    trk.frameIndices.push(currentFrame);
  }

  for (let di = 0; di < M; di++) {
    if (assigned[di] !== -1) continue;
    const id = nextId.value++;
    assigned[di] = id;
    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);
    tracks.push({
      id,
      firstHip: hip,
      lastHip: hip,
      frames: 1,
      box,
      areaSum: box.w * box.h,
      hipYSum: hip.y,
      biometrics: bio,
      firstFrameIndex: currentFrame,
      lastFrameIndex: currentFrame,
      frameIndices: [currentFrame],
      velocity: { vx: 0, vy: 0 },
    });
  }

  return assigned;
}

/**
 * Merges fragmented tracklets belonging to the same subject (e.g. when walking across
 * frame causes track loss across sample steps, or momentary occlusion).
 */
export function mergeFragmentedTracks(tracks: PersonTrack[]): PersonTrack[] {
  if (tracks.length <= 1) return tracks;

  const result: PersonTrack[] = tracks.map((t) => ({
    ...t,
    frameIndices: [...(t.frameIndices || [])],
  }));

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const t1 = result[i];
        const t2 = result[j];

        const first1 = t1.firstFrameIndex ?? 0;
        const first2 = t2.firstFrameIndex ?? 0;

        const [earlier, later] = first1 <= first2 ? [t1, t2] : [t2, t1];
        const eLast = earlier.lastFrameIndex ?? 0;
        const lFirst = later.firstFrameIndex ?? 0;

        // Check frame index overlap (allow max 1 overlapping frame)
        const set1 = new Set(earlier.frameIndices || []);
        let overlap = 0;
        for (const idx of later.frameIndices || []) {
          if (set1.has(idx)) overlap++;
        }
        if (overlap > 1) continue;

        // Scale-invariant biometric distance gating
        const bioDist = biometricDistance(earlier.biometrics, later.biometrics);
        if (bioDist > 0.35) continue;

        const frameGap = Math.max(1, lFirst - eLast);

        // Forward and backward velocity projections
        const eVx = earlier.velocity?.vx ?? 0;
        const eVy = earlier.velocity?.vy ?? 0;
        const predHipForward = {
          x: earlier.lastHip.x + eVx * frameGap,
          y: earlier.lastHip.y + eVy * frameGap,
        };

        const lVx = later.velocity?.vx ?? 0;
        const lVy = later.velocity?.vy ?? 0;
        const predHipBackward = {
          x: later.firstHip ? later.firstHip.x - lVx * frameGap : later.lastHip.x - lVx * frameGap,
          y: later.firstHip ? later.firstHip.y - lVy * frameGap : later.lastHip.y - lVy * frameGap,
        };

        // Bidirectional endpoint spatial distance checks for U-turns / direction flips
        const eLastHip = earlier.lastHip;
        const eFirstHip = earlier.firstHip ?? earlier.lastHip;
        const lFirstHip = later.firstHip ?? later.lastHip;
        const lLastHip = later.lastHip;

        const dLastFirst = Math.hypot(eLastHip.x - lFirstHip.x, eLastHip.y - lFirstHip.y);
        const dFirstLast = Math.hypot(eFirstHip.x - lLastHip.x, eFirstHip.y - lLastHip.y);
        const dLastLast = Math.hypot(eLastHip.x - lLastHip.x, eLastHip.y - lLastHip.y);
        const dFirstFirst = Math.hypot(eFirstHip.x - lFirstHip.x, eFirstHip.y - lFirstHip.y);

        const directEndpointDist = Math.min(dLastFirst, dFirstLast, dLastLast, dFirstFirst);

        const gapDistForward = Math.hypot(lFirstHip.x - predHipForward.x, lFirstHip.y - predHipForward.y);
        const gapDistBackward = Math.hypot(eLastHip.x - predHipBackward.x, eLastHip.y - predHipBackward.y);

        const minDist = Math.min(gapDistForward, gapDistBackward, directEndpointDist);

        // Maximum allowed spatial distance based on gap duration
        const maxDist = 0.28 + Math.min(0.25, frameGap * 0.05);

        if (minDist <= maxDist && (bioDist < 0.32 || minDist <= 0.25)) {
          // Store frame counts before mutation for correct weighted averaging
          const w1 = earlier.frames;
          const w2 = later.frames;

          earlier.frames += later.frames;
          earlier.areaSum += later.areaSum;
          earlier.hipYSum += later.hipYSum;

          if ((later.lastFrameIndex ?? 0) >= (earlier.lastFrameIndex ?? 0)) {
            earlier.lastHip = later.lastHip;
            earlier.box = later.box;
            earlier.velocity = later.velocity;
            earlier.lastFrameIndex = later.lastFrameIndex;
          }
          if ((later.firstFrameIndex ?? 0) < (earlier.firstFrameIndex ?? 0)) {
            earlier.firstHip = later.firstHip ?? later.lastHip;
            earlier.firstFrameIndex = later.firstFrameIndex;
          }

          // Weighted average of scale-invariant biometric ratios
          if (earlier.biometrics && later.biometrics) {
            const totalW = w1 + w2;
            const eb = earlier.biometrics as any;
            const lb = later.biometrics as any;

            earlier.biometrics = {
              aspectRatio: (eb.aspectRatio * w1 + lb.aspectRatio * w2) / totalW,
              torsoLegRatio: ((eb.torsoLegRatio ?? eb.torsoRatio ?? 0.35) * w1 + (lb.torsoLegRatio ?? lb.torsoRatio ?? 0.35) * w2) / totalW,
              shoulderHipRatio: ((eb.shoulderHipRatio ?? eb.shoulderWidthRatio ?? 0.25) * w1 + (lb.shoulderHipRatio ?? lb.shoulderWidthRatio ?? 0.25) * w2) / totalW,
            };
          }

          earlier.frameIndices = Array.from(
            new Set([...(earlier.frameIndices || []), ...(later.frameIndices || [])])
          ).sort((a, b) => a - b);

          result.splice(result.indexOf(later), 1);
          mergedAny = true;
          break;
        }
      }
      if (mergedAny) break;
    }
  }

  return result;
}

/** Score tracks: prefer persistent, large, nearer (lower in frame) humans — demote pets. */
export function trackPriorityScore(t: PersonTrack): number {
  const meanArea = t.areaSum / Math.max(1, t.frames);
  const meanHipY = t.hipYSum / Math.max(1, t.frames);
  const speed = Math.hypot(t.velocity?.vx ?? 0, t.velocity?.vy ?? 0);
  const human = humanLikenessScore(t.biometrics, t.box);
  return (
    t.frames * 3 +
    meanArea * 80 +
    meanHipY * 8 +
    Math.min(1.0, speed * 10) * 20 +
    human * 55
  );
}

export function tracksToPeople(
  tracks: PersonTrack[],
  sampleIndex: number,
): TrackedPerson[] {
  const consolidated = mergeFragmentedTracks(tracks);
  const maxFrames = Math.max(1, ...consolidated.map((t) => t.frames));

  const humans = consolidated.filter((t) => {
    if (!(t.frames >= 2 || (maxFrames <= 2 && t.frames >= 1))) return false;
    // Drop clear non-humans (pets) when we have any plausible human track
    return isLikelyHumanTrack(t.biometrics, t.box, 0.45);
  });

  // Fallback: if filter emptied the list (odd poses / occlusion), keep original gate
  const pool = humans.length > 0 ? humans : consolidated.filter(
    (t) => t.frames >= 2 || (maxFrames <= 2 && t.frames >= 1),
  );

  return pool
    .sort((a, b) => trackPriorityScore(b) - trackPriorityScore(a))
    .map((t, i) => ({
      id: i + 1,
      color: PERSON_COLORS[i % PERSON_COLORS.length],
      sampleBox: t.box,
      sampleFrameIndex: sampleIndex,
      frameCount: t.frames,
      biometrics: t.biometrics,
    }));
}

export function computeDualTaskCost(
  single: GaitMetrics,
  dual: GaitMetrics,
): DualTaskCost {
  const dte = calculateDTE(single, dual);

  const cadenceCostPct = Number((-dte.cadenceDTE).toFixed(1));
  const stepTimeCvCostPct = Number((-dte.stepTimeCvDTE).toFixed(1));
  const stabilityCostPts = Number((single.stabilityScore - dual.stabilityScore).toFixed(1));
  const automaticityCostPts = Number((single.automaticityScore - dual.automaticityScore).toFixed(1));

  let summary = `Dual-Task Effect (${dte.cmiClassification}): Cadence DTE = ${dte.cadenceDTE}%, Step Time CV DTE = ${dte.stepTimeCvDTE}%, Symmetry DTE = ${dte.symmetryDTE}%.`;

  if (dte.cmiClassification === "mutual_interference") {
    summary += " Significant cognitive-motor mutual interference observed: both cadence and step rhythmicity degraded markedly under dual-task conditions.";
  } else if (dte.cmiClassification === "cognitive_prioritization") {
    summary += " Cognitive prioritization observed: motor performance declined during secondary task execution.";
  } else if (dte.cmiClassification === "motor_prioritization") {
    summary += " Motor prioritization observed: gait cadence or symmetry improved during dual-task execution.";
  } else {
    summary += " No significant cognitive-motor interference detected (|DTE| <= 5%).";
  }

  return {
    cadenceCostPct,
    stepTimeCvCostPct,
    stabilityCostPts,
    automaticityCostPts,
    summary,
    cadenceDTE: dte.cadenceDTE,
    stepTimeCvDTE: dte.stepTimeCvDTE,
    symmetryDTE: dte.symmetryDTE,
    cmiClassification: dte.cmiClassification,
  };
}

export function analyzeGait(
  frames: PoseFrame[],
  personId: number = 1,
  taskMode: TaskMode = "single",
  dualTaskCost?: DualTaskCost,
  patientMeta?: PatientMetadata,
  options?: GaitAnalysisOptions | SmoothingMethod,
): AnalysisResult {
  const metrics = computeGaitMetrics(frames, options);
  const angleAnalysis = computeGaitAngleAnalysis(
    frames,
    metrics.stepEvents || [],
    metrics.viewAngle || "unknown",
  );
  const guesses = buildEducatedGuesses(metrics, { taskMode, dualTaskCost });
  return {
    metrics,
    guesses,
    personId,
    analyzedFrames: frames.length,
    taskMode,
    dualTaskCost,
    angleAnalysis,
    patientMeta,
    notes: [
      `Analyzed ${frames.length} uniform 30Hz frames over ${metrics.durationSec.toFixed(1)}s`,
      `Effective sample rate ~${(((metrics as Record<string, unknown>).samplingFps as number) ?? metrics.fpsEffective).toFixed(1)} fps`,
      `View angle estimate: ${metrics.viewAngle}`,
      `Task mode: ${taskMode === "dual" ? "walk + cognitive" : "walk only"}`,
      ...(dualTaskCost
        ? [`Dual-task cadence DTE ${dualTaskCost.cadenceDTE?.toFixed(1)}% (${dualTaskCost.cmiClassification})`]
        : taskMode === "single"
          ? ["Saved as walk-only baseline for dual-task pairing"]
          : ["No walk-only baseline in session yet"]),
    ],
  };
}

export type Stride = {
  durationSec: number;
  [key: string]: unknown;
};

export function filterSteadyStateStrides<T extends number | Stride>(
  strideIntervals: T[]
): {
  steadyStrides: T[];
  excludedCount: number;
} {
  if (!strideIntervals || strideIntervals.length === 0) {
    return { steadyStrides: [], excludedCount: 0 };
  }
  if (strideIntervals.length < 3) {
    return { steadyStrides: [...strideIntervals], excludedCount: 0 };
  }

  const getDuration = (item: T): number =>
    typeof item === "number" ? item : (item as Stride).durationSec ?? 0;

  const durations = strideIntervals.map(getDuration);
  const sorted = [...durations].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  let startIndex = 0;
  let endIndex = strideIntervals.length - 1;
  const minKeep = Math.max(3, Math.floor(0.50 * strideIntervals.length));

  while (
    startIndex < endIndex &&
    endIndex - startIndex + 1 > minKeep &&
    median > 0 &&
    Math.abs(durations[startIndex] - median) / median > 0.40
  ) {
    startIndex++;
  }

  while (
    endIndex > startIndex &&
    endIndex - startIndex + 1 > minKeep &&
    median > 0 &&
    Math.abs(durations[endIndex] - median) / median > 0.40
  ) {
    endIndex--;
  }

  const steadyStrides = strideIntervals.slice(startIndex, endIndex + 1);
  const excludedCount = strideIntervals.length - steadyStrides.length;

  return { steadyStrides, excludedCount };
}



