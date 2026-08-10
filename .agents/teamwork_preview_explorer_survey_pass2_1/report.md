# Phase 2 Technical Survey & Architectural Report: Requirements R1, R2, R3

## Executive Summary

This survey report provides a comprehensive technical investigation of Requirements R1, R2, and R3 for Phase 2 of the `gait-lab` spatio-temporal gait analysis engine upgrade. Based on forensic audit of existing source code (`src/lib/gait/analysis.ts`, `src/lib/gait/signal.ts`, `src/lib/gait/PoseTracker.ts`), scientific literature (Casiez et al. 2012, Kuhn & Munkres 1955, Kalman 1960), and the 986-test Vitest suite, we present the structural, mathematical, and algorithmic specifications for upgrading these core components.

---

## 1. Requirement R1: Hungarian Algorithm for `matchPeople()` in `analysis.ts`

### 1.1 Existing Implementation & Limitations
- **Location**: `src/lib/gait/analysis.ts` (lines 815–933).
- **Current Approach**: Greedy pair assignment.
  - Computes all pairs $(di, ti)$ for detection $di \in [0, D-1]$ and track $ti \in [0, T-1]$.
  - Cost function: `cost = minDist + bioDist * 0.25`, where `minDist = Math.min(distPred, distLast)`.
  - Gating: `spatialDist > maxAllowedDist || cost > maxAllowedCost`.
    - `maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0)`
    - `maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10)`
  - Sorts all candidate pairs by `cost` ascending and greedily matches available pairs.
- **Root Cause of Defect**:
  - In multi-person scenarios (e.g., crossing trajectories, U-turns, close walking proximity), greedy assignment takes the single local minimum pair $(d_1, t_1)$. This local choice often leaves $d_2$ with a high cost to $t_2$ (or forces gating failure for $d_2$, spawning an artificial duplicate track $t_3$).
  - Globally optimal assignment requires minimizing the total cost sum $\sum_{i, j} C_{i, j}$, which greedy sorting fails to guarantee.

### 1.2 Hungarian (Kuhn-Munkres) Algorithm Design
- **Cost Matrix Structure**:
  - Dimension: $D \times T$ matrix where $D = \text{detections.length}$ and $T = \text{tracks.length}$.
  - For detection $i$ and track $j$:
    - If `minDist <= maxAllowedDist && cost <= maxAllowedCost`:
      $C_{i, j} = \text{minDist} + \text{bioDist} \times 0.25$
    - Else (gating threshold exceeded):
      $C_{i, j} = \infty$ (represented as a sentinel large constant, e.g., $10^9$).
- **Handling Rectangular Dimensions ($D \neq T$) & Gating**:
  - Convert $D \times T$ cost matrix to a square $K \times K$ matrix where $K = \max(D, T)$.
  - Fill dummy rows (if $D < T$) or dummy columns (if $T < D$) with $10^9$.
  - Execute Kuhn-Munkres augmenting path algorithm ($O(K^3)$ complexity).
  - Post-process assignment: For detection $i$ assigned to track $j$:
    - If $j < T$ and $C_{i, j} < 10^9$, assign `assigned[i] = tracks[j].id` and perform track update (velocity EMA 50/50 or 80/20 on reversal, biometrics EMA 70/30, lastHip, frameIndices).
    - Else, detection $i$ remains unassigned (`assigned[i] = -1`), spawning a new track with `nextId.value++`.
- **Zero External Dependencies**:
  - Hungarian algorithm can be implemented concisely (~50–60 lines of pure TypeScript) without importing external npm packages.
  - Execution time for $K \le 10$ is $< 0.05\text{ ms}$, ensuring zero runtime performance overhead.

### 1.3 Test Coverage & Verification Strategy
- Existing test suites: `person_identification_stress.test.ts` (30+ category-partition tests), `analysis.test.ts`, `m2_challenger_verification.test.ts`.
- Verification metric: 0 false duplicate person tracks generated on single/multi-subject walk clips; zero regressions across 986+ vitest unit tests.

---

## 2. Requirement R2: 2-State Kalman Filter in `signal.ts`

