# Handoff Report: Milestone M1 — Computer Vision & Model Fidelity Upgrades

**Agent**: `worker_m1_1`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/worker_m1_1`  
**Parent Conversation ID**: `75715ff9-9d80-47ae-bd6a-226d8bd44d8a`  
**Date**: 2026-08-09  

---

## 1. Observation

### Modified and Created Files
1. **`src/lib/gait/pose.ts`**:
   - Implemented `MODEL_CANDIDATES` hierarchy: `heavy` (`/models/pose_landmarker_heavy.task` & Google Storage CDN URL) -> `full` (`/models/pose_landmarker_full.task` & Google Storage CDN URL) -> `lite` (`/models/pose_landmarker_lite.task` & Google Storage CDN URL).
   - Refactored `getPoseLandmarker()` to execute triply-nested candidate tier x asset path x GPU/CPU delegate fallback loops.
   - Augment `PoseLandmarkerLike` interface with `loadedModelTier?: "heavy" | "full" | "lite"` and `loadedDelegate?: "GPU" | "CPU"`.
   - Added test-aware timeout protection (`createLandmarkerWithTimeout`) to prevent socket timeouts when CDN paths are evaluated in offline or mock-isolated test runners.

2. **`src/lib/gait/signal.ts`**:
   - Implemented `savitzkyGolay5(signal: number[]): number[]` using 5-point quadratic convolution kernel `[-3, 12, 17, 12, -3] / 35` with 2-element linear boundary reflection padding and `< 5` sample length guard.
   - Implemented `kalmanFilter1D(signal: number[], processNoise = 1e-4, measurementNoise = 1e-2): number[]` using 1D scalar state-space model ($x_k, P_k$) with default process noise $Q=10^{-4}$, measurement noise $R=10^{-2}$, and occlusion coasting over `NaN`/`Infinity` measurements.
   - Updated `smoothPoseFrames<T extends PoseFrame>(frames: T[], method: 'savitzky-golay' | 'kalman' | 'none' = 'savitzky-golay', options?: { processNoise?: number; measurementNoise?: number }): T[]` to filter both 2D `landmarks` and 3D `worldLandmarks` across frame sequences without mutating original input frames.

3. **`src/lib/gait/types.ts`**:
   - Exported `SmoothingMethod = 'savitzky-golay' | 'kalman' | 'none'`.
   - Exported `GaitAnalysisOptions = { smoothingMethod?: SmoothingMethod }`.

4. **`src/lib/gait/analysis.ts`**:
   - Updated `computeGaitMetricsCore` to apply `smoothPoseFrames(rawFrames, smoothingMethod)` right after the frame length check (`if (rawFrames.length < 5)`), ensuring clean landmark trajectories enter all downstream metrics (`detectViewAngle`, `series` extraction, `detectGaitEventsZeni`, joint angle calculations).
   - Updated `computeGaitMetrics` and `analyzeGait` to accept optional `smoothingMethod` or `GaitAnalysisOptions` parameter (defaulting to `'savitzky-golay'`).

5. **`src/lib/gait/__tests__/pose.test.ts` (New File)**:
   - Added unit test suite covering candidate hierarchy (`heavy` -> `full` -> `lite`), GPU -> CPU delegate fallbacks, local -> CDN URL fallbacks, instance metadata tagging (`loadedModelTier`, `loadedDelegate`), and failure error throwing.

6. **`src/lib/gait/__tests__/signal.test.ts`**:
   - Added unit tests for `savitzkyGolay5` (reflection padding, length < 5 guard), `kalmanFilter1D` (noise reduction, occlusion coasting over `NaN`/`Infinity`), and `smoothPoseFrames` (options, non-mutation, metadata preservation).

7. **`src/lib/gait/__tests__/analysis.test.ts`**:
   - Added unit tests verifying integration of `smoothingMethod` in `computeGaitMetricsCore` under landmark coordinate jitter.

---

## 2. Logic Chain

1. **Model Fidelity & Fallback Hierarchy**: Clinical spatio-temporal accuracy requires tracking subtle lower-extremity landmark displacements. MediaPipe's `heavy` task (~25 MB) offers higher landmark precision than `lite` (~5.7 MB). Implementing `MODEL_CANDIDATES` with local paths and CDN fallbacks across GPU and CPU delegates guarantees that the engine loads the highest fidelity model supported by the client hardware and asset availability.
2. **Coordinate Temporal Smoothing**: High-frequency landmark tracking jitter or single-frame coordinate pops degrade heel-strike peak detection, step width variance, and joint angle kinetics. 
   - 5-point Savitzky-Golay quadratic convolution (`[-3, 12, 17, 12, -3] / 35`) with 2-element boundary reflection padding suppresses coordinate jitter while preserving movement amplitude and timing without phase delay.
   - 1D scalar state-space Kalman filtering ($x_k, P_k$) provides low-latency causal smoothing with occlusion coasting during missing keypoints (`NaN`/`Infinity`).
3. **Engine Pipeline Integration**: Placing `smoothPoseFrames` at the entry of `computeGaitMetricsCore` guarantees that all downstream consumers receive clean landmark trajectories, directly improving gait variability metrics (`stepTimeCV`, `stepWidthVariability`) and symmetry assessments.

---

## 3. Caveats

- In Vitest unit testing without network connectivity, local model assets not on disk (e.g. `pose_landmarker_heavy.task`) quickly fall through to `pose_landmarker_lite.task` which is checked into `public/models/`.
- Signal smoothing filters 2D `landmarks` and 3D `worldLandmarks` trajectories independently for each landmark coordinate ($x, y, z$).

---

## 4. Conclusion

Milestone M1 is fully implemented, verified, and integrated into the `gait-lab` engine per specifications in `PROJECT.md`, `SCOPE.md`, and Explorer handoff reports.

---

## 5. Verification Method

Independent verification can be executed via the standard project quality commands:

```bash
# 1. Vitest Unit & Integration Test Suite (100% Pass)
npm test

# 2. TypeScript Typecheck (0 Errors)
npm run typecheck

# 3. ESLint Compliance Check (0 Errors)
npm run lint

# 4. Production Build (Success)
npm run build
```
