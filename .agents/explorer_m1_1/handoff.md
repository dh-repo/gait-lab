# Handoff Report: MediaPipe Pose Landmarker Model Hierarchy & Delegate Fallback Upgrade (`pose.ts`)

**Agent**: Explorer M1-1 (CV Model Hierarchy Specialist)  
**Date**: 2026-08-09  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_1`  
**Target Module**: `src/lib/gait/pose.ts` & `src/lib/gait/__tests__/pose.test.ts`

---

## 1. Observation

Direct code audit of `src/lib/gait/pose.ts`:

- Lines 31-35 in `src/lib/gait/pose.ts`:
  ```typescript
  const fileset = await FilesetResolver.forVisionTasks("/wasm");
  const modelAssetPath = "/models/pose_landmarker_lite.task";
  ```
  Observes hardcoded model path to `pose_landmarker_lite.task`. Heavy (`pose_landmarker_heavy.task`) and Full (`pose_landmarker_full.task`) models are never attempted.

- Lines 41-59 in `src/lib/gait/pose.ts`:
  ```typescript
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
  ```
  Observes delegate fallback logic restricted to a single local asset path for `lite`. If local path 404s or fails, no CDN URL fallback is attempted.

- Lines 8-16 in `src/lib/gait/pose.ts`:
  ```typescript
  export type PoseLandmarkerLike = {
    detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
    detectForVideo: (
      video: HTMLVideoElement | HTMLCanvasElement,
      timestamp: number,
    ) => PoseDetectionResult;
    setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
    close?: () => void;
  };
  ```
  Observes `PoseLandmarkerLike` interface lacks `modelTier` and `delegate` properties exposing active model metadata at runtime.

- Absence of `src/lib/gait/__tests__/pose.test.ts`:
  Confirmed via file search that `pose.test.ts` does not yet exist.

---

## 2. Logic Chain

1. **Model Hierarchy Rationale**: `pose_landmarker_heavy.task` offers the highest keypoint fidelity and spatial landmark accuracy for gait biomechanics. Therefore, `heavy` must be attempted first. If `heavy` cannot be loaded, fallback to `full` (`pose_landmarker_full.task`), and finally `lite` (`pose_landmarker_lite.task`).
2. **Delegate Fallback Rationale**: Within each model tier and path candidate, WebGL/GPU acceleration (`delegate: "GPU"`) yields lower latency. If WebGL context creation or GPU delegate binding fails, WASM CPU execution (`delegate: "CPU"`) should be attempted before abandoning that path/tier candidate.
3. **Asset Resolution Rationale**: Static local assets (`/models/pose_landmarker_${tier}.task`) minimize network dependency. However, if local assets are missing or 404 in production, downloading from the Google Storage CDN (`https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/pose_landmarker_${tier}.task`) guarantees runtime availability.
4. **Interface Property Rationale**: Adding optional properties `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate` to `PoseLandmarkerLike` allows UI components (`GaitApp.tsx`) and telemetry systems (`PoseTracker.ts`) to inspect runtime model tier and hardware acceleration status without breaking existing code.
5. **Test Isolation Rationale**: Exporting `resetPoseLandmarkerCache()` enables resetting `landmarkerPromise` to `null` between tests in `pose.test.ts`, guaranteeing isolated testing of all 12 candidate fallback branches.

---

## 3. Caveats

- **Network Access for CDN Fallback**: In offline or strict firewalled environments, Google Storage CDN URL fallback will fail if local assets are also absent. The system will cleanly throw an aggregated error after all 12 attempts fail.
- **Model Asset Sizes**: `heavy` model is ~25 MB. First-time fetch over CDN in browser environments may take 1-3 seconds on slower networks; caching via browser cache / PWA service worker mitigates repeated downloads.

---

## 4. Conclusion

The specification documented in `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_1/analysis.md` provides a complete, robust, non-breaking design for upgrading `src/lib/gait/pose.ts` and adding unit tests in `src/lib/gait/__tests__/pose.test.ts`.

Key deliverables specified:
- Refactored `getPoseLandmarker()` with 12-step candidate fallback loop (3 tiers $\times$ 2 paths $\times$ 2 delegates).
- Updated `PoseLandmarkerLike` interface with `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate`.
- Exported `resetPoseLandmarkerCache()` helper for unit test isolation.
- Complete Vitest unit test suite specification for `pose.test.ts`.

---

## 5. Verification Method

### Code Inspection Verification
1. Inspect `src/lib/gait/pose.ts` to confirm `MODEL_TIERS` (`["heavy", "full", "lite"]`), `DELEGATES` (`["GPU", "CPU"]`), local vs CDN URLs, and `PoseLandmarkerLike` interface updates.
2. Inspect `src/lib/gait/__tests__/pose.test.ts` to confirm unit test coverage across all fallback paths.

### Command Line Verification
Run the following commands:
```bash
# Run new pose unit test suite
npx vitest run src/lib/gait/__tests__/pose.test.ts

# Run all project unit tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Run ESLint check
npm run lint
```

### Invalidation Conditions
- If `getPoseLandmarker()` attempts `lite` before `heavy` or `full`.
- If GPU delegate failure causes the entire model tier to be skipped without attempting CPU delegate.
- If missing local model files result in immediate failure without attempting the Google Storage CDN URL.
- If `PoseLandmarkerLike` instance lacks `modelTier` or `delegate` properties upon successful initialization.
