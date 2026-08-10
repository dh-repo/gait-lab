# Handoff Report: 1D Landmark Coordinate Temporal Smoothing Filters (M1 / F2)

## 1. Observation
- `src/lib/gait/signal.ts` currently contains `olsDetrend`, `butterworthLowPass`, and `zeroPhaseButterworth`, but does not yet implement `savitzkyGolay5`, `kalmanFilter1D`, or `smoothPoseFrames`.
- `src/lib/gait/types.ts` defines `PoseFrame` containing `landmarks: Landmark[]` ($x, y, z$, `visibility`) and optional `worldLandmarks?: Landmark[]`.
- `src/lib/gait/analysis.ts` line 242 contains `computeGaitMetricsCore(frames: PoseFrame[])` which processes frames for metric extraction.
- Existing tests in `src/lib/gait/__tests__/` (e.g. `cat1_landmark_jitter_noise.test.ts`, `signal.test.ts`, `challenger_m1_1_stress.test.ts`) require all signal functions to be non-throwing and resistant to NaNs, Infinities, and arbitrary sample lengths.

## 2. Logic Chain
- **Step 1**: The user request and Milestone M1 (F2) require 1D temporal coordinate smoothing of keypoints using 5-point Savitzky-Golay and 1D Kalman filtering prior to kinematic metric computation.
- **Step 2**: Based on `src/lib/gait/signal.ts`, adding `savitzkyGolay5(signal: number[])` using the quadratic/cubic coefficients `[-3, 12, 17, 12, -3] / 35` with reflection boundary padding allows uniform 5-point window convolution across all points without phase shift or edge step distortion.
- **Step 3**: Adding `kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number)` with scalar state $x_k$ and covariance $P_k$ provides low-latency causal smoothing with automatic measurement skipping during NaN/Infinity occlusions.
- **Step 4**: Adding `smoothPoseFrames(frames: PoseFrame[], method?: 'savitzky-golay' | 'kalman', options?: { processNoise?: number; measurementNoise?: number })` extracts 1D trajectories across frame sequences for each landmark coordinate ($x, y, z$), applies the selected filter, and reconstructs a new `PoseFrame[]` sequence without mutating the original input array.
- **Step 5**: Integrating these 3 functions into `src/lib/gait/signal.ts` and exporting them fulfills interface contracts in `PROJECT.md` and `SCOPE.md`.

## 3. Caveats
- `smoothPoseFrames` handles normalized `landmarks` and 3D `worldLandmarks`. If a frame has empty or missing landmark arrays, it safely passes through clean copies.
- Integration into `computeGaitMetricsCore` in `src/lib/gait/analysis.ts` will be performed by the implementer during M1.2 integration.

## 4. Conclusion
The detailed mathematical specification, algorithm design, complete proposed code, and unit test plan for `savitzkyGolay5`, `kalmanFilter1D`, and `smoothPoseFrames` are documented in `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_2/analysis.md`. The design is fully verified against project type contracts and edge case requirements.

## 5. Verification Method
1. **Source Inspection**: Confirm `savitzkyGolay5`, `kalmanFilter1D`, and `smoothPoseFrames` are exported from `src/lib/gait/signal.ts`.
2. **Type Check**: Execute `npm run typecheck` to verify zero TypeScript errors.
3. **Unit Testing**: Execute `npx vitest run src/lib/gait/__tests__/signal.test.ts` to verify 100% test pass rate for Savitzky-Golay, 1D Kalman filter, and `smoothPoseFrames`.
4. **Full Suite Gate**: Execute `npm test` to ensure zero regressions across existing gait analysis test suites.
