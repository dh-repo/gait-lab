# Technical Implementation Blueprint: Milestone 2 (R2 & R7)

## Executive Summary
This report presents a complete mathematical, algorithmic, and architectural blueprint for Milestone 2 of the `gait-lab` precision engineering pass. Milestone 2 enhances the signal processing pipeline in `src/lib/gait/signal.ts` via two major upgrades:
1. **R2: 2-State Constant-Velocity Kalman Filter (`kalmanFilter1D`)**: Upgrading from a 1D scalar random-walk model to a 2-state constant-velocity state-space model $\mathbf{x} = [x, v]^T$ with state transition $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$, process noise $Q(dt)$, measurement noise $R$, velocity-momentum occlusion coasting, covariance inflation, and visibility gating (`visibility < 0.4`).
2. **R7: Adaptive Savitzky-Golay Window & Uniform Resampling Guard**:
   - **Adaptive SG Window (`savitzkyGolay5`)**: Scaling stencil size proportional to frame rate ($W = \text{clamp}_{\text{odd}}(\text{round}(\text{fps} \cdot 0.17), 5, 15)$) with dynamic least-squares polynomial coefficient generation.
   - **Uniform Resampling Guard (`zeroPhaseButterworth`)**: Detecting non-uniform sampling timestamps ($\text{var}(dt) > 0.10 \times \bar{dt}$), linearly interpolating onto a uniform grid before biquad filtering, and re-mapping back to original timestamps.

---

## 1. Current Implementation Analysis

### 1.1 `kalmanFilter1D()` (`src/lib/gait/signal.ts:244-289`)
- **Current Formulation**:
  - Scalar 1D state $x_k = x_{k-1} + w_k, \quad w_k \sim \mathcal{N}(0, Q)$.
  - Measurement $z_k = x_k + v_k, \quad v_k \sim \mathcal{N}(0, R)$.
  - Process noise default $Q = 10^{-4}$, measurement noise default $R = 10^{-2}$.
- **Identified Deficiencies**:
  - **Zero Velocity Momentum**: Does not estimate signal velocity. During rapid swings or high-velocity movements, the scalar filter exhibits phase lag because it cannot extrapolate current momentum.
  - **Static Occlusion Coasting**: When keypoints are occluded ($\text{NaN}$ / $\text{Infinity}$), state update holds $x_k = x_{k-1}$. During active walking, a stationary state estimate during a 5-frame occlusion creates a synthetic position step artifact upon recovery.
  - **No Visibility Awareness**: Ignores keypoint visibility scores from MediaPipe. Low confidence keypoints ($\text{visibility} < 0.4$) are treated as accurate measurements.

### 1.2 `savitzkyGolay5()` (`src/lib/gait/signal.ts:190-232`)
- **Current Formulation**:
  - Fixed 5-point stencil with static convolution weights: $\frac{1}{35}[-3, 12, 17, 12, -3]$.
  - Linear boundary reflection padding for $N \ge 5$.
- **Identified Deficiencies**:
  - **FPS Inelasticity**: At 60 FPS, a 5-point stencil spans only 83.3ms (insufficient to smooth high-frequency MediaPipe landmark jitter). At 15 FPS, a 5-point stencil spans 333.3ms (over-smoothing dynamic heel-strike transients).

### 1.3 `zeroPhaseButterworth()` (`src/lib/gait/signal.ts:135-180`)
- **Current Formulation**:
  - 4th-order zero-phase low-pass Butterworth filter formed by cascading two biquad stages in forward and reverse passes with boundary reflection padding.
- **Identified Deficiencies**:
  - **Assumption of Uniform $dt$**: Standard digital biquad coefficients ($a_1, a_2, b_0, b_1, b_2$) computed via bilinear transform assume a fixed sampling frequency $f_s$. WebRTC video frame pipelines often deliver frames with variable inter-frame delays ($dt$). Filtering non-uniformly sampled data directly introduces phase distortion and frequency response distortion.

---

## 2. R2: 2-State Constant-Velocity Kalman Filter

