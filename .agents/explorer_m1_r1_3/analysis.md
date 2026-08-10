# Detailed Analysis: Keypoint Smoothing Integration in `src/lib/gait/analysis.ts`

**Agent**: explorer_m1_r1_3  
**Milestone**: M1 (F2 - 1D Coordinate Temporal Smoothing Integration)  
**Target File**: `src/lib/gait/analysis.ts`  
**Date**: 2026-08-09  

---

## 1. Executive Summary

This report presents a comprehensive architectural analysis for integrating 1D landmark coordinate temporal smoothing (`smoothPoseFrames` from `src/lib/gait/signal.ts`) into the core gait analysis engine (`src/lib/gait/analysis.ts`) for Milestone M1 (Feature F2).

Currently, `computeGaitMetricsCore` in `analysis.ts` applies zero-phase 4th-order Butterworth low-pass filtering to six isolated 1D scalar time series (`midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`). However, raw 2D/3D landmark coordinates ($x, y, z$) across MediaPipe's 33 keypoints are directly used without pre-smoothing in key subsystems:
1. Camera view angle detection (`detectViewAngle`).
2. Zeni kinematic gait event detection (`detectGaitEventsZeni`).
3. Spatial metrics such as step width (`stepWidth`), pelvic obliquity (`hipDrop`), and torso height normalization (`torsoHeight`).
4. Downstream joint angle ensemble analysis (`computeGaitAngleAnalysis`).

Integrating `smoothPoseFrames` at the very start of `computeGaitMetricsCore` ensures that all 33 landmark coordinate trajectories are temporally smoothed (via 5-point Savitzky-Golay or 1D Kalman filtering) before any geometric calculations, event detections, or angle analyses occur.

---

## 2. Investigation of Current `computeGaitMetricsCore` Keypoint Pipeline

### 2.1 Entry Point & Data Flow in `analysis.ts`

The primary metric calculation function `computeGaitMetricsCore(frames: PoseFrame[]): GaitMetrics` processes an array of MediaPipe pose frames:

```typescript
function computeGaitMetricsCore(frames: PoseFrame[]): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

  // 1. View Angle Detection (uses raw frames)
  const { angle, confidence } = detectViewAngle(frames);
  const t0 = frames[0].timeMs;
  const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (frames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  // 2. Extraction of series time-series (uses raw frames)
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

  // 3. Selective 1D Low-pass Filtering on 6 extracted scalar series
  const midHipX = zeroPhaseButterworth(series.map((s) => s.midHipX), fps, 6.0);
  const midHipY = zeroPhaseButterworth(series.map((s) => s.midHipY), fps, 6.0);
  const leftWristRel = zeroPhaseButterworth(series.map((s) => s.leftWristRel), fps, 6.0);
  const rightWristRel = zeroPhaseButterworth(series.map((s) => s.rightWristRel), fps, 6.0);
  const leftKneeAngle = zeroPhaseButterworth(series.map((s) => s.leftKneeAngle), fps, 6.0);
  const rightKneeAngle = zeroPhaseButterworth(series.map((s) => s.rightKneeAngle), fps, 6.0);

  // 4. Zeni Event Detection (uses raw frames)
  const zeniBreakdown = detectGaitEventsZeni(frames, fpsEffective);
  ...
```

### 2.2 Unsmoothed Vulnerabilities Identified

1. **Camera View Angle Classification (`detectViewAngle`)**:
   - `detectViewAngle` iterates over raw `frames` to calculate average shoulder width (`dist(L_SHOULDER, R_SHOULDER) / torsoHeight`), hip depth (`|L_HIP.z - R_HIP.z|`), and vertical limb separation (`|L_ANKLE.y - R_ANKLE.y| + |L_KNEE.y - R_KNEE.y|`).
   - Single-frame landmark coordinate pops or high-frequency tracking jitter can skew the normalized shoulder width or hip $z$-depth averages, causing camera orientation misclassification (e.g. classifying a sagittal walk as oblique or frontal).

2. **Zeni Event Detection (`detectGaitEventsZeni`)**:
   - `detectGaitEventsZeni` evaluates anterior-posterior (AP) displacements of heels (`LM.L_HEEL: 29`, `LM.R_HEEL: 30`), toes (`LM.L_FOOT: 31`, `LM.R_FOOT: 32`), or ankles relative to pelvis center (`midHip`).
   - If raw landmark coordinates contain high-frequency jitter or transient spikes, local extrema finding can produce false peak candidates, misidentifying heel strikes or toe-offs and inflating step time variability (`stepTimeCV`).

3. **Normalization Denominators (`torsoHeight`)**:
   - `torsoHeight(lm)` computes distance between mid-shoulder and mid-hip. High-frequency vertical jitter on shoulder or hip landmarks causes frame-to-frame fluctuation in `torsoHeight`, corrupting all normalized spatial metrics (`stepWidth`, `hipDrop`, `leftWristRel`, `rightWristRel`).

