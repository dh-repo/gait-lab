# Technical Analysis & Architectural Survey: Requirement 1 (R1)

## Executive Summary
This survey provides a comprehensive architectural analysis of Requirement 1 (R1) for the `gait-lab` spatio-temporal gait analysis engine:
1. **MediaPipe Pose Model Fidelity & Fallback Chain**: Upgrading `getPoseLandmarker()` in `src/lib/gait/pose.ts` to support high-fidelity models with a cascading fallback chain: `pose_landmarker_heavy.task` -> `pose_landmarker_full.task` -> `pose_landmarker_lite.task` (trying GPU delegate first, then CPU delegate for each candidate).
2. **1D Landmark Coordinate Temporal Smoothing**: Implementing 1D landmark coordinate temporal smoothing (5-point Savitzky-Golay filter and 1D Constant Velocity Kalman Filter) on raw keypoints prior to feature extraction and kinematic metric computation.

---

## 1. MediaPipe Pose Model Loading & Fallback Chain

### Current State (`src/lib/gait/pose.ts`)
- Currently hardcodes a single asset path: `/models/pose_landmarker_lite.task` (lines 35-59).
- Attempts `PoseLandmarker.createFromOptions` with `delegate: "GPU"`, falling back to `delegate: "CPU"` for `lite` only.
- Does not check or attempt higher-fidelity model candidates (`heavy` or `full`).

### Proposed Architecture & Logic
- **Candidate Models**:
  ```ts
  const MODEL_CANDIDATES = [
    "/models/pose_landmarker_heavy.task",
    "/models/pose_landmarker_full.task",
    "/models/pose_landmarker_lite.task",
  ];
  ```
- **Fallback Execution Order**:
  For each path in `MODEL_CANDIDATES` in order:
  1. Attempt `PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: path, delegate: "GPU" }, ...common })`.
  2. If GPU creation throws an error, attempt `delegate: "CPU"`.
  3. If CPU creation also throws an error (e.g. 404 file missing / fetch error), log a warning and proceed to the next candidate model path in `MODEL_CANDIDATES`.
  4. If all candidates fail, rethrow the final error.
- **Model Metadata & State**:
  - Track loaded model name (e.g., `heavy`, `full`, `lite`) in module state so downstream analytics can record model fidelity provenance.

---

## 2. 1D Landmark Coordinate Temporal Smoothing

### Current State (`src/lib/gait/analysis.ts` & `src/lib/gait/signal.ts`)
- Downstream 1D scalar series (e.g., `midHipX`, `midHipY`, `leftWristRel`, `leftKneeAngle`) are filtered post-hoc using `zeroPhaseButterworth(..., 6.0)`.
- However, raw 3D landmark coordinates in `PoseFrame.landmarks` (33 landmarks per frame with `x, y, z, visibility`) are **unfiltered** prior to feature calculation (`torsoHeight`, `angleDeg`, `dist`, `boundingBox`, relative foot displacement).
- Consequently, single-frame landmark tracking pops, salt-and-pepper noise, and high-frequency jitter pollute non-linear geometric derived metrics.

### Proposed Architecture & Filtering Algorithms

#### A. 5-Point Savitzky-Golay (SG) Filter
- **Mathematics**: A 5-point quadratic/cubic polynomial Savitzky-Golay filter smooths a 1D coordinate series $y[n]$ using fixed optimal least-squares convolution coefficients:
  $$y_{\text{smooth}}[i] = \frac{-3 y[i-2] + 12 y[i-1] + 17 y[i] + 12 y[i+1] - 3 y[i+2]}{35}$$
- **Boundary Reflection Padding**:
  For $N \ge 5$, pad array at left ($i=0$) and right ($i=N-1$) using symmetric reflection padding:
  $y_{\text{pad}}[-1] = 2 y[0] - y[1]$, $y_{\text{pad}}[-2] = 2 y[0] - y[2]$.
  This eliminates phase shift and avoids boundary attenuation.
- **Sanitization**: Replace non-finite numbers (NaN/Infinity) with adjacent finite values prior to convolution.