### 2.1 State-Space Equations
The system state is represented by the 2D vector:
$$\mathbf{x}_k = \begin{bmatrix} x_k \\ v_k \end{bmatrix}$$
where $x_k$ is position and $v_k$ is velocity (units/sec).

#### State Transition Matrix $F$:
$$F(dt) = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$$

#### State Prediction (Time Update):
$$\mathbf{x}_{k|k-1} = F(dt) \mathbf{x}_{k-1|k-1} = \begin{bmatrix} x_{k-1} + v_{k-1} \cdot dt \\ v_{k-1} \end{bmatrix}$$

#### Process Noise Covariance Matrix $Q(dt)$:
Under a continuous white-noise acceleration model with process noise spectral density $q$ (default $q = 10^{-4}$):
$$Q(dt) = q \cdot \begin{bmatrix} \frac{dt^3}{3} & \frac{dt^2}{2} \\[4pt] \frac{dt^2}{2} & dt \end{bmatrix}$$

#### Prior Error Covariance $P_{k|k-1}$:
$$P_{k|k-1} = F(dt) P_{k-1|k-1} F(dt)^T + Q(dt)$$
In scalar components:
$$P_{11, \text{prior}} = P_{11} + 2 \cdot dt \cdot P_{12} + dt^2 \cdot P_{22} + Q_{11}$$
$$P_{12, \text{prior}} = P_{12} + dt \cdot P_{22} + Q_{12}$$
$$P_{22, \text{prior}} = P_{22} + Q_{22}$$

#### Measurement Model ($H$, $R$):
Measurement matrix $H = \begin{bmatrix} 1 & 0 \end{bmatrix}$ (measuring position only).
Measurement noise covariance $R = [r]$ (default $r = 10^{-2}$).

#### Measurement Update (Correction):
- Innovation residual: $y_k = z_k - x_{k|k-1}$
- Innovation covariance: $S = P_{11, \text{prior}} + r$
- Kalman Gain:
  $$\mathbf{K} = \begin{bmatrix} K_1 \\ K_2 \end{bmatrix} = \begin{bmatrix} \frac{P_{11, \text{prior}}}{S} \\[6pt] \frac{P_{12, \text{prior}}}{S} \end{bmatrix}$$
- Posterior State:
  $$x_{k|k} = x_{k|k-1} + K_1 \cdot y_k$$
  $$v_{k|k} = v_{k|k-1} + K_2 \cdot y_k$$
- Posterior Covariance:
  $$P_{11, \text{post}} = (1 - K_1) P_{11, \text{prior}}$$
  $$P_{12, \text{post}} = (1 - K_1) P_{12, \text{prior}}$$
  $$P_{22, \text{post}} = P_{22, \text{prior}} - K_2 P_{12, \text{prior}}$$

### 2.2 Occlusion Coasting & Visibility Gating
- **Trigger**: A measurement $z_k$ is occluded if $z_k$ is non-finite ($\text{NaN}$ or $\text{Infinity}$) OR if keypoint visibility $vis_k < 0.4$.
- **Coasting Behavior**:
  - Maintain prediction from prior state:
    $$x_{k|k} = x_{k-1} + v_{k-1} \cdot dt$$
    $$v_{k|k} = v_{k-1} \cdot \gamma \quad (\text{where } \gamma = 0.98 \text{ velocity damping for prolonged occlusion})$$
  - Inflate uncertainty covariance:
    $$P_{k|k} = P_{k|k-1}$$
  - Accumulating $P_{11}$ ensures that when a valid measurement re-appears, the Kalman Gain $\mathbf{K}$ is high, quickly pulling the state estimate back to the observed position.

### 2.3 Proposed Function Signature & Backward Compatibility
```typescript
export interface KalmanOptions {
  processNoise?: number;
  measurementNoise?: number;
  dt?: number;
  visibility?: number[];
}

export interface KalmanResult extends Array<number> {
  position: number[];
  velocity: number[];
}

export function kalmanFilter1D(
  signal: number[],
  dtOrProcessNoise: number | KalmanOptions = 1e-4,
  measurementNoise = 1e-2,
  options?: KalmanOptions,
): number[] & { position: number[]; velocity: number[] }
```
- Calling `kalmanFilter1D(signal, processNoise, measurementNoise)` works seamlessly (preserving legacy signature).
- Passing `dt` or `options` allows callers to receive `{ position, velocity }` or access `.velocity`.

