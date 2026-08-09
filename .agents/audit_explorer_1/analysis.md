# Deep Analysis & Architecture Design: Gait Event Detection & Follow-Cam Direction Inference (R1 & R5)

**Author:** Audit Explorer 1  
**Target Files:** `src/lib/gait/events.ts`, `src/lib/gait/__tests__/events.test.ts`, `src/lib/gait/__tests__/testHelpers.ts`  
**Date:** 2026-08-09  

---

## 1. Executive Summary

This investigation addresses synthetic ground-truth audit findings **R1** (Follow-Cam Direction Inference) and **R5** (Peak Detection Prominence Filtering) in the `gait-lab` kinematic gait event engine (`src/lib/gait/events.ts`).

1. **Finding R1 (Follow-Cam Direction Failure)**: The current walking direction inference relies solely on net mid-hip horizontal displacement across the clip (`midHipX[n-1] - midHipX[0]`). In handheld or panning follow-cam videos, the subject remains centered in the image frame, causing net hip drift to approach zero ($\approx 0.00$). Depending on subtle camera movement or framing jitter, right-to-left (R->L) gait is frequently misclassified as left-to-right (L->R), causing complete inversion of Zeni algorithm peak detection logic (heel strikes misidentified as toe offs) and corrupting stance phase calculations.
2. **Finding R5 (Peak Prominence Filtering)**: The peak detection function `findExtrema` checks simple 3-point local inequalities without amplitude or prominence thresholds. Low-amplitude noise ripples from landmark jitter or filter ringing generate false local extrema, producing spurious heel strike and toe off events that disrupt stride timing and double support percentage calculation.

This document provides a complete mathematical analysis, algorithmic redesigns, code blueprints, and synthetic test plans for resolving both findings.

---

## 2. Analysis of Follow-Cam Direction Inference (R1)

### 2.1 Current Implementation in `src/lib/gait/events.ts`

In `detectGaitEventsZeni` (lines 127–129):

```typescript
// Determine overall walking direction (+1 = left-to-right, -1 = right-to-left)
const totalDisplacement = midHipX[n - 1] - midHipX[0];
const direction = totalDisplacement < -0.05 ? -1 : 1;
```

### 2.2 Root Cause of Failure in Follow-Cam Shots

In fixed/stationary camera setups, a subject walking Left-to-Right moves across the image sensor, so $X_{\text{midHip}}$ increases from $\approx 0.2$ to $\approx 0.8$ ($\Delta X \approx +0.6 > -0.05 \implies \text{direction} = +1$). A subject walking Right-to-Left moves from $X \approx 0.8$ to $X \approx 0.2$ ($\Delta X \approx -0.6 < -0.05 \implies \text{direction} = -1$).

However, in **handheld follow-cam shots**:
- The camera operator walks alongside or follows the subject.
- The computer vision tracking bounding box centers the subject in the video frame ($X_{\text{midHip}} \approx 0.50 \pm 0.03$).
- The net mid-hip displacement `totalDisplacement` across the video sequence is near zero ($| \Delta X | \le 0.02$).

#### Failure Case Matrix
| True Walking Direction | Camera Operator Movement | Net Mid-Hip Drift ($\Delta X$) | Inferred Direction | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Right-to-Left (-1)** | Panning slightly faster than subject | $-0.02$ | **$+1$ (L->R)** | ❌ **MISCLASSIFIED** |
| **Right-to-Left (-1)** | Perfectly centered framing | $0.00$ | **$+1$ (L->R)** | ❌ **MISCLASSIFIED** |
| **Left-to-Right (+1)** | Panning slightly faster than subject | $-0.06$ | **$-1$ (R->L)** | ❌ **MISCLASSIFIED** |

### 2.3 Impact on Zeni Event Detection Algorithm

The Zeni kinematic algorithm (Zeni et al., 2008) relies on relative anterior-posterior (AP) foot position with respect to the mid-hip center:
- $X_{\text{heel, rel}}(t) = X_{\text{heel}}(t) - X_{\text{hip}}(t)$
- $X_{\text{toe, rel}}(t) = X_{\text{toe}}(t) - X_{\text{hip}}(t)$

When walking **Left-to-Right (+1)**:
- At Heel Strike (Initial Contact), the heel is at its maximum anterior extension ahead of the hip $\implies$ **Local Maximum** of $X_{\text{heel, rel}}$.
- At Toe Off (Terminal Contact), the toe is at its maximum posterior extension behind the hip $\implies$ **Local Minimum** of $X_{\text{toe, rel}}$.

