import { zeroPhaseButterworth } from "./signal";
import { detectGaitEventsZeni, refinePeakTimestamp, type GaitEvent } from "./events";
import { symmetryAngle } from "./symmetry";
import { computeHarmonicRatio } from "./smoothness";
import { calculateDTE } from "./dte";
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
  DualTaskCost,
  GaitMetrics,
  Landmark,
  PoseFrame,
  ReliabilityBounds,
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

function computeGaitMetricsCore(frames: PoseFrame[]): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

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

  // Calculate step and stride timing statistics from Heel Strikes
  const heelStrikes = stepEvents.filter((e) => e.type === "heel_strike");
  const stepCount = heelStrikes.length;
  const cadenceSpm = durationSec > 0 ? (stepCount / durationSec) * 60 : 0;

  const stepIntervals: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    stepIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
  }
  const avgStepTimeSec = mean(stepIntervals) || 0;
  const stepTimeCV = avgStepTimeSec > 1e-6 ? std(stepIntervals) / avgStepTimeSec : 0;

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

  // Overall composite Zifchock Symmetry Angle (SA) [0, 50]%
  const symmetryAngleVal = Number(((stepTimeSA + armSwingSA + kneeFlexSA) / (kneeFlexLeft != null ? 3 : 2)).toFixed(2));

  // Legacy percentage asymmetries retained for compatibility
  const stepTimeAsymmetry = asymmetryRatio(meanLeftStepTime, meanRightStepTime);
  const armSwingAsymmetry = asymmetryRatio(armSwingLeft, armSwingRight);
  const kneeAsymmetry = (kneeFlexLeft != null && kneeFlexRight != null) ? asymmetryRatio(kneeFlexLeft, kneeFlexRight) : null;

  // Stride length proxy: hip travel between same-side steps (valid in sagittal/oblique)
  const leftStride: number[] = [];
  const rightStride: number[] = [];
  for (let i = 1; i < heelStrikes.length; i++) {
    if (heelStrikes[i].side !== heelStrikes[i - 1].side) {
      const i0 = nearestIndex(series.map((s) => s.t), heelStrikes[i - 1].timeSec);
      const i1 = nearestIndex(series.map((s) => s.t), heelStrikes[i].timeSec);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (heelStrikes[i].side === "left") leftStride.push(travel);
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
  const latRes = hipXNorm.map((v, i) => v - ma(hipXNorm, win)[i]);
  const vertRes = hipYNorm.map((v, i) => v - ma(hipYNorm, win)[i]);
  const rawLateralSway = Math.min(std(latRes), 0.12);
  const verticalBounce = Math.min(std(vertRes), 0.1);
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

  // Compute FFT Trunk Harmonic Ratios (HR)
  const meanStrideSec = meanStride > 0 ? meanStride : (avgStepTimeSec > 0 ? avgStepTimeSec * 2 : undefined);
  const hrMetrics = computeHarmonicRatio(midHipY, midHipX, fps, meanStrideSec);
  const harmonicRatioVertical = hrMetrics.hrVertical;
  const harmonicRatioLateral = hrMetrics.hrLateral;
  const harmonicRatio = hrMetrics.overallHR;

  // Path smoothness: 1 - residual lateral deviation relative to progress
  const prog = midHipX;
  const det = detrend(prog);
  const linearSmoothness = clamp(1 - std(det) / Math.max(range(prog), 0.02), 0, 1);
  const pathSmoothness = Number((0.6 * linearSmoothness + 0.4 * Math.min(1.0, harmonicRatio / 3.0)).toFixed(2));

  // Secondary exploratory composite scores (demoted indices, non-diagnostic)
  const effSway = lateralSway ?? rawLateralSway;
  const effStepWidthVar = stepWidthVariability ?? rawStepWidthVariability;
  const effKneeFlexL = kneeFlexLeft ?? 45;
  const effKneeFlexR = kneeFlexRight ?? 45;

  const stabilityScore = clamp(
    100 - (effSway * 220 + verticalBounce * 180 + Math.min(effStepWidthVar, 0.25) * 35) + Math.min(harmonicRatioLateral, 3.0) * 6,
    8,
    98,
  );
  const rhythmScore = clamp(
    100 - stepTimeCV * 120 - Math.abs(cadenceSpm - 110) * 0.25 + (harmonicRatioVertical - 2.0) * 5,
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
    100 - stepTimeCV * 180 - strideTimeCV * 80 - effSway * 200 - (1 - pathSmoothness) * 25 + (harmonicRatioLateral - 1.5) * 4,
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
    harmonicRatioVertical,
    harmonicRatioLateral,
    harmonicRatio,
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

export function computeGaitMetrics(frames: PoseFrame[]): GaitMetrics {
  const full = computeGaitMetricsCore(frames);
  if (frames.length < 10) {
    return full;
  }

  const halfN = Math.floor(frames.length / 2);
  const half1Frames = frames.slice(0, halfN);
  const half2Frames = frames.slice(halfN);

  const m1 = computeGaitMetricsCore(half1Frames);
  const m2 = computeGaitMetricsCore(half2Frames);

  const ci: Record<string, ReliabilityBounds> = {
    cadenceSpm: buildReliabilityBounds(full.cadenceSpm, m1.cadenceSpm, m2.cadenceSpm),
    cadence: buildReliabilityBounds(full.cadenceSpm, m1.cadenceSpm, m2.cadenceSpm),
    stepTimeCV: buildReliabilityBounds(full.stepTimeCV, m1.stepTimeCV, m2.stepTimeCV),
    symmetryAngle: buildReliabilityBounds(full.symmetryAngle, m1.symmetryAngle, m2.symmetryAngle),
    symmetryIndex: buildReliabilityBounds(full.symmetryAngle, m1.symmetryAngle, m2.symmetryAngle),
    harmonicRatioVertical: buildReliabilityBounds(full.harmonicRatioVertical, m1.harmonicRatioVertical, m2.harmonicRatioVertical),
    harmonicRatioLateral: buildReliabilityBounds(full.harmonicRatioLateral, m1.harmonicRatioLateral, m2.harmonicRatioLateral),
    harmonicRatio: buildReliabilityBounds(full.harmonicRatio, m1.harmonicRatio, m2.harmonicRatio),
    harmonicRatioOverall: buildReliabilityBounds(full.harmonicRatio, m1.harmonicRatio, m2.harmonicRatio),
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
    harmonicRatioVertical: 1.0,
    harmonicRatioLateral: 1.0,
    harmonicRatio: 1.0,
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
  if (xs.length < 2) return xs.slice();
  const n = xs.length;
  const xMean = (n - 1) / 2;
  const yMean = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (xs[i] - yMean);
    den += (i - xMean) ** 2;
  }
  const slope = den ? num / den : 0;
  return xs.map((y, i) => y - (yMean + slope * (i - xMean)));
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



export type PersonTrack = {
  id: number;
  lastHip: Landmark;
  frames: number;
  box: ReturnType<typeof boundingBox>;
  /** Sum of bbox areas for mean size ranking */
  areaSum: number;
  /** Sum of hip y (image coords) — lower/more bottom of frame often = nearer subject */
  hipYSum: number;
};

/** Multi-person tracking via hip-center nearest neighbor + size-aware ranking. */
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
): number[] {
  const assigned = new Array(detections.length).fill(-1);
  const usedTracks = new Set<number>();

  const pairs: { di: number; ti: number; d: number }[] = [];
  for (let di = 0; di < detections.length; di++) {
    const hip = hipCenter(detections[di]);
    for (let ti = 0; ti < tracks.length; ti++) {
      const d = dist(hip, tracks[ti].lastHip);
      pairs.push({ di, ti, d });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  for (const p of pairs) {
    if (assigned[p.di] !== -1 || usedTracks.has(p.ti)) continue;
    if (p.d > 0.22) continue;
    assigned[p.di] = tracks[p.ti].id;
    usedTracks.add(p.ti);
    const box = boundingBox(detections[p.di]);
    const hip = hipCenter(detections[p.di]);
    tracks[p.ti].lastHip = hip;
    tracks[p.ti].frames += 1;
    tracks[p.ti].box = box;
    tracks[p.ti].areaSum += box.w * box.h;
    tracks[p.ti].hipYSum += hip.y;
  }

  for (let di = 0; di < detections.length; di++) {
    if (assigned[di] !== -1) continue;
    const id = nextId.value++;
    assigned[di] = id;
    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    tracks.push({
      id,
      lastHip: hip,
      frames: 1,
      box,
      areaSum: box.w * box.h,
      hipYSum: hip.y,
    });
  }
  return assigned;
}

/** Score tracks: prefer persistent, large, nearer (lower in frame) subjects — typical handheld follow shot. */
export function trackPriorityScore(t: PersonTrack): number {
  const meanArea = t.areaSum / Math.max(1, t.frames);
  const meanHipY = t.hipYSum / Math.max(1, t.frames);
  return t.frames * 3 + meanArea * 80 + meanHipY * 8;
}

export function tracksToPeople(
  tracks: PersonTrack[],
  sampleIndex: number,
): TrackedPerson[] {
  return tracks
    .filter((t) => t.frames >= 1)
    .sort((a, b) => trackPriorityScore(b) - trackPriorityScore(a))
    .map((t, i) => ({
      id: t.id,
      color: PERSON_COLORS[i % PERSON_COLORS.length],
      sampleBox: t.box,
      sampleFrameIndex: sampleIndex,
      frameCount: t.frames,
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
