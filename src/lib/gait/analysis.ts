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
  GaitMetrics,
  Landmark,
  PoseFrame,
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
  // Near-zero both sides → treat as symmetric (avoid 0 vs tiny → 100% asym)
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

  // Frontal: wide shoulders, more lateral travel, less depth asymmetry
  // Sagittal: narrower projected shoulder width, more limb separation in y, larger z hip split
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

  // Primary displacement direction of mid-hip
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
): { t: number; side: "L" | "R" }[] {
  if (signal.length < 12 || durationSec < 1.5) return [];
  const s = detrend(smooth(signal, 5));
  const n = s.length;
  const meanS = mean(s);
  const x = s.map((v) => v - meanS);
  // lag search: 0.35s–1.2s step period → cadence 50–170 spm
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
  const events: { t: number; side: "L" | "R" }[] = [];
  // place steps on local maxima near expected grid
  const peaks = findPeaks(s.map((v) => -v), Math.max(2, Math.floor(bestLag * 0.55)), 0);
  // if inverted peaks weak, use positive peaks
  const peaks2 = findPeaks(s, Math.max(2, Math.floor(bestLag * 0.55)), 0);
  const use = peaks.length >= peaks2.length ? peaks : peaks2;
  let side: "L" | "R" = "L";
  for (const i of use) {
    events.push({ t: times[i] ?? i * dt, side });
    side = side === "L" ? "R" : "L";
  }
  // If too few peaks, synthesize from period
  if (events.length < Math.max(4, durationSec / period - 1)) {
    events.length = 0;
    side = "L";
    for (let t = period * 0.5; t < durationSec - 0.1; t += period) {
      events.push({ t, side });
      side = side === "L" ? "R" : "L";
    }
  }
  return events;
}