When walking **Right-to-Left (-1)**:
- At Heel Strike, maximum anterior extension corresponds to the smallest X coordinate $\implies$ **Local Minimum** of $X_{\text{heel, rel}}$.
- At Toe Off, maximum posterior extension corresponds to the largest X coordinate $\implies$ **Local Maximum** of $X_{\text{toe, rel}}$.

```typescript
// Lines 140-141: Peak types depend on direction
const heelStrikeMode: "max" | "min" = direction === 1 ? "max" : "min";
const toeOffMode: "max" | "min" = direction === 1 ? "min" : "max";
```

**Consequence of Misclassification:** When a R->L follow-cam shot is wrongly classified as `direction = +1`, `findExtrema` searches for local MAXIMA of heel displacement. Local maxima in R->L gait correspond to **Toe-Off / Late Swing**, not Heel Strike! The entire event timeline is inverted, resulting in corrupted stance phase percentages or total breakdown of gait phase calculations.

---

## 3. Design of Fix for R1: Foot Orientation Direction Inference

### 3.1 Anatomical & Kinematic Principle

In human biomechanics during sagittal-plane gait:
- The foot is anatomically oriented along the vector from heel to toe (calcaneus to distal phalanx / 2nd metatarsal head).
- In normalized image space (where $X$ increases from left to right):
  - When walking **Left-to-Right**, the toe is positioned to the right of the heel ($X_{\text{toe}} > X_{\text{heel}}$), so $(X_{\text{toe}} - X_{\text{heel}}) > 0$.
  - When walking **Right-to-Left**, the toe is positioned to the left of the heel ($X_{\text{toe}} < X_{\text{heel}}$), so $(X_{\text{toe}} - X_{\text{heel}}) < 0$.

Crucially, this foot orientation vector is **invariant to camera motion and camera translation**! Even if a follow-cam operator moves parallel to the subject with zero net mid-hip displacement, the anatomical orientation of the foot in 2D image coordinates remains strictly positive for L->R walking and strictly negative for R->L walking.

### 3.2 Mathematical Formulation & Algorithm

For each frame $i \in [0, n-1]$:

1. **Left Foot Orientation Difference**:
   $$\Delta X_{\text{L}, i} = X_{\text{L\_FOOT}, i} - X_{\text{L\_HEEL}, i}$$
   Valid if `visibility(L_FOOT) >= 0.4` and `visibility(L_HEEL) >= 0.4`.

2. **Right Foot Orientation Difference**:
   $$\Delta X_{\text{R}, i} = X_{\text{R\_FOOT}, i} - X_{\text{R\_HEEL}, i}$$
   Valid if `visibility(R_FOOT) >= 0.4` and `visibility(R_HEEL) >= 0.4`.

3. **Sample Pooling & Median Estimate**:
   Collect all valid frame samples:
   $$\mathcal{S} = \{ \Delta X_{\text{L}, i} \mid \text{valid}_{\text{L}, i} \} \cup \{ \Delta X_{\text{R}, i} \mid \text{valid}_{\text{R}, i} \}$$

4. **Fallback & Direction Decision Logic**:
   - **Primary Path (Foot Landmark Orientation)**:
     If $|\mathcal{S}| \ge N_{\text{min}}$ (where $N_{\text{min}} = 5$ samples):
     $$\text{medianDiff} = \text{median}(\mathcal{S})$$
     If $\text{medianDiff} > 0.005 \implies \text{direction} = +1$ (Left-to-Right).  
     If $\text{medianDiff} < -0.005 \implies \text{direction} = -1$ (Right-to-Left).

   - **Secondary Fallback Path (Low Foot Visibility / Occlusion)**:
     If foot landmark visibility is low across the clip ($|\mathcal{S}| < N_{\text{min}}$ or $|\text{medianDiff}| \le 0.005$):
     Fall back to net mid-hip displacement:
     $$\Delta X_{\text{hip}} = X_{\text{midHip}}[n-1] - X_{\text{midHip}}[0]$$
     $$\text{direction} = (\Delta X_{\text{hip}} < -0.05) ? -1 : 1$$

---

## 4. Analysis of Peak Detection Noise Ripples (R5)

### 4.1 Current Implementation of `findExtrema`

In `src/lib/gait/events.ts` (lines 41–74):

