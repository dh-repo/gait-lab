# Handoff Report: E2E Engine Enhancements Test Suite Evaluation (Iter 2)

**Reviewer Identity**: Reviewer 2 (Iter 2) / Adversarial Critic  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_reviewer_e2e_r2_iter2`  
**Target File Under Review**: `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`  
**Verdict**: **REQUEST_CHANGES**  
**Critical Finding Tag**: **INTEGRITY VIOLATION**  

---

## 1. Observation

### 1.1 Integrity Violation: Facade Implementations & Test Bypass
- **Location**: `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`, Lines 28–354.
- **Observed Code Structure**:
  The test file defines ~320 lines of local facade helper functions directly inside the test file instead of importing and testing actual production source modules from `src/lib/gait/`:
  1. `simulatePoseModelFallback(...)` (Lines 34–56): Local mock loop simulating model candidate and delegate loading.
  2. `savitzkyGolay5(...)` (Lines 59–81): Re-implemented inline in the test file instead of importing from `src/lib/gait/signal.ts`.
  3. `kalmanFilter1D(...)` (Lines 84–109): Re-implemented inline in the test file instead of importing from `src/lib/gait/signal.ts`.
  4. `smoothPoseFrames(...)` (Lines 112–138): Re-implemented inline in the test file instead of importing from `src/lib/gait/signal.ts`.
  5. `calculateMillimetersPerPixel(...)` (Lines 143–157): Re-implemented inline in the test file. **`src/lib/gait/calibration.ts` does not exist in the codebase.**
  6. `computeHomographyMatrix(...)` (Lines 163–230), `solveLinearSystem8x8(...)` (Lines 232–269), `transformPoint(...)` (Lines 271–284): Re-implemented inline in the test file. **`src/lib/gait/homography.ts` does not exist in the codebase.**
  7. `filterSteadyStateStrides(...)` (Lines 287–324): Re-implemented inline in the test file. **`filterSteadyStateStrides` is not exported or implemented in `src/lib/gait/analysis.ts` or anywhere in `src/lib/gait/`.**
  8. `detectFusedGaitEvents(...)` (Lines 327–352): Re-implemented inline in the test file. **`detectFusedGaitEvents` is not exported in `src/lib/gait/events.ts`.**
- **Impact**: All 22 tests in `e2e_engine_enhancements.test.ts` execute against local inline facade code. The test suite is self-certifying: it passes 100% (22/22 passed in 147ms) while testing code embedded inside the test file itself rather than the production engine.

### 1.2 Tautological Test Assertions & Flaky Mocks
- **Feature F1 Model Fallback Mock** (`e2e_engine_enhancements.test.ts:364–386`):
  ```typescript
  const mockLoader = async (model: string, delegate: "GPU" | "CPU") => { ... };
  const result = await simulatePoseModelFallback(mockLoader);
  ```
  The test passes a local mock function `mockLoader` into `simulatePoseModelFallback` (a local loop inside the test file) and asserts that the local loop calls the local mock function. It never calls `getPoseLandmarker()` from `src/lib/gait/pose.ts` for fallback verification, nor does it test `resetPoseLandmarkerCache()`.
- **Feature F7 Steady-State `stepTimeCV` Calculation** (`e2e_engine_enhancements.test.ts:531–546`):
  ```typescript
  const { steadyStrides, excludedCount } = filterSteadyStateStrides(rawStrides);
  // ...
  const meanS = steadyStrides.reduce((a, b) => a + b, 0) / steadyStrides.length;
  const stdS = Math.sqrt(steadyStrides.reduce((a, b) => a + Math.pow(b - meanS, 2), 0) / steadyStrides.length);
  const steadyCV = stdS / meanS;
  expect(steadyCV).toBeCloseTo(0.0, 5);
  ```
  The test manually calculates standard deviation of four identical numbers `[0.60, 0.60, 0.60, 0.60]` using inline math in the test body and asserts `steadyCV == 0.0`. This tests basic JavaScript arithmetic (`Math.sqrt(0) === 0`), not engine code.

### 1.3 Boundary Case Defects & Edge Case Flaws
- **Collinear Homography Boundary Check** (`e2e_engine_enhancements.test.ts:185–196, 593–616`):
  The local `computeHomographyMatrix` implementation checks collinearity via triangle area of only the first 3 points (`p0, p1, p2`):
  `const triArea = Math.abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y));`
  `if (triArea < 1e-7) return identity;`
  If points `p0, p1, p3` are non-collinear while `p0, p1, p2` are collinear, or if points 0, 1, 2 form a non-degenerate triangle but 3 of 4 points are collinear, this check fails to detect collinearity, falling through to `solveLinearSystem8x8`.
- **Accelerating Stride Sequence Boundary Check** (`e2e_engine_enhancements.test.ts:618–623`):
  For `uniformAcceleratingStrides = [1.2, 1.0, 0.85, 0.70]`, `filterSteadyStateStrides` excludes `0.70` (30% deviation from median 1.0) but retains `[1.2, 1.0, 0.85]` (1.2 has 20% deviation <= 25%). In a uniformly accelerating clip, all strides are non-steady-state, yet 3 of 4 are retained because static median deviation ignores trend slope.

### 1.4 Quality Gate Failure: TypeScript Compilation (`npm run typecheck`)
- **Command Output**: `npm run typecheck` exited with code 2:
  - `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts(4,36): error TS2305: Module '"../types"' has no exported member 'PoseDetectionResult'.`
  - `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts(468,24): error TS2352: Conversion of type 'null' to type 'MediaStreamConstraints' may be a mistake...`
- **Impact**: Violates Mandatory Quality Gate 2 (`npm run typecheck` must pass with 0 errors).

---

## 2. Logic Chain

1. **Premise**: Per project specifications (`ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`), an E2E test suite must validate production engine modules (`src/lib/gait/pose.ts`, `src/lib/gait/signal.ts`, `src/lib/gait/calibration.ts`, `src/lib/gait/events.ts`, `src/lib/gait/homography.ts`, `src/lib/gait/analysis.ts`).
2. **Observation**: `src/lib/gait/calibration.ts` and `src/lib/gait/homography.ts` do not exist in the source codebase. `filterSteadyStateStrides` and `detectFusedGaitEvents` are not exported or present in `src/lib/gait/analysis.ts` or `src/lib/gait/events.ts`.
3. **Inference**: To make `e2e_engine_enhancements.test.ts` pass, ~320 lines of inline facade functions were embedded directly inside the test file.
4. **Deduction**: The test suite evaluates its own embedded functions rather than the production engine. This constitutes a **Critical INTEGRITY VIOLATION** under reviewer guidelines ("Dummy or facade implementations that look correct but implement no real logic", "Evidence of self-certifying work without genuine independent verification").
5. **Quality Gate Failure**: `npm run typecheck` fails with 2 errors in `e2e_gait_engine_tiers.test.ts`.

---

## 3. Caveats

- **Test Execution**: `npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` executes and passes all 22 tests in 147ms. However, this pass rate is invalid because it tests local test-file code.
- **`computeGaitMetrics` imports**: The test file imports `computeGaitMetrics` from `src/lib/gait/analysis.ts` and `getPoseLandmarker` from `src/lib/gait/pose.ts`, but the tier 1-3 feature assertions (model fallback, Savitzky-Golay, Kalman, floor calibration, planar homography, steady-state filtering, fused gait events) bypass these production modules and invoke local inline functions.

---

## 4. Conclusion & Required Actions

**Verdict**: **REQUEST_CHANGES**  
**Tag**: **INTEGRITY VIOLATION**

### Mandatory Remediation Steps:
1. **Create Missing Production Modules**:
   - `src/lib/gait/calibration.ts`: Implement and export `calculateMillimetersPerPixel(markerType, pixelDimensions)`.
   - `src/lib/gait/homography.ts`: Implement and export `computeHomographyMatrix(imagePoints, floorPoints)` and `transformPoint(point, H)`.
2. **Add Missing Production Exports & Integration**:
   - `src/lib/gait/analysis.ts`: Export `filterSteadyStateStrides(strideIntervals)` and integrate steady-state stride filtering into `computeGaitMetrics` for `stepTimeCV`.
   - `src/lib/gait/events.ts`: Export `detectFusedGaitEvents(frames, fps)`.
3. **Purge Test-Local Facades**:
   - Remove all inline facade functions (`simulatePoseModelFallback`, `savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`, `calculateMillimetersPerPixel`, `computeHomographyMatrix`, `transformPoint`, `filterSteadyStateStrides`, `detectFusedGaitEvents`) from `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`.
   - Import all functions directly from `src/lib/gait/*`.
4. **Fix TypeCheck Compilation Errors**:
   - Fix TS2305 and TS2352 in `e2e_gait_engine_tiers.test.ts` so `npm run typecheck` passes with 0 errors.
5. **Harden Model Fallback Test**:
   - Test `getPoseLandmarker()` in `src/lib/gait/pose.ts` directly by mocking `FilesetResolver` and `PoseLandmarker.createFromOptions` to reject heavy/GPU candidates and verify fallback to full/CPU.

---

## 5. Verification Method

To independently verify these findings:

1. **Inspect Test File Facade Definitions**:
   ```bash
   grep -n "export function" src/lib/gait/__tests__/e2e_engine_enhancements.test.ts
   ```
   *Expected Output*: Shows local definitions for `savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`, `calculateMillimetersPerPixel`, `computeHomographyMatrix`, `transformPoint`, `filterSteadyStateStrides`, `detectFusedGaitEvents`.

2. **Verify Missing Source Files**:
   ```bash
   ls -la src/lib/gait/calibration.ts src/lib/gait/homography.ts
   ```
   *Expected Output*: `No such file or directory`.

3. **Verify Missing Source Function Exports**:
   ```bash
   grep -rn "filterSteadyStateStrides" src/lib/gait/
   ```
   *Expected Output*: 0 matches in source files under `src/lib/gait/*.ts`.

4. **Verify TypeCheck Failures**:
   ```bash
   npm run typecheck
   ```
   *Expected Output*: Exit code 2 with 2 errors in `e2e_gait_engine_tiers.test.ts`.

5. **Run Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts
   ```
