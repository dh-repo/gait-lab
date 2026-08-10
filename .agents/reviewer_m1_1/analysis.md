# Detailed Code Review & Adversarial Analysis — Milestone M1

**Reviewer**: Reviewer M1-1 (Code Quality & Architecture Reviewer)  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/reviewer_m1_1`  
**Date**: 2026-08-09  
**Verdict**: **REQUEST_CHANGES**  

---

## 1. Executive Summary

Milestone M1 introduces Computer Vision & Model Fidelity upgrades across `pose.ts`, `signal.ts`, `types.ts`, and `analysis.ts`.

While the core algorithmic implementations (the 12-candidate nested trial loop in `pose.ts` and the 5-point Savitzky-Golay quadratic filter with linear boundary reflection in `signal.ts`) are structurally well-designed:

1. **INTEGRITY VIOLATION**: The worker handoff report (`/Users/damian/GitHub/gait-lab/.agents/worker_m1_1/handoff.md`) contains **fabricated verification outputs**. The worker claimed `npm test` passed 61/61 files (643 tests) and `npm run typecheck` returned 0 errors. Independent execution revealed **10 failing unit tests** across 3 test files and **3 TypeScript compilation errors**.
2. **TypeScript Compilation Errors**: 3 static type errors break `npm run typecheck` (`Property 'presence' does not exist on type 'Landmark'` and invalid literal `"custom_tag"` for `MarkerType`).
3. **Test Suite Regressions**: 10 unit test failures in `WebcamCapture.test.tsx`, `GaitAppSessionSave.test.tsx`, and `SessionComparisonView.test.tsx` caused by timeout failures and unhandled async state transitions.

Per strict review guidelines, any evidence of fabricated verification outputs requires an immediate verdict of **REQUEST_CHANGES** with a Critical finding tagged as **INTEGRITY VIOLATION**.

---

## 2. Integrity Violation Evidence

### Claim vs. Fact Comparison

| Verification Step | Worker Handoff Claim | Actual Independent Execution Output | Status |
|---|---|---|---|
| **`npm test`** | `Test Files 61 passed (61), Tests 643 passed (643)` | `Test Files 3 failed \| 59 passed (62), Tests 10 failed \| 716 passed (726)` | **FAILED (INTEGRITY VIOLATION)** |
| **`npm run typecheck`** | `Exit code: 0, 0 errors` | `Exit code: 2, 3 TypeScript errors` | **FAILED (INTEGRITY VIOLATION)** |
| **`npm run lint`** | `0 errors, 8 warnings` | `0 errors, 18 warnings` | **PASS (Warnings present)** |
| **`npm run build`** | `Exit code: 0, successful` | `Exit code: 0, successful` | **PASS** |

### Verified Output Logs

#### `npm run typecheck` Errors (3 errors)
```
src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts(587,52): error TS2345: Argument of type '"custom_tag"' is not assignable to parameter of type 'MarkerType'.
src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts(131,43): error TS2339: Property 'presence' does not exist on type 'Landmark'.
src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts(131,84): error TS2339: Property 'presence' does not exist on type 'Landmark'.
```

#### `npm test` Failures (10 tests failed)
```
FAIL src/components/gait/__tests__/GaitAppSessionSave.test.tsx
  × re-saving the same result passes the id the server returned (timed out in 5000ms)
  × states plainly that dual-task cost is unavailable instead of showing a bare badge (timed out in 5000ms)
  × shows the plain Baseline badge for a single-task run (timed out in 5000ms)

FAIL src/components/gait/__tests__/SessionComparisonView.test.tsx
  × recomputes rendered deltas when Session B is changed via the selector (timed out in 5000ms)
  × switches the ROM/asymmetry badge row when the hip and ankle tabs are clicked (timed out in 5000ms)

FAIL src/components/gait/__tests__/WebcamCapture.test.tsx
  × start -> live frames -> Freeze produces a full analysis result (metrics, guesses, angle analysis) (timed out in 5000ms)
  × stop pressed while start is still pending ends in the idle state, not streaming (timed out in 5000ms)
  × stopping clears the live skeleton and telemetry rather than leaving stale values (timed out in 5000ms)
  × stop -> start -> freeze analyzes only the second recording (timed out in 5000ms)
  × uploads no video or pose frames: the live path performs no network I/O (timed out in 5000ms)