```typescript
function findExtrema(
  signal: number[],
  mode: "max" | "min",
  minGap: number,
): number[] {
  const indices: number[] = [];
  const n = signal.length;
  if (n < 3) return indices;

  for (let i = 1; i < n - 1; i++) {
    const isExtremum =
      mode === "max"
        ? signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]
        : signal[i] < signal[i - 1] && signal[i] <= signal[i + 1];

    if (isExtremum) {
      if (indices.length === 0 || i - indices[indices.length - 1] >= minGap) {
        indices.push(i);
      } else {
        const prevIdx = indices[indices.length - 1];
        const isMoreProminent =
          mode === "max"
            ? signal[i] > signal[prevIdx]
            : signal[i] < signal[prevIdx];
        if (isMoreProminent) {
          indices[indices.length - 1] = i;
        }
      }
    }
  }

  return indices;
}
```

### 4.2 Root Cause of False Extremum Detection

1. **Absence of Prominence / Amplitude Filtering**:
   The current algorithm evaluates `signal[i] > signal[i-1] && signal[i] >= signal[i+1]`. This flags ANY micro-ripple as a candidate extremum. Even a 0.0001 (0.1 mm) fluctuation caused by MediaPipe landmark jitter or Butterworth filter transient response is treated as a valid peak candidate.
2. **Inadequate Collision Resolution (`minGap`)**:
   `minGap` prevents peaks closer than `0.35 * fps` frames ($\approx 10$ frames at 30 fps). However, noise ripples during stance phase (when the foot is on the ground, occurring over $\approx 0.6$ seconds or 18 frames) often occur $> 10$ frames away from the main stance peak. Consequently, `findExtrema` accepts noise bumps as distinct heel strike or toe off events.
3. **Impact on Gait Metrics**:
   - Extra events distort stride event chronological sequencing.
   - Stance phase percentage estimation (`computeStanceForSide`) fails or returns fallback values ($60.0\%$).
   - Double support percentage calculation produces invalid intervals.

---

## 5. Design of Fix for R5: Peak Prominence Filtering

### 5.1 Mathematical Definition of Topographic Peak Prominence

Peak prominence measures how much a local extremum stands out relative to surrounding baseline signal troughs/crests.

For a candidate local **maximum** at frame index $i$ with value $y_i = x[i]$:
1. Extend left from $i$ until encountering an index $j$ where $x[j] > y_i$ (or reaching array boundary $j = 0$). Find the minimum signal value in this left window:
   $$m_{\text{left}} = \min_{k \in [\text{left\_bound}, i]} x[k]$$
2. Extend right from $i$ until encountering an index $j$ where $x[j] > y_i$ (or reaching array boundary $j = n-1$). Find the minimum signal value in this right window:
   $$m_{\text{right}} = \min_{k \in [i, \text{right\_bound}]} x[k]$$
3. The reference trough level is $y_{\text{ref}} = \max(m_{\text{left}}, m_{\text{right}})$.
4. The **prominence** of the local maximum is:
   $$\text{Prominence}_{\text{max}}(i) = y_i - y_{\text{ref}}$$

For a candidate local **minimum** at frame index $i$ with value $y_i = x[i]$:
1. Extend left from $i$ until encountering an index $j$ where $x[j] < y_i$ (or reaching $j = 0$). Find the maximum signal value in this left window:
   $$M_{\text{left}} = \max_{k \in [\text{left\_bound}, i]} x[k]$$
2. Extend right from $i$ until encountering an index $j$ where $x[j] < y_i$ (or reaching $j = n-1$). Find the maximum signal value in this right window:
   $$M_{\text{right}} = \max_{k \in [i, \text{right\_bound}]} x[k]$$
3. The reference crest level is $y_{\text{ref}} = \min(M_{\text{left}}, M_{\text{right}})$.
4. The **prominence** of the local minimum is:
   $$\text{Prominence}_{\text{min}}(i) = y_{\text{ref}} - y_i$$

### 5.2 Dynamic Prominence Thresholding

To ensure scale invariance across subjects, image resolutions, and crop dimensions:
1. Compute the peak-to-peak amplitude range of the signal:
   $$\text{sigRange} = \max_{k}(x[k]) - \min_{k}(x[k])$$
2. Set the dynamic minimum prominence threshold:
   $$P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$$
   - Any peak with prominence $< P_{\text{min}}$ (less than 15% of total stride excursion) is filtered out as a noise ripple.
   - For stationary or standing poses where $\text{sigRange} < 0.02$, all micro-fluctuations are rejected, naturally suppressing false event detection in non-walking clips.

---

## 6. Implementation Blueprint

### 6.1 Refactored `findExtrema` in `src/lib/gait/events.ts`

