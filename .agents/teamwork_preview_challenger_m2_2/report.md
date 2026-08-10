# Empirical Stress & Regression Report: Milestone 2 Signal Processing (`src/lib/gait/signal.ts`)

**Agent**: `teamwork_preview_challenger_m2_2`  
**Date**: 2026-08-10  
**Target File**: `src/lib/gait/signal.ts`  
**Verdict**: **REJECT**

---

## 1. Executive Summary

Milestone 2 Pass 2 introduced the 2-state constant-velocity Kalman filter (`kalmanFilter1D` / `kalmanFilter2D`), adaptive Savitzky-Golay window scaling (`computeSgWindowSize` / `savitzkyGolayAdaptive`), and the uniform resampling guard in `zeroPhaseButterworth`.

An empirical stress harness (`src/lib/gait/__tests__/challenger_m2_2_empirical_stress.test.ts`) was executed to test boundary conditions, non-finite values, numerical scaling ($10^6$ and $10^{-12}$), sudden sign-flips, parabolic trajectories (constant acceleration $a = 9.81\text{ m/s}^2$), and `smoothPoseFrames`.

### Summary of Results:
1. **Target Module (`src/lib/gait/signal.ts`)**: Core algorithms are robust against empty arrays, 1-2 element arrays, non-finite inputs (`NaN`, `Infinity`), extreme numerical scales ($10^6$ and $10^{-12}$), sign-flips, and constant acceleration trajectories.
2. **TypeScript Typecheck (`npx tsc --noEmit`)**: **FAILED** (exited with code 2). Syntax error in `src/lib/gait/__tests__/analysis.test.ts:525`.
3. **Repository Vitest Suite (`npx vitest run`)**: **FAILED**. Multiple test file failures across the repository.

Because `npx tsc --noEmit` and `npx vitest run` do not meet the 100% green pass rate criteria, the overall Milestone 2 verification verdict is **REJECT**.

---

## 2. Empirical Stress Test Scenarios & Results

Empirical test suite: `src/lib/gait/__tests__/challenger_m2_2_empirical_stress.test.ts` (14 test scenarios).

| Scenario | Input / Test Condition | Expected Behavior | Actual Behavior | Result |
| --- | --- | --- | --- | --- |
| **Empty Input** | `[]` to all functions | Return `[]` or `{ position: [], velocity: [] }` without throwing | Returned `[]` safely | **PASS** |
| **Single Element** | `[42]` to all functions | Return `[42]` or `{ position: [42], velocity: [0] }` without error | Returned `[42]` safely | **PASS** |
| **2-Element Input** | `[1, 2]` to all functions | Handle length < 5 gracefully | Handled gracefully, OLS detrend returned `[0, 0]` | **PASS** |
| **All NaNs** | `[NaN, NaN, NaN, NaN, NaN]` | Convert NaNs to finite 0s without bubbling NaNs | Returned `[0, 0, 0, 0, 0]` all finite | **PASS** |
| **Leading & Trailing NaNs** | `[NaN, NaN, 10, 20, 30, 40, 50, NaN, NaN]` | Coast via 2-state KF velocity prediction for trailing NaNs | Position increased monotonically during coasting (`pos[7] > pos[6] > ...`) | **PASS** |
| **Interleaved NaN Gaps** | `[10, NaN, 20, NaN, 30, NaN, 40]` | Interpolate and coast across NaNs | Position reached > 30 smoothly without NaNs | **PASS** |
| **Large Values** | `[1e6, 1e6+10, 1e6-10, 1e6+5, 1e6-5, 1e6]` | No numeric overflow / float overflow | All outputs finite numbers | **PASS** |
| **Subnormal Values** | `[1e-12, 2e-12, -1e-12, 3e-12, 0, 1e-12]` | No underflow to NaN or division by zero | All outputs finite numbers | **PASS** |
| **Mixed Scale** | `[1e-12, 1.0, 1e6, -1e6, 0, 1e-12]` | Handle $18$ orders of magnitude variance | All outputs finite numbers | **PASS** |
| **Sudden Sign-Flips** | `[100, -100, 100, -100, ...]` | Low-pass filter attenuates high frequency ripple | Attenuated amplitude towards 0 | **PASS** |
| **Parabolic Trajectory** | $x(t) = \frac{1}{2} (9.81) t^2$ at 60 FPS | 2-state KF and zero-phase Butterworth track parabolic trajectory | Position error < 0.05 after initial transient; SG/Butterworth error < 0.01 | **PASS** |
| **Adaptive SG Window** | FPS = 15, 30, 60, 90, 120 | Scale odd window between 5 and 15 points | FPS 15->5, 30->5, 60->11, 90->15, 120->15 | **PASS** |
| **Resampling Guard** | Non-uniform dt (timestamps with 20% jitter) | Trigger linear interpolation resampling before Butterworth | Filtered output length matches input, all finite | **PASS** |
| **smoothPoseFrames** | 10 frames, NaN landmarks, visibility < 0.4 | Filter 3D coords, preserve metadata and worldLandmarks | Returned smoothed pose frames with finite coords | **PASS** |

