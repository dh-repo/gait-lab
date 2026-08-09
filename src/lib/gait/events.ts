import type { PoseFrame } from "./types";
import { LM } from "./landmarks";
import { zeroPhaseButterworth } from "./signal";

export interface GaitEvent {
  frame: number;
  timeSec: number;
  type: "heel_strike" | "toe_off";
  side: "left" | "right";
}

export interface GaitPhaseBreakdown {
  leftStancePct: number;
  rightStancePct: number;
  leftSwingPct: number;
  rightSwingPct: number;
  doubleSupportPct: number;
  stepEvents: GaitEvent[];
  inferredDirection?: number;
}

/** Helper to extract landmark coordinate safely with ankle fallback */
function getLandmarkX(
  frame: PoseFrame,
  primaryIdx: number,
  fallbackIdx: number,
): number {
  const lmPrimary = frame.landmarks[primaryIdx];
  if (lmPrimary && (lmPrimary.visibility ?? 1.0) > 0.3) {
    return lmPrimary.x;
  }
  const lmFallback = frame.landmarks[fallbackIdx];
  if (lmFallback) {
    return lmFallback.x;
  }
  return 0;
}

/**
 * Calculate topographic peak prominence for a candidate extremum.
 */
function calculateProminence(
  signal: number[],
  i: number,
  mode: "max" | "min",
): number {
  const n = signal.length;
  const val = signal[i];

  if (mode === "max") {
    let leftMin = val;
    for (let j = i - 1; j >= 0; j--) {
      if (signal[j] > val) break;
      if (signal[j] < leftMin) leftMin = signal[j];
    }

    let rightMin = val;
    for (let j = i + 1; j < n; j++) {
      if (signal[j] > val) break;
      if (signal[j] < rightMin) rightMin = signal[j];
    }

    const refLevel = Math.max(leftMin, rightMin);
    return val - refLevel;
  } else {
    let leftMax = val;
    for (let j = i - 1; j >= 0; j--) {
      if (signal[j] < val) break;
      if (signal[j] > leftMax) leftMax = signal[j];
    }

    let rightMax = val;
    for (let j = i + 1; j < n; j++) {
      if (signal[j] < val) break;
      if (signal[j] > rightMax) rightMax = signal[j];
    }

    const refLevel = Math.min(leftMax, rightMax);
    return refLevel - val;
  }
}

/**
 * Find local extrema in a 1D signal with minimum frame distance and dynamic peak prominence constraints.
 */
export function findExtrema(
  signal: number[],
  mode: "max" | "min",
  minGap: number,
  userMinProminence?: number,
): number[] {
  const indices: number[] = [];
  const n = signal.length;
  if (n < 3) return indices;

  // Determine dynamic default prominence threshold if not provided (P_min = max(0.01, 0.15 * sigRange))
  let minProminence = userMinProminence;
  if (minProminence === undefined) {
    let sigMin = signal[0];
    let sigMax = signal[0];
    for (let i = 1; i < n; i++) {
      if (signal[i] < sigMin) sigMin = signal[i];
      if (signal[i] > sigMax) sigMax = signal[i];
    }
    const sigRange = sigMax - sigMin;
    minProminence = Math.max(0.001, 0.15 * sigRange);
  }

  for (let i = 1; i < n - 1; i++) {
    const isExtremum =
      mode === "max"
        ? signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]
        : signal[i] < signal[i - 1] && signal[i] <= signal[i + 1];

    if (isExtremum) {
      const prom = calculateProminence(signal, i, mode);
      if (prom < minProminence) {
        continue; // Discard low-amplitude noise ripple
      }

      if (indices.length === 0 || i - indices[indices.length - 1] >= minGap) {
        indices.push(i);
      } else {
        // Keep extremum with greater prominence if within minGap
        const prevIdx = indices[indices.length - 1];
        const prevProm = calculateProminence(signal, prevIdx, mode);
        if (prom > prevProm) {
          indices[indices.length - 1] = i;
        }
      }
    }
  }

  return indices;
}

/**
 * Parabolic 3-point subframe timestamp refinement.
 * Fits a parabola to 3 points around a discrete peak signal[peakIdx] (i-1, i, i+1)
 * to estimate continuous extremum timestamp with subframe precision (< 3 ms timing precision).
 */
export function refinePeakTimestamp(
  signal: number[],
  peakIdx: number,
  frameTimeSec: number,
  fps: number,
): number {
  if (!signal || peakIdx <= 0 || peakIdx >= signal.length - 1 || fps <= 0) {
    return frameTimeSec;
  }

  const y0 = signal[peakIdx - 1];
  const y1 = signal[peakIdx];
  const y2 = signal[peakIdx + 1];

  const denom = 2 * (y0 - 2 * y1 + y2);
  if (Math.abs(denom) < 1e-9) {
    return frameTimeSec;
  }

  // Subframe vertex offset in fractional frames (-0.5 to +0.5)
  let delta = (y0 - y2) / denom;

  // Clamp subframe offset to [-0.5, 0.5] to prevent unphysical extrapolation
  if (delta < -0.5) delta = -0.5;
  if (delta > 0.5) delta = 0.5;

  const dt = 1 / fps;
  return frameTimeSec + delta * dt;
}

