## 2026-08-09T21:08:04Z

### Objective:
Implement Milestone M1 (Computer Vision & Model Fidelity Upgrades) per specifications in `PROJECT.md`, `SCOPE.md`, and Explorer handoff reports.

### Tasks:
1. Read `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`, `/Users/damian/GitHub/gait-lab/PROJECT.md`, `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`.
2. Read Explorer Handoff Reports:
   - `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_1/handoff.md`
   - `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_2/handoff.md`
   - `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3/handoff.md`
3. Modify `src/lib/gait/pose.ts`:
   - Implement `MODEL_CANDIDATES` array with hierarchy `heavy` -> `full` -> `lite`, specifying local paths (`/models/pose_landmarker_*.task`) and Google Storage CDN fallback URLs.
   - Implement nested fallback loops in `getPoseLandmarker()` trying candidate tier, path (local -> CDN), and delegate (`GPU` -> `CPU`).
   - Augment `PoseLandmarkerLike` with `loadedModelTier?: "heavy" | "full" | "lite"` and `loadedDelegate?: "GPU" | "CPU"`.
4. Modify `src/lib/gait/signal.ts`:
   - Implement `savitzkyGolay5(signal: number[]): number[]` using 5-point quadratic convolution kernel `[-3, 12, 17, 12, -3] / 35` with 2-element reflection padding and length < 5 guard.
   - Implement `kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number): number[]` using 1D scalar state-space model ($x_k, P_k$) with default $Q=10^{-4}, R=10^{-2}$ and occlusion coasting.
   - Implement `smoothPoseFrames(frames: PoseFrame[], method?: 'savitzky-golay' | 'kalman'): PoseFrame[]` to smooth 2D `landmarks` and 3D `worldLandmarks` trajectories across `PoseFrame[]`.
5. Modify `src/lib/gait/analysis.ts` & `src/lib/gait/types.ts`:
   - Add optional `smoothingMethod?: 'savitzky-golay' | 'kalman' | 'none'` to analysis options / options parameters. Default to `'savitzky-golay'`.
   - In `computeGaitMetricsCore`, apply `smoothPoseFrames` right after the frame length check (`if (frames.length < 5)`), and use the smoothed frames for all downstream metric calculations.
6. Add & Update Tests:
   - Create `src/lib/gait/__tests__/pose.test.ts` covering model candidate hierarchy, GPU to CPU delegate fallback, local to CDN fallback, and failure throwing.
   - Add unit tests in `src/lib/gait/__tests__/signal.test.ts` testing `savitzkyGolay5`, `kalmanFilter1D`, and `smoothPoseFrames` with impulse noise, edge padding, and frame trajectory processing.
   - Add unit tests in `src/lib/gait/__tests__/analysis.test.ts` verifying smoothing integration in `computeGaitMetricsCore`.
7. Verify Code Quality & Build:
   - Run `npm test`
   - Run `npm run typecheck`
   - Run `npm run lint`
   - Run `npm run build`
8. Write your handoff report to `/Users/damian/GitHub/gait-lab/.agents/worker_m1_1/handoff.md` and communicate completion via `send_message`.

## 2026-08-09T21:08:01Z
You are Worker M1-1 for gait-lab.
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/worker_m1_1
Mandatory Reference: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md