---

## 3. Regression Suite & Build Verification

### 3.1 TypeScript Typecheck (`npx tsc --noEmit`)
- **Status**: **FAILED** (exit code 2)
- **Verbatim Error**:
  ```
  src/lib/gait/__tests__/analysis.test.ts(525,1): error TS1005: '}' expected.
  ```
- **Analysis**: `src/lib/gait/__tests__/analysis.test.ts` contains a syntax error at line 525, preventing TypeScript compilation.

### 3.2 Vitest Test Suite (`npx vitest run`)
- **Status**: **FAILED**
- **Failures Identified**:
  1. `src/lib/gait/__tests__/analysis.test.ts`: Syntax error prevents test execution (0 tests run).
  2. `src/lib/gait/__tests__/signal_m2_stress.test.ts`:
     - Test `2.1 Window size scaling across 15, 30, 60, 120 FPS`: Expected window size 9 at 60 FPS, but `computeSgWindowSize(60)` returns 11.
  3. `src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts`:
     - Test `smooths 1000 frames x 33 keypoints x 3D coords in < 15 ms`: Benchmark threshold exceeded (took 450ms).
  4. `src/lib/gait/__tests__/sample_picker.test.ts`:
     - Test `verifies physical existence, front moov atom offset, and container/stream integrity of reference video files in public/samples/`: Failure during media container inspection.
  5. `src/lib/gait/__tests__/challenger_m3_1_empirical.test.ts`:
     - Test `handles ultra-low (1 FPS) and ultra-high (240 FPS) frame rates safely`.
  6. `src/lib/gait/__tests__/m3_challenger_2_stress.test.tsx`:
     - Test `3.2 Full kinematic analysis pipeline on resampled gappy webcam stream yields ZERO NaN/Infinity values`.

---

## 4. Discrepancy & Root Cause Analysis

1. **Syntax Error in Test Suite**:
   `src/lib/gait/__tests__/analysis.test.ts` was edited in an incomplete state, leaving an missing closing brace at line 525 (`error TS1005: '}' expected.`). This breaks both `npx tsc --noEmit` and `npx vitest run`.

2. **Window Size Formula Mismatch**:
   In `src/lib/gait/signal.ts`:
   ```ts
   export function computeSgWindowSize(fps: number): number {
     if (!Number.isFinite(fps) || fps <= 0) return 5;
     const raw = Math.round(fps * 0.17);
     const odd = raw % 2 === 0 ? raw + 1 : raw;
     return Math.max(5, Math.min(15, odd));
   }
   ```
   For `fps = 60`: `raw = Math.round(60 * 0.17) = Math.round(10.2) = 10`. Since `10` is even, `odd = 11`.
   However, `signal_m2_stress.test.ts` hardcodes an expected value of `9` for 60 FPS. This mismatch causes `signal_m2_stress.test.ts` to fail.

---

## 5. Conclusion & Recommendations

The core algorithms in `src/lib/gait/signal.ts` demonstrate high numerical stability and correct mathematical behavior under boundary conditions, non-finite inputs, extreme scale values ($10^{-12}$ to $10^6$), sign-flips, and constant acceleration trajectories.

However, because the repository fails `npx tsc --noEmit` and `npx vitest run`, the official Verdict is **REJECT**.

### Actionable Fixes Required:
1. Fix syntax error in `src/lib/gait/__tests__/analysis.test.ts` (add missing closing brace at line 525).
2. Align `signal_m2_stress.test.ts` window size expectation for 60 FPS with `computeSgWindowSize(60) === 11` (or adjust `computeSgWindowSize` formula if 9 was intended).
3. Re-run `npx tsc --noEmit` and `npx vitest run` until 100% pass rate is achieved.
