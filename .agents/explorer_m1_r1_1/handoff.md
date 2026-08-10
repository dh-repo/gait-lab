# Handoff Report: MediaPipe Model Loading Fallback (Milestone M1 - Feature F1)

**Agent**: `explorer_m1_r1_1`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_1`  
**Target Module**: `src/lib/gait/pose.ts`  
**Date**: 2026-08-09  

---

## 1. Observation

1. **Hardcoded Model Asset Path**: In `src/lib/gait/pose.ts` at line 35:
   ```typescript
   const modelAssetPath = "/models/pose_landmarker_lite.task";
   ```
   Only the lightweight model is requested. Higher precision candidate models (`pose_landmarker_heavy.task` and `pose_landmarker_full.task`) are never attempted.

2. **Delegate Fallback Scope**: Lines 47–59 of `src/lib/gait/pose.ts` attempt a single `GPU` delegate try block followed by a single `CPU` delegate catch block for `pose_landmarker_lite.task`. If both fail, `getPoseLandmarker()` catches the error and throws.

3. **Public Asset Directory Contents**:
   - `public/models/pose_landmarker_lite.task` (5,777,746 bytes) exists locally on disk.
   - `public/models/pose_landmarker_heavy.task` and `public/models/pose_landmarker_full.task` are not currently in `public/models/`.

4. **Missing Unit Test Suite**: `src/lib/gait/__tests__/` contains 30+ test suites for gait signals, events, and metrics, but lacks a dedicated unit test file for `pose.ts` landmarker initialization fallback behavior.

5. **Canonical CDN Asset URLs for Google MediaPipe Models**:
   - Heavy: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`
   - Full: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`
   - Lite: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`

---

## 2. Logic Chain

1. **Clinical Precision Requirement**: Accurate spatio-temporal gait metrics (step time, stride length, gait variability) require tracking subtle lower-extremity landmark displacement. MediaPipe's `heavy` model (~25 MB) provides significantly higher keypoint accuracy and tracking stability than `lite` (~5.7 MB).
2. **Cascading Model Preference**: To maximize accuracy while remaining robust across diverse hardware and network conditions, the loader must follow a strict preference hierarchy: `heavy` $\rightarrow$ `full` $\rightarrow$ `lite`.
3. **Resilience to Missing Local Assets**: Because `heavy` and `full` task files may not be present in `public/models/` on every installation or offline deployment, each model tier should evaluate local asset paths (`/models/pose_landmarker_${tier}.task`) followed by Google Storage CDN URLs.
4. **Delegate Acceleration**: WebGL GPU acceleration (`delegate: "GPU"`) yields optimal frame processing throughput. If WebGL context creation or shader compilation fails (e.g. in virtualized browser sessions or unsupported GPUs), the loader must fall back to WebAssembly CPU execution (`delegate: "CPU"`) for that model/asset path before progressing to subsequent fallback options.
5. **Structured Iteration Architecture**: Replacing the hardcoded `try/catch` in `getPoseLandmarker()` with a triply-nested iteration loop over `[heavy, full, lite]` $\times$ `[Local, CDN]` $\times$ `[GPU, CPU]` guarantees that the highest-fidelity available combination will always be selected.

---

## 3. Caveats

- **Network Overhead for CDN Fallbacks**: Downloading `pose_landmarker_heavy.task` (~25 MB) from CDN on slow mobile connections may introduce a multi-second delay on first load. However, browser caching will mitigate subsequent loads.
- **WASM Memory Constraints**: Running WebAssembly MediaPipe tasks in CPU mode consumes substantial browser memory (~100-200 MB per worker context).
- **No Source Modifications Made**: As an explorer agent, no source code outside of `.agents/explorer_m1_r1_1/` was modified.

---

## 4. Conclusion

`src/lib/gait/pose.ts` requires updating `getPoseLandmarker()` to implement a triply-nested model asset and delegate fallback loop across tiers `heavy`, `full`, and `lite`. 

The implementer should refactor `getPoseLandmarker()` to:
1. Define a structured candidate array `MODEL_CANDIDATES` covering `heavy`, `full`, and `lite` with both local paths and Google Storage CDN fallback URLs.
2. Iterate through each candidate, attempting `GPU` delegate followed by `CPU` delegate.
3. Attach metadata properties `loadedModelTier` and `loadedDelegate` to the returned `PoseLandmarkerLike` instance.
4. Create a dedicated test suite `src/lib/gait/__tests__/pose.test.ts` verifying candidate selection and fallback behavior under mock failures.

---

## 5. Verification Method

1. **Static Analysis & Type Checking**:
   ```bash
   npm run typecheck
   npm run lint
   ```
2. **Unit Test Verification**:
   - Create `src/lib/gait/__tests__/pose.test.ts` and run:
   ```bash
   npx vitest run src/lib/gait/__tests__/pose.test.ts
   ```
3. **Full Regression Test Suite**:
   ```bash
   npm test
   ```
4. **Manual Invalidation Conditions**:
   - `getPoseLandmarker()` fails to load when local `heavy` model is absent.
   - Failure on GPU delegate causes total load failure instead of CPU delegate retry.
