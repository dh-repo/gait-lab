# Detailed Technical Survey Report for Requirement R1: MediaPipe Model Hierarchy & Landmark Temporal Smoothing

**Author:** Explorer Survey 1  
**Date:** 2026-08-09  
**Target Repository:** `/Users/damian/GitHub/gait-lab`  
**Scope:** Requirement R1 (Computer Vision Model Fidelity & Temporal Coordinate Filtering)

---

## 1. Executive Summary

This report delivers a comprehensive technical survey and architectural plan for **Requirement R1**, covering:
1. **MediaPipe Pose Landmarker Hierarchy Upgrade** (`src/lib/gait/pose.ts`): Moving from a hardcoded single-model loader (`pose_landmarker_lite.task`) to a multi-tiered fallback hierarchy (`pose_landmarker_heavy.task` $\rightarrow$ `pose_landmarker_full.task` $\rightarrow$ `pose_landmarker_lite.task`) supporting local assets and remote CDN fallbacks with GPU/CPU delegate resilience.
2. **1D Landmark Coordinate Temporal Smoothing**: Introducing pre-metric 1D temporal filtering on raw keypoint coordinates $(x, y, z)$ across all 33 MediaPipe landmarks prior to kinematic gait event detection (`events.ts`), joint angle computation (`angles.ts`), and spatiotemporal metric extraction (`analysis.ts`).

---

## 2. MediaPipe Pose Landmarker Model Hierarchy (`src/lib/gait/pose.ts`)

### 2.1 Current Implementation Audit

In `src/lib/gait/pose.ts` (lines 29–66):

```typescript
export async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, PoseLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks("/wasm");
      const modelAssetPath = "/models/pose_landmarker_lite.task";

      const common = {
        runningMode: "IMAGE" as const,
        numPoses: 5,
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.25,
        minTrackingConfidence: 0.25,
      };

      try {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "GPU" },
          ...common,
        });
        return landmarker as unknown as PoseLandmarkerLike;
      } catch {
        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath, delegate: "CPU" },
          ...common,
        });
        return landmarker as unknown as PoseLandmarkerLike;
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}
```

#### Identified Limitations & Architectural Vulnerabilities:
1. **Hardcoded Model**: Line 35 hardcodes `const modelAssetPath = "/models/pose_landmarker_lite.task"`. Heavy (`pose_landmarker_heavy.task`) and Full (`pose_landmarker_full.task`) models are never attempted.
2. **Lack of Asset Fallback**: If the local file fails to load or return 404 (e.g. static asset missing in deployment or offline environment), the loader immediately throws without attempting CDN acquisition.
3. **No Model Tier Fallback**: If `heavy` fails to initialize on GPU or CPU, there is no automatic fallback to `full` or `lite`.
4. **Missing Model Metadata**: `PoseLandmarkerLike` does not report which model tier (`heavy`, `full`, or `lite`) or delegate (`GPU` or `CPU`) was successfully bound at runtime.

### 2.2 Proposed Multi-Tier Fallback Hierarchy Architecture

The upgraded `getPoseLandmarker` function must attempt model loading across a 3-level model hierarchy, with dual GPU $\rightarrow$ CPU delegate fallbacks and dual Local $\rightarrow$ CDN asset URL resolution per tier.

#### Model Tier Specification:

| Tier Priority | Model File | Model Capacity | Typical File Size | Target Use Case |
|---|---|---|---|---|
| 1 (**Primary**) | `pose_landmarker_heavy.task` | Highest accuracy, high keypoint stability | ~25 MB | Clinical workstations, high-precision gait tracking |
| 2 (**Fallback 1**) | `pose_landmarker_full.task` | Balanced precision & throughput | ~12 MB | Mid-tier hardware, mobile GPUs |
| 3 (**Fallback 2**) | `pose_landmarker_lite.task` | Lightest footprint, fastest inference | ~5.7 MB | Fallback mode, low-power devices |

#### Asset Path & CDN Resolution Matrix:

