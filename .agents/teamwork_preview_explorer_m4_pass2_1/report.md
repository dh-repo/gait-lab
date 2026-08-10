# Implementation Blueprint: Dynamic Per-Stride Walking Direction & U-Turn Event Detection

**Agent**: `teamwork_preview_explorer_m4_pass2_1`  
**Milestone**: M4 Pass 2 (Explorer 1)  
**Target File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts`  
**Test File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/events.test.ts`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

This document provides a comprehensive, read-only implementation blueprint for upgrading the event detection engine in `src/lib/gait/events.ts` (specifically `detectGaitEventsZeni`). The current engine relies on a single global walking direction (+1 or -1) calculated across an entire video clip. In clinical walk-and-turn protocols (e.g., 10-meter walk test, TUG test) where the subject turns 180° mid-trial, event detection fails during the return segment because heel-strike and toe-off peak modes invert relative to image X-coordinates.

This blueprint establishes the exact mathematical formulation, data structures, algorithm design, and code modifications required to implement:
1. **Dynamic Per-Stride Walking Direction** via a sliding window (~1.5s / 45 frames).
2. **Local Foot Orientation Median Calculation** per sliding window segment.
3. **Sign-Flip Hysteresis State Machine** (> 0.01 threshold) to prevent direction chattering.
4. **Per-Segment Peak Mode Selection (`heelStrikeMode` and `toeOffMode`)** supporting 180° U-turns.
5. **Frontal-Y Contact Disambiguation** replacing naive `k % 2` parity with lateral ankle coordinate inspection ($y_{\text{L}}$ vs $y_{\text{R}}$).

---

## 2. Forensic Codebase Diagnosis

### 2.1 Current Implementation in `events.ts` (lines 237–306)

```ts
// Existing global direction calculation (lines 270–289):
let direction = 1;
if (footDiffs.length >= 5) {
  footDiffs.sort((a, b) => a - b);
  const midIdx = Math.floor(footDiffs.length / 2);
  const medianFootDiff = footDiffs.length % 2 === 0
    ? (footDiffs[midIdx - 1] + footDiffs[midIdx]) / 2
    : footDiffs[midIdx];

  if (Math.abs(medianFootDiff) > 0.005) {
    direction = medianFootDiff > 0 ? 1 : -1;
  } else {
    const totalDisplacement = midHipX[n - 1] - midHipX[0];
    direction = totalDisplacement < -0.05 ? -1 : 1;
  }
}

// Global peak mode selection (lines 299–306):
const heelStrikeMode: "max" | "min" = direction === 1 ? "max" : "min";
const toeOffMode: "max" | "min" = direction === 1 ? "min" : "max";

let rawLHeelStrikes = findExtrema(filtLHeel, heelStrikeMode, minGap);
let rawRHeelStrikes = findExtrema(filtRHeel, heelStrikeMode, minGap);
let rawLToeOffs = findExtrema(filtLToe, toeOffMode, minGap);
let rawRToeOffs = findExtrema(filtRToe, toeOffMode, minGap);
```

### 2.2 Critical Failure Modes

1. **U-Turn Inversion Failure**:
   - In direction $+1$ (left-to-right), heel strike occurs when the foot is furthest ahead of the mid-hip in $+X$, creating a local **maximum** in `footXRel`.
   - In direction $-1$ (right-to-left), heel strike occurs when the foot is furthest ahead in $-X$, creating a local **minimum** in `footXRel`.
   - With a global `direction = 1`, all heel strikes during the return leg (right-to-left) are local minima, but `findExtrema` is instructed to search for `maxima`. Consequently, 100% of heel strikes and toe offs on the return walk are missed.

2. **Frontal-Y Index Parity Fragility (lines 349–370)**:
   - When AP motion collapses (`apRange < 0.028`), contacts are assigned by strict index parity: `if (k % 2 === 0) rawLHeelStrikes.push(f); else rawRHeelStrikes.push(f);`.
   - A single noise peak or missed contact permanently inverts left and right foot labels for all remaining frames.

---

## 3. Algorithmic Blueprint & Mathematical Specification

### 3.1 Per-Frame Foot Orientation Difference $D[i]$

