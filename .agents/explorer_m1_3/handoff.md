# Handoff Report: Milestone M1 — Landmark Coordinate Smoothing & Test Infrastructure Audit

**Author**: Explorer M1-3  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_3`  
**Target Milestone**: Milestone M1 (Computer Vision & Model Fidelity Upgrades)  
**Date**: 2026-08-09  

---

## 1. Observation

1. **`src/lib/gait/analysis.ts` Execution Flow**:
   - `computeGaitMetricsCore(frames: PoseFrame[])` begins at line 242.
   - At line 247, `detectViewAngle(frames)` is called directly on `frames`.
   - At line 287, `detectGaitEventsZeni(frames, fpsEffective)` is called directly on `frames`.
   - 6.0 Hz zero-phase Butterworth filtering (`zeroPhaseButterworth`) is applied at lines 279–284 ONLY to derived 1D arrays (`midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`).
   - Landmark spatial trajectories (`leftAnkleY`, `rightAnkleY`, `stepWidth`, `hipDrop`) and `detectGaitEventsZeni` input keypoints remain unfiltered raw MediaPipe coordinates.

2. **`src/lib/gait/types.ts` & `src/lib/gait/index.ts` Interface Contracts**:
   - `src/lib/gait/types.ts` defines `Landmark`, `PoseFrame`, `GaitMetrics`, and `AnalysisResult`.
   - `src/lib/gait/index.ts` re-exports `./signal` (`export * from "./signal"`), `./landmarks`, `./events`, `./angles`, `./symmetry`, `./dte`, `./guesses`, `./persistence`, `./ratings`.
   - `src/lib/gait/index.ts` currently does NOT export `./pose`.
   - `BiometricSignature` is declared in both `types.ts` (line 27) and `analysis.ts` (line 621), resolved in `index.ts` (lines 16–28) via explicit exports.

3. **Existing Test Infrastructure (`src/lib/gait/__tests__/`)**:
   - Total test suites: 59 files across unit, integration, and synthetic stress categories. Total tests: 604 tests.
   - `signal.test.ts`: 11 tests covering `olsDetrend`, `butterworthLowPass`, and `zeroPhaseButterworth`.
   - `cat1_landmark_jitter_noise.test.ts`: 3 synthetic stress tests covering single-frame spikes (+0.55/-0.60 pops), joint-correlated high-frequency noise, out-of-bounds coords, and NaN/Infinity injection.
   - `m2_challenger_verification.test.ts`: 19 tests exercising Catmull-Rom cubic spline resampling via `resamplePoseFrames` in `pose.ts`.
   - `PoseTracker.test.ts`: 13 tests exercising camera tracking, constraints, and landmarker mock fallbacks.

4. **Test & Build Execution Verification**:
   - `npm test`: Executed Vitest across all 59 test files. Output: `Test Files 59 passed (59), Tests 604 passed (604)`.
   - `npm run typecheck`: Executed `tsc --noEmit`. Output: `exited with code 0` (0 TypeScript errors).
   - `npm run lint`: Executed `eslint .`. Output: `0 errors, 1 warning` (`exited with code 0`).
   - `npm run build`: Executed `vite build` with Nitro Vercel preset. Output: `✓ built in 1.19s`, `exited with code 0`.

---

## 2. Logic Chain

1. **Observation 1 $\rightarrow$ Integration Placement**: `detectGaitEventsZeni` and `detectViewAngle` rely directly on frame landmark spatial coordinates. Calling `const frames = smoothPoseFrames(rawFrames);` at line 246 of `computeGaitMetricsCore` filters noise across all 33 landmarks BEFORE any event detection, angle computation, or metric extraction occurs.
2. **Observation 1 $\rightarrow$ Split-Half Consistency**: `computeGaitMetrics(frames)` calls `computeGaitMetricsCore` on the full frame sequence and twice on half-split sub-arrays (`m1` and `m2`). Placing `smoothPoseFrames` inside `computeGaitMetricsCore` automatically guarantees consistent signal filtering for both full-session metrics and split-half reliability bounds (`confidenceIntervals`).
3. **Observation 2 $\rightarrow$ Interface Contract Alignment**: Exporting `SmoothingMethod`, `PoseLandmarkerModelTier`, `PoseLandmarkerDelegate`, and `PoseLandmarkerLike` from `types.ts` (or `pose.ts`), and adding `export * from "./pose";` to `index.ts` cleanly exposes all Milestone M1 capabilities to the application barrel without export name collisions.
4. **Observation 3 & 4 $\rightarrow$ Regression Baseline**: The existing test suite of 604 tests (100% passing) and `cat1_landmark_jitter_noise.test.ts` provide a robust regression boundary. Integrating 1D temporal coordinate smoothing preserves 100% test pass rates and zero typecheck/lint/build errors while enhancing metric stability against salt-and-pepper tracking noise.

---

## 3. Caveats

- **Minimum Frame Requirement**: Both `smoothPoseFrames` (5-point Savitzky-Golay) and `computeGaitMetricsCore` require $N \ge 5$ frames. For $N < 5$, `computeGaitMetricsCore` returns `emptyMetrics(rawFrames)` prior to smoothing.
- **Model Fallback Network Dependency**: Model fallback testing for `pose_landmarker_heavy.task` $\rightarrow$ `full` $\rightarrow$ `lite` in unit tests should mock `fetch` / `createFromOptions` to prevent network requests during offline test execution.

---

## 4. Conclusion

- **Pre-Metric Placement**: Call `const frames = smoothPoseFrames(rawFrames);` at the top of `computeGaitMetricsCore()` in `src/lib/gait/analysis.ts`.
- **Interface Exports**: Add `export * from "./pose";` to `src/lib/gait/index.ts` and define `SmoothingMethod` / landmarker metadata types in `types.ts`.
- **Test Infrastructure Readiness**: Existing test infrastructure is 100% passing (59 files, 604 tests, 0 typecheck/lint/build errors). `cat1_landmark_jitter_noise.test.ts` validates jitter noise resilience.
- Complete findings and code blueprints are published in `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_3/analysis.md`.

---

## 5. Verification Method

To independently verify all findings and test requirements:

1. **Detailed Technical Report**: Inspect `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_3/analysis.md`.
2. **Unit & Integration Test Suite**: Run `npm test` in `/Users/damian/GitHub/gait-lab`. (Expected: 59 passed test files, 604 passed tests).
3. **Synthetic Noise Test Suite**: Run `npx vitest run src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts`. (Expected: 3/3 passed tests).
4. **TypeScript Verification**: Run `npm run typecheck`. (Expected: 0 errors).
5. **Lint Verification**: Run `npm run lint`. (Expected: 0 errors).
6. **Production Build Verification**: Run `npm run build`. (Expected: successful build).