#### B. 1D Constant Velocity Kalman Filter
- **State Model**: State vector $\mathbf{x}_k = [p_k, v_k]^T$ (position and velocity).
- **State Transition Matrix**:
  $$F = \begin{bmatrix} 1 & \Delta t \\ 0 & 1 \end{bmatrix}$$
- **Measurement Matrix**: $H = [1, 0]$.
- **Parameters**: Process noise covariance $Q$, measurement noise covariance $R$. Measurement noise $R$ can be dynamically weighted by visibility: $R_k = R_0 / (\text{visibility}_k + \epsilon)$.
- Optional Rauch-Tung-Striebel (RTS) backward smoothing pass for zero-phase offline processing.

#### C. Integration in Gait Analysis Pipeline
- **New Module / Utility**: `smoothPoseFrames(frames: PoseFrame[], options?: { method?: 'savitzky' | 'kalman' }): PoseFrame[]` in `src/lib/gait/signal.ts` or `src/lib/gait/landmarks.ts`.
- **Pipeline Integration**:
  In `computeGaitMetricsCore(frames: PoseFrame[])` (`src/lib/gait/analysis.ts`):
  ```ts
  const smoothedFrames = smoothPoseFrames(frames, { method: "savitzky" });
  ```
  Use `smoothedFrames` to construct derived `series`, compute `detectViewAngle`, run `detectGaitEventsZeni`, and compute joint angles and spatial-temporal metrics.

---

## 3. Affected Files & Task Inventory

| File Path | Purpose / Modification Needed |
| --- | --- |
| `src/lib/gait/pose.ts` | Implement `MODEL_CANDIDATES` fallback loop (`heavy` GPU/CPU -> `full` GPU/CPU -> `lite` GPU/CPU) in `getPoseLandmarker()`. |
| `src/lib/gait/signal.ts` | Add 1D `savitzkyGolay5(data: number[])`, `kalmanFilter1D(data: number[])`, and `smoothPoseFrames(frames: PoseFrame[])` utilities. |
| `src/lib/gait/analysis.ts` | Integrate `smoothPoseFrames` at the start of `computeGaitMetricsCore` prior to metric extraction. |
| `src/lib/gait/types.ts` | Add optional configuration or provenance fields for model name and smoothing method if needed. |
| `src/lib/gait/__tests__/r1_model_and_smoothing.test.ts` | Unit tests for candidate model fallbacks, 1D Savitzky-Golay, 1D Kalman filter, and noise robustness. |

---

## 4. Handoff Protocol & Verification

### 1. Observation
- `src/lib/gait/pose.ts`: line 35 hardcodes `const modelAssetPath = "/models/pose_landmarker_lite.task";`.
- `public/models/`: currently contains only `pose_landmarker_lite.task` (5.77 MB).
- `src/lib/gait/analysis.ts`: `computeGaitMetricsCore` receives raw `frames` and computes derived geometry before applying Butterworth filtering to scalar signals.

### 2. Logic Chain
1. MediaPipe Pose supports higher precision models (`heavy`, `full`). By attempting `heavy` -> `full` -> `lite` with GPU/CPU fallbacks, the system automatically uses the highest fidelity model available in any deployment environment.
2. 1D coordinate temporal smoothing (5-point Savitzky-Golay or Kalman) applied directly to 3D keypoint coordinates $(x_i, y_i, z_i)$ suppresses tracking jitter and single-frame pops before non-linear geometric derived metrics (angles, distances, bounding boxes) are computed, increasing spatial-temporal metric accuracy and stability.

### 3. Caveats
- `pose_landmarker_heavy.task` is ~30 MB and `pose_landmarker_full.task` is ~15 MB. When missing, `fetch`/creation fails gracefully and falls back to `lite`.
- For frame sequences shorter than 5 frames ($N < 5$), 5-point Savitzky-Golay uses reflection padding or identity fallback.

### 4. Conclusion
R1 requires upgrading `getPoseLandmarker()` in `pose.ts` and adding 1D coordinate temporal smoothing (`smoothPoseFrames`) in `signal.ts`/`analysis.ts`.

### 5. Verification Method
- `npm test`: Runs all vitest tests including new R1 tests.
- `npm run typecheck`: Ensures 0 TypeScript errors.
- `npm run lint`: Ensures 0 ESLint errors.