For each model tier $M \in \{\text{"heavy"}, \text{"full"}, \text{"lite"}\}$:
- **Local Path**: `/models/pose_landmarker_${M}.task`
- **Google Storage CDN Fallback URL**: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${M}/float16/1/pose_landmarker_${M}.task`

#### Trial Order per Model Tier $M$:
1. `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: localPath, delegate: "GPU" }, ...common })`
2. If failed: `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: localPath, delegate: "CPU" }, ...common })`
3. If failed: `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: cdnUrl, delegate: "GPU" }, ...common })`
4. If failed: `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: cdnUrl, delegate: "CPU" }, ...common })`

If all 4 attempts for model tier $M$ fail, catch the error, log a fallback diagnostic warning, and proceed to model tier $M+1$.

#### Enhanced `PoseLandmarkerLike` Interface:
```typescript
export type PoseLandmarkerModelTier = "heavy" | "full" | "lite";
export type PoseLandmarkerDelegate = "GPU" | "CPU";

export type PoseLandmarkerLike = {
  detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
  detectForVideo: (
    video: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ) => PoseDetectionResult;
  setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
  close?: () => void;
  /** Active loaded model tier name */
  modelTier?: PoseLandmarkerModelTier;
  /** Active backend delegate */
  delegate?: PoseLandmarkerDelegate;
};
```

---

## 3. 1D Landmark Coordinate Temporal Smoothing

### 3.1 Current Landmark Flow & Noise Susceptibility

Currently, raw keypoints undergo the following path:
1. MediaPipe returns 33 landmarks per frame: $\{ (x_i, y_i, z_i, \text{vis}_i) \}_{i=0}^{32}$.
2. `resamplePoseFrames()` (`src/lib/gait/pose.ts:268-340`) interpolates frame timestamps using Catmull-Rom splines to enforce a uniform 30 Hz grid.
3. In `computeGaitMetricsCore()` (`src/lib/gait/analysis.ts`):
   - Raw keypoints are immediately accessed for Zeni gait event detection (`detectGaitEventsZeni` in `events.ts`).
   - Raw keypoints are used for joint angle calculation (`computeGaitAngleAnalysis` in `angles.ts`).
   - Post-hoc 4th-order zero-phase Butterworth low-pass filtering is applied ONLY to derived 1D signals (`midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`) at line 278-285.

#### Critical Gap:
Raw coordinate keypoint jitter (such as single-frame high-frequency camera noise, lighting flickers, or limb occlusions) directly corrupts initial contact (heel strike) peak selection in `events.ts`, torso height estimations in `landmarks.ts`, and instantaneous knee/hip/ankle joint angles in `angles.ts` **before** the 1D Butterworth filter ever sees them.

### 3.2 Mathematical Formulation of 1D Coordinate Smoothing

To address keypoint noise prior to metric calculation, every individual landmark's spatial coordinates $(x, y, z)$ over time must undergo 1D temporal filtering.

#### Method A: 5-Point Savitzky-Golay (SavGol) Filter
The 5-point Savitzky-Golay quadratic/cubic filter computes a smoothed point $\hat{x}_k$ by fitting a local 2nd/3rd-degree polynomial to a moving window of 5 points ($k-2, k-1, k, k+1, k+2$) using unweighted least squares:

$$\hat{x}_k = \frac{-3 x_{k-2} + 12 x_{k-1} + 17 x_k + 12 x_{k+1} - 3 x_{k+2}}{35}$$

**Convolution Weight Vector:**
$$W = \frac{1}{35} \begin{bmatrix} -3 & 12 & 17 & 12 & -3 \end{bmatrix}$$

**Boundary Condition Handling ($N \ge 5$):**
For boundary frames $k \in \{0, 1, N-2, N-1\}$, apply linear reflection padding:
- $x_{-1} = 2 x_0 - x_1$, $x_{-2} = 2 x_0 - x_2$
- $x_N = 2 x_{N-1} - x_{N-2}$, $x_{N+1} = 2 x_{N-1} - x_{N-3}$

**Advantages:**
1. Zero phase delay (symmetrical kernel).
2. Preserves peak amplitudes and inflection slope sharp features (heel-strike transients) significantly better than standard moving averages.
3. Extremely fast, $O(N)$ complexity, 0 hyperparameters to tune.

#### Method B: 1D Adaptive Kalman Filter with Visibility Weighting
A discrete-time 1D constant-velocity Kalman filter tracks landmark position $x_k$ and velocity $v_k$:

$$\mathbf{x}_k = \begin{bmatrix} x_k \\ v_k \end{bmatrix}, \quad \mathbf{F} = \begin{bmatrix} 1 & \Delta t \\ 0 & 1 \end{bmatrix}, \quad \mathbf{H} = \begin{bmatrix} 1 & 0 \end{bmatrix}$$

**Process & Measurement Noise Covariances:**
- Process noise covariance: $\mathbf{Q} = q \begin{bmatrix} \frac{\Delta t^3}{3} & \frac{\Delta t^2}{2} \\ \frac{\Delta t^2}{2} & \Delta t \end{bmatrix}$ (where $q \approx 0.1$).
- Visibility-Adaptive Measurement Noise:
  $$R_k = \frac{R_0}{\max(\text{visibility}_k, 0.01)^2}$$
  where $R_0 \approx 1e-4$. Lower visibility automatically increases measurement covariance $R_k$, causing the Kalman update to trust the motion model prediction when the keypoint is obscured or low-confidence!

**Backward RTS (Rauch-Tung-Striebel) Smoother:**
For batch video processing, run a backward pass after the forward filter pass to eliminate phase lag:
$$\hat{\mathbf{x}}_{k|N} = \hat{\mathbf{x}}_k + \mathbf{C}_k (\hat{\mathbf{x}}_{k+1|N} - \hat{\mathbf{x}}_{k+1}^-)$$
where gain $\mathbf{C}_k = \mathbf{P}_k \mathbf{F}^T (\mathbf{P}_{k+1}^-)^{-1}$.

### 3.3 Comparative Recommendation & Integration Plan

| Dimension | 5-Point Savitzky-Golay | 1D Visibility-Adaptive Kalman/RTS | Recommendation |
|---|---|---|---|
| **Phase Distortion** | Exactly 0 (Symmetric) | 0 with RTS backward pass | Both suitable |
| **Feature Preservation** | High peak preservation | Smooth continuous trajectory | SavGol preserves sharp heel strike impact dynamics best |
| **Visibility Handling** | Fixed weights | Dynamic $R(\text{vis})$ weighting | Combined approach (SavGol with visibility threshold gating) |
| **Computational Complexity** | 5 ops/point ($O(N)$) | Matrix inversion per step ($O(N)$) | SavGol is ~10x faster |

#### Primary Integration Point:
Create a dedicated function `smoothPoseFrames(frames: PoseFrame[]): PoseFrame[]` in `src/lib/gait/signal.ts` or `src/lib/gait/pose.ts`.

Call `smoothPoseFrames(frames)` immediately inside `computeGaitMetricsCore()` in `src/lib/gait/analysis.ts`:

```typescript
export function computeGaitMetricsCore(rawFrames: PoseFrame[]): GaitMetrics {
  if (rawFrames.length < 5) return emptyMetrics(rawFrames);

  // Requirement R1: 1D Landmark Coordinate Temporal Smoothing on raw keypoints prior to metrics
  const frames = smoothPoseFrames(rawFrames);
  
  // Proceed with view angle detection, event detection, angles, metrics using smoothed frames...
}
```

---

## 4. Verification & Testing Strategy

### 4.1 Unit & Integration Tests to Implement/Verify
1. **Pose Landmarker Loading Hierarchy Test (`pose.test.ts`)**:
   - Verify `getPoseLandmarker()` attempts `heavy` first.
   - Mock rejection of `heavy` and verify fallback to `full` and `lite`.
   - Mock rejection of GPU delegate and verify fallback to CPU delegate.
   - Verify active `modelTier` and `delegate` properties on returned instance.

2. **1D Temporal Coordinate Smoothing Test (`signal.test.ts` / `cat1_landmark_jitter_noise.test.ts`)**:
   - Test 5-point Savitzky-Golay filter on clean sine trajectory + high-frequency noise. Verify variance reduction without amplitude attenuation.
   - Test boundary condition handling ($N < 5$, $N = 5$, boundary reflection).
   - Test noise suppression on synthetic walking frames (`cat1_landmark_jitter_noise.test.ts`) and confirm improvement in gait event subframe timing accuracy.

3. **Regression Tests**:
   - Run `npm test` across all 81 existing test suites.
   - Run `npm run typecheck` (0 errors).
   - Run `npm run lint` (0 errors).
   - Run `npm run build` (successful build).