For frame $i \in [0, N-1]$ with effective sampling rate $\text{FPS}$:
$$\Delta x_{\text{L}}[i] = x_{\text{L,toe}}[i] - x_{\text{L,heel}}[i] \quad (\text{if } \text{visibility}_{\text{L}} \ge 0.4)$$
$$\Delta x_{\text{R}}[i] = x_{\text{R,toe}}[i] - x_{\text{R,heel}}[i] \quad (\text{if } \text{visibility}_{\text{R}} \ge 0.4)$$

Let $D[i]$ be the mean of available valid foot orientation differences at frame $i$.  
If neither foot has visible landmarks ($\text{visibility} < 0.4$), estimate $D[i]$ from local mid-hip displacement:
$$D[i] = \text{midHipX}[\min(i+2, N-1)] - \text{midHipX}[\max(i-2, 0)]$$

### 3.2 Sliding Window Local Median $M[i]$ (~1.5s / 45 frames)

Define window radius $H$:
$$H = \max(7, \text{Math.round}(0.75 \cdot \text{FPS})) \quad (\approx 22 \text{ frames at } 30\text{ FPS, } 45\text{ frames total span})$$

For each frame $i \in [0, N-1]$, define the window index set:
$$\mathcal{W}_i = [\max(0, i - H), \min(N - 1, i + H)]$$

Compute the local median foot orientation difference $M[i]$:
$$M[i] = \text{median}\left( \{ D[j] \mid j \in \mathcal{W}_i \} \right)$$

### 3.3 Sign-Flip Hysteresis State Machine

To prevent rapid directional oscillation ("chattering") when the subject pivots or walks towards/away from the camera near $M[i] \approx 0$, apply a hysteresis threshold $\epsilon = 0.01$:

```
Initial state d_0:
  if |M[0]| > 0.005: d_0 = sgn(M[0])
  else: d_0 = sgn(midHipX[N-1] - midHipX[0])

For frame i = 0 to N-1:
  if d_{i-1} == +1 and M[i] < -0.01:
      d_i = -1
  else if d_{i-1} == -1 and M[i] > +0.01:
      d_i = +1
  else:
      d_i = d_{i-1}
```

This yields a per-frame direction vector $\mathbf{d} = [d_0, d_1, \dots, d_{N-1}]^T \in \{+1, -1\}^N$.

### 3.4 Direction-Aware Extremum Combination

Instead of running global `findExtrema`, candidate extrema are evaluated across the whole signal for both `"max"` and `"min"`, then filtered by the per-frame direction state $\mathbf{d}$:

#### Helper Function: `combineExtremaByDirection()`

```ts
function combineExtremaByDirection(
  signal: number[],
  directions: number[],
  eventType: "heel" | "toe",
  minGap: number
): number[] {
  // 1. Find all candidate local maxima and minima with minGap spacing
  const maxes = findExtrema(signal, "max", minGap);
  const mins = findExtrema(signal, "min", minGap);

  // 2. Filter candidate indices by matching per-frame direction
  // Heel Strike: dir == 1 -> max, dir == -1 -> min
  // Toe Off:     dir == 1 -> min, dir == -1 -> max
  const candidates: number[] = [];

  for (const f of maxes) {
    const dir = directions[f];
    if ((eventType === "heel" && dir === 1) || (eventType === "toe" && dir === -1)) {
      candidates.push(f);
    }
  }

  for (const f of mins) {
    const dir = directions[f];
    if ((eventType === "heel" && dir === -1) || (eventType === "toe" && dir === 1)) {
      candidates.push(f);
    }
  }

  // 3. Sort chronologically
  candidates.sort((a, b) => a - b);

  // 4. De-duplicate candidates within minGap
  const result: number[] = [];
  for (const f of candidates) {
    if (result.length === 0 || f - result[result.length - 1] >= minGap) {
      result.push(f);
    } else {
      // Keep extremum with larger prominence
      const prev = result[result.length - 1];
      const prevDir = directions[prev];
      const prevMode = (eventType === "heel" ? prevDir === 1 : prevDir === -1) ? "max" : "min";
      const currMode = (eventType === "heel" ? directions[f] === 1 : directions[f] === -1) ? "max" : "min";
      const prevProm = calculateProminence(signal, prev, prevMode);
      const currProm = calculateProminence(signal, f, currMode);
      if (currProm > prevProm) {
        result[result.length - 1] = f;
      }
    }
  }

  return result;
}
```

