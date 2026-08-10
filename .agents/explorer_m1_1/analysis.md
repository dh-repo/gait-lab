# Technical Analysis & Implementation Specification: MediaPipe Pose Landmarker Model Hierarchy & Delegate Fallback Engine (`src/lib/gait/pose.ts`)

**Author**: Explorer M1-1 (CV Model Hierarchy Specialist)  
**Date**: 2026-08-09  
**Target File**: `src/lib/gait/pose.ts`  
**Associated Test File**: `src/lib/gait/__tests__/pose.test.ts`  
**Milestone**: M1 — Feature F1 (MediaPipe Heavy/Full/Lite Model Candidate Hierarchy & GPU/CPU Delegate Fallback)

---

## 1. Executive Summary

This report presents a thorough technical investigation and architectural design for upgrading the MediaPipe Pose Landmarker initialization engine in `src/lib/gait/pose.ts`. The current implementation hardcodes a single lightweight model (`pose_landmarker_lite.task`) with only a local GPU/CPU delegate fallback. 

The upgraded architecture establishes:
1. **3-Tier Model Hierarchy**: Primary attempt with `pose_landmarker_heavy.task`, falling back to `pose_landmarker_full.task`, and finally `pose_landmarker_lite.task`.
2. **Dual Delegate Resilience**: For every model tier and path candidate, GPU delegate execution is attempted first; on WebGL/GPU failure, CPU delegate execution is attempted immediately before moving to subsequent path/tier candidates.
3. **Local Asset & Google Storage CDN Dual Path Resolution**: Attempts local static asset `/models/pose_landmarker_${tier}.task` first, with automatic fallback to the official Google Storage CDN URL (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`).
4. **Enhanced `PoseLandmarkerLike` Interface**: Exposes runtime metadata properties `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate` on the active landmarker instance.
5. **Comprehensive Unit Test Suite**: Complete specification for `src/lib/gait/__tests__/pose.test.ts` utilizing Vitest mocks to validate all 12 fallback combinations, error handling, singleton caching, and existing video detection utilities.

---

## 2. Codebase Audit: `src/lib/gait/pose.ts`

### 2.1 Current Implementation Analysis

Lines 29–66 of `src/lib/gait/pose.ts` currently contain:

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

### 2.2 Identified Architectural Deficiencies

1. **Single Hardcoded Model Tier**: Line 35 explicitly hardcodes `/models/pose_landmarker_lite.task`. The higher accuracy models (`heavy` and `full`) are never attempted, limiting clinical precision for high-resolution gait analysis.
2. **Single Local Asset Path**: If the local file `/models/pose_landmarker_lite.task` is missing (e.g. static asset deployment issue or uncached offline asset), initialization fails entirely without attempting CDN retrieval.
3. **No Cross-Tier Fallback**: If GPU/CPU fails on `heavy`, there is no secondary fallback to `full` or `lite`.
4. **Missing Runtime Metadata**: `PoseLandmarkerLike` does not report which model tier or backend delegate was successfully loaded at runtime.
5. **Testability Limitation**: `landmarkerPromise` singleton state is private and cannot be cleared by unit tests without module re-imports.

---

## 3. Multi-Tier Model Hierarchy & Fallback Matrix Specification

### 3.1 Model Tier Hierarchy

| Priority | Tier (`PoseLandmarkerModelTier`) | Asset File | File Size (approx.) | Kinematic Accuracy | Target Hardware / Scenario |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 (**Primary**) | `"heavy"` | `pose_landmarker_heavy.task` | ~25 MB | Highest (Clinical Grade) | High-performance desktops/workstations, clinical setups |
| 2 (**Fallback 1**) | `"full"` | `pose_landmarker_full.task` | ~12 MB | High (Balanced) | Mid-range devices, laptops, mobile GPUs |
| 3 (**Fallback 2**) | `"lite"` | `pose_landmarker_lite.task` | ~5.7 MB | Medium (Fastest) | Low-power devices, fallback mode |

### 3.2 Asset Path & CDN Resolution Matrix

For each model tier `tier` $\in \{\text{"heavy"}, \text{"full"}, \text{"lite"}\}$:
- **Local Path**: `/models/pose_landmarker_${tier}.task`
- **Google Storage CDN Fallback URL**: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`

### 3.3 Delegate Strategy

For each path candidate, delegates are attempted in order:
1. `"GPU"` (WebGL acceleration via MediaPipe GPU delegate)
2. `"CPU"` (WASM multi-threaded CPU delegate fallback)

### 3.4 Full 12-Step Candidate Trial Hierarchy

The loader executes nested trial loops across Model Tiers $\rightarrow$ Asset Paths $\rightarrow$ Delegates:

```
[Tier 1: heavy]
  ├── Local: /models/pose_landmarker_heavy.task
  │     ├── Delegate: GPU
  │     └── Delegate: CPU (if GPU fails)
  └── CDN: https://storage.googleapis.com/.../pose_landmarker_heavy.task
        ├── Delegate: GPU (if local fails)
        └── Delegate: CPU (if CDN GPU fails)

[Tier 2: full] (if all heavy attempts fail)
  ├── Local: /models/pose_landmarker_full.task
  │     ├── Delegate: GPU
  │     └── Delegate: CPU
  └── CDN: https://storage.googleapis.com/.../pose_landmarker_full.task
        ├── Delegate: GPU
        └── Delegate: CPU

[Tier 3: lite] (if all full attempts fail)
  ├── Local: /models/pose_landmarker_lite.task
  │     ├── Delegate: GPU
  │     └── Delegate: CPU
  └── CDN: https://storage.googleapis.com/.../pose_landmarker_lite.task
        ├── Delegate: GPU
        └── Delegate: CPU
```

---

## 4. Proposed Interface & Implementation Changes

### 4.1 Interface Contract Updates in `src/lib/gait/pose.ts`

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
  /** Successfully bound model tier */
  modelTier?: PoseLandmarkerModelTier;
  /** Successfully bound backend delegate */
  delegate?: PoseLandmarkerDelegate;
};
```

### 4.2 Cache Reset Helper Export

```typescript
/**
 * Resets the singleton PoseLandmarker loading promise.
 * Used primarily for unit test isolation when testing loading fallbacks.
 */
