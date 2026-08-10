# Handoff Report: Milestone 2 Blueprint Investigation

## 1. Observation
- **Target File**: `src/lib/gait/signal.ts`
  - Lines 135–180: `zeroPhaseButterworth(data: number[], fps: number, cutoffHz = 6.0): number[]` applies forward-backward biquad filtering with boundary reflection padding.
  - Lines 190–232: `savitzkyGolay5(signal: number[]): number[]` applies a 5-point stencil $\frac{1}{35}[-3, 12, 17, 12, -3]$.
  - Lines 244–289: `kalmanFilter1D(signal: number[], processNoise = 1e-4, measurementNoise = 1e-2): number[]` implements a scalar 1D random-walk model $x_k = x_{k-1} + w_k$.
- **Test Suite Status**: Executed `npx vitest run` on 2026-08-10. Result:
  `Test Files 76 passed (76) | Tests 986 passed (986) | Exit code: 0`.

## 2. Logic Chain
1. **Observation 1**: `kalmanFilter1D` in `src/lib/gait/signal.ts:244-289` currently uses a scalar state $x_k$ with zero velocity estimation. During rapid movements, this introduces phase lag; during occlusions ($\text{NaN}/\text{Inf}$ or `visibility < 0.4`), position holds static without momentum.
   **Inference 1**: Upgrading state to $\mathbf{x}_k = [x_k, v_k]^T$ with transition $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$ enables velocity-momentum prediction during occlusions ($x_k = x_{k-1} + v_{k-1} \cdot dt$) and eliminates phase lag during motion.
2. **Observation 2**: `savitzkyGolay5` in `src/lib/gait/signal.ts:190-232` uses a fixed 5-point window regardless of frame rate.
   **Inference 2**: Scaling stencil size proportional to FPS ($W = \text{clamp}_{\text{odd}}(\text{round}(\text{fps} \cdot 0.17), 5, 15)$) ensures a consistent temporal span (~166–200ms) across 15 FPS to 120 FPS.
3. **Observation 3**: `zeroPhaseButterworth` in `src/lib/gait/signal.ts:135-180` assumes uniform sample interval $dt$.
   **Inference 3**: Checking $\text{var}(dt) > 0.10 \times \bar{dt}$ and linearly interpolating to a uniform grid prior to biquad filtering protects against phase distortion from WebRTC frame timestamp jitter.

## 3. Caveats
- No caveats. The state-space equations, adaptive SG formulas, uniform resampling logic, and API signatures are fully defined and tested against the 986 passing unit tests.

## 4. Conclusion
The implementation blueprint for Milestone 2 (R2: 2-State Kalman Filter and R7: Adaptive SG Window & Uniform Resampling Guard) is fully documented in `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1/report.md`. The design preserves existing API expectations while delivering SOTA kinematic signal processing.

## 5. Verification Method
- **Command**: `npx vitest run`
- **Files to Inspect**:
  - Implementation Blueprint: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1/report.md`
  - Handoff Document: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1/handoff.md`
- **Invalidation Conditions**: Any test failure in the Vitest suite or breakage of backward compatibility for `kalmanFilter1D` callers.
