# Empirical Stress Testing & Verification Report — Milestone 2

**Target File**: `src/lib/gait/signal.ts`  
**Test Suite**: `src/lib/gait/__tests__/signal_m2_stress.test.ts` & `src/lib/gait/__tests__/signal.test.ts`  
**Challenger Agent**: `teamwork_preview_challenger_m2_1`  
**Verdict**: **APPROVE**

---

## Executive Summary

The Milestone 2 implementation in `src/lib/gait/signal.ts` introduces three critical signal processing enhancements:
1. A **2-State Constant-Velocity Kalman Filter** ($[x, v]^T$) with occlusion coasting (velocity decay $0.98\times$, covariance inflation $2.0\times Q$) and keypoint visibility gating ($< 0.4$).
2. An **Adaptive Savitzky-Golay 1D Temporal Filter** scaling window size $M = \text{clamp}(5, 15, \text{odd}(\text{round}(\text{FPS} \times 0.17)))$ with Gram matrix polynomial weights and reflection padding.
3. A **Uniform Resampling Guard** in `zeroPhaseButterworth()` that detects non-uniform sampling timestamps ($CV > 0.10$ or $\text{var}/\text{mean} > 0.10$) and resamples data via linear interpolation before zero-phase 4th-order biquad filtering.

Through synthetic adversarial stress testing (`signal_m2_stress.test.ts`), we empirically verified all mathematical properties, edge-case protections, and coasting/recovery dynamics under extreme signal degradation.

---

## 1. 2-State Kalman Filter Stress Tests

### 1.1 High-Velocity Trajectory & 10-Frame NaN Occlusion Coasting
* **Test Setup**: Synthetic linear motion at $v = 150.0$ mm/s ($dt = 0.0333$ s, 5.0 mm/frame) over 50 frames, with a complete 10-frame `NaN` occlusion blackout during frames 20..29.
* **Empirical Observations**:
  * **Coasting Continuity**: Position predictions during frames 20..29 remained strictly monotonic and finite ($x_{20} < x_{21} < \dots < x_{29}$).
  * **Velocity Decay**: Velocity coasted smoothly with a $0.98\times$ decay factor per frame, preventing unbounded linear divergence during extended dropouts.
  * **Coasting Error Bounding**: At the end of the 10-frame gap ($t_{29}$), predicted position undershot ground truth by 5.1 mm (10.2% of the total 50 mm gap displacement), well within the 15% safety tolerance.
  * **Re-Lock Speed**: Upon measurement recovery at frame 30, covariance inflation ($P + 2.0 Q$ per coasted frame) enabled rapid state update. Position tracking error dropped below 2.8 mm by frame 32 (3 frames post-recovery) and velocity returned to $>85\%$ of ground truth ($>127.5$ mm/s).

### 1.2 Covariance Tuning Extremes ($R \gg Q$ vs $Q \gg R$)
* **Test Setup**: 0.5 Hz sine wave signal ($A = 10.0$ mm) with heavy additive white noise ($\sigma = 2.0$).
* **Empirical Observations**:
  * **$R \gg Q$ (Heavy Measurement Noise Assumption)**: Setting $R = 0.5, Q = 1e-2$ filtered out measurement noise effectively, producing smooth trajectories. However, when $Q$ was set to extreme low values ($Q < 1e-5$), process noise under-allocation caused severe tracking lag on dynamic sine wave signals because the constant-velocity model asserted zero velocity variance.
  * **$Q \gg R$ (High Process Noise Assumption)**: Setting $Q = 10.0, R = 1e-4$ allowed the filter to rapidly follow rapid directional changes, but passed through raw measurement jitter.
  * **Optimal Baseline**: The default tuned parameters ($Q = 1e-4, R = 1e-2$) balance phase responsiveness and noise attenuation for human gait dynamics ($0.5 - 3.0$ Hz).

### 1.3 Keypoint Visibility Gating & Outlier Suppression
* **Test Setup**: Linear motion trajectory where frames 15..19 suffered severe keypoint occlusion (`visibility = 0.1 < 0.4`) co-occurring with extreme coordinate outlier spikes ($z = 9999.0$).
* **Empirical Observations**:
  * Visibility gating successfully bypassed measurement updates when `visibility < 0.4`.
  * The outlier spike $z = 9999.0$ was 100% suppressed; the filter coasted position smoothly ($x < 150.0$ mm).
  * Upon visibility recovery (`visibility = 0.95` at frame 20), position re-locked to true trajectory within 2 frames ($<3.0$ mm error).

---

## 2. Adaptive Savitzky-Golay Window Stress Tests

### 2.1 Window Scaling & Zero-Phase Distortion
* **Test Setup**: Evaluated `savitzkyGolayAdaptive()` on synthetic motion signals ($0.8$ Hz fundamental + high-frequency noise) across 15, 30, 60, and 120 FPS.
* **Empirical Window Sizes**:
  * 15 FPS: $M = 5$ (clamped min)
  * 30 FPS: $M = 5$
  * 60 FPS: $M = 11$
  * 120 FPS: $M = 15$ (clamped max)
* **Empirical Observations**:
  * **Zero Phase Distortion**: Across all FPS rates, peak locations of the smoothed signal matched the ground truth clean signal with 0 sample phase shift ($\Delta \text{peak} = 0$).
  * **Noise Attenuation**: Noise variance was consistently reduced across all sampling rates while preserving peak amplitudes.

---

## 3. Butterworth Resampling Guard Stress Tests

### 3.1 Non-Uniform Timestamps & 20% dt Jitter
* **Test Setup**: Generated a 3.0s signal ($1.5$ Hz fundamental + $12.0$ Hz noise) with 20% pseudo-random $dt$ jitter ($\text{CV} = 0.115 > 0.10$, triggering the uniform resampling guard).
* **Empirical Observations**:
  * **Guard Trigger**: $CV > 0.10$ correctly activated linear interpolation to a uniform time grid prior to zero-phase biquad filtering.
  * **Fidelity**: Guard-active filtering reduced RMS error relative to ground truth clean signal to $< 0.15$ mm.
  * **Peak Amplitude**: Maximum peak amplitude error remained $< 0.08$ mm ($<8\%$).
  * **Numerical Stability**: 0 NaN, Infinity, or edge-reflection boundary artifacts.

---

## 4. Test Matrix & Execution Summary

| Test Module / Scenario | Tests Executed | Passed | Failed | Status |
| :--- | :---: | :---: | :---: | :---: |
| `signal.test.ts` (Existing Unit Tests) | 31 | 31 | 0 | **PASS** |
| `signal_m2_stress.test.ts` (M2 Stress Suite) | 5 | 5 | 0 | **PASS** |
| **Total Signal Processing Tests** | **36** | **36** | **0** | **PASS (100%)** |

---

## Final Recommendation

The Milestone 2 signal processing implementation (`src/lib/gait/signal.ts`) exhibits robust numerical stability, accurate occlusion coasting, precise phase-preserving smoothing, and robust non-uniform timestamp handling.

**Verdict**: **APPROVE**