export function computeGaitMetrics(frames: PoseFrame[]): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

  const { angle, confidence } = detectViewAngle(frames);
  const t0 = frames[0].timeMs;
  const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (frames.length - 1) / durationSec;

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

  // --- Step detection (multi-strategy; rear/frontal store walks need more than ankle-Y) ---
  const leftY = smooth(series.map((s) => s.leftAnkleY));
  const rightY = smooth(series.map((s) => s.rightAnkleY));
  const leftX = smooth(series.map((s) => s.leftAnkleX));
  const rightX = smooth(series.map((s) => s.rightAnkleX));
  const hipY = smooth(series.map((s) => s.midHipY));
  // Expect ~1.5–2.5 steps/s max → min spacing ~0.28–0.45s
  const minDist = Math.max(2, Math.floor(fpsEffective * 0.32));
  const prom = 0.004;

  let leftPeaks = findPeaks(leftY, minDist, prom);
  let rightPeaks = findPeaks(rightY, minDist, prom);

  // Strategy B: frontal/oblique stance — low lateral speed + relatively low ankle
  if (angle === "frontal" || angle === "oblique" || leftPeaks.length + rightPeaks.length < 3) {
    const lVel = leftX.map((v, i) => (i ? v - leftX[i - 1] : 0));
    const rVel = rightX.map((v, i) => (i ? v - rightX[i - 1] : 0));
    const lS = findLocalStance(leftY, lVel, minDist);
    const rS = findLocalStance(rightY, rVel, minDist);
    if (lS.length + rS.length > leftPeaks.length + rightPeaks.length) {
      leftPeaks = lS;
      rightPeaks = rS;
    }
  }

  // Strategy C: hip vertical bounce peaks → assign side by which ankle is lower (planted)
  // Works well for rear-follow phone video when feet are foreshortened.
  let hipPeaks = findPeaks(hipY, minDist, 0.002);
  if (hipPeaks.length < 3) {
    // try inverted (image y may bounce either way depending on camera pitch)
    hipPeaks = findPeaks(
      hipY.map((v) => -v),
      minDist,
      0.002,
    );
  }

  // Strategy D: ankle height crossover events (which foot is lower changes)
  const sideLead: ("L" | "R" | null)[] = series.map((_, i) => {
    const dy = leftY[i] - rightY[i];
    if (Math.abs(dy) < 0.004) return null;
    return dy > 0 ? "L" : "R"; // higher y = lower in image = more planted
  });
  const crossIdx: number[] = [];
  for (let i = 1; i < sideLead.length; i++) {
    if (sideLead[i] && sideLead[i - 1] && sideLead[i] !== sideLead[i - 1]) {
      if (!crossIdx.length || i - crossIdx[crossIdx.length - 1] >= minDist) crossIdx.push(i);
    }
  }

  let stepEvents: { t: number; side: "L" | "R" }[] = [];
  for (const i of leftPeaks) stepEvents.push({ t: series[i].t, side: "L" });
  for (const i of rightPeaks) stepEvents.push({ t: series[i].t, side: "R" });

  // If ankle strategies are weak, prefer hip peaks + foot side, or crossovers
  const ankleCount = stepEvents.length;
  if (ankleCount < Math.max(4, durationSec * 0.8)) {
    const fromHip: typeof stepEvents = [];
    for (const i of hipPeaks) {
      const side: "L" | "R" = leftY[i] >= rightY[i] ? "L" : "R";
      fromHip.push({ t: series[i].t, side });
    }
    if (fromHip.length > ankleCount) stepEvents = fromHip;
  }
  if (stepEvents.length < Math.max(4, durationSec * 0.8) && crossIdx.length >= 3) {
    stepEvents = crossIdx.map((i) => ({
      t: series[i].t,
      side: (sideLead[i] || "L") as "L" | "R",
    }));
  }

  stepEvents.sort((a, b) => a.t - b.t);

  // Deduplicate near-simultaneous; enforce alternating sides when possible
  const deduped: typeof stepEvents = [];
  for (const e of stepEvents) {
    if (deduped.length && Math.abs(e.t - deduped[deduped.length - 1].t) < 0.2) {
      continue;
    }
    // drop impossibly fast steps (< 0.28s)
    if (deduped.length && e.t - deduped[deduped.length - 1].t < 0.28) continue;
    deduped.push(e);
  }

  // Fallback: oscillation period from hip/ankle when discrete detectors under-count
  // (common in rear-follow phone video with foreshortened feet).
  const expectedMinSteps = Math.max(4, durationSec * 0.7); // ~42 spm floor for a walk clip
  if (deduped.length < expectedMinSteps) {
    const times = series.map((s) => s.t);
    const candidates = [
      estimateStepsFromOscillation(hipY, times, durationSec),
      estimateStepsFromOscillation(
        series.map((s, i) => (leftY[i] + rightY[i]) / 2),
        times,
        durationSec,
      ),
      estimateStepsFromOscillation(
        series.map((s, i) => Math.abs(leftX[i] - rightX[i])),
        times,
        durationSec,
      ),
    ];
    candidates.sort((a, b) => b.length - a.length);
    if (candidates[0].length > deduped.length) {
      deduped.length = 0;
      for (const e of candidates[0]) {
        if (deduped.length && e.t - deduped[deduped.length - 1].t < 0.28) continue;
        deduped.push(e);
      }
    }
  }

  const stepCount = deduped.length;
  const cadenceSpm = durationSec > 0 ? (stepCount / durationSec) * 60 : 0;

  const stepIntervals: number[] = [];
  for (let i = 1; i < deduped.length; i++) {
    stepIntervals.push(deduped[i].t - deduped[i - 1].t);
  }
  const avgStepTimeSec = mean(stepIntervals) || 0;

  const leftIntervals: number[] = [];
  const rightIntervals: number[] = [];
  for (let i = 1; i < deduped.length; i++) {
    if (deduped[i].side === "L" && deduped[i - 1].side === "L") {
      // skip same side consecutive if any
    }
    if (deduped[i].side === "L") leftIntervals.push(deduped[i].t - deduped[i - 1].t);
    if (deduped[i].side === "R") rightIntervals.push(deduped[i].t - deduped[i - 1].t);
  }
  const stepTimeAsymmetry = asymmetryRatio(mean(leftIntervals) || avgStepTimeSec, mean(rightIntervals) || avgStepTimeSec);

  // Stride length proxy: hip travel between same-side steps, normalized by torso
  const leftStride: number[] = [];
  const rightStride: number[] = [];
  for (let i = 1; i < deduped.length; i++) {
    if (deduped[i].side !== deduped[i - 1].side) {
      const i0 = nearestIndex(series.map((s) => s.t), deduped[i - 1].t);
      const i1 = nearestIndex(series.map((s) => s.t), deduped[i].t);
      const travel = Math.hypot(
        series[i1].midHipX - series[i0].midHipX,
        series[i1].midHipY - series[i0].midHipY,
      ) / mean(series.map((s) => s.torso));
      if (deduped[i].side === "L") leftStride.push(travel);
      else rightStride.push(travel);
    }
  }
  const strideAsymmetry = asymmetryRatio(mean(leftStride) || 0, mean(rightStride) || 0);

  const midHipX = smooth(series.map((s) => s.midHipX));
  const midHipY = smooth(series.map((s) => s.midHipY));
  const torsoS = series.map((s) => s.torso);
  const meanTorso = mean(torsoS) || 1;
  // Follow-cam safe sway: high-frequency residual of scale-normalized hip
  // (short moving average removes path + operator pan; keeps true wobble).
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
  let lateralSway = std(latRes);
  let verticalBounce = std(vertRes);
  lateralSway = Math.min(lateralSway, 0.12);
  verticalBounce = Math.min(verticalBounce, 0.1);

  const armSwingLeft = range(series.map((s) => s.leftWristRel));
  const armSwingRight = range(series.map((s) => s.rightWristRel));
  const armSwingAsymmetry = asymmetryRatio(armSwingLeft, armSwingRight);

  const kneeFlexLeft = range(series.map((s) => s.leftKneeAngle));
  const kneeFlexRight = range(series.map((s) => s.rightKneeAngle));
  const kneeAsymmetry = asymmetryRatio(kneeFlexLeft, kneeFlexRight);

  const stepWidthVariability = std(series.map((s) => s.stepWidth));

  // Double support hint: fraction of frames where both ankles are relatively low
  const leftRel = series.map((s, i) => leftY[i] - midHipY[i]);
  const rightRel = series.map((s, i) => rightY[i] - midHipY[i]);
  const lThresh = mean(leftRel) + 0.15 * std(leftRel);
  const rThresh = mean(rightRel) + 0.15 * std(rightRel);
  let bothLow = 0;
  for (let i = 0; i < series.length; i++) {
    if (leftRel[i] > lThresh && rightRel[i] > rThresh) bothLow++;
  }
  const doubleSupportHint = bothLow / series.length;

  // Variability (literature: stride/step-time CV is more informative than mean speed alone)
  const stepTimeCV =
    avgStepTimeSec > 1e-6 ? std(stepIntervals) / avgStepTimeSec : 0;

  // Same-side stride intervals (L→L, R→R)
  const strideIntervals: number[] = [];
  for (const side of ["L", "R"] as const) {
    const ts = deduped.filter((e) => e.side === side).map((e) => e.t);
    for (let i = 1; i < ts.length; i++) strideIntervals.push(ts[i] - ts[i - 1]);
  }
  const meanStride = mean(strideIntervals);
  const strideTimeCV = meanStride > 1e-6 ? std(strideIntervals) / meanStride : stepTimeCV;

  const hipDrops = series.map((s) => s.hipDrop);
  const pelvicObliquity = mean(hipDrops.map(Math.abs));
  const pelvicObliquityVar = std(hipDrops);
  const meanStepWidth = mean(series.map((s) => s.stepWidth));

  // Path smoothness: 1 - residual lateral deviation relative to progress
  const prog = series.map((s) => s.midHipX);
  const det = detrend(prog);
  const pathSmoothness = clamp(
    1 - std(det) / Math.max(range(prog), 0.02),
    0,
    1,
  );

  // Composite scores 0-100
  const stabilityScore = clamp(
    100 - (lateralSway * 220 + verticalBounce * 180 + Math.min(stepWidthVariability, 0.25) * 35),
    8,
    98,
  );
  const rhythmScore = clamp(
    100 -
      stepTimeCV * 120 -
      Math.abs(cadenceSpm - 110) * 0.25,
    5,
    98,
  );
  const symmetryScore = clamp(
    100 -
      (stepTimeAsymmetry * 55 +
        strideAsymmetry * 45 +
        armSwingAsymmetry * 20 +
        kneeAsymmetry * 25),
    8,
    98,
  );
  const mobilityScore = clamp(
    40 +
      Math.min(cadenceSpm, 130) * 0.25 +
      Math.min(armSwingLeft + armSwingRight, 2) * 12 +
      Math.min((kneeFlexLeft + kneeFlexRight) / 2, 70) * 0.25 -
      doubleSupportHint * 25,
    5,
    98,
  );
  // Automaticity-ish score: low variability + decent stability (research dual-task literature)
  const automaticityScore = clamp(
    100 - stepTimeCV * 180 - strideTimeCV * 80 - lateralSway * 200 - (1 - pathSmoothness) * 25,
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

  return {
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
    stepEvents: deduped,
  };
}

