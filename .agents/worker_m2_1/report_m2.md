# Milestone 2 Implementation Report: Signal Processing & Event Detection Tuning

**Author:** worker_m2_1  
**Date:** 2026-08-10  
**Status:** Completed  

---

## 1. Overview & Objectives

Milestone 2 focused on deepening signal processing calibration, kinematic event detection thresholds, multi-person tracking stability, target lock velocity projection, clinical grading rules, and fall risk model bounds across the core engine in `src/lib/gait/`.

All implementations were verified against static typing, ESLint compliance, and full Vitest suite execution (891/891 passing tests, 100% pass rate).

---

## 2. Code Modifications & Parameter Calibrations

### 2.1 `src/lib/gait/events.ts`
- **Peak Prominence Threshold ($P_{\text{min}}$):** Lowered baseline prominence calculation in `findExtrema` from `Math.max(0.001, 0.15 * sigRange)` to `Math.max(0.0005, 0.12 * sigRange)`. This improves detection of low-amplitude heel strikes on frontal/oblique video recordings (`tuning-3992.mp4`).
- **Frontal-Y Fallback Hysteresis:** Refined mode-switch trigger in `detectGaitEventsZeni` from `apRange < 0.022 || apEventCount < 4` to `apRange < 0.028 && apEventCount < 5`. This prevents mode flickering between AP displacement and vertical ankle motion on indoor frontal walk clips.

### 2.2 `src/lib/gait/analysis.ts`
- **Steady-State Stride Filtering:** Calibrated relative deviation threshold in `filterSteadyStateStrides` to 40% (`0.40`) with a retention guard `minKeep = Math.max(3, Math.floor(0.50 * strideIntervals.length))`. This preserves valid pathological asymmetry while trimming lead-in acceleration and lead-out deceleration strides.

### 2.3 `src/lib/gait/PoseTracker.ts`
- **Target Lock Scoring with Velocity Projection:** Enhanced candidate scoring in `PoseTracker.ts` by tracking target velocity (`targetVelocity`) and projecting position $x_{\text{pred}} = x_{t-1} + v \cdot \Delta t$. Scored candidates using $d = \min(\text{dist}(hip, lastTargetHip), \text{dist}(hip, x_{\text{pred}}))$, preventing target lock loss when secondary candidates pass behind the subject (`tuning-3993.mp4`).
- **State Reset:** Cleared `targetVelocity` and `lastTargetTimeMs` inside `clearBuffer()`.

### 2.4 Signal, Ratings, Guesses, & Fall Risk Modules (`signal.ts`, `ratings.ts`, `guesses.ts`, `fallrisk.ts`)
- Verified zero-phase 4th-order Butterworth low-pass filtering ($f_c = 6.0$ Hz), 5-point Savitzky-Golay smoothing, and 1D Kalman filter occlusion coasting in `signal.ts`.
- Verified Data Quality scoring bounds `[8, 98]`, Zifchock SA thresholds (5% watch, 10% elevated), Plummer & Eskes CMI classification, CDC STEADI Model A cutoffs, Composite Model B re-normalization weights, and 5 acute weakness deterioration rules.

---

## 3. Verification Results

1. **Vitest Unit & Integration Suite:**
   ```bash
   npx vitest run
   ```
   - **Result:** 68 test files passed, 891 tests passed (0 failures).

2. **TypeScript Compilation:**
   ```bash
   npx tsc --noEmit
   ```
   - **Result:** 0 errors.

3. **ESLint Verification:**
   ```bash
   npx eslint .
   ```
   - **Result:** 0 errors (18 pre-existing unused variable warnings in test files).

---

## 4. Conclusion

Milestone 2 parameter tuning and signal processing enhancements are complete and verified. The codebase is clean, robust, and 100% green across all test harnesses.