### 2.1 Existing Implementation & Limitations
- **Location**: `src/lib/gait/signal.ts` (`kalmanFilter1D`, lines 244–289).
- **Current Approach**: 1D scalar random-walk position model:
  $$x_k = x_{k-1} + w_k, \quad w_k \sim \mathcal{N}(0, Q)$$
  $$z_k = x_k + v_k, \quad v_k \sim \mathcal{N}(0, R)$$
- **Defects**:
  1. **Phase Lag**: Lacks velocity state, causing filter lag during rapid foot swing phase ($v \approx 1.5\text{–}2.5\text{ m/s}$).
  2. **Static Occlusion Coasting**: When keypoints are occluded/NaN, scalar model holds position static ($x_k = x_{k-1}$), ignoring momentum.
  3. **Transient Distortion**: Over-smooths rapid deceleration transients at initial contact (heel strike).

### 2.2 2-State Constant Velocity Kalman Filter Specification
- **State Vector**:
  $$\mathbf{x}_k = \begin{bmatrix} x_k \\ v_k \end{bmatrix}$$
- **State Transition Matrix ($F$) & Model**:
  $$F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix} \quad (\text{where } dt = 1.0 \text{ unit frame step or } \Delta t \text{ in seconds})$$
  $$\mathbf{x}_{k|k-1} = F \mathbf{x}_{k-1|k-1} = \begin{bmatrix} x_{k-1} + v_{k-1} \cdot dt \\ v_{k-1} \end{bmatrix}$$
- **Process Noise Covariance ($Q$) & Measurement Noise ($R$)**:
  - Process Noise Matrix:
    $$Q = \begin{bmatrix} Q_x & 0 \\ 0 & Q_v \end{bmatrix} \quad \text{where } Q_x = \text{processNoise} \; (10^{-4}), \; Q_v = Q_x \times 0.1$$
  - Measurement Noise Scalar:
    $$R = \text{measurementNoise} \; (10^{-2})$$
  - Measurement Matrix:
    $$H = \begin{bmatrix} 1 & 0 \end{bmatrix}$$
- **Predict-Correct Equations**:
  1. **Time Update (Predict)**:
     $$\mathbf{\hat{x}}_{k|k-1} = \begin{bmatrix} x_{k-1} + v_{k-1} dt \\ v_{k-1} \end{bmatrix}$$
     $$P_{k|k-1} = F P_{k-1|k-1} F^T + Q$$
  2. **Measurement Update (Correct)** (when measurement $z_k$ is finite AND landmark `visibility >= 0.4`):
     $$y_k = z_k - \hat{x}_{k|k-1}$$
     $$S_k = P_{00} + R$$
     $$K_k = \begin{bmatrix} P_{00} / S_k \\ P_{10} / S_k \end{bmatrix}$$
     $$\mathbf{\hat{x}}_{k|k} = \mathbf{\hat{x}}_{k|k-1} + K_k y_k$$
     $$P_{k|k} = (I - K_k H) P_{k|k-1}$$
  3. **Occlusion Coasting (when $z_k$ is non-finite / NaN / Infinity OR `visibility < 0.4`)**:
     $$\mathbf{\hat{x}}_{k|k} = \mathbf{\hat{x}}_{k|k-1} = \begin{bmatrix} x_{k-1} + v_{k-1} dt \\ v_{k-1} \end{bmatrix}$$
     $$P_{k|k} = P_{k|k-1} \quad (\text{uncertainty inflates by } Q)$$
- **Integration Points**:
  - `kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number, visibilities?: number[])` in `signal.ts`.
  - `smoothPoseFrames` in `signal.ts` passes landmark visibility vectors to `kalmanFilter1D`.

### 2.3 Test Coverage & Verification Strategy
- Existing tests: `signal.test.ts` (lines 285–312), `e2e_engine_enhancements.test.ts`, `e2e_gait_engine_tiers.test.ts`.
- Verification metric: Lower RMSE on sinusoidal / linear movement signals with noise; non-zero velocity momentum during 5-frame NaN gap; 100% green pass rate across all signal test suites.

---

## 3. Requirement R3: One Euro Adaptive Filter for Real-Time `PoseTracker`