export function resetPoseLandmarkerCache(): void {
  landmarkerPromise = null;
}
```

### 4.3 Refactored `getPoseLandmarker()` Implementation

```typescript
const MODEL_TIERS: PoseLandmarkerModelTier[] = ["heavy", "full", "lite"];
const DELEGATES: PoseLandmarkerDelegate[] = ["GPU", "CPU"];

function getCandidateAssetPaths(tier: PoseLandmarkerModelTier): string[] {
  return [
    `/models/pose_landmarker_${tier}.task`,
    `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`,
  ];
}

export async function getPoseLandmarker(): Promise<PoseLandmarkerLike> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const { FilesetResolver, PoseLandmarker } = vision;
      const fileset = await FilesetResolver.forVisionTasks("/wasm");

      const common = {
        runningMode: "IMAGE" as const,
        numPoses: 5,
        minPoseDetectionConfidence: 0.25,
        minPosePresenceConfidence: 0.25,
        minTrackingConfidence: 0.25,
      };

      let lastError: unknown = null;

      for (const tier of MODEL_TIERS) {
        const candidatePaths = getCandidateAssetPaths(tier);
        for (const modelAssetPath of candidatePaths) {
          for (const delegate of DELEGATES) {
            try {
              const landmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath, delegate },
                ...common,
              });
              const instance = landmarker as unknown as PoseLandmarkerLike;
              instance.modelTier = tier;
              instance.delegate = delegate;
              return instance;
            } catch (err) {
              lastError = err;
              console.warn(
                `Failed loading PoseLandmarker (${tier}, ${modelAssetPath}, ${delegate}):`,
                err,
              );
            }
          }
        }
      }

      throw lastError ?? new Error("Failed to load PoseLandmarker across all tiers, paths, and delegates.");
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}
```

---

## 5. Specification for Unit Test File `src/lib/gait/__tests__/pose.test.ts`

The test suite must be created at `src/lib/gait/__tests__/pose.test.ts` using Vitest.

### 5.1 Test Suite Structure & Mocks

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPoseLandmarker,
  resetPoseLandmarkerCache,
  nextVideoTimestamp,
  toLandmarks,
  resamplePoseFrames,
  detectPosesOnVideoFrame,
  type PoseLandmarkerLike,
} from "../pose";
import type { PoseFrame } from "../types";

// Mock @mediapipe/tasks-vision
const mockCreateFromOptions = vi.fn();
const mockForVisionTasks = vi.fn().mockResolvedValue({ wasmPath: "/wasm" });

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks: (...args: unknown[]) => mockForVisionTasks(...args),
  },
  PoseLandmarker: {
    createFromOptions: (...args: unknown[]) => mockCreateFromOptions(...args),
  },
}));
```

### 5.2 Unit Test Cases to Include

#### Test Group 1: Model Hierarchy & Fallback Mechanics
1. **`heavy` Local GPU Success (Primary Path)**:
   - Configure `mockCreateFromOptions` to resolve with a mock landmarker.
   - Assert `getPoseLandmarker()` resolves with `modelTier === "heavy"` and `delegate === "GPU"`.
   - Assert `mockCreateFromOptions` was called with `modelAssetPath: "/models/pose_landmarker_heavy.task"` and `delegate: "GPU"`.

