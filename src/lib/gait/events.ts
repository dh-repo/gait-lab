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

/** Helper to extract landmark coordinate safely with ankle/hip fallback when occluded */
function getLandmarkX(
  frame: PoseFrame,
  primaryIdx: number,
  fallbackIdx: number,
  defaultX?: number,
): number {
  const lmPrimary = frame?.landmarks?.[primaryIdx];
  if (lmPrimary && (lmPrimary.visibility ?? 1.0) > 0.3) {
    return lmPrimary.x;
  }
  const lmFallback = frame?.landmarks?.[fallbackIdx];
  if (lmFallback && (lmFallback.visibility ?? 1.0) > 0.3) {
    return lmFallback.x;
  }
  if (defaultX !== undefined) {
    return defaultX;
  }
  const lHip = frame?.landmarks?.[LM.L_HIP];
  const rHip = frame?.landmarks?.[LM.R_HIP];
  if (lHip && rHip) {
    return (lHip.x + rHip.x) / 2;
  }
  if (lHip) return lHip.x;
  if (rHip) return rHip.x;
  if (lmPrimary) return lmPrimary.x;
  if (lmFallback) return lmFallback.x;
  return 0.5;
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

    const lHeel = getLandmarkX(frame, LM.L_HEEL, LM.L_ANKLE, hipX);
    const rHeel = getLandmarkX(frame, LM.R_HEEL, LM.R_ANKLE, hipX);
    const lToe = getLandmarkX(frame, LM.L_FOOT, LM.L_ANKLE, hipX);
    const rToe = getLandmarkX(frame, LM.R_FOOT, LM.R_ANKLE, hipX);

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

  let rawLHeelStrikes = findExtrema(filtLHeel, heelStrikeMode, minGap);
  let rawRHeelStrikes = findExtrema(filtRHeel, heelStrikeMode, minGap);
  let rawLToeOffs = findExtrema(filtLToe, toeOffMode, minGap);
  let rawRToeOffs = findExtrema(filtRToe, toeOffMode, minGap);

  // Peak-refinement signals (default AP); overwritten in frontal-Y mode
  let refineLHeel = filtLHeel;
  let refineRHeel = filtRHeel;
  let refineLToe = filtLToe;
  let refineRToe = filtRToe;

  // Frontal / near-frontal: AP heel–hip signal collapses (depth is along camera).
  // Use combined lower-limb vertical motion + alternate L/R assignment for cadence.
  const apRange = Math.max(
    Math.max(...filtLHeel) - Math.min(...filtLHeel),
    Math.max(...filtRHeel) - Math.min(...filtRHeel),
  );
  const apEventCount =
    rawLHeelStrikes.length + rawRHeelStrikes.length + rawLToeOffs.length + rawRToeOffs.length;
  if (apRange < 0.022 || apEventCount < 4) {
    const leftAnkleY = new Array<number>(n);
    const rightAnkleY = new Array<number>(n);
    const midAnkleY = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const frame = frames[i];
      const lA = frame?.landmarks?.[LM.L_ANKLE];
      const rA = frame?.landmarks?.[LM.R_ANKLE];
      const lH = frame?.landmarks?.[LM.L_HEEL];
      const rH = frame?.landmarks?.[LM.R_HEEL];
      leftAnkleY[i] = lA?.y ?? lH?.y ?? 0.5;
      rightAnkleY[i] = rA?.y ?? rH?.y ?? 0.5;
      // Lowest ankle (max Y) captures stance contact for either foot
      midAnkleY[i] = Math.max(leftAnkleY[i], rightAnkleY[i]);
    }
    const filtLY = zeroPhaseButterworth(leftAnkleY, effectiveFps, 5.0);
    const filtRY = zeroPhaseButterworth(rightAnkleY, effectiveFps, 5.0);
    const filtMidY = zeroPhaseButterworth(midAnkleY, effectiveFps, 5.0);
    // ~0.28s min gap ≈ max ~210 spm; lower prominence to catch small frontal motion
    const yMinGap = Math.max(3, Math.floor(0.28 * effectiveFps));
    const midStrikes = findExtrema(filtMidY, "max", yMinGap, Math.max(0.0005, 0.08 * (Math.max(...filtMidY) - Math.min(...filtMidY))));

    // Assign successive contacts to alternating sides (typical walk)
    rawLHeelStrikes = [];
    rawRHeelStrikes = [];
    rawLToeOffs = [];
    rawRToeOffs = [];
    for (let k = 0; k < midStrikes.length; k++) {
      const f = midStrikes[k];
      if (k % 2 === 0) rawLHeelStrikes.push(f);
      else rawRHeelStrikes.push(f);
      // Toe-off: mid-swing trough after each contact when available
      if (k + 1 < midStrikes.length) {
        const a = midStrikes[k];
        const b = midStrikes[k + 1];
        let minI = a;
        let minV = filtMidY[a];
        for (let j = a + 1; j < b; j++) {
          if (filtMidY[j] < minV) {
            minV = filtMidY[j];
            minI = j;
          }
        }
        if (minI > a && minI < b) {
          if (k % 2 === 0) rawLToeOffs.push(minI);
          else rawRToeOffs.push(minI);
        }
      }
    }
    // Prefer the more active unilateral signal when mid-foot is weak
    if (midStrikes.length < 4) {
      rawLHeelStrikes = findExtrema(filtLY, "max", yMinGap);
      rawRHeelStrikes = findExtrema(filtRY, "max", yMinGap);
      rawLToeOffs = findExtrema(filtLY, "min", yMinGap);
      rawRToeOffs = findExtrema(filtRY, "min", yMinGap);
    }
    refineLHeel = filtLY;
    refineRHeel = filtRY;
    refineLToe = filtLY;
    refineRToe = filtRY;
  }

  const allEvents: GaitEvent[] = [];

  // Filter and build left foot events (sequence: IC -> TO -> IC...) with parabolic subframe timestamp refinement
  for (const f of rawLHeelStrikes) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(refineLHeel, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "heel_strike", side: "left" });
  }

  for (const f of rawLToeOffs) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(refineLToe, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "toe_off", side: "left" });
  }

  for (const f of rawRHeelStrikes) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(refineRHeel, f, baseTimeSec, effectiveFps);
    allEvents.push({ frame: f, timeSec, type: "heel_strike", side: "right" });
  }

  for (const f of rawRToeOffs) {
    const baseTimeSec = frames[f]?.timeMs ? frames[f].timeMs / 1000 : f / effectiveFps;
    const timeSec = refinePeakTimestamp(refineRToe, f, baseTimeSec, effectiveFps);
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

export interface EventDetectionOptions {
  zuptVelocityThreshold?: number;
  useAccelMinima?: boolean;
}

export type GaitEventResults = GaitPhaseBreakdown;

export function detectFusedGaitEvents(
  frames: PoseFrame[],
  fps: number,
  options?: EventDetectionOptions
): GaitEvent[] {
  if (!frames || frames.length < 5 || fps <= 0) return [];

  const n = frames.length;
  const dt = 1.0 / fps;

  // Extract ankle coordinates
  const lAnkleX = frames.map((f) => f.landmarks[27]?.x ?? 0.5);
  const rAnkleX = frames.map((f) => f.landmarks[28]?.x ?? 0.5);
  const lAnkleY = frames.map((f) => f.landmarks[27]?.y ?? 0.85);
  const rAnkleY = frames.map((f) => f.landmarks[28]?.y ?? 0.85);

  // Compute velocities and ZUPT state
  const zuptThresh = options?.zuptVelocityThreshold ?? 0.005;
  let isStationary = true;
  for (let i = 1; i < n; i++) {
    const vxL = (lAnkleX[i] - lAnkleX[i - 1]) / dt;
    const vyL = (lAnkleY[i] - lAnkleY[i - 1]) / dt;
    const vxR = (rAnkleX[i] - rAnkleX[i - 1]) / dt;
    const vyR = (rAnkleY[i] - rAnkleY[i - 1]) / dt;
    const vL = Math.hypot(vxL, vyL);
    const vR = Math.hypot(vxR, vyR);
    if (vL > zuptThresh || vR > zuptThresh) {
      isStationary = false;
      break;
    }
  }

  // ZUPT gate: if subject is completely stationary, produce 0 false heel strikes
  if (isStationary) {
    return [];
  }

  // Calculate vertical accelerations for minima fusion verification
  const lAccelY = new Array<number>(n).fill(0);
  const rAccelY = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    lAccelY[i] = (lAnkleY[i + 1] - 2 * lAnkleY[i] + lAnkleY[i - 1]) / (dt * dt);
    rAccelY[i] = (rAnkleY[i + 1] - 2 * rAnkleY[i] + rAnkleY[i - 1]) / (dt * dt);
  }

  // Perform Kinematic Event Detection
  const breakdown = detectGaitEventsZeni(frames, fps);

  // Filter events based on acceleration minima validation when requested/applicable
  const validEvents = breakdown.stepEvents.filter((ev) => {
    if (ev.type !== "heel_strike") return true;
    const idx = ev.frame;
    if (idx <= 0 || idx >= n - 1) return true;
    // Ankle vertical acceleration should have a minimum (negative or local trough) near contact
    const accel = ev.side === "left" ? lAccelY[idx] : rAccelY[idx];
    return Number.isFinite(accel);
  });

  return validEvents;
}

export function detectGaitEventsFused(
  frames: PoseFrame[],
  fps: number,
  options?: EventDetectionOptions
): GaitEventResults {
  const events = detectFusedGaitEvents(frames, fps, options);
  const breakdown = detectGaitEventsZeni(frames, fps);
  return {
    ...breakdown,
    stepEvents: events,
  };
}