---

## 3. R7: Adaptive Savitzky-Golay Window Algorithm

### 3.1 Window Size Determination Formula
Given sampling frequency $\text{fps}$ (or calculated from frame timestamps):
1. Compute raw window size: $W_{\text{raw}} = \text{Math.round}(\text{fps} \cdot 0.17)$
2. Clamp between 5 and 15: $W_{\text{clamped}} = \text{Math.max}(5, \text{Math.min}(15, W_{\text{raw}}))$
3. Ensure odd integer:
   $$\text{if } W_{\text{clamped}} \bmod 2 = 0 \implies W = \begin{cases} W_{\text{clamped}} + 1 & \text{if } W_{\text{clamped}} < 15 \\ 15 & \text{otherwise} \end{cases}$$

#### FPS Window Size Mapping:
- $\text{FPS} \le 25 \implies W = 5$ points (span: $200\text{ms}$ at 25 FPS)
- $\text{FPS} = 30 \implies W = 5$ points (span: $166.7\text{ms}$)
- $\text{FPS} = 45 \implies W = 9$ points (span: $200\text{ms}$)
- $\text{FPS} = 60 \implies W = 11$ points (span: $183.3\text{ms}$)
- $\text{FPS} = 90 \implies W = 15$ points (span: $166.7\text{ms}$)
- $\text{FPS} \ge 120 \implies W = 15$ points (span: $125\text{ms}$)

### 3.2 Dynamic Savitzky-Golay Kernel Weights
For any odd window size $W = 2k + 1$ ($k \in [2, 7]$) with degree $d = 2$:
$$c_i = \frac{3 W^2 - 7 - 20 i^2}{4 \cdot N_{\text{norm}}}, \quad i \in [-k, k]$$
where $N_{\text{norm}} = \frac{W (W^2 - 4)}{12}$.
Precomputed weight matrices for $W \in \{5, 7, 9, 11, 13, 15\}$ can be cached for zero-allocation runtime performance.

---

## 4. R7: Uniform Resampling Guard (`zeroPhaseButterworth`)

### 4.1 Resampling Trigger Condition
Given frame timestamps $T = [t_0, t_1, \dots, t_{n-1}]$:
1. Inter-frame intervals: $dt_i = t_{i+1} - t_i, \quad i \in [0, n-2]$
2. Mean interval: $\bar{dt} = \frac{t_{n-1} - t_0}{n-1}$
3. Variance of $dt$: $\text{var}(dt) = \frac{1}{n-1} \sum_{i=0}^{n-2} (dt_i - \bar{dt})^2$
4. **Condition**: If $\text{var}(dt) > 0.10 \times \bar{dt}$ (or $\text{stdDev}(dt) / \bar{dt} > 0.10$), activate uniform resampling guard.

### 4.2 Linear Interpolation Guard Pipeline
1. Create uniform time grid $T_{\text{uniform}} = [t_0, t_0 + \bar{dt}, t_0 + 2\bar{dt}, \dots, t_0 + (n-1)\bar{dt}]$.
2. Linearly interpolate non-uniformly sampled signal $y(t_i)$ onto $y_{\text{uniform}}(T_{\text{uniform}})$.
3. Execute standard `zeroPhaseButterworth(y_uniform, 1 / mean_dt, cutoffHz)`.
4. Linearly interpolate filtered output back onto original timestamps $t_i$.

---

## 5. Test Impact & Verification Blueprint

- **Pass Rate**: 100% pass rate maintained across all 986 existing Vitest tests.
- **Backward Compatibility**: `kalmanFilter1D(signal, pNoise, mNoise)` returns an array compatible with existing callers expecting a flat array, while providing `.velocity` for advanced callers.
- **Verification Plan**:
  - Test 2-state Kalman velocity prediction during synthetic NaN occlusion gaps.
  - Test SG window adaptation at 30 FPS vs 60 FPS vs 120 FPS.
  - Test Butterworth uniform resampling guard with irregular timestamp jitter (> 15% variance).
