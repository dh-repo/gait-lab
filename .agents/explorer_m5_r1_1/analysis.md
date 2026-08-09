# Implementation Blueprint: Follow-Cam Direction Inference (R1) & Peak Prominence Filtering (R5)

**Milestone:** M5 (Features R1 & R5)  
**Target Files:**
- `src/lib/gait/events.ts`
- `src/lib/gait/__tests__/events.test.ts`
- `src/lib/gait/__tests__/testHelpers.ts`  
**Author:** Explorer (`explorer_m5_r1_1`)  
**Date:** 2026-08-09  

---

## 1. Executive Summary & Problem Analysis

In sagittal gait analysis using MediaPipe Pose estimation, detecting Heel Strike (Initial Contact) and Toe Off (Terminal Contact) depends on relative anterior-posterior (AP) foot coordinate trajectories relative to the mid-hip center.

### 1.1 Finding R1: Follow-Cam Direction Failure
- **Current Behavior (`events.ts` lines 127–129)**: Walking direction is determined solely via net horizontal mid-hip displacement across the clip: `const direction = midHipX[n - 1] - midHipX[0] < -0.05 ? -1 : 1`.
- **Root Cause**: In handheld or panning follow-cam videos, the camera tracks the subject, keeping the mid-hip centered in the frame ($X_{\text{midHip}} \approx 0.50$). Net hip displacement is near zero ($|\Delta X| \le 0.02$). For Right-to-Left (R->L) gait, a net displacement of `-0.01` or `0.00` is NOT `< -0.05`, causing the system to infer `direction = 1` (Left-to-Right).
- **Impact**: Inferred direction `+1` forces `findExtrema` to search for local MAXIMA of relative heel position for Heel Strikes. But in R->L gait, Heel Strike occurs at anterior extension, which is the local MINIMUM of image X coordinates. This inverts peak types (Heel Strikes misidentified as Toe Offs), corrupting stance phase percentages.
- **Solution (R1)**: Infer direction using the median foot orientation difference ($X_{\text{toe}} - X_{\text{heel}}$) across valid frames (`visibility >= 0.4`). In 2D sagittal view, $X_{\text{toe}} - X_{\text{heel}} > 0$ for L->R walking and $< 0$ for R->L walking, invariant to camera motion. Fall back to mid-hip displacement when foot landmark visibility is low (`< 0.4`) or valid samples $< 5$.

### 1.2 Finding R5: Peak Prominence Noise Ripples
- **Current Behavior (`events.ts` lines 41–74)**: `findExtrema` checks simple 3-point local inequalities without amplitude or prominence thresholds.
- **Root Cause**: Micro-fluctuations from MediaPipe landmark jitter or Butterworth filter transient response/ringing create false local extrema.
- **Impact**: When a micro-ripple occurs $> \text{minGap}$ frames away from a true gait peak, `findExtrema` accepts it as a false Heel Strike or Toe Off event, producing invalid stance phase percentages or double support calculations.
- **Solution (R5)**: Calculate topographic peak prominence in `findExtrema` and enforce a dynamic minimum prominence threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{signalRange})$. Discard candidate extrema with prominence $< P_{\text{min}}$.

---

## 2. Mathematical Formulations & Algorithms

### 2.1 R1: Foot Orientation Direction Inference Algorithm
1. Loop over frames $i \in [0, n-1]$:
   - For left foot: if `lToe` (LM 31) and `lHeel` (LM 29) exist with `(lToe.visibility ?? 1.0) >= 0.4` and `(lHeel.visibility ?? 1.0) >= 0.4`, calculate $\Delta X_{\text{L}, i} = X_{\text{lToe}} - X_{\text{lHeel}}$ and push to `footDiffs`.
   - For right foot: if `rToe` (LM 32) and `rHeel` (LM 30) exist with `(rToe.visibility ?? 1.0) >= 0.4` and `(rHeel.visibility ?? 1.0) >= 0.4`, calculate $\Delta X_{\text{R}, i} = X_{\text{rToe}} - X_{\text{rHeel}}$ and push to `footDiffs`.
2. Decision Logic:
   - If `footDiffs.length >= 5`:
     - Sort `footDiffs` in ascending order.
     - `medianFootDiff` = median value of `footDiffs`.
     - If $|\text{medianFootDiff}| > 0.005$:
       - `direction = medianFootDiff > 0 ? 1 : -1`
     - Else (median diff magnitude $\le 0.005$, e.g. strict frontal view):
       - Fall back to hip displacement: `direction = (midHipX[n - 1] - midHipX[0] < -0.05) ? -1 : 1`.
   - Else (`footDiffs.length < 5`, low foot landmark visibility):
     - Fall back to hip displacement: `direction = (midHipX[n - 1] - midHipX[0] < -0.05) ? -1 : 1`.