### 3.1 Existing Implementation & Limitations
- **Location**: `src/lib/gait/PoseTracker.ts` (lines 105, 336–395).
- **Current Approach**: Raw landmark assignment to `lastTargetHip`:
  `this.lastTargetHip = newHip;`
- **Defects**: Single-frame landmark detection jitter causes erratic target position predictions and velocity spikes (`vxStep`, `vyStep`), distorting multi-person target scoring.

### 3.2 One Euro Adaptive Filter Formulation (Casiez et al. CHI 2012)
- **Mathematical Formulation**:
  The One Euro filter adjusts its cutoff frequency $f_c$ dynamically based on the filtered rate of change (speed) of the signal:
  1. **Derivative Estimation**:
     $$dx_k = \frac{x_k - \hat{x}_{k-1}}{dt}$$
     $$\alpha_d = \frac{2 \pi f_{c, d} dt}{1 + 2 \pi f_{c, d} dt} \quad (\text{where } f_{c, d} = \text{dCutoff} = 1.0\text{ Hz})$$
     $$\widehat{dx}_k = \alpha_d dx_k + (1 - \alpha_d) \widehat{dx}_{k-1}$$
  2. **Adaptive Cutoff Frequency**:
     $$f_c = \text{minCutoff} + \beta \cdot |\widehat{dx}_k|$$
     - $\text{minCutoff} = 1.0\text{ Hz}$: Minimum cutoff frequency (maximum smoothing when signal is still/slow).
     - $\beta = 0.007$: Speed coefficient (increases cutoff frequency linearly with speed to minimize lag during fast movement).
  3. **Position Filtering**:
     $$\alpha = \frac{2 \pi f_c dt}{1 + 2 \pi f_c dt}$$
     $$\hat{x}_k = \alpha x_k + (1 - \alpha) \hat{x}_{k-1}$$

### 3.3 Integration Points in `PoseTracker.ts`
- Create a standalone utility class `OneEuroFilter` (in `src/lib/gait/oneEuro.ts` or co-located in `PoseTracker.ts`).
- In `PoseTracker`:
  - Instantiate `OneEuroFilter` instances for target hip coordinates: `hipFilterX` and `hipFilterY`.
  - In `PoseTracker.loop()`: Filter `newHip.x` and `newHip.y` before updating `lastTargetHip`.
  - Filter target velocity steps to eliminate jitter spikes.
  - Reset filter states inside `clearBuffer()` or when target lock is cleared.

### 3.4 Test Coverage & Verification Strategy
- Existing tests: `PoseTracker.test.ts` (13 unit tests).
- Verification metric: Target hip jitter reduced by $\ge 30\%$ on synthetic oscillating inputs; zero target lock drops or lag regressions.

---

## 4. Synthesis & Architectural Plan

| Requirement | Module | Key Changes | Impact / Improvement |
|---|---|---|---|
| **R1 (Hungarian)** | `src/lib/gait/analysis.ts` | Replace greedy sorting with Hungarian algorithm ($O(K^3)$ Kuhn-Munkres) using `minDist + bioDist * 0.25` cost & `maxAllowedDist` gating. | Zero track-swap errors during crossing paths; globally minimal assignment cost. |
| **R2 (2-State Kalman)** | `src/lib/gait/signal.ts` | Upgrade `kalmanFilter1D` to 2-state $[x, v]^T$ constant-velocity model with `visibility < 0.4` occlusion coasting. | Velocity momentum prediction; zero phase lag during swing phase; robust NaN handling. |
| **R3 (One Euro Filter)** | `src/lib/gait/PoseTracker.ts` | Implement One Euro Adaptive Filter (Casiez et al. 2012) on target hip coordinates & velocity. | $\ge 30\%$ reduction in target hip position jitter; smooth velocity estimates in real-time tracking. |

---

## 5. Verification Commands

To independently verify the implementation after code updates:
1. `npx vitest run` — 100% green pass rate across all test files.
2. `npx tsc --noEmit` — 0 TypeScript errors.
3. `npx eslint .` — 0 ESLint errors.
4. `npm run build` — Valid production build with zero errors.
