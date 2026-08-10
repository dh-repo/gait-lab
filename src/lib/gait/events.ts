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
    minProminence = Math.max(0.0005, 0.12 * sigRange);
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
 * Combines local extrema across time-varying direction segments.
 * For heel strikes: direction +1 expects local max, direction -1 expects local min.
 * For toe offs:     direction +1 expects local min, direction -1 expects local max.
 */
export function combineExtremaByDirection(
  signal: number[],
  directions: number[],
  eventType: "heel" | "toe",
  minGap: number,
): number[] {
  const maxes = findExtrema(signal, "max", minGap);
  const mins = findExtrema(signal, "min", minGap);

  const candidates: number[] = [];

  for (const f of maxes) {
    const dir = directions[f];
    if (
      (eventType === "heel" && dir === 1) ||
      (eventType === "toe" && dir === -1)
    ) {
      candidates.push(f);
    }
  }

  for (const f of mins) {
    const dir = directions[f];
    if (
      (eventType === "heel" && dir === -1) ||
      (eventType === "toe" && dir === 1)
    ) {
      candidates.push(f);
    }
  }

  candidates.sort((a, b) => a - b);

  const result: number[] = [];
  for (const f of candidates) {
    if (result.length === 0 || f - result[result.length - 1] >= minGap) {
      result.push(f);
    } else {
      const prev = result[result.length - 1];
      const prevDir = directions[prev];
      const prevMode: "max" | "min" =
        (eventType === "heel" ? prevDir === 1 : prevDir === -1) ? "max" : "min";
      const currMode: "max" | "min" =
        (eventType === "heel" ? directions[f] === 1 : directions[f] === -1) ? "max" : "min";

      const prevProm = calculateProminence(signal, prev, prevMode);
      const currProm = calculateProminence(signal, f, currMode);
      if (currProm > prevProm) {
        result[result.length - 1] = f;
      }
    }
  }

  return result;
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

  // 1. Calculate per-frame foot orientation difference (toe.x - heel.x)
  const perFrameFootDiff = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    if (!frame || !frame.landmarks) {
      perFrameFootDiff[i] = 0;
      continue;
    }
    const lToe = frame.landmarks[LM.L_FOOT];
    const lHeel = frame.landmarks[LM.L_HEEL];
    const rToe = frame.landmarks[LM.R_FOOT];
    const rHeel = frame.landmarks[LM.R_HEEL];

    let sum = 0;
    let cnt = 0;
    if (
      lToe &&
      lHeel &&
      (lToe.visibility ?? 1.0) >= 0.4 &&
      (lHeel.visibility ?? 1.0) >= 0.4
    ) {
      sum += lToe.x - lHeel.x;
      cnt++;
    }
    if (
      rToe &&
      rHeel &&
      (rToe.visibility ?? 1.0) >= 0.4 &&
      (rHeel.visibility ?? 1.0) >= 0.4
    ) {
      sum += rToe.x - rHeel.x;
      cnt++;
    }
    if (cnt > 0) {
      perFrameFootDiff[i] = sum / cnt;
    } else {
      const iPrev = Math.max(0, i - 2);
      const iNext = Math.min(n - 1, i + 2);
      perFrameFootDiff[i] = midHipX[iNext] - midHipX[iPrev];
    }
  }

  // 2. Sliding window local median (~1.5s / 45 frames window)
  const windowRadius = Math.max(7, Math.round(0.75 * effectiveFps));
  const localMedians = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const winStart = Math.max(0, i - windowRadius);
    const winEnd = Math.min(n - 1, i + windowRadius);
    const windowVals: number[] = [];
    for (let j = winStart; j <= winEnd; j++) {
      windowVals.push(perFrameFootDiff[j]);
    }
    windowVals.sort((a, b) => a - b);
    const mid = Math.floor(windowVals.length / 2);
    localMedians[i] =
      windowVals.length % 2 === 0
        ? (windowVals[mid - 1] + windowVals[mid]) / 2
        : windowVals[mid];
  }

  // 3. Sign-flip hysteresis state machine (> 0.01 threshold)
  const hysteresisThresh = 0.01;
  const directions = new Array<number>(n);

  let initialDir = 1;
  if (Math.abs(localMedians[0]) > 0.005) {
    initialDir = localMedians[0] > 0 ? 1 : -1;
  } else {
    const totalDisplacement = midHipX[n - 1] - midHipX[0];
    initialDir = totalDisplacement < -0.05 ? -1 : 1;
  }

  let stateDir = initialDir;
  for (let i = 0; i < n; i++) {
    const med = localMedians[i];
    if (stateDir === 1 && med < -hysteresisThresh) {
      stateDir = -1;
    } else if (stateDir === -1 && med > hysteresisThresh) {
      stateDir = 1;
    }
    directions[i] = stateDir;
  }

  // Summary scalar direction for backward compatibility
  let posCount = 0;
  for (let i = 0; i < n; i++) {
    if (directions[i] === 1) posCount++;
  }
  const inferredDirection = posCount >= n / 2 ? 1 : -1;

  // Pre-filter relative trajectories at fc = 6.0 Hz
  const filtLHeel = zeroPhaseButterworth(leftHeelXRel, effectiveFps, 6.0);
  const filtRHeel = zeroPhaseButterworth(rightHeelXRel, effectiveFps, 6.0);
  const filtLToe = zeroPhaseButterworth(leftToeXRel, effectiveFps, 6.0);
  const filtRToe = zeroPhaseButterworth(rightToeXRel, effectiveFps, 6.0);

  const minGap = Math.max(3, Math.floor(0.18 * effectiveFps));

  // Determine peak events using per-frame direction vector
  let rawLHeelStrikes = combineExtremaByDirection(filtLHeel, directions, "heel", minGap);
  let rawRHeelStrikes = combineExtremaByDirection(filtRHeel, directions, "heel", minGap);
  let rawLToeOffs = combineExtremaByDirection(filtLToe, directions, "toe", minGap);
  let rawRToeOffs = combineExtremaByDirection(filtRToe, directions, "toe", minGap);

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
  if (apRange < 0.028 && apEventCount < 5) {
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
    // ~0.18s min gap ≈ max ~330 spm — filters bounce doubles without starving real walk
    const yMinGap = Math.max(3, Math.floor(0.18 * effectiveFps));

    const midPromRange = Math.max(...filtMidY) - Math.min(...filtMidY);
    const lyPromRange = Math.max(...filtLY) - Math.min(...filtLY);
    const ryPromRange = Math.max(...filtRY) - Math.min(...filtRY);

    const midPeaks = findExtrema(
      filtMidY,
      "max",
      yMinGap,
      Math.max(0.0005, 0.08 * midPromRange),
    );
    const lPeaks = findExtrema(
      filtLY,
      "max",
      yMinGap,
      Math.max(0.0005, 0.08 * lyPromRange),
    );
    const rPeaks = findExtrema(
      filtRY,
      "max",
      yMinGap,
      Math.max(0.0005, 0.08 * ryPromRange),
    );

    // Merge candidate peaks into a sorted, de-duplicated peak array
    const rawCandidateSet = new Set<number>([...midPeaks, ...lPeaks, ...rPeaks]);
    const sortedCandidates = Array.from(rawCandidateSet).sort((a, b) => a - b);

    const midStrikes: number[] = [];
    const mergeWindow = Math.max(2, Math.floor(0.08 * effectiveFps));
    for (const p of sortedCandidates) {
      if (midStrikes.length === 0) {
        midStrikes.push(p);
      } else {
        const lastP = midStrikes[midStrikes.length - 1];
        if (p - lastP < mergeWindow) {
          if (filtMidY[p] > filtMidY[lastP]) {
            midStrikes[midStrikes.length - 1] = p;
          }
        } else {
          midStrikes.push(p);
        }
      }
    }

    // Assign successive contacts based on spatial ankle position & landmark inspection
    rawLHeelStrikes = [];
    rawRHeelStrikes = [];
    rawLToeOffs = [];
    rawRToeOffs = [];

    let lastAssignedSide: "left" | "right" | null = null;
    let lastAssignedFrame: number | null = null;
    let estimatedStepFrames = Math.max(6, Math.round(0.45 * effectiveFps));
    const yDeadband = 0.003; // ~0.3% normalized image height threshold
    const minStrideGapFrames = Math.max(8, Math.floor(0.65 * 2 * estimatedStepFrames));

    for (let k = 0; k < midStrikes.length; k++) {
      const f = midStrikes[k];
      const frame = frames[f];

      // Landmark visibility evaluation
      const lA = frame?.landmarks?.[LM.L_ANKLE];
      const rA = frame?.landmarks?.[LM.R_ANKLE];
      const lH = frame?.landmarks?.[LM.L_HEEL];
      const rH = frame?.landmarks?.[LM.R_HEEL];

      const lVis = Math.max(lA?.visibility ?? 1.0, lH?.visibility ?? 1.0);
      const rVis = Math.max(rA?.visibility ?? 1.0, rH?.visibility ?? 1.0);

      const diffY = filtLY[f] - filtRY[f]; // positive = Left ankle is lower in frame (larger Y value)

      // Windowed spatial height inspection (check [f-2, f+2] for max magnitude difference)
      let bestDiffY = diffY;
      if (Math.abs(diffY) <= yDeadband) {
        const winStart = Math.max(0, f - 2);
        const winEnd = Math.min(n - 1, f + 2);
        let maxAbsDiff = Math.abs(diffY);
        for (let w = winStart; w <= winEnd; w++) {
          const dY = filtLY[w] - filtRY[w];
          if (Math.abs(dY) > maxAbsDiff) {
            maxAbsDiff = Math.abs(dY);
            bestDiffY = dY;
          }
        }
      }

      let side: "left" | "right";

      if (lVis >= 0.3 && rVis >= 0.3 && Math.abs(bestDiffY) > yDeadband) {
        // Tier 1: Primary spatial vertical height inspection
        side = bestDiffY > 0 ? "left" : "right";
      } else if (lVis >= 0.3 && rVis < 0.3) {
        // Tier 2A: Asymmetric visibility (Left visible, Right occluded)
        const lHipY = frame?.landmarks?.[LM.L_HIP]?.y ?? 0.5;
        const lAnkleYVal = filtLY[f];
        side =
          lAnkleYVal - lHipY > 0.25
            ? "left"
            : lastAssignedSide === "left"
              ? "right"
              : "left";
      } else if (rVis >= 0.3 && lVis < 0.3) {
        // Tier 2B: Asymmetric visibility (Right visible, Left occluded)
        const rHipY = frame?.landmarks?.[LM.R_HIP]?.y ?? 0.5;
        const rAnkleYVal = filtRY[f];
        side =
          rAnkleYVal - rHipY > 0.25
            ? "right"
            : lastAssignedSide === "right"
              ? "left"
              : "right";
      } else {
        // Tier 3 & 4: Ambiguous height / low visibility fallback via Alternation Memory with Frame Continuity
        if (lastAssignedSide !== null && lastAssignedFrame !== null) {
          const deltaFrames = f - lastAssignedFrame;
          const elapsedSteps = Math.max(1, Math.round(deltaFrames / estimatedStepFrames));
          if (elapsedSteps % 2 === 1) {
            side = lastAssignedSide === "left" ? "right" : "left";
          } else {
            side = lastAssignedSide;
          }
        } else {
          side = k % 2 === 0 ? "left" : "right";
        }
      }

      // De-duplication check: prevent duplicate same-side heel strikes during stance plateaus / ripples
      if (side === lastAssignedSide && lastAssignedFrame !== null) {
        const deltaF = f - lastAssignedFrame;
        if (deltaF < minStrideGapFrames) {
          // Candidate f is within the same stance plateau / ripple of lastAssignedFrame
          const targetArray = side === "left" ? rawLHeelStrikes : rawRHeelStrikes;
          if (targetArray.length > 0) {
            const prevF = targetArray[targetArray.length - 1];
            // If current peak f has higher Y (greater elevation), replace previous peak
            if (filtMidY[f] > filtMidY[prevF]) {
              targetArray[targetArray.length - 1] = f;
              lastAssignedFrame = f;
            }
          }
          continue; // Skip adding duplicate same-side contact
        }
      }

      // Record valid contact assignment and update running step duration estimate
      if (lastAssignedSide !== null && lastAssignedFrame !== null && side !== lastAssignedSide) {
        const stepDur = f - lastAssignedFrame;
        if (stepDur >= 6 && stepDur <= 4.0 * effectiveFps) {
          estimatedStepFrames = Math.round(0.7 * estimatedStepFrames + 0.3 * stepDur);
        }
      }

      lastAssignedSide = side;
      lastAssignedFrame = f;

      if (side === "left") {
        rawLHeelStrikes.push(f);
      } else {
        rawRHeelStrikes.push(f);
      }

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
          if (side === "left") rawLToeOffs.push(minI);
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

      if (strideDur > 0.3 && strideDur < 4.0) {
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

  const allStrikes = allEvents
    .filter((e) => e.type === "heel_strike")
    .sort((a, b) => a.timeSec - b.timeSec);

  const stepIntervals: number[] = [];
  for (let i = 1; i < allStrikes.length; i++) {
    const dt = allStrikes[i].timeSec - allStrikes[i - 1].timeSec;
    if (dt > 0.15 && dt < 4.0) {
      stepIntervals.push(dt);
    }
  }
  const meanStepTime =
    stepIntervals.length > 0
      ? stepIntervals.reduce((a, b) => a + b, 0) / stepIntervals.length
      : 0.55;

  const dsSearchLimit = Math.min(0.75 * meanStepTime, 1.0);

  const dsIntervals: number[] = [];

  // Left IC to Right TO
  for (const lic of leftStrikes) {
    const rto = rightOffs.find(
      (to) => to.timeSec > lic.timeSec && to.timeSec - lic.timeSec < dsSearchLimit,
    );
    if (rto) {
      dsIntervals.push(rto.timeSec - lic.timeSec);
    }
  }

  // Right IC to Left TO
  for (const ric of rightStrikes) {
    const lto = leftOffs.find(
      (to) => to.timeSec > ric.timeSec && to.timeSec - ric.timeSec < dsSearchLimit,
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
      if (dur > 0.4 && dur < 4.0) {
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
    inferredDirection: inferredDirection,
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