4. **Downstream Joint Angle Analysis (`computeGaitAngleAnalysis`)**:
   - Called from `analyzeGait`: `computeGaitAngleAnalysis(frames, stepEvents, viewAngle)`.
   - Joint angles (hip, knee, ankle) are computed per frame. Unsmoothed keypoint jitter introduces artificial spikes into joint angle curves and corrupts peak angle calculations (e.g., peak knee flexion during swing phase).

---

## 3. Integration Design for Keypoint Smoothing

### 3.1 Proposed Integration Location

Raw keypoint coordinates must be temporally smoothed at the **entry point** of `computeGaitMetricsCore`, immediately following short-clip length verification (`frames.length < 5`).

```typescript
import { smoothPoseFrames } from "./signal";

function computeGaitMetricsCore(
  frames: PoseFrame[],
  smoothingMethod: 'savitzky-golay' | 'kalman' = 'savitzky-golay'
): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

  // Pre-filter raw 33 landmark trajectories across frames
  const smoothedFrames = smoothPoseFrames(frames, smoothingMethod);

  // Use smoothedFrames for view angle detection, series extraction, and event detection
  const { angle, confidence } = detectViewAngle(smoothedFrames);
  const t0 = smoothedFrames[0].timeMs;
  const durationSec = Math.max(0.001, (smoothedFrames[smoothedFrames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (smoothedFrames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  const series = smoothedFrames.map((f) => {
    ...
  });

  ...
  const zeniBreakdown = detectGaitEventsZeni(smoothedFrames, fpsEffective);
```

### 3.2 Keypoint Smoothing Function Contract in `src/lib/gait/signal.ts`

Per `PROJECT.md` and `SCOPE.md`, `signal.ts` exports:

```typescript
export function savitzkyGolay5(signal: number[]): number[];
export function kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number): number[];
export function smoothPoseFrames(
  frames: PoseFrame[],
  method: 'savitzky-golay' | 'kalman' = 'savitzky-golay'
): PoseFrame[];
```

#### Mathematical Properties of `smoothPoseFrames`:
1. **Savitzky-Golay 5-Point Quadratic/Cubic Filter (`'savitzky-golay'`)**:
   - Convolution stencil coefficients: $[-3, 12, 17, 12, -3] / 35$.
   - Preserves signal height, width, and area of local maxima/minima without peak attenuation (superior to moving averages for biomechanical movement).
   - Boundary handling for indices $i \in \{0, 1, N-2, N-1\}$ uses endpoint reflection or unweighted window padding.
2. **1D Linear Kalman Filter (`'kalman'`)**:
   - State model: $x_k = x_{k-1} + w_k, \quad w_k \sim \mathcal{N}(0, Q)$
   - Measurement model: $z_k = x_k + v_k, \quad v_k \sim \mathcal{N}(0, R)$
   - Optimal for online frame streams and Gaussian noise suppression.
3. **Data Integrity & Non-Finite Guard**:
   - `smoothPoseFrames` iterates over each landmark $k \in [0, 32]$ and coordinate $c \in \{x, y, z\}$.
   - Non-finite values (`NaN`, `Infinity`, `null`) are sanitized prior to filtering.
   - Metadata (`timeMs`, `timestamp`, `visibility`) is preserved on each returned `PoseFrame`.

---

## 4. Affected Metrics & Downstream Catalog

The table below catalogs all gait metrics and downstream functions affected by keypoint temporal smoothing:

| Category | Metric / Subsystem | Direct Effect of Keypoint Smoothing |
|---|---|---|
| **View Angle** | `viewAngle`, `viewConfidence` | Prevents camera angle misclassification caused by shoulder/hip jitter. |
| **Temporal Events** | `stepEvents` (heel strike & toe off) | Eliminates false event peaks from Zeni AP foot displacement extremum detection. |
| **Cadence & Speed** | `stepCount`, `cadenceSpm`, `avgStepTimeSec` | Ensures precise step detection and timing accuracy. |
| **Variability** | `stepTimeCV`, `strideTimeCV` | Removes artificial variance created by tracking noise; measures true gait stride variability. |
| **Symmetry** | `symmetryAngle` (Zifchock SA), `stepTimeAsymmetry`, `armSwingAsymmetry`, `kneeAsymmetry`, `strideAsymmetry` | Reduces noise-induced asymmetry artifacts between left and right limbs. |
| **Frontal Kinematics** | `lateralSway`, `verticalBounce` | Smoothes mid-hip trajectory and torso normalization denominator. |
| **Spatial Width** | `meanStepWidth`, `stepWidthVariability` | Smoothes ankle x-coordinate separation distance $x_{\text{rel\_ankle}}$. |
| **Pelvic Obliquity** | `pelvicObliquity`, `pelvicObliquityVar` | Smoothes left/right hip y-coordinate difference. |
| **Trunk Control** | `pathSmoothness` | Improves residual detrended hip progress stability calculation. |
| **Sagittal Flexion** | `kneeFlexLeft`, `kneeFlexRight`, `armSwingLeft`, `armSwingRight` | Eliminates angle spikes from joint coordinate jitter; yields true anatomical ranges. |
| **Composite Scores** | `stabilityScore`, `rhythmScore`, `symmetryScore`, `mobilityScore`, `automaticityScore`, `overallScore` | Prevents score degradation caused by raw tracking noise. |
| **Downstream** | `computeGaitAngleAnalysis` (`angles.ts`) | Produces smooth ensemble average joint angle curves (0-100% gait cycle). |
| **Downstream** | `computeDualTaskCost` (`dte.ts`) | Ensures robust dual-task effect ($DTE$) calculation without noise bias. |