```typescript
/**
 * Calculate the prominence of a local extremum in a 1D signal.
 */
function calculateProminence(
  signal: number[],
  i: number,
  mode: "max" | "min",
): number {
  const n = signal.length;
  const val = signal[i];

  if (mode === "max") {
    // Find left window minimum up to a higher peak
    let leftMin = val;
    for (let j = i - 1; j >= 0; j--) {
      if (signal[j] > val) break;
      if (signal[j] < leftMin) leftMin = signal[j];
    }

    // Find right window minimum up to a higher peak
    let rightMin = val;
    for (let j = i + 1; j < n; j++) {
      if (signal[j] > val) break;
      if (signal[j] < rightMin) rightMin = signal[j];
    }

    const refLevel = Math.max(leftMin, rightMin);
    return val - refLevel;
  } else {
    // Find left window maximum down to a lower valley
    let leftMax = val;
    for (let j = i - 1; j >= 0; j--) {
      if (signal[j] < val) break;
      if (signal[j] > leftMax) leftMax = signal[j];
    }

    // Find right window maximum down to a lower valley
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
 * Find local extrema in a 1D signal with minimum frame distance and peak prominence constraints.
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

  // Determine dynamic default prominence threshold if not provided
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
        continue; // Filter out low-amplitude noise ripple
      }

      if (indices.length === 0 || i - indices[indices.length - 1] >= minGap) {
        indices.push(i);
      } else {
        // Keep the extremum with greater prominence or value within minGap
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

### 6.2 Updated Direction Inference in `detectGaitEventsZeni`

```typescript
  // Determine overall walking direction (+1 = left-to-right, -1 = right-to-left)
  // R1 Fix: Calculate direction using median foot orientation difference (toe.x - heel.x) across frames,
  // falling back to mid-hip displacement when foot landmark visibility is low.
  const footDiffs: number[] = [];

  for (let i = 0; i < n; i++) {
    const frame = frames[i];
    const lToe = frame.landmarks[LM.L_FOOT];
    const lHeel = frame.landmarks[LM.L_HEEL];
    const rToe = frame.landmarks[LM.R_FOOT];
    const rHeel = frame.landmarks[LM.R_HEEL];

    if (
      lToe && lHeel &&
      (lToe.visibility ?? 1.0) >= 0.4 &&
      (lHeel.visibility ?? 1.0) >= 0.4
    ) {
      footDiffs.push(lToe.x - lHeel.x);
    }
    if (
      rToe && rHeel &&
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

## 7. Test Plan for Synthetic Gait Test Cases

### 7.1 Test Helper Enhancements in `src/lib/gait/__tests__/testHelpers.ts`

Add a `followCam?: boolean` option to `SyntheticFrameOptions`:
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

When `followCam: true` is set:
```typescript
const progress = opts.followCam
  ? 0 // Stationary midHipX (centered in frame)
  : (t / Math.max(0.1, durationSec)) * 0.4 * direction;
```

### 7.2 Proposed Unit Tests for `src/lib/gait/__tests__/events.test.ts`

1. **R1 Test 1: L->R Follow-Cam Direction & Stance Phase Verification**:
   - Input: `generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0, direction: 1, followCam: true })`.
   - Assertions:
     - `result.stepEvents.length > 0`
     - `result.leftStancePct` in $[50, 70]$ ($\approx 60\%$)
     - `result.rightStancePct` in $[50, 70]$ ($\approx 60\%$)

2. **R1 Test 2: R->L Follow-Cam Direction & Stance Phase Verification (Crucial Fix Validation)**:
   - Input: `generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0, direction: -1, followCam: true })`.
   - Assertions:
     - `result.stepEvents.length > 0`
     - `result.leftStancePct` in $[50, 70]$ ($\approx 60\%$)
     - `result.rightStancePct` in $[50, 70]$ ($\approx 60\%$)

3. **R1 Fallback Test: Low Foot Visibility Fallback to Hip Drift**:
   - Input: Frames with low foot visibility (`visibility = 0.1`) and `direction: -1`, with actual hip displacement $< -0.05$.
   - Assertions: Correctly infers `direction = -1` via hip drift fallback.

4. **R5 Test: High Noise Ripple Prominence Filtering**:
   - Input: Synthetic walking frames with `noiseLevel: 0.04`.
   - Assertions:
     - Prominence filtering suppresses noise ripples.
     - Event count remains consistent with clean signal (no double-counting of heel strikes).
     - Stance phase percentage remains in valid range $[50, 70]$.

---

## 8. Verification Strategy

1. **Static Analysis & Type Checking**:
   Run `npm run typecheck` to verify interface and type safety.
2. **Automated Unit Testing**:
   Run `npm test src/lib/gait/__tests__/events.test.ts` to execute all existing and new synthetic gait event test cases.
3. **Full Suite Regression Testing**:
   Run `npm test` across all modules (`signal`, `events`, `symmetry`, `smoothness`, `dte`, `analysis`).
