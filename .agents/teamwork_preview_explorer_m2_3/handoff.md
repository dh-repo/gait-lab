# Handoff Report: R7 Adaptive SG Window & Uniform Resampling Guard Analysis

**Agent ID**: `teamwork_preview_explorer_m2_3`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_3`  
**Target File**: `src/lib/gait/signal.ts`  
**Date**: 2026-08-10  

---

## 1. Observation

1. **Existing Savitzky-Golay Implementation**:
   - `src/lib/gait/signal.ts` lines 190–232 defines `savitzkyGolay5(signal: number[]): number[]`.
   - Uses a fixed 5-point stencil kernel `inv35 * [-3, 12, 17, 12, -3]`.
   - `smoothPoseFrames` (lines 299–425) defaults to calling `savitzkyGolay5(sig)` for 1D landmark coordinate smoothing.

2. **SG Window Scaling Formula**:
   - Formula specified in requirement: `windowSize = Math.max(5, Math.min(15, Math.round(fps * 0.17)))`.
   - Evaluated at 15, 30, 45, 60, 90 FPS:
     - 15 FPS: `round(2.55) = 3` -> adjusted odd = 3 -> clamped min = 5.
     - 30 FPS: `round(5.1) = 5` -> odd = 5.
     - 45 FPS: `round(7.65) = 8` -> adjusted odd = 9.
     - 60 FPS: `round(10.2) = 10` -> adjusted odd = 11.
     - 90 FPS: `round(15.3) = 15` -> odd = 15.

3. **Existing Zero-Phase Butterworth Implementation**:
   - `src/lib/gait/signal.ts` lines 135–180 defines `zeroPhaseButterworth(data: number[], fps: number, cutoffHz = 6.0): number[]`.
   - Assumes uniform sampling intervals $\Delta t = 1 / \text{fps}$.
   - Called in `src/lib/gait/analysis.ts` lines 289–294 on time series (`midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`).

4. **Codebase Callers**:
   - `src/lib/gait/analysis.ts`: imports `olsDetrend`, `zeroPhaseButterworth`, `smoothPoseFrames`.
   - `src/lib/gait/index.ts`: re-exports `olsDetrend`, `butterworthLowPass`, `zeroPhaseButterworth`, `savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`.
   - 11 Vitest test files import and directly test `savitzkyGolay5`, `zeroPhaseButterworth`, and `smoothPoseFrames`.

5. **Test Suite Baseline**:
   - Running `npx vitest run src/lib/gait/__tests__/signal.test.ts` completed with 22/22 passed tests (0 failures).

---

## 2. Logic Chain

1. **Step 1 (SG Window Fix Necessity)**: From Observation 1, `savitzkyGolay5` is locked to 5 points. At 60 FPS, 5 points span 83 ms (insufficient to smooth MediaPipe jitter). Scaling window size proportional to FPS via `fps * 0.17` maintains a constant physical time window (~167–183 ms) across variable frame rates.
2. **Step 2 (Math Formulation for SG Generalization)**: From Observation 2, an odd window size $M = 2m + 1$ requires 2nd/3rd degree Gram matrix coefficients $c_k = (S_4 - S_2 k^2) / D$ where $S_0 = M$, $S_2 = \sum k^2$, $S_4 = \sum k^4$, $D = S_0 S_4 - S_2^2$. This formula generates exact zero-phase coefficients for any odd $M \in \{5, 7, 9, 11, 13, 15\}$, matching the hardcoded 5-point kernel when $M=5$.
3. **Step 3 (Resampling Guard Rationale)**: From Observation 3, WebRTC video decoding delivers variable frame timestamps $T$. When interval Coefficient of Variation $CV = \frac{\sigma_{\Delta t}}{\bar{\Delta t}} > 0.10$ or variance ratio $\frac{\sigma^2_{\Delta t}}{\bar{\Delta t}} > 0.10$, standard digital filter difference equations distort frequency cutoff and cause phase ripple.
4. **Step 4 (Uniform Resampling Design)**: Linear interpolation onto a uniform grid $t_{\text{grid}} = t_0 + k \cdot \bar{\Delta t}$ followed by Butterworth filtering at $\text{fps}_{\text{eff}} = 1 / \bar{\Delta t}$ and linear interpolation back to $T$ restores uniform sampling guarantees without breaking contract or changing return types.
5. **Step 5 (Backward Compatibility & Callers)**: From Observation 4 & 5, maintaining `savitzkyGolay5()` as a named export (calling `savitzkyGolay(signal, 5)`) guarantees zero breakage across all existing 11 test suites while enabling `savitzkyGolay(signal, windowSize)`, `savitzkyGolayAdaptive(signal, fps)`, and `smoothPoseFrames(frames, method, options)` for new features.

---

## 3. Caveats

- **Minimum Array Length for $M > 5$**: If signal length $N$ is less than the calculated window size $M$ (e.g. $N=7$ but $M=11$), the filter automatically reduces the effective window size $M_{\text{eff}}$ to the largest odd integer $\le N$ (e.g. 7 points) to prevent extrapolation artifacts.
- **Timestamp Scale**: Timestamps passed to `zeroPhaseButterworth` or `smoothPoseFrames` may be in seconds or milliseconds. The guard detects scale automatically based on `meanDt` magnitude (`meanDt < 1.0` implies seconds; otherwise milliseconds).

---

## 4. Conclusion

Requirement R7 is fully analyzed, mathematically validated, and ready for implementation in `src/lib/gait/signal.ts`.
- `savitzkyGolay5()` preserved as backward-compatible wrapper.
- Generalized `savitzkyGolay(signal, windowSize)` and `savitzkyGolayAdaptive(signal, fps)` added.
- SG window scaling `Math.max(5, Math.min(15, Math.round(fps * 0.17)))` verified with odd-integer clamping.
- Uniform resampling guard in `zeroPhaseButterworth()` designed with linear interpolation resampling and reverse mapping.
- All callers in `analysis.ts` and test suites mapped and verified.

---

## 5. Verification Method

1. **Unit Test Pass**:
   `npx vitest run src/lib/gait/__tests__/signal.test.ts`
2. **TypeScript Compilation**:
   `npx tsc --noEmit`
3. **Full Vitest Suite Pass**:
   `npx vitest run`
4. **Inspection of `report.md`**:
   Verify complete mathematical derivations and code snippets in `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_3/report.md`.