2. **GPU Delegate Failure $\rightarrow$ CPU Delegate Fallback**:
   - Configure `mockCreateFromOptions` to throw when `delegate === "GPU"` for heavy local, but resolve when `delegate === "CPU"`.
   - Assert `getPoseLandmarker()` resolves with `modelTier === "heavy"` and `delegate === "CPU"`.

3. **Local Path Failure $\rightarrow$ Google Storage CDN Fallback**:
   - Configure `mockCreateFromOptions` to throw for local path `/models/pose_landmarker_heavy.task` (both GPU and CPU), but resolve for CDN URL `https://storage.googleapis.com/.../pose_landmarker_heavy.task`.
   - Assert `getPoseLandmarker()` resolves with `modelTier === "heavy"` and `delegate === "GPU"`.
   - Verify `mockCreateFromOptions` was called with the CDN URL.

4. **Tier 1 (`heavy`) Failure $\rightarrow$ Tier 2 (`full`) Fallback**:
   - Configure `mockCreateFromOptions` to throw for all 4 `heavy` candidate options (Local GPU, Local CPU, CDN GPU, CDN CPU).
   - Configure `mockCreateFromOptions` to resolve on `full` Local GPU.
   - Assert `getPoseLandmarker()` resolves with `modelTier === "full"` and `delegate === "GPU"`.

5. **Tier 1 & 2 Failure $\rightarrow$ Tier 3 (`lite`) Fallback**:
   - Configure `mockCreateFromOptions` to throw for all 8 `heavy` and `full` candidate options.
   - Configure `mockCreateFromOptions` to resolve on `lite` Local GPU.
   - Assert `getPoseLandmarker()` resolves with `modelTier === "lite"` and `delegate === "GPU"`.

6. **All 12 Candidates Failure $\rightarrow$ Rejection & Cache Reset**:
   - Configure `mockCreateFromOptions` to throw for all 12 candidate combinations.
   - Assert `getPoseLandmarker()` rejects with the last error.
   - Subsequent call to `getPoseLandmarker()` triggers a new loading attempt (verifying `landmarkerPromise` cache reset).

7. **Concurrent Invocation Singleton Deduplication**:
   - Call `getPoseLandmarker()` twice in parallel without awaiting.
   - Assert `mockCreateFromOptions` is called only once for the succeeding candidate.
   - Assert both returned promises resolve to the identical instance.

#### Test Group 2: Existing Utility Functions
8. **`nextVideoTimestamp()` Monotonicity**:
   - Call `nextVideoTimestamp()` sequentially and verify output strictly increases by 33 ms per call.

9. **`toLandmarks()` Field Mapping**:
   - Pass raw array with missing `visibility`. Verify output defaults `visibility` to `1`.

10. **`resamplePoseFrames()` Catmull-Rom Spline Interpolation**:
    - Pass raw frames array at non-uniform intervals.
    - Verify output array has uniform $\Delta t = 1000 / \text{targetFps}$ spacing and interpolated landmark coordinates.

11. **`detectPosesOnVideoFrame()` Canvas & Video Element Detection**:
    - Mock `HTMLVideoElement` and `CanvasRenderingContext2D`.
    - Verify landmarker `detect()` is invoked properly on canvas.

---

## 6. Downstream Compatibility & Risk Verification

1. **`PoseTracker.ts` Compatibility**:
   - `PoseTracker.ts` calls `await getPoseLandmarker()`. Since `PoseLandmarkerLike` now includes optional `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate`, existing code in `PoseTracker.ts` operates seamlessly.
   - Optional: `PoseTracker.ts` can expose `getLoadedModelTier()` and `getLoadedDelegate()` for UI telemetry.

2. **`GaitApp.tsx` Compatibility**:
   - Calls `await getPoseLandmarker()` during session load/analysis. Zero breaking changes.

3. **Performance Impact**:
   - Trying candidates sequentially adds negligible setup latency (~1-5 ms per rejected mock/path in Node/browser, or fast failure on 404). Once loaded, the singleton promise caches the result globally.

---

## 7. Next Steps for Implementation (Worker Task Guidance)

1. Apply refactored `PoseLandmarkerModelTier`, `PoseLandmarkerDelegate`, `PoseLandmarkerLike`, `resetPoseLandmarkerCache`, and `getPoseLandmarker()` to `src/lib/gait/pose.ts`.
2. Create `src/lib/gait/__tests__/pose.test.ts` implementing the specified 11 test cases.
3. Verify test pass rate with `npx vitest run src/lib/gait/__tests__/pose.test.ts`.
4. Run full test suite `npm test`, typecheck `npm run typecheck`, and lint `npm run lint`.
