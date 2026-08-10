# Handoff Report: Keypoint Smoothing Integration Analysis (`src/lib/gait/analysis.ts`)

**Agent**: explorer_m1_r1_3  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3`  
**Parent Conversation ID**: `75715ff9-9d80-47ae-bd6a-226d8bd44d8a`  
**Date**: 2026-08-09  

---

## 1. Observation

### 1.1 Source Code Excerpts & File Paths

- **`src/lib/gait/analysis.ts` (Lines 242–289)**:
  `computeGaitMetricsCore` accepts `frames: PoseFrame[]`. Currently, raw `frames` are passed directly into `detectViewAngle(frames)`, `series` extraction, and `detectGaitEventsZeni(frames, fpsEffective)` without prior coordinate temporal smoothing:
  ```typescript
  function computeGaitMetricsCore(frames: PoseFrame[]): GaitMetrics {
    if (frames.length < 5) {
      return emptyMetrics(frames);
    }

    const { angle, confidence } = detectViewAngle(frames);
    const t0 = frames[0].timeMs;
    const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
    const fpsEffective = (frames.length - 1) / durationSec;
    const fps = Math.max(1, fpsEffective);

    const series = frames.map((f) => {
      const lm = f.landmarks;
      ...
    });

    // Zero-phase 4th-order Butterworth low-pass filtering (fc = 6.0 Hz) on landmark trajectories
    const midHipX = zeroPhaseButterworth(series.map((s) => s.midHipX), fps, 6.0);
    const midHipY = zeroPhaseButterworth(series.map((s) => s.midHipY), fps, 6.0);
    ...
    const zeniBreakdown = detectGaitEventsZeni(frames, fpsEffective);
  ```

- **`PROJECT.md` & `SCOPE.md` Interface Contracts**:
  - `src/lib/gait/signal.ts`: Exports `savitzkyGolay5(signal: number[])`, `kalmanFilter1D(signal: number[])`, and `smoothPoseFrames(frames: PoseFrame[], method?: 'savitzky-golay' | 'kalman'): PoseFrame[]`.
  - `src/lib/gait/analysis.ts`: `computeGaitMetricsCore(...)` must smooth raw keypoints prior to metric computation.

- **`src/lib/gait/__tests__/analysis.test.ts` (Lines 51–149)**:
  Contains unit tests for `computeGaitMetrics`, view angle detection, stationary clips, split-half CI, and metric suppression.

- **`src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts` (Lines 6–61)**:
  Stress tests single-frame coordinate pops and joint-correlated high-frequency noise.

---

## 2. Logic Chain

1. **Observation 1.1**: `computeGaitMetricsCore` receives raw `frames: PoseFrame[]`. It uses raw landmarks for `detectViewAngle`, `series` coordinate extraction, torso normalization (`torsoHeight`), and `detectGaitEventsZeni`.
2. **Inference 1**: Single-frame tracking pops or high-frequency MediaPipe landmark jitter directly pollute `detectViewAngle`, `torsoHeight` normalization, spatial step width, pelvic obliquity, and Zeni heel strike peak detection.
3. **Observation 1.2**: `PROJECT.md` and `SCOPE.md` specify that `smoothPoseFrames(frames: PoseFrame[], method?: 'savitzky-golay' | 'kalman')` in `signal.ts` must filter keypoint coordinates across frames prior to metric computation.
4. **Inference 2**: Pre-filtering `frames` at the entry point of `computeGaitMetricsCore` (via `const smoothedFrames = smoothPoseFrames(frames, smoothingMethod)`) guarantees that all downstream consumers (`detectViewAngle`, `series` extraction, `detectGaitEventsZeni`, `computeGaitAngleAnalysis`) receive clean, temporally smoothed landmark trajectories.
5. **Inference 3**: Savitzky-Golay 5-point quadratic filtering (`'savitzky-golay'`) is the optimal default method because it suppresses high-frequency coordinate noise while preserving peak amplitudes and timing of human limb movements better than moving averages.

---

## 3. Caveats

1. **Short Clips Guard**: Clips with `frames.length < 5` cannot be smoothed by a 5-point filter stencil. `smoothPoseFrames` must safely return a shallow copy of `frames` without filtering when `frames.length < 5`.
2. **NaN / Non-Finite Coordinate Handling**: Keypoint smoothing must sanitize non-finite values (`NaN`, `Infinity`) prior to filtering to prevent numerical corruption across the smoothed trajectory.
3. **Execution Order**: `smoothPoseFrames` must be executed after validating `frames.length >= 5` and before calculating effective FPS or invoking `detectViewAngle`.

---

## 4. Conclusion

Keypoint coordinate temporal smoothing must be integrated into `src/lib/gait/analysis.ts` at the beginning of `computeGaitMetricsCore(frames: PoseFrame[])` by applying `smoothPoseFrames(frames)`.

This change affects all downstream temporal, spatial, kinematic, and symmetry metrics as well as joint angle ensemble calculations, protecting the entire gait engine against MediaPipe landmark tracking jitter and coordinate noise.

Full detailed findings, metric catalog, and test specifications are documented in:
`/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3/analysis.md`.

---

## 5. Verification Method

To verify the integration of keypoint smoothing after implementation:

### 5.1 Project Verification Commands
```bash
# 1. Verify TypeScript static typecheck (must pass with 0 compilation errors)
npm run typecheck

# 2. Verify ESLint compliance (must pass with 0 errors / warnings)
npm run lint

# 3. Run full Vitest unit & integration test suite (must pass 100%)
npm test

# 4. Verify production build
npm run build
```

### 5.2 Specific Test Files to Inspect / Execute
- `npm test src/lib/gait/__tests__/analysis.test.ts`
- `npm test src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts`
- `npm test src/lib/gait/__tests__/signal.test.ts`

### 5.3 Invalidation Conditions
- Any test failure in `analysis.test.ts` or `cat1_landmark_jitter_noise.test.ts`.
- `computeGaitMetricsCore` failing to smooth `frames` before passing to `detectViewAngle` or `detectGaitEventsZeni`.
- `stepTimeCV` or `stepWidthVariability` being artificially inflated by un-smoothed landmark tracking noise.