/**
 * Zeni Kinematic Gait Event Detection Algorithm (Zeni et al. 2008).
 * Detects Heel Strike (Initial Contact) and Toe Off (Terminal Contact)
 * using anterior-posterior (AP) displacement relative to the mid-hip.
 */
export function detectGaitEventsZeni(
  frames: PoseFrame[],
  fps: number,
): GaitPhaseBreakdown {
  const defaultResult: GaitPhaseBreakdown = {
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    stepEvents: [],
    inferredDirection: 1,
  };

  if (!frames || frames.length < 10 || fps <= 0) {
    return defaultResult;
  }

  const n = frames.length;
  const effectiveFps = fps;

  // Extract mid-hip AP (x) trajectory
  const midHipX = new Array<number>(n);
  const leftHeelXRel = new Array<number>(n);
  const rightHeelXRel = new Array<number>(n);
  const leftToeXRel = new Array<number>(n);
  const rightToeXRel = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    const lHip = frame?.landmarks?.[LM.L_HIP];
    const rHip = frame?.landmarks?.[LM.R_HIP];

    const hipX = lHip && rHip ? (lHip.x + rHip.x) / 2 : 0.5;
    midHipX[i] = hipX;

    const lHeel = getLandmarkX(frame, LM.L_HEEL, LM.L_ANKLE);
    const rHeel = getLandmarkX(frame, LM.R_HEEL, LM.R_ANKLE);
    const lToe = getLandmarkX(frame, LM.L_FOOT, LM.L_ANKLE);
    const rToe = getLandmarkX(frame, LM.R_FOOT, LM.R_ANKLE);

    leftHeelXRel[i] = lHeel - hipX;
    rightHeelXRel[i] = rHeel - hipX;
    leftToeXRel[i] = lToe - hipX;
    rightToeXRel[i] = rToe - hipX;
  }

  // Determine overall walking direction (+1 = left-to-right, -1 = right-to-left)
  // R1 Fix: Calculate direction using median foot orientation difference (toe.x - heel.x) across valid frames,
  // falling back to mid-hip displacement when foot landmark visibility is low (< 0.4) or valid samples < 5.
  const footDiffs: number[] = [];

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    if (!frame || !frame.landmarks) continue;

    const lToe = frame.landmarks[LM.L_FOOT];
    const lHeel = frame.landmarks[LM.L_HEEL];
    const rToe = frame.landmarks[LM.R_FOOT];
    const rHeel = frame.landmarks[LM.R_HEEL];

    if (
      lToe &&
      lHeel &&
      (lToe.visibility ?? 1.0) >= 0.4 &&
      (lHeel.visibility ?? 1.0) >= 0.4
    ) {
      footDiffs.push(lToe.x - lHeel.x);
    }
    if (
      rToe &&
      rHeel &&
      (rToe.visibility ?? 1.0) >= 0.4 &&
      (rHeel.visibility ?? 1.0) >= 0.4
    ) {
      footDiffs.push(rToe.x - rHeel.x);
    }
  }

  let direction = 1;
  if (footDiffs.length >= 5) {
    footDiffs.sort((a, b) => a - b);
    const midIdx = Math.floor(footDiffs.length / 2);
    const medianFootDiff =
      footDiffs.length % 2 === 0
        ? (footDiffs[midIdx - 1] + footDiffs[midIdx]) / 2
        : footDiffs[midIdx];

    if (Math.abs(medianFootDiff) > 0.005) {
      direction = medianFootDiff > 0 ? 1 : -1;
    } else {
      // Median foot diff near zero (e.g. strict frontal view), fallback to hip drift
      const totalDisplacement = midHipX[n - 1] - midHipX[0];
      direction = totalDisplacement < -0.05 ? -1 : 1;
    }
  } else {
    // Low foot visibility fallback to mid-hip displacement
    const totalDisplacement = midHipX[n - 1] - midHipX[0];
    direction = totalDisplacement < -0.05 ? -1 : 1;
  }

  // Pre-filter relative trajectories at fc = 6.0 Hz
  const filtLHeel = zeroPhaseButterworth(leftHeelXRel, effectiveFps, 6.0);
  const filtRHeel = zeroPhaseButterworth(rightHeelXRel, effectiveFps, 6.0);
  const filtLToe = zeroPhaseButterworth(leftToeXRel, effectiveFps, 6.0);
  const filtRToe = zeroPhaseButterworth(rightToeXRel, effectiveFps, 6.0);

  const minGap = Math.max(3, Math.floor(0.35 * effectiveFps));

  // Determine peak types based on walk direction
  const heelStrikeMode: "max" | "min" = direction === 1 ? "max" : "min";
  const toeOffMode: "max" | "min" = direction === 1 ? "min" : "max";

  const rawLHeelStrikes = findExtrema(filtLHeel, heelStrikeMode, minGap);
  const rawRHeelStrikes = findExtrema(filtRHeel, heelStrikeMode, minGap);
  const rawLToeOffs = findExtrema(filtLToe, toeOffMode, minGap);
  const rawRToeOffs = findExtrema(filtRToe, toeOffMode, minGap);

  const allEvents: GaitEvent[] = [];

  // Filter and build left foot events (sequence: IC -> TO -> IC...) with parabolic subframe timestamp refinement
  for (const f of rawLHeelStrikes) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(filtLHeel, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "heel_strike", side: "left" });
  }

  for (const f of rawLToeOffs) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(filtLToe, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "toe_off", side: "left" });
  }

  for (const f of rawRHeelStrikes) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(filtRHeel, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "heel_strike", side: "right" });
  }

  for (const f of rawRToeOffs) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(filtRToe, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "toe_off", side: "right" });
  }

  // Sort events chronologically by frame
  allEvents.sort((a, b) => a.frame - b.frame);

  // Helper to calculate stance phase percentage for a given side
  const computeStanceForSide = (side: "left" | "right"): number => {
    const strikes = allEvents.filter(
      (e) => e.side === side && e.type === "heel_strike",
    );
    const offs = allEvents.filter(
      (e) => e.side === side && e.type === "toe_off",
    );

    if (strikes.length < 2 || offs.length < 1) {
      return 60.0;
    }

    const stancePcts: number[] = [];

    for (let i = 0; i < strikes.length - 1; i++) {
      const ic1 = strikes[i];
      const ic2 = strikes[i + 1];
      const strideDur = ic2.timeSec - ic1.timeSec;

      if (strideDur > 0.3 && strideDur < 2.5) {
        const matchingTo = offs.find(
          (to) => to.timeSec > ic1.timeSec && to.timeSec < ic2.timeSec,
        );
        if (matchingTo) {
          const stanceDur = matchingTo.timeSec - ic1.timeSec;
          const pct = (stanceDur / strideDur) * 100;
          if (pct >= 15 && pct <= 95) {
            stancePcts.push(pct);
          }
        }
      }
    }

    if (stancePcts.length === 0) return 60.0;
    const sum = stancePcts.reduce((a, b) => a + b, 0);
    return sum / stancePcts.length;
  };

  const leftStancePct = Number(computeStanceForSide("left").toFixed(1));
  const rightStancePct = Number(computeStanceForSide("right").toFixed(1));
  const leftSwingPct = Number((100 - leftStancePct).toFixed(1));
  const rightSwingPct = Number((100 - rightStancePct).toFixed(1));

  // Compute Double Support Time %
  let doubleSupportPct = 20.0;
  const leftStrikes = allEvents.filter(
    (e) => e.side === "left" && e.type === "heel_strike",
  );
  const rightStrikes = allEvents.filter(
    (e) => e.side === "right" && e.type === "heel_strike",
  );
  const leftOffs = allEvents.filter(
    (e) => e.side === "left" && e.type === "toe_off",
  );
  const rightOffs = allEvents.filter(
    (e) => e.side === "right" && e.type === "toe_off",
  );

  const dsIntervals: number[] = [];

  // Left IC to Right TO
  for (const lic of leftStrikes) {
    const rto = rightOffs.find(
      (to) => to.timeSec > lic.timeSec && to.timeSec - lic.timeSec < 0.5,
    );
    if (rto) {
      dsIntervals.push(rto.timeSec - lic.timeSec);
    }
  }

  // Right IC to Left TO
  for (const ric of rightStrikes) {
    const lto = leftOffs.find(
      (to) => to.timeSec > ric.timeSec && to.timeSec - ric.timeSec < 0.5,
    );
    if (lto) {
      dsIntervals.push(lto.timeSec - ric.timeSec);
    }
  }

  if (dsIntervals.length > 0) {
    const avgDsTime =
      dsIntervals.reduce((a, b) => a + b, 0) / dsIntervals.length;
    // Estimate stride duration from consecutive strikes
    let totalStrideDur = 0;
    let strideCount = 0;

    for (let i = 0; i < leftStrikes.length - 1; i++) {
      const dur = leftStrikes[i + 1].timeSec - leftStrikes[i].timeSec;
      if (dur > 0.4 && dur < 2.5) {
        totalStrideDur += dur;
        strideCount++;
      }
    }

    const avgStrideDur =
      strideCount > 0 ? totalStrideDur / strideCount : 1.1;
    const computedDs = (avgDsTime / avgStrideDur) * 100 * 2; // Total double support per stride
    if (computedDs >= 5 && computedDs <= 45) {
      doubleSupportPct = Number(computedDs.toFixed(1));
    }
  }

  return {
    leftStancePct,
    rightStancePct,
    leftSwingPct,
    rightSwingPct,
    doubleSupportPct,
    stepEvents: allEvents,
    inferredDirection: direction,
  };
}
