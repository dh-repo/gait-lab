# Handoff Report — Milestone 2 Requirements R2 & R7 Implementation

## 1. Observation

### Implementation Files Modified:
- `src/lib/gait/signal.ts`: Implemented 2-state constant-velocity Kalman filter (`kalmanFilter1D`, `kalmanFilter2D`, `KalmanOptions`, `KalmanResult2D`), Savitzky-Golay adaptive window scaling (`computeSgWindowSize`, `savitzkyGolay`, `savitzkyGolayAdaptive`), 1D linear interpolation (`linearInterpolate`), and Butterworth uniform resampling guard (`zeroPhaseButterworth`).
- `src/lib/gait/__tests__/signal.test.ts`: Added unit test suites verifying 2-state Kalman filter velocity estimation, occlusion coasting, visibility gating (< 0.4), adaptive SG window sizes at 30, 60, 120 FPS, dynamic Gram matrix kernel weights, linear interpolation, and Butterworth uniform resampling guard.

### Test & Compilation Execution Results:
1. `npx vitest run src/lib/gait/__tests__/signal.test.ts`:
   - Result: PASS (31/31 tests passed, 0 failed, duration: 658ms).
2. `npx tsc --noEmit`:
   - Result: PASS (0 errors).

---

## 2. Logic Chain

1. **R2 2-State Constant-Velocity Kalman Filter**:
   - Model formulation: State vector $\mathbf{x} = [\text{pos}, \text{vel}]^T$, transition matrix $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$, process noise covariance $Q(dt) = q \cdot \begin{bmatrix} dt^3/3 & dt^2/2 \\ dt^2/2 & dt \end{bmatrix}$ (default $q = 10^{-4}$), measurement matrix $H = [1, 0]$, measurement noise $R = 10^{-2}$.
   - Update steps: Innovation $y = z - x_{\text{pred}}[0]$, innovation covariance scalar $S = P_{\text{pred}}[0,0] + R$, gain $K = [P_{\text{pred}}[0,0]/S, P_{\text{pred}}[1,0]/S]^T$. Covariance update is explicitly calculated with symmetry averaging $P_{01} = P_{10} = (P_{01} + P_{10}) / 2$.
   - Occlusion Coasting & Visibility Gating: When measurement $z$ is non-finite ($\text{NaN}/\text{Infinity}$) or landmark visibility $< 0.4$, position is predicted forward via velocity momentum ($x_{\text{new}}[0] = x_{\text{prev}}[0] + x_{\text{prev}}[1] \cdot dt$), velocity is damped by $0.98$, and error covariance is inflated by $P_{\text{new}} = P_{\text{pred}} + Q \cdot 2.0$.
   - Backward Compatibility: `kalmanFilter1D` returns a `number[]` array of position estimates with non-enumerable `.position` and `.velocity` properties attached via `Object.defineProperties`, allowing 100% backward compatibility for legacy callers expecting `toEqual([])` array equality while supporting 2D access. `kalmanFilter2D` exports explicit `{ position, velocity }` objects.

2. **R7 Adaptive SG Window & Uniform Resampling Guard**:
   - Window sizing: `computeSgWindowSize(fps)` computes $\text{raw} = \text{round}(\text{fps} \cdot 0.17)$, converts to odd integer, and clamps between 5 and 15 points (30 FPS $\to$ 5, 60 FPS $\to$ 11, 120 FPS $\to$ 15).
   - Gram matrix kernel weights: `savitzkyGolay(signal, windowSize)` computes exact quadratic/cubic polynomial kernel weights $c_k = (S_4 - S_2 \cdot k^2) / D$ for odd stencil $M \in [5, 15]$ with boundary reflection padding.
   - `savitzkyGolay5(signal)` retains 100% backward compatibility.
   - Resampling guard: `zeroPhaseButterworth` checks inter-frame interval non-uniformity ($CV = \text{std}(dt)/\bar{dt} > 0.10$ or $\text{var}(dt)/\bar{dt} > 0.10$). When triggered, data is linearly interpolated onto a uniform grid $t_{\text{grid}} = t_0 + k \cdot \bar{dt}$, passed through zero-phase Butterworth filtering at $f_{\text{eff}} = 1/\bar{dt}$, and interpolated back to original timestamps using `linearInterpolate`.

---

## 3. Caveats

- For extremely low FPS ($\le 15$), SG window size clamps at minimum 5 points to preserve transient gait features (e.g. heel-strike impulses).
- When initializing the Kalman filter state, the first finite measurement encountered initializes position state $x_0 = [z, 0]^T$ with identity covariance $P = I$.
- No known caveats or regressions.

---

## 4. Conclusion

Milestone 2 requirements R2 (2-State Constant-Velocity Kalman Filter with velocity coasting and visibility gating) and R7 (Adaptive SG Window & Uniform Resampling Guard) are fully implemented, verified, and pass all type checks and unit tests.

---

## 5. Verification Method

To independently verify this work, run:
```bash
# 1. Run signal unit tests
npx vitest run src/lib/gait/__tests__/signal.test.ts

# 2. Run TypeScript compiler check
npx tsc --noEmit
```
Both commands MUST complete with exit code 0.
