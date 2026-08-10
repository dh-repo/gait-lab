# Technical Analysis: MediaPipe Model Loading & Fallback Hierarchy (Milestone M1 - Feature F1)

**Agent**: `explorer_m1_r1_1`  
**Target File**: `src/lib/gait/pose.ts`  
**Date**: 2026-08-09  

---

## 1. Executive Summary

Milestone M1 (F1) requires upgrading the MediaPipe Pose Landmarker initialization in `src/lib/gait/pose.ts` to support high-fidelity pose estimation model candidates in a cascading preference hierarchy (`pose_landmarker_heavy.task` $\rightarrow$ `pose_landmarker_full.task` $\rightarrow$ `pose_landmarker_lite.task`) with per-candidate GPU-to-CPU delegate fallback mechanisms.

Currently, `getPoseLandmarker()` in `src/lib/gait/pose.ts` hardcodes a single model asset path (`/models/pose_landmarker_lite.task`) and only attempts GPU $\rightarrow$ CPU delegate fallback for that single lightweight model. The higher precision models (`heavy` and `full`) are never attempted.

This analysis evaluates the current implementation, details the model tier hierarchy and delegate fallback architecture, examines local vs. CDN asset resolution, identifies missing test coverage, and provides exact recommendations for the implementer agent.

---

## 2. Current Implementation Analysis (`src/lib/gait/pose.ts`)

### 2.1 Code Structure & Function Inventory
In `src/lib/gait/pose.ts`:
- **`PoseDetectionResult`**: Type definition for pose landmarks (`landmarks` and `worldLandmarks`).
- **`PoseLandmarkerLike`**: Interface abstracting MediaPipe's `PoseLandmarker` object (`detect`, `detectForVideo`, `setOptions`, `close`).
- **`getPoseLandmarker()`**: Singleton async function returning `Promise<PoseLandmarkerLike>`.
- **`toLandmarks()`**: Helper converting MediaPipe points `{x, y, z, visibility}` to internal `Landmark` models.
- **`detectPosesOnVideoFrame()`**: Canvas rendering helper ensuring valid video frame capture and brightness checking.
- **`resamplePoseFrames()`**: Catmull-Rom cubic spline interpolation for uniform time grid resampling.

### 2.2 Current Initialization Logic (`getPoseLandmarker`)
Lines 29–66 of `src/lib/gait/pose.ts`:
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

### 2.3 Identified Flaws & Limitations
1. **Hardcoded Single Model Tier**: Line 35 hardcodes `const modelAssetPath = "/models/pose_landmarker_lite.task"`. Higher fidelity models (`heavy` and `full`) are never attempted.
2. **Missing Local-to-CDN Asset Fallback**: If a local asset path is missing or fails to fetch (e.g. 404), `createFromOptions` throws an error. There is no automated attempt to fetch from Google Storage CDN URLs (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/...`).
3. **No Cross-Tier Delegate Loop**: The try/catch block only catches GPU failure on `lite` and tries CPU on `lite`. If `heavy` or `full` are introduced, failure on GPU must fall back to CPU *before* moving to the next model tier, OR try `Heavy GPU` $\rightarrow$ `Heavy CPU` $\rightarrow$ `Full GPU` $\rightarrow$ `Full CPU` $\rightarrow$ `Lite GPU` $\rightarrow$ `Lite CPU`.
4. **Lack of Metadata Exposure**: The returned landmarker does not report which model tier or delegate was successfully initialized, making debugging and observability difficult.

---

## 3. Model Candidates Preference Hierarchy

Clinical spatio-temporal gait analysis relies on tracking subtle lower-extremity landmark displacement (ankle, heel, toe) across gait cycles.

| Model Tier | Asset File Name | Approx Size | Accuracy / Keypoint Stability | Primary Use Case |
|---|---|---|---|---|
| **Heavy** (Primary) | `pose_landmarker_heavy.task` | ~25 MB | Highest keypoint precision; minimal jitter; robust under occlusion | Clinical precision workstations, high-accuracy gait tracking |
| **Full** (Fallback 1) | `pose_landmarker_full.task` | ~12 MB | Balanced keypoint precision & throughput | Standard desktops, mid-tier mobile hardware |
| **Lite** (Fallback 2) | `pose_landmarker_lite.task` | ~5.7 MB | Lightest memory footprint; fastest inference | Fallback for restricted memory / low-tier devices |

### Repository File Audit
- `public/models/pose_landmarker_lite.task` (5,777,746 bytes) exists locally.
- `public/models/pose_landmarker_heavy.task` and `public/models/pose_landmarker_full.task` do NOT exist in `public/models/`.
- **Requirement**: The loading logic MUST be resilient to missing local files. When `pose_landmarker_heavy.task` is missing locally, it should attempt CDN download or gracefully fall back to the next available tier without breaking the application.

---

## 4. Delegate & Asset Loading Fallback Matrix

### 4.1 Preferred Resolution Sequence
For every candidate model tier (`heavy` $\rightarrow$ `full` $\rightarrow$ `lite`), the loader should evaluate asset locations (`Local Path` $\rightarrow$ `Google Storage CDN URL`) and execution delegates (`GPU` $\rightarrow$ `CPU`).

The cascading matrix sequence:

1. `Heavy` Local (`/models/pose_landmarker_heavy.task`) with `GPU` delegate
2. `Heavy` Local (`/models/pose_landmarker_heavy.task`) with `CPU` delegate
3. `Heavy` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`) with `GPU` delegate
4. `Heavy` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`) with `CPU` delegate
5. `Full` Local (`/models/pose_landmarker_full.task`) with `GPU` delegate
6. `Full` Local (`/models/pose_landmarker_full.task`) with `CPU` delegate
7. `Full` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`) with `GPU` delegate
8. `Full` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`) with `CPU` delegate
9. `Lite` Local (`/models/pose_landmarker_lite.task`) with `GPU` delegate
10. `Lite` Local (`/models/pose_landmarker_lite.task`) with `CPU` delegate
11. `Lite` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`) with `GPU` delegate
12. `Lite` CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`) with `CPU` delegate

### 4.2 Asset URL Reference Table
- **Heavy CDN**: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`
- **Full CDN**: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`
- **Lite CDN**: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`

