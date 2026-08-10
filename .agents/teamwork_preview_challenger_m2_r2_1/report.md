# Milestone 2 Iteration 2 Empirical Challenge Report (`signal.ts`)

**Agent**: `teamwork_preview_challenger_m2_r2_1`  
**Target Module**: `src/lib/gait/signal.ts`  
**Date**: 2026-08-10  
**Overall Risk Assessment**: LOW  
**Verdict**: APPROVE  

---

## 1. Executive Summary

As the Empirical Challenger for Milestone 2 Iteration 2, I conducted rigorous empirical verification and stress-testing of `src/lib/gait/signal.ts` and its test suites. All required verification checks passed with a 100% green pass rate:

- `npx vitest run src/lib/gait/__tests__/signal_m2_stress.test.ts`: **5/5 PASSED (100%)**
- `npx vitest run src/lib/gait/__tests__/signal.test.ts`: **31/31 PASSED (100%)**
- Custom Empirical Stress Harness (`adversarial_stress_check.ts`): **29/29 PASSED (100%)**

The implementation of the 2-State Constant-Velocity Kalman Filter, Adaptive Savitzky-Golay Window Scaling (15-120 FPS), and Butterworth Uniform Resampling Guard demonstrates strong mathematical correctness, numerical stability under extreme non-finite/NaN conditions, and zero metric degradation or phase distortion.

---

## 2. Verification Results & Test Execution Summary

| Test Suite / Harness | Tests | Passed | Failed | Key Verification Aspects |
| :--- | :---: | :---: | :---: | :--- |
| `signal_m2_stress.test.ts` | 5 | 5 | 0 | 10-frame NaN occlusion coasting, Q/R covariance tuning, low-visibility (<0.4) outlier suppression, adaptive SG window scaling (15-120 FPS), 20% dt jitter resampling guard. |
| `signal.test.ts` | 31 | 31 | 0 | 2-State Kalman 1D/2D, adaptive SG, 5-point SG, zero-phase Butterworth impulse response, DC signal preservation, cutoff sweeps (1-12 Hz), OLS detrending, 1D linear interpolation. |
| `adversarial_stress_check.ts` | 29 | 29 | 0 | All-NaN inputs, extreme Q/R/dt parameters, 100-frame NaN gap coasting, even/oversized SG windows, non-finite FPS inputs (0, NaN, Inf), duplicate timestamps (dt=0), pose frame smoothing. |

---

## 3. Detailed Component Analysis & Stress Harness Evidence

### 3.1 2-State Constant-Velocity Kalman Filter (`kalmanFilter1D`, `kalmanFilter2D`)
- **State Vector & Transition**: State $x = [pos, vel]^T$, transition matrix $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$. Process noise $Q(dt)$ continuous white-noise acceleration model.
- **Occlusion Coasting & Visibility Gating**:
  - When $z_k$ is `NaN`/`Infinity` or landmark visibility $< 0.4$, measurement update is skipped.
  - Position is coasted using velocity prediction: $x_0 = x_{pred0} = x_0 + x_1 \cdot dt$.
  - Velocity decays by 0.98 factor ($x_1 = x_{pred1} \cdot 0.98$), avoiding divergence during prolonged gaps.
  - Uncertainty covariance is inflated by $+ 2 \cdot Q$.
  - Re-lock accuracy: After a 10-frame NaN occlusion gap at 30 FPS (velocity 150 mm/s), coasting displacement error was $< 15\%$ of total gap displacement, and re-lock position error at frame 32 was $< 3.0$ mm.
  - All-NaN signal test: Returns zero position and velocity vectors of matching length without throwing errors or producing NaNs.

### 3.2 Adaptive Savitzky-Golay Windowing (`computeSgWindowSize`, `savitzkyGolayAdaptive`)
- **Window Scaling Formula**: `raw = Math.round(fps * 0.17)`, adjusted to nearest odd integer and clamped to $[5, 15]$.
  - $15 \text{ FPS} \to 5$
  - $30 \text{ FPS} \to 5$
  - $60 \text{ FPS} \to 11$
  - $120 \text{ FPS} \to 15$
- **Zero Phase Distortion**: Gram matrix polynomial kernel weights preserve motion peaks exactly without time shift (peak index smoothed equals peak index clean).
- **Boundary Reflection Padding**: Reflection padding prevents boundary attenuation artifacts. Even window size inputs dynamically increment to odd integers without crashing. Non-finite FPS inputs (0, NaN, Infinity) fall back safely to minimum window size 5.

### 3.3 Zero-Phase Butterworth Uniform Resampling Guard (`zeroPhaseButterworth`)
- **Guard Condition**: Triggers resampling when timestamp $CV > 0.10$ or variance ratio $> 0.10$.
- **Fidelity Under Jitter**: Under $20\%$ dt timestamp jitter at 30 FPS, the guard resamples the signal onto a uniform grid via linear interpolation, applies zero-phase filtering, and interpolates back. Filtered RMS error relative to ground truth clean motion was $< 0.15$, with peak magnitude error $< 0.08$.
- **Duplicate Timestamps**: Handles duplicate timestamps ($dt = 0$) gracefully without division-by-zero or `NaN` outputs.

---

## 4. Adversarial Challenge Dimensions

1. **Assumption Stress-Testing**:
   - *Assumption*: WebRTC timestamp frames are uniformly sampled.
   - *Stress*: Injected 20% dt jitter and duplicate timestamps ($dt = 0$).
   - *Result*: Pass. Uniform resampling guard handles jitter; `linearInterpolate` handles $dx = 0$ safely.
2. **Edge Case Mining**:
   - *Stress*: 100-frame complete NaN occlusion gap.
   - *Result*: Pass. Velocity prediction coasted position smoothly without numerical explosion; state remained finite throughout.
3. **Non-Finite & Boundary Inputs**:
   - *Stress*: `fps = 0`, `fps = NaN`, `fps = Infinity`, all-NaN signal array.
   - *Result*: Pass. Safe fallbacks prevented crashes, yielding finite, valid output structures.

---

## 5. Final Recommendation

`src/lib/gait/signal.ts` is fully verified, mathematically sound, and robustly hardened against edge cases. **Verdict: APPROVE**.