function emptyMetrics(frames: PoseFrame[]): GaitMetrics {
  return {
    viewAngle: "unknown",
    viewConfidence: 0,
    durationSec: frames.length ? (frames[frames.length - 1].timeMs - frames[0].timeMs) / 1000 : 0,
    fpsEffective: 0,
    stepCount: 0,
    cadenceSpm: 0,
    avgStepTimeSec: 0,
    stepTimeAsymmetry: 0,
    strideAsymmetry: 0,
    lateralSway: 0,
    verticalBounce: 0,
    armSwingLeft: 0,
    armSwingRight: 0,
    armSwingAsymmetry: 0,
    kneeFlexLeft: 0,
    kneeFlexRight: 0,
    kneeAsymmetry: 0,
    stepWidthVariability: 0,
    doubleSupportHint: 0,
    stepTimeCV: 0,
    strideTimeCV: 0,
    pelvicObliquity: 0,
    pelvicObliquityVar: 0,
    meanStepWidth: 0,
    pathSmoothness: 0,
    stabilityScore: 0,
    rhythmScore: 0,
    symmetryScore: 0,
    mobilityScore: 0,
    automaticityScore: 0,
    overallScore: 0,
    series: [],
    stepEvents: [],
  };
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

function findLocalStance(ankleY: number[], vel: number[], minDist: number): number[] {
  const peaks: number[] = [];
  for (let i = 2; i < ankleY.length - 2; i++) {
    const slow = Math.abs(vel[i]) <= mean(vel.map(Math.abs)) * 0.55;
    const low =
      ankleY[i] >= ankleY[i - 1] &&
      ankleY[i] >= ankleY[i + 1] &&
      ankleY[i] >= mean(ankleY);
    if (slow && low) {
      if (peaks.length && i - peaks[peaks.length - 1] < minDist) {
        if (ankleY[i] > ankleY[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      } else {
        peaks.push(i);
      }
    }
  }
  return peaks;
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
    if (p.d > 0.22) continue; // tighter to reduce ID swaps in multi-person aisles
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
  // frames dominate; size next; slight bias for lower-in-frame (closer when filming from behind)
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
): import("./types").DualTaskCost {
  const pct = (a: number, b: number) => {
    if (Math.abs(a) < 1e-6) return 0;
    return ((b - a) / Math.abs(a)) * 100;
  };
  // Dual-task cost: positive = worse under dual task for most markers
  // Cadence usually drops under dual task → cost = (single - dual) / single
  const cadenceCostPct =
    single.cadenceSpm > 1
      ? ((single.cadenceSpm - dual.cadenceSpm) / single.cadenceSpm) * 100
      : 0;
  const stepTimeCvCostPct = pct(Math.max(single.stepTimeCV, 0.01), dual.stepTimeCV);
  const stabilityCostPts = single.stabilityScore - dual.stabilityScore;
  const automaticityCostPts = single.automaticityScore - dual.automaticityScore;

  let summary =
    "Dual-task cost compares walk-only vs walk+cognitive task. Higher cost means gait degraded more when attention was split.";
  const high =
    cadenceCostPct > 15 ||
    stepTimeCvCostPct > 25 ||
    automaticityCostPts > 12;
  if (high) {
    summary +=
      " This clip pair shows a relatively large dual-task effect — a research-style signal sometimes linked to cognitive–motor interference, but also fatigue, environment, or task difficulty.";
  } else {
    summary +=
      " Dual-task change is modest in this pair — gait held up reasonably under the secondary task (or tasks were too similar).";
  }

  return {
    cadenceCostPct,
    stepTimeCvCostPct,
    stabilityCostPts,
    automaticityCostPts,
    summary,
  };
}