---

## 5. Missing Pieces & Code Base Gaps

1. **No Unit Test Coverage for `pose.ts` Model Loading**:
   - `src/lib/gait/__tests__/` contains tests for `analysis`, `events`, `signal`, `PoseTracker`, but NO dedicated unit test for model fallback hierarchy in `pose.ts`.
   - A new test file `src/lib/gait/__tests__/pose.test.ts` should be created to test `getPoseLandmarker()` fallback behavior.

2. **Metadata Augmentation for `PoseLandmarkerLike`**:
   - Callers such as `PoseTracker.ts` or diagnostic UI components would benefit from knowing the loaded model tier (`heavy`, `full`, `lite`) and delegate (`GPU` or `CPU`).
   - Recommending adding optional fields to `PoseLandmarkerLike`:
     ```typescript
     export type PoseLandmarkerLike = {
       detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
       detectForVideo: (video: HTMLVideoElement | HTMLCanvasElement, timestamp: number) => PoseDetectionResult;
       setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
       close?: () => void;
       loadedModelTier?: "heavy" | "full" | "lite";
       loadedDelegate?: "GPU" | "CPU";
     };
     ```

---

## 6. Proposed Implementation Specifications

### 6.1 `src/lib/gait/pose.ts` Proposed Refactoring Code

```typescript
export type ModelTier = "heavy" | "full" | "lite";
export type DelegateType = "GPU" | "CPU";

export interface ModelCandidate {
  tier: ModelTier;
  paths: string[];
}

export const MODEL_CANDIDATES: ModelCandidate[] = [
  {
    tier: "heavy",
    paths: [
      "/models/pose_landmarker_heavy.task",
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
    ],
  },
  {
    tier: "full",
    paths: [
      "/models/pose_landmarker_full.task",
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    ],
  },
  {
    tier: "lite",
    paths: [
      "/models/pose_landmarker_lite.task",
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    ],
  },
];

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

      const delegates: DelegateType[] = ["GPU", "CPU"];

      for (const candidate of MODEL_CANDIDATES) {
        for (const modelAssetPath of candidate.paths) {
          for (const delegate of delegates) {
            try {
              const landmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath, delegate },
                ...common,
              });
              const wrapped = landmarker as unknown as PoseLandmarkerLike;
              wrapped.loadedModelTier = candidate.tier;
              wrapped.loadedDelegate = delegate;
              return wrapped;
            } catch (err) {
              console.warn(
                `[getPoseLandmarker] Candidate tier '${candidate.tier}' path '${modelAssetPath}' delegate '${delegate}' failed:`,
                err,
              );
            }
          }
        }
      }

      throw new Error(
        "Failed to initialize MediaPipe PoseLandmarker across all candidate model tiers, locations, and delegates.",
      );
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}
```

### 6.2 Unit Verification Strategy (`src/lib/gait/__tests__/pose.test.ts`)
The implementer should write unit tests mocking `@mediapipe/tasks-vision`'s `PoseLandmarker.createFromOptions`:
1. **Primary Success Test**: Mock `createFromOptions` to succeed on `pose_landmarker_heavy.task` with GPU delegate. Assert returned landmarker has `loadedModelTier: "heavy"` and `loadedDelegate: "GPU"`.
2. **GPU Failure Fallback Test**: Mock `createFromOptions` to fail when `delegate: "GPU"` for heavy, but succeed when `delegate: "CPU"`. Assert returned landmarker has `loadedModelTier: "heavy"` and `loadedDelegate: "CPU"`.
3. **Local Missing Fallback Test**: Mock `createFromOptions` to fail on local `/models/pose_landmarker_heavy.task`, but succeed on CDN heavy URL. Assert loading succeeds via CDN.
4. **Tier Cascading Test**: Mock `createFromOptions` to fail for all `heavy` and `full` candidate paths/delegates, and succeed on `lite`. Assert returned landmarker falls back to `lite`.

---

## 7. Conclusion

The proposed design for Feature F1 satisfies all requirements of Milestone M1. It ensures high clinical accuracy when heavy or full models are available while providing robust fallback to local/CDN assets and GPU/CPU delegates. Implementation is straightforward and self-contained within `src/lib/gait/pose.ts`.