### 3.5 Frontal-Y Lateral Ankle Contact Disambiguation

Replace naive `k % 2` parity assignment (lines 349–353) with vertical ankle coordinate comparison ($y_{\text{L}}$ vs $y_{\text{R}}$):

```ts
// At contact frame f:
const lA = frames[f]?.landmarks?.[LM.L_ANKLE];
const rA = frames[f]?.landmarks?.[LM.R_ANKLE];
const lH = frames[f]?.landmarks?.[LM.L_HEEL];
const rH = frames[f]?.landmarks?.[LM.R_HEEL];

const lY = lA?.y ?? lH?.y ?? 0.5;
const rY = rA?.y ?? rH?.y ?? 0.5;

// MediaPipe Y increases downwards; ground plane contact is at larger Y (lower in image)
if (lY > rY + 0.005) {
  rawLHeelStrikes.push(f);
} else if (rY > lY + 0.005) {
  rawRHeelStrikes.push(f);
} else {
  // Indeterminate vertical height (within 5mm equivalent): fallback to parity or mid-hip X offset
  if (k % 2 === 0) rawLHeelStrikes.push(f);
  else rawRHeelStrikes.push(f);
}
```

---

## 4. Proposed Code Changes (`src/lib/gait/events.ts`)

### 4.1 Addition of `combineExtremaByDirection` Helper

Add helper function near line 149 (after `findExtrema`):

```ts
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
    if ((eventType === "heel" && dir === 1) || (eventType === "toe" && dir === -1)) {
      candidates.push(f);
    }
  }

  for (const f of mins) {
    const dir = directions[f];
    if ((eventType === "heel" && dir === -1) || (eventType === "toe" && dir === 1)) {
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
```

### 4.2 Replacement of Direction Calculation & Peak Detection in `detectGaitEventsZeni` (lines 237–306)

Replace lines 237–306 in `detectGaitEventsZeni()` with:

```ts
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
    if (lToe && lHeel && (lToe.visibility ?? 1.0) >= 0.4 && (lHeel.visibility ?? 1.0) >= 0.4) {
      sum += (lToe.x - lHeel.x);
      cnt++;
    }
    if (rToe && rHeel && (rToe.visibility ?? 1.0) >= 0.4 && (rHeel.visibility ?? 1.0) >= 0.4) {
      sum += (rToe.x - rHeel.x);
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

  // Calculate dominant direction across video for inferredDirection metadata
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
```

### 4.3 Update to Return Object in `detectGaitEventsZeni` (line 525)

Set `inferredDirection: inferredDirection` in the return breakdown object.

---

## 5. Verification Plan & Test Strategy

### 5.1 New Test Cases for `src/lib/gait/__tests__/events.test.ts`

1. **180° U-Turn Walk-and-Turn Protocol Test**:
   - Construct synthetic frames where subject walks L $\to$ R ($+1$) for 60 frames, pivots 180° (frames 60–90), and walks R $\to$ L ($-1$) for 60 frames.
   - Assert `stepEvents` are detected in both segments.
   - Verify zero missed heel strikes on return path.

2. **Direction Hysteresis Deadband Test**:
   - Construct synthetic noise signal near $M[i] \approx 0$ with amplitude $\pm 0.005$.
   - Verify `directions` vector remains stable without chattering.

3. **Frontal-Y Lateral Ankle Disambiguation Test**:
   - Construct frontal frames where $y_{\text{L}} > y_{\text{R}}$ at odd contacts and $y_{\text{R}} > y_{\text{L}}$ at even contacts.
   - Verify left and right heel strikes match lateral leg position regardless of index parity.

### 5.2 Command Verification Matrix

| Verification Step | Command | Expected Result |
|---|---|---|
| Unit Test Suite | `npx vitest run src/lib/gait/__tests__/events.test.ts` | 100% green pass |
| Full Test Suite | `npx vitest run` | All 986+ tests pass |
| Type Check | `npx tsc --noEmit` | 0 errors |
| Lint Check | `npx eslint src/lib/gait/events.ts` | 0 errors |

---

**Blueprint Prepared By**: `teamwork_preview_explorer_m4_pass2_1`  
**Status**: Ready for Pass 2 Implementation