### 2.2 R5: Topographic Peak Prominence Algorithm
For a candidate local extremum at index $i$ with value $y_i = x[i]$:
- **Maximum Mode (`mode === 'max'`)**:
  - Extend left: find $\min$ in $[j_{\text{left}}, i]$ where search stops if $x[j] > y_i$. Result: $m_{\text{left}}$.
  - Extend right: find $\min$ in $[i, j_{\text{right}}]$ where search stops if $x[j] > y_i$. Result: $m_{\text{right}}$.
  - Reference level $y_{\text{ref}} = \max(m_{\text{left}}, m_{\text{right}})$.
  - Prominence $= y_i - y_{\text{ref}}$.
- **Minimum Mode (`mode === 'min'`)**:
  - Extend left: find $\max$ in $[j_{\text{left}}, i]$ where search stops if $x[j] < y_i$. Result: $M_{\text{left}}$.
  - Extend right: find $\max$ in $[i, j_{\text{right}}]$ where search stops if $x[j] < y_i$. Result: $M_{\text{right}}$.
  - Reference level $y_{\text{ref}} = \min(M_{\text{left}}, M_{\text{right}})$.
  - Prominence $= y_{\text{ref}} - y_i$.
- **Dynamic Prominence Threshold**:
  - Signal range $\text{sigRange} = \max_{k}(x[k]) - \min_{k}(x[k])$.
  - Dynamic threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$.

---

## 3. Concrete Source Code Blueprint

### 3.1 Edits to `src/lib/gait/events.ts`

#### A. Topographic Prominence and Refactored `findExtrema` (Lines 38–74)

```typescript
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
function findExtrema(
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
    minProminence = Math.max(0.01, 0.15 * sigRange);
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
```

#### B. Direction Inference in `detectGaitEventsZeni` (Lines 127–130)

Replace existing lines 127–129 with:

```typescript
  // Determine overall walking direction (+1 = left-to-right, -1 = right-to-left)
  // R1 Fix: Calculate direction using median foot orientation difference (toe.x - heel.x) across valid frames,
  // falling back to mid-hip displacement when foot landmark visibility is low (< 0.4) or valid samples < 5.
  const footDiffs: number[] = [];

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
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
```

---

### 3.2 Edits to `src/lib/gait/__tests__/testHelpers.ts`

1. Update `SyntheticFrameOptions` interface (lines 51–59):
```typescript
export interface SyntheticFrameOptions {
  fps?: number;
  durationSec?: number;
  direction?: number; // 1 for left-to-right, -1 for right-to-left
  followCam?: boolean; // When true, simulates handheld follow-cam (net hip drift near 0)
  asymmetryFactor?: number;
  lowVisibilityLandmarks?: boolean;
  noiseLevel?: number;
  viewAngle?: 'sagittal' | 'frontal' | 'oblique';
}
```

2. Update `progress` calculation in `generateSyntheticWalkingFrames` (lines 87–88):
```typescript
    const progress = opts.followCam
      ? 0
      : (t / Math.max(0.1, durationSec)) * 0.4 * direction;
```

---

### 3.3 Edits to `src/lib/gait/__tests__/events.test.ts`

Add the following new test cases:

```typescript
  it("correctly infers L->R direction and calculates stance phase in follow-cam shots (followCam = true, direction = 1)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: 1,
      followCam: true,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
    expect(result.rightStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
  });

  it("correctly infers R->L direction and calculates stance phase in follow-cam shots (followCam = true, direction = -1)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: -1,
      followCam: true,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
    expect(result.rightStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
  });

  it("falls back to mid-hip displacement when foot landmark visibility is low (< 0.4)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: -1,
      lowVisibilityLandmarks: true, // sets foot/heel visibility to 0.1
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
  });

  it("suppresses low-amplitude noise ripples using dynamic peak prominence filtering", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      noiseLevel: 0.04,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
  });
```

---

## 4. Verification Plan

1. **Type checking**:
   Run `npm run typecheck` to verify no TypeScript compilation issues across `events.ts`, `testHelpers.ts`, and `events.test.ts`.
2. **Targeted Unit Tests**:
   Run `npx vitest run src/lib/gait/__tests__/events.test.ts` to execute all tests including the new follow-cam and prominence noise test cases.
3. **Full Test Suite Execution**:
   Run `npm test` to ensure zero regressions across all scientific modules.
4. **Invalidation Criteria**:
   If a synthetic R->L follow-cam clip (`followCam: true`, `direction: -1`) returns inverted event types or fails stance phase bounds ($[40\%, 80\%]$), the implementation fails verification.