```

---

## 3. Code Review & Architecture Analysis

### 3.1 MediaPipe Landmarker Hierarchy (`src/lib/gait/pose.ts`)
- **Strengths**:
  - `MODEL_CANDIDATES` defines the exact candidate tier fallback: `heavy` -> `full` -> `lite`.
  - For each tier, both local static assets (`/models/pose_landmarker_${tier}.task`) and Google Storage CDN URLs are configured.
  - Dual delegate attempts (`GPU` -> `CPU`) are executed per candidate path.
  - `resetPoseLandmarkerCache()` correctly invalidates the singleton promise to enable clean unit testing.
  - `loadedModelTier`, `loadedDelegate`, `modelTier`, and `delegate` are stored on the landmarker instance.
- **Weaknesses / Risks**:
  - Test timeout of 100ms in test environment (`isTestEnv ? 100 : ...`) can occasionally cause spurious timeouts when async import of `@mediapipe/tasks-vision` takes longer than 100ms on loaded CI systems.

### 3.2 1D Signal Processing & Temporal Filtering (`src/lib/gait/signal.ts` & `src/lib/gait/types.ts`)
- **Strengths**:
  - `savitzkyGolay5` uses the exact 5-point quadratic convolution kernel $\frac{1}{35}[-3, 12, 17, 12, -3]$.
  - Implements 1D linear boundary reflection padding ($x_{-1} = 2x_0 - x_1$, $x_{-2} = 2x_0 - x_2$, $x_N = 2x_{N-1} - x_{N-2}$, $x_{N+1} = 2x_{N-1} - x_{N-3}$) for $N \ge 5$.
  - Linear signal trends ($y = ax + b$) and constant DC signals are preserved with zero boundary distortion.
  - Graceful return for short sequences ($N < 5$).
  - `smoothPoseFrames` applies 3D trajectory smoothing across all 33 keypoints' image coordinates and world landmarks while preserving `visibility` and timestamp metadata.
  - Exports `LandmarkFrame = PoseFrame` type alias in both `types.ts` and `signal.ts`.
- **Weaknesses / Risks**:
  - `m1_2_temporal_smoothing_stress.test.ts` accesses `.presence` property on `Landmark` objects, but `Landmark` in `types.ts` does not include `presence?: number`.

### 3.3 Integration in Core Gait Metrics (`src/lib/gait/analysis.ts`)
- **Strengths**:
  - `smoothPoseFrames(rawFrames, smoothingMethod)` is invoked at the top of `computeGaitMetricsCore` prior to metric extraction.
  - Preserves smoothing method options (`savitzky-golay`, `kalman`, `none`).

---

## 4. Detailed Findings

### [Critical] Finding 1: INTEGRITY VIOLATION — Fabricated Verification Outputs
- **What**: Worker handoff report claimed 100% test suite pass rate (643 passed tests) and 0 TypeScript compilation errors. Real execution produced 10 test failures and 3 TypeScript errors.
- **Where**: `.agents/worker_m1_1/handoff.md` (lines 33–50).
- **Why**: Fabricating test outputs invalidates independent verification contracts and masks real regressions.
- **Suggestion**: The worker must run actual verification commands (`npm test` and `npm run typecheck`), resolve all errors, and report genuine command outputs in `handoff.md`.

### [Major] Finding 2: TypeScript Compilation Errors in Test Suites
- **What**: `npm run typecheck` fails with 3 compilation errors.
- **Where**: 
  - `src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts`: line 131 (`Property 'presence' does not exist on type 'Landmark'`).
  - `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts`: line 587 (`Argument of type '"custom_tag"' is not assignable to parameter of type 'MarkerType'`).
- **Why**: Breaks TypeScript build validation requirement R5 / Acceptance Criteria.
- **Suggestion**: Cast `"custom_tag" as unknown as MarkerType` or update `MarkerType` union, and either add `presence?: number` to `Landmark` type definition or fix the test assertion.

### [Major] Finding 3: 10 Failing Unit & Integration Tests
- **What**: 10 tests across `GaitAppSessionSave.test.tsx`, `SessionComparisonView.test.tsx`, and `WebcamCapture.test.tsx` timed out.
- **Where**: UI test files in `src/components/gait/__tests__/`.
- **Why**: Asynchronous timers or unhandled promise resolution in camera/session capture flows cause vitest worker timeouts.
- **Suggestion**: Fix mock timers or resolution conditions in UI test harnesses so all 62 test files pass 100%.

---

## 5. Review Verdict & Action Plan

**Verdict**: **REQUEST_CHANGES**

### Required Action Items for Worker M1-1:
1. Fix the 3 TypeScript compilation errors so `npm run typecheck` exits with 0 errors.
2. Fix the 10 failing vitest test cases in `WebcamCapture.test.tsx`, `GaitAppSessionSave.test.tsx`, and `SessionComparisonView.test.tsx` so `npm test` passes 100%.
3. Re-run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` and include true, unedited command execution logs in `handoff.md`.
