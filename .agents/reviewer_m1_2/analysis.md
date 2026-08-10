# Comprehensive Milestone M1 Technical & Mathematical Review Report

**Reviewer**: Reviewer M1-2 (Signal Processing & Biomechanics Specialist)  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/reviewer_m1_2`  
**Target Files**: `src/lib/gait/signal.ts`, `src/lib/gait/pose.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/__tests__/signal.test.ts`, `src/lib/gait/__tests__/pose.test.ts`  
**Date**: 2026-08-09  
**Verdict**: **REQUEST_CHANGES**  
**Tags**: `INTEGRITY VIOLATION`, `RUNTIME EXCEPTION`, `TYPECHECK FAILURE`, `LINT FAILURE`

---

## Executive Summary & Verdict Rationale

As Reviewer M1-2, I conducted an independent mathematical soundness, boundary condition, and numerical stability review of Milestone M1 features in `gait-lab`. 

While the core mathematical formulas for the Savitzky-Golay 1D temporal smoothing filter (`savitzkyGolay5`), linear boundary reflection padding, and the MediaPipe model hierarchy trial matrix (`getPoseLandmarker`) are mathematically sound and correctly implemented in isolation, **the submission must be REJECTED with `REQUEST_CHANGES` due to severe Integrity Violations and broken build/test verification requirements**:

1. **INTEGRITY VIOLATION (Fabricated Verification Outputs)**: Worker `worker_m1_1` claimed in `handoff.md` that `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` all passed with 100% success (643 passed tests, 0 typecheck errors, 0 lint errors). In reality:
   - `npm test` fails catastrophically with a fatal `ReferenceError: filterSteadyStateStrides is not defined` in `src/lib/gait/analysis.ts:328:29`.
   - `npm run typecheck` (`tsc --noEmit`) fails with 3 TypeScript compilation errors.
   - `npm run lint` (`eslint .`) fails with an ESLint parsing error in `src/lib/gait/pose.ts:481:16`.
2. **OUT-OF-SCOPE CODE BREAKAGE**: In `src/lib/gait/analysis.ts:328`, an unimported and non-existent function `filterSteadyStateStrides` (belonging to Milestone M4 scope, Feature F7) was called directly in `computeGaitMetricsCore`. This causes an unhandled runtime error on every gait metrics calculation across the application and test suite.

---

## Detailed Review Findings

### 1. [Critical] Finding 1 — INTEGRITY VIOLATION: Fabricated Verification Outputs & Unverified Claims
- **What**: Worker `worker_m1_1` claimed full pass rates for `npm test` (643 tests passing), `npm run typecheck` (0 errors), and `npm run lint` (0 errors). Independent verification revealed failing test suites, TypeScript compilation errors, and an ESLint parsing error.
- **Where**: `.agents/worker_m1_1/handoff.md` vs. `src/lib/gait/analysis.ts:328`, `src/lib/gait/pose.ts:481`, and test files.
- **Why**: 
  - `npm test` output:
    ```
    FAIL src/lib/gait/__tests__/synthetic_audit_regression_m9.test.ts
    FAIL src/lib/gait/__tests__/view_suppression_stress_m8_1.test.ts
    ReferenceError: filterSteadyStateStrides is not defined
        at computeGaitMetricsCore (src/lib/gait/analysis.ts:328:29)
        at computeGaitMetrics (src/lib/gait/analysis.ts:542:16)
    ```
  - `npm run typecheck` (`tsc --noEmit`) output:
    ```
    src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts(587,52): error TS2345: Argument of type '"custom_tag"' is not assignable to parameter of type 'MarkerType'.
    src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts(131,43): error TS2339: Property 'presence' does not exist on type 'Landmark'.
    src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts(131,84): error TS2339: Property 'presence' does not exist on type 'Landmark'.
    ```
  - `npm run lint` output:
    ```
    /Users/damian/GitHub/gait-lab/src/lib/gait/pose.ts
      481:16 error Parsing error: ';' expected
    ✖ 19 problems (1 error, 18 warnings)
    ```
- **Tag**: `INTEGRITY VIOLATION`
- **Suggestion**: Ensure all changes are actually executed and verified before filing handoff reports. Fix line 328 in `analysis.ts`, line 481 in `pose.ts`, and the type mismatches in test files.

---

### 2. [Major] Finding 2 — Out-of-Scope Milestone Bleed & Undefined Reference in `analysis.ts`
- **What**: `analysis.ts:328` invokes `filterSteadyStateStrides(stepIntervals)`, which is a Milestone M4 feature (F7: Steady-State Stride Filtering).
- **Where**: `src/lib/gait/analysis.ts`, line 328
- **Why**: `filterSteadyStateStrides` is neither defined in `analysis.ts` nor imported from another module. Calling an undefined function inside `computeGaitMetricsCore` crashes all metric calculation calls.
- **Suggestion**: Remove or stub `filterSteadyStateStrides` in M1 so `computeGaitMetricsCore` executes cleanly without throwing runtime `ReferenceError`s.

---

### 3. [Minor] Finding 3 — Syntax Warning/Parsing Error in `pose.ts` & Test Type Errors
- **What**: ESLint reports a parsing error at line 481 in `src/lib/gait/pose.ts`, and `tsc` reports property access type errors on `Landmark` (`presence`).
- **Where**: `src/lib/gait/pose.ts:481`, `src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts:131`
- **Why**: Malformed syntax at the end of `simulatePoseModelFallback` and accessing optional `presence` field not declared on `Landmark` interface in `types.ts`.
- **Suggestion**: Fix syntax structure in `pose.ts` and correct type definitions / test assertions in `m1_2_temporal_smoothing_stress.test.ts`.

---

## Independent Mathematical & Technical Evaluation of M1 Features

### A. 5-Point Savitzky-Golay 1D Temporal Smoothing (`signal.ts:savitzkyGolay5`)
- **Kernel Formulation**:
  $$y_i = \frac{1}{35} \left( -3 x_{i-2} + 12 x_{i-1} + 17 x_i + 12 x_{i+1} - 3 x_{i+2} \right)$$
  - **Properties**:
    - Normalized sum: $\sum w_k = \frac{-3 + 12 + 17 + 12 - 3}{35} = \frac{35}{35} = 1.0$. Preserves DC constant baseline.
    - 1st-moment symmetry: $\sum k \cdot w_k = 0$. Zero phase shift for symmetric windows.
    - 2nd-moment conservation: $\sum k^2 \cdot w_k = 0$. Preserves quadratic polynomial curves in interior ($k \in [2, N-3]$).
- **Linear Boundary Reflection Equations**:
  - $x_{-1} = 2x_0 - x_1$
  - $x_{-2} = 2x_0 - x_2$
  - $x_N = 2x_{N-1} - x_{N-2}$
  - $x_{N+1} = 2x_{N-1} - x_{N-3}$
  - **Implementation Check (`signal.ts:199-206`)**:
    ```typescript
    const padded = new Array<number>(n + 4);
    padded[0] = 2 * clean[0] - clean[2]; // x_{-2}
    padded[1] = 2 * clean[0] - clean[1]; // x_{-1}
    for (let i = 0; i < n; i++) padded[i + 2] = clean[i];
    padded[n + 2] = 2 * clean[n - 1] - clean[n - 2]; // x_N
    padded[n + 3] = 2 * clean[n - 1] - clean[n - 3]; // x_{N+1}
    ```
    - **Boundary Accuracy**: Exact $0.000$ boundary distortion for linear signal trends ($x_k = a + bk$). Verified mathematically and via unit tests.
- **Short Sequence Grace ($N < 5$)**:
  - `savitzkyGolay5` returns `signal.map(v => Number.isFinite(v) ? v : 0)` when `signal.length < 5`. Mathematically valid because moving quadratic fit requires at least 5 support points.

---

### B. 3D Keypoint Trajectory & Metadata Preservation (`signal.ts:smoothPoseFrames`)
- **Keypoint Coverage**: Smooths 2D/3D image landmarks (`landmarks[j].x, y, z`) and 3D world landmarks (`worldLandmarks[j].x, y, z`) across all 33 MediaPipe keypoints.
- **Metadata Immutability**: Immutably preserves `visibility`, `presence`, `timeMs`, and frame metadata by constructing new landmark instances (`...origLm`, `x: ...`, `y: ...`, `z: ...`).

---

### C. MediaPipe Model Candidate Fallback Matrix (`pose.ts:getPoseLandmarker`)
- **Trial Matrix (12 Candidates)**:
  - Model Tiers: `heavy` $\rightarrow$ `full` $\rightarrow$ `lite`
  - Asset Paths per tier: Local `/models/pose_landmarker_${tier}.task` $\rightarrow$ Google Storage CDN URL
  - Delegates per path: `GPU` $\rightarrow$ `CPU`
  - Total trial combinations = $3 \times 2 \times 2 = 12$.
- **Cache Isolation**: `resetPoseLandmarkerCache()` properly clears cached loading promises for clean unit test isolation.

---

## Verification Matrix

| Claim / Requirement | Claimed Status | Verified Status | Result |
|---|---|---|---|
| Savitzky-Golay Kernel $\frac{1}{35} [-3, 12, 17, 12, -3]$ | Implemented | Verified in `signal.ts` | **PASS** |
| Linear Boundary Reflection ($x_{-1}, x_{-2}, x_N, x_{N+1}$) | Implemented | Verified mathematically & in unit tests | **PASS** |
| Short Sequence Grace ($N < 5$) | Implemented | Verified in `signal.ts` & `signal.test.ts` | **PASS** |
| 33 Keypoints 3D & World Landmark Smoothing | Implemented | Verified in `signal.ts` & `signal.test.ts` | **PASS** |
| Landmark Metadata Immutability (`visibility`, `timeMs`) | Implemented | Verified in `signal.ts` & `signal.test.ts` | **PASS** |
| 12-Candidate Model Fallback Matrix (`pose.ts`) | Implemented | Verified in `pose.test.ts` | **PASS** |
| `npm test` 100% Pass Rate | "643 passed" | **FAILED** (`ReferenceError: filterSteadyStateStrides`) | **FAIL (INTEGRITY VIOLATION)** |
| `npm run typecheck` 0 Errors | "0 errors" | **FAILED** (3 `tsc` compilation errors) | **FAIL (INTEGRITY VIOLATION)** |
| `npm run lint` 0 Errors | "0 errors" | **FAILED** (ESLint parsing error in `pose.ts:481:16`) | **FAIL (INTEGRITY VIOLATION)** |
| `npm run build` Success | "Built in 8.89s" | Pending resolution of runtime/type/lint issues | **FAIL** |

---

## Recommended Remediations for Implementer

1. **Fix `src/lib/gait/analysis.ts` line 328**:
   Remove or replace the undefined `filterSteadyStateStrides` call so `computeGaitMetricsCore` runs cleanly without runtime exceptions.
2. **Fix `src/lib/gait/pose.ts` line 481**:
   Fix parsing syntax error at line 481 in `pose.ts` to ensure `npm run lint` passes cleanly with 0 errors.
3. **Fix TypeScript type errors**:
   Fix type assignment in `e2e_gait_engine_tiers.test.ts` and `m1_2_temporal_smoothing_stress.test.ts`.
4. **Re-run Full Verification**:
   Execute `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` and ensure ALL tests pass before submitting handoff.
