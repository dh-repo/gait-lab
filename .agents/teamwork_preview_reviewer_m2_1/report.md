# Milestone 2 Code Review & Adversarial Stress Analysis Report

**Reviewer**: `teamwork_preview_reviewer_m2_1` (Reviewer 1)  
**Date**: 2026-08-10  
**Target Files**: `src/lib/gait/signal.ts`, `src/lib/gait/__tests__/signal.test.ts`  
**Verdict**: **REQUEST_CHANGES**

---

## Executive Summary

An independent, evidence-based code quality, numerical stability, interface contract, and adversarial stress review was conducted for Milestone 2 changes in `src/lib/gait/signal.ts` and `src/lib/gait/__tests__/signal.test.ts`.

The core implementation of Requirement **R2** (2-State Constant-Velocity Kalman Filter with velocity coasting and visibility gating) and Requirement **R7** (Adaptive Savitzky-Golay windowing with dynamic Gram matrix weights and Butterworth uniform resampling guard) in `src/lib/gait/signal.ts` is **mathematically sound, numerically stable, fully compliant with specifications, and 100% pass on dedicated unit tests (`31/31 passed`)**.

However, the overall review verdict is **REQUEST_CHANGES** due to:
1. **Compilation Failure (Major)**: `npx tsc --noEmit` fails with a TypeScript syntax error (`error TS1005: '}' expected`) in `src/lib/gait/__tests__/analysis.test.ts:525:1` caused by unclosed test block braces in an adjacent test file.
2. **Stress Test Mismatch (Minor)**: `npx vitest run` triggers a failure in `signal_m2_stress.test.ts` (Test 2.1). At 120 FPS, 4.0 Hz noise falls inside the passband ($H(f) \approx 0.981$) of the $M=15$ Savitzky-Golay filter (clamped max window size per R7 specification), resulting in ~3.8% noise variance attenuation instead of the stress test assertion's expected >30%.

---

## Detailed Code & Mathematical Inspection

### 1. R2: 2-State Constant-Velocity Kalman Filter (`kalmanFilter1D` & `kalmanFilter2D`)

- **State Vector & Transition**:
  $$\mathbf{x}_k = \begin{bmatrix} x_k \\ v_k \end{bmatrix}, \quad F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$$
  Implemented in `signal.ts` (lines 499-500):
  `xPred0 = x0 + x1 * validDt; xPred1 = x1;`
  Mathematically exact.

- **Process Noise Matrix $Q(dt)$**:
  Continuous white-noise acceleration model:
  $$Q(dt) = q \cdot \begin{bmatrix} \frac{dt^3}{3} & \frac{dt^2}{2} \\ \frac{dt^2}{2} & dt \end{bmatrix}$$
  Implemented in `signal.ts` (lines 444-447):
  ```ts
  const Q00 = q * ((validDt * validDt * validDt) / 3);
  const Q01 = q * ((validDt * validDt) / 2);
  const Q10 = Q01;
  const Q11 = q * validDt;
  ```
  Exact implementation. Process noise floor $q = \max(1\text{e-}9, \text{processNoise})$ prevents numerical degeneracy.

- **Measurement Noise & Innovation Inversion**:
  Measurement matrix $H = [1, 0]$. Innovation scalar $S = P_{\text{pred}}[0,0] + R$.
  Since $R = \max(1\text{e-}9, \text{measurementNoise}) > 0$, $S$ is strictly positive, guaranteeing scalar inversion $S^{-1} = 1/S$ is free of division-by-zero risk.
  Covariance matrix update includes off-diagonal symmetry averaging (`avg01 = (PNew01 + PNew10) / 2`) at line 525 to prevent asymmetry accumulation from floating-point roundoff.

- **Occlusion Coasting & Visibility Gating**:
  `isValid = Number.isFinite(z) && (vis === undefined || vis >= 0.4);`
  When invalid ($z$ is `NaN`/`Infinity` or landmark visibility $< 0.4$):
  - Position is forward-predicted: $x_0 \leftarrow x_{\text{pred}, 0}$
  - Velocity is damped by $0.98$ to prevent linear divergence over long gaps: $x_1 \leftarrow x_{\text{pred}, 1} \times 0.98$
  - Uncertainty covariance is inflated: $P \leftarrow P_{\text{pred}} + 2.0 \cdot Q$
  This enables smooth trajectory momentum during 5–30 frame occlusions and rapid re-lock when valid keypoints resume.

- **Backward Compatibility Interface**:
  `kalmanFilter1D` defines non-enumerable properties `.position` and `.velocity` on the returned array `posOut` using `Object.defineProperties`:
  ```ts
  Object.defineProperties(posOut, {
    position: { value: posOut, enumerable: false, writable: true, configurable: true },
    velocity: { value: velOut, enumerable: false, writable: true, configurable: true },
  });
  ```
  Because properties are non-enumerable, standard array equality comparisons (`toEqual([])`), `for..of` loops, and `.map()` calls ignore them, preserving 100% backward compatibility for existing 1D position callers while enabling `.position` and `.velocity` accessors. `kalmanFilter2D` exports a explicit `{ position, velocity }` object.

---

### 2. R7: Adaptive SG Window & Uniform Resampling Guard

- **Window Sizing Formula (`computeSgWindowSize`)**:
  Computes $\text{raw} = \text{round}(\text{fps} \cdot 0.17)$, converts to odd integer, and clamps to $[5, 15]$.
  - 15 FPS $\to 5$
  - 30 FPS $\to 5$
  - 60 FPS $\to 11$
  - 120 FPS $\to 15$
  Evaluates correctly for all positive and invalid FPS values.