---

## 5. Unit Test Coverage & Recommended New Test Cases

### 5.1 Current Test Suite Status
- `src/lib/gait/__tests__/analysis.test.ts`: Covers core pipeline, clip-length invariance, view angle suppression, split-half CI, multi-person tracking, dual-task cost, and null metrics.
- `src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts`: Stress tests single-frame coordinate pops, joint-correlated noise, and out-of-bounds/NaN values.

### 5.2 Recommended New Test Cases to Add

1. **Keypoint Smoothing Integration & Jitter Attenuation Test (`analysis.test.ts`)**:
   - *Objective*: Verify that keypoint smoothing inside `computeGaitMetrics` attenuates coordinate noise and prevents artificial variability inflation.
   - *Test Setup*: Generate ground-truth synthetic walking frames (`cleanFrames`). Create `noisyFrames` by adding high-frequency noise ($\sigma = 0.08$) to ankle and knee landmarks.
   - *Assertion*: `computeGaitMetrics(noisyFrames).stepTimeCV` must remain within $0.02$ of `computeGaitMetrics(cleanFrames).stepTimeCV`.

2. **Smoothing Method Selection Test (`analysis.test.ts`)**:
   - *Objective*: Verify that `computeGaitMetricsCore` works seamlessly with both `'savitzky-golay'` and `'kalman'` methods.
   - *Assertion*: Call `computeGaitMetricsCore(frames, 'savitzky-golay')` and `computeGaitMetricsCore(frames, 'kalman')`. Assert both return valid, finite `GaitMetrics` with identical frame array length.

3. **Spike Suppression in Gait Event Detection Test (`analysis.test.ts`)**:
   - *Objective*: Verify that a single-frame coordinate pop (e.g. $+0.50$ on ankle $y$-coordinate at frame 15) is smoothed out and does not generate a spurious `heel_strike` event.
   - *Assertion*: Assert `stepEvents.length` is identical for clean frames and spiked frames after keypoint smoothing.

4. **Downstream Joint Angle Curve Smoothness Test (`angles.test.ts` / `analysis.test.ts`)**:
   - *Objective*: Verify that `analyzeGait` on noisy frames produces continuous joint angle curves in `angleAnalysis.normalizedPoints` without derivative discontinuities.

---

## 6. Implementation Code Snippets & Diff Plan

### Proposed Changes in `src/lib/gait/analysis.ts`

```typescript
// 1. Add import from signal.ts
import { olsDetrend, zeroPhaseButterworth, smoothPoseFrames } from "./signal";

// 2. Update computeGaitMetricsCore to accept optional smoothingMethod parameter and smooth frames
export function computeGaitMetricsCore(
  frames: PoseFrame[],
  smoothingMethod: 'savitzky-golay' | 'kalman' = 'savitzky-golay'
): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

  // Pre-smooth raw 33 keypoint trajectories across frames prior to metric computation
  const smoothedFrames = smoothPoseFrames(frames, smoothingMethod);

  const { angle, confidence } = detectViewAngle(smoothedFrames);
  const t0 = smoothedFrames[0].timeMs;
  const durationSec = Math.max(0.001, (smoothedFrames[smoothedFrames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (smoothedFrames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  const series = smoothedFrames.map((f) => {
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

  ...
  const zeniBreakdown = detectGaitEventsZeni(smoothedFrames, fpsEffective);
  ...
```

---

## 7. Conclusion

Integrating `smoothPoseFrames` at the entry of `computeGaitMetricsCore` completes Feature F2 requirements for Milestone M1. It protects the entire spatio-temporal gait analysis engine against MediaPipe landmark tracking jitter and coordinate spikes, ensuring high accuracy, precision, and clinical reliability across all gait metrics.