- **Dynamic Gram Matrix Kernel Weights (`savitzkyGolay`)**:
  Calculates exact quadratic/cubic polynomial kernel weights $c_k = \frac{S_4 - S_2 \cdot k^2}{D}$ dynamically for any odd stencil size $M \in [5, 15]$:
  ```ts
  const D = S0 * S4 - S2 * S2;
  c[k + m] = (S4 - S2 * k * k) / D;
  ```
  Uses reflection boundary padding around endpoints ($y[-j] = 2 y[0] - y[j]$), eliminating boundary offset distortion. `savitzkyGolay5` is preserved as a 5-point wrapper.

- **Uniform Resampling Guard (`zeroPhaseButterworth`)**:
  Calculates inter-frame intervals $dt_k = t_{k+1} - t_k$, mean $\overline{dt}$, variance $\text{var}(dt)$, coefficient of variation $CV = \text{std}(dt)/\overline{dt}$, and variance ratio $\text{var}(dt)/\overline{dt}$.
  When $CV > 0.10$ or variance ratio $> 0.10$:
  1. Linearly interpolates signal onto a uniform grid $t_{\text{grid}} = t_0 + k \cdot \overline{dt}$ via `linearInterpolate`.
  2. Applies `zeroPhaseButterworth` at effective FPS $f_{\text{eff}} = 1/\overline{dt}$.
  3. Interpolates filtered signal back to original non-uniform timestamps.
  Recursion is properly guarded because the uniform recursive call omits options/timestamps.

---

## Verification Results

### 1. Signal Unit Test Suite
Command: `npx vitest run src/lib/gait/__tests__/signal.test.ts`
- **Result**: **PASS** (31/31 tests passed, 0 failures, duration: 938ms).

### 2. TypeScript Compilation Check
Command: `npx tsc --noEmit`
- **Result**: **FAIL** (Exit code 2).
- **Error Snippet**:
  ```
  src/lib/gait/__tests__/analysis.test.ts(525,1): error TS1005: '}' expected.
  ```
- **Note**: `src/lib/gait/signal.ts` and `src/lib/gait/__tests__/signal.test.ts` have **0 type errors**. The failure originates in `analysis.test.ts`.

### 3. Full Vitest Test Suite
Command: `npx vitest run`
- **Result**: **FAIL** (2 test failures out of 76 test files).
- **Failure 1**: `src/lib/gait/__tests__/signal_m2_stress.test.ts` -> `Test 2.1 Window size scaling across 15, 30, 60, 120 FPS`.
  - **Root Cause Analysis**: The stress test injects 4.0 Hz noise into a signal sampled at 120 FPS. The R7 specification clamps the maximum Savitzky-Golay window size to 15 points. At 120 FPS, 15 points corresponds to a $125\text{ ms}$ window, giving a transfer function value $H(4\text{ Hz}) \approx 0.981$ (attenuation of only 1.9%). The stress test expected $>30\%$ noise variance reduction, which is mathematically impossible for a 15-point SG filter at 120 FPS on 4 Hz noise.
- **Failure 2**: `src/lib/gait/__tests__/analysis_m1_comparison.test.tsx` (unrelated milestone UI component test).

---

## Integrity Violation Analysis

| Violation Category | Check Description | Status | Evidence |
|-------------------|-------------------|--------|----------|
| Hardcoded Test Results | Embedded magic constants returning expected test outputs | **PASS** | Dynamic calculation of $Q(dt)$, $S$, $K$, Gram matrix $c_k$, linear interpolation |
| Facade Implementations | Dummy functions lacking true filter state updates | **PASS** | Complete 2-state matrix equations & biquad/reflection padding |
| Task Shortcuts | Delegation to unapproved external tools or skipping matrix math | **PASS** | Native TS implementation of Kalman equations & Gram matrix |
| Fabricated Outputs | Fake test execution logs or unverified claims | **PASS** | Vitest runs executed independently |
| Self-Certifying Work | Submitting code without automated test verification | **PASS** | 31 unit tests and 5 empirical stress tests verified |

**Integrity Violation Verdict**: **CLEAN** (No cheating or integrity violations found).

---

## Findings Summary & Action Items

| ID | Severity | Location | Issue Description | Suggested Fix |
|---|---|---|---|---|
| **F-01** | **Major** | `src/lib/gait/__tests__/analysis.test.ts:525` | Syntax error (`TS1005: '}' expected`) breaking project `npx tsc --noEmit` build. | Add missing closing bracket `});` to properly close the top-level `describe` block. |
| **F-02** | **Minor** | `src/lib/gait/__tests__/signal_m2_stress.test.ts:217` | Test 2.1 fails at 120 FPS because 4.0 Hz noise lies in the passband of the 15-point SG filter ($H \approx 0.981$). | Adjust `noiseFreq` in test 2.1 for 120 FPS to $\ge 15\text{ Hz}$ (or relax variance threshold at 120 FPS) so noise lies in the filter stopband. |

---

## Conclusion & Recommendation

The core code changes for Milestone 2 in `src/lib/gait/signal.ts` are of high quality, mathematically accurate, and clean. Once **F-01** (syntax error in `analysis.test.ts`) and **F-02** (stress test frequency adjustment in `signal_m2_stress.test.ts`) are resolved by the assigned workers, Milestone 2 will be ready for final approval.
