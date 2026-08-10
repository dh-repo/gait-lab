# Technical Analysis & Design: 1D Landmark Coordinate Temporal Smoothing Filters (Milestone M1 / Feature F2)

## 1. Executive Summary & Scope
This report provides a comprehensive technical investigation and implementation design for 1D Landmark Coordinate Temporal Smoothing Filters in `src/lib/gait/signal.ts` for Milestone M1 (Feature F2). 

Video-based pose estimation landmarks (such as MediaPipe 33-point keypoints) exhibit high-frequency coordinate jitter, frame-to-frame discretization noise, and occasional tracking pops. To prevent this noise from degrading kinematic calculations (such as joint angle velocity, ankle acceleration, stride intervals, and step variability `stepTimeCV`), raw keypoint coordinates must be temporally smoothed across frame sequences before kinematic metric extraction.

This analysis details:
1. **5-point Savitzky-Golay quadratic/cubic filter (`savitzkyGolay5`)**
2. **1D Kalman filter (`kalmanFilter1D`)**
3. **Trajectory batch smoothing helper (`smoothPoseFrames`)**
4. **Complete proposed code implementations and unit test specifications**

---

## 2. Codebase Baseline Inspection

### `src/lib/gait/signal.ts`
- Currently contains:
  - `olsDetrend(data: number[])`: OLS linear trend removal.
  - `butterworthLowPass(data: number[], fps: number, cutoffHz?: number)`: Causal 4th-order Butterworth low-pass filter.
  - `zeroPhaseButterworth(data: number[], fps: number, cutoffHz?: number)`: Zero-phase forward-backward Butterworth low-pass filter (filtfilt equivalent) with 24-sample boundary reflection padding.
- `savitzkyGolay5`, `kalmanFilter1D`, and `smoothPoseFrames` are **not yet present** in `signal.ts`.

### `src/lib/gait/types.ts`
- `PoseFrame` definition:
  ```typescript
  export type Landmark = {
    x: number;
    y: number;
    z: number;
    visibility?: number;
  };

  export type PoseFrame = {
    timeMs: number;
    landmarks: Landmark[];
    worldLandmarks?: Landmark[];
  };
  ```

---

## 3. Detailed Component Designs

### 3.1 5-Point Savitzky-Golay Filter (`savitzkyGolay5`)

#### Mathematical Formulation
Savitzky-Golay filtering fits a local polynomial to a sliding window of data points using linear least squares. For a 5-point symmetric window ($m = 2$) and polynomial degree $p = 2$ or $p = 3$, the filter simplifies to a fixed convolution kernel:

$$h = \frac{1}{35} [-3, 12, 17, 12, -3]$$

For interior points $i \in [2, n-3]$:
$$y[i] = \frac{-3 x[i-2] + 12 x[i-1] + 17 x[i] + 12 x[i+1] - 3 x[i+2]}{35}$$

#### Boundary Handling & Reflection Padding
To filter edge points ($i=0, 1, n-2, n-1$) cleanly without phase distortion or boundary artifacts, reflection padding of length 2 is applied at both ends of the signal:
- Left padding:
  $$padded[0] = 2 x[0] - x[2], \quad padded[1] = 2 x[0] - x[1]$$
- Signal body:
  $$padded[2 + i] = x[i] \quad \text{for } i \in [0, n-1]$$
- Right padding:
  $$padded[n + 2] = 2 x[n-1] - x[n-2], \quad padded[n + 3] = 2 x[n-1] - x[n-3]$$

Applying the 5-point stencil across $padded[2 \dots n+1]$ yields smoothed values for all $n$ original points while preserving linear trends at the boundaries.

#### Edge Cases & Robustness
- **Signal length $n < 5$**: If $n < 5$ or $n = 0$, convolution cannot form a full window. The filter sanitizes non-finite values and returns a copy of the input array.
- **Non-finite numbers (NaN, Infinity, -Infinity)**: Non-finite inputs are sanitized to `0` (or the nearest finite value) before convolution, ensuring the output contains strictly finite numbers (`Number.isFinite(v) === true`).

---

### 3.2 1D Kalman Filter (`kalmanFilter1D`)

#### Mathematical State-Space Formulation
A 1D scalar Kalman Filter estimates state $x_k$ (landmark coordinate position) from noisy measurements $z_k$:

- **Process Model**:
  $$x_k = x_{k-1} + w_k, \quad w_k \sim \mathcal{N}(0, Q)$$
- **Measurement Model**:
  $$z_k = x_k + v_k, \quad v_k \sim \mathcal{N}(0, R)$$

Where:
- $Q$ (`processNoise`): Process noise variance. Default $Q = 10^{-4}$ ($0.0001$).
- $R$ (`measurementNoise`): Measurement noise variance. Default $R = 10^{-2}$ ($0.01$).

#### State Update Equations
For $k = 0, 1, \dots, n-1$:

1. **Initialization ($k = 0$)**:
   $$\hat{x}_0 = z_0, \quad P_0 = 1.0$$
   Output $\hat{y}[0] = \hat{x}_0$.

2. **Time Prediction ($k \ge 1$)**:
   $$\hat{x}_k^- = \hat{x}_{k-1}$$
   $$P_k^- = P_{k-1} + Q$$

3. **Measurement Update**:
   - If measurement $z_k$ is finite:
     $$y_k = z_k - \hat{x}_k^- \quad (\text{innovation})$$
     $$S_k = P_k^- + R \quad (\text{innovation covariance})$$
     $$K_k = \frac{P_k^-}{S_k} \quad (\text{Kalman gain})$$
     $$\hat{x}_k = \hat{x}_k^- + K_k \cdot y_k \quad (\text{posterior estimate})$$
     $$P_k = (1 - K_k) \cdot P_k^- \quad (\text{posterior covariance})$$
   - If measurement $z_k$ is non-finite (NaN/Infinity, e.g. landmark occlusion):
     $$\hat{x}_k = \hat{x}_k^- \quad (\text{coast on prediction})$$
     $$P_k = P_k^-$$

#### Properties
- Causal, low-latency, $O(N)$ execution time.
- Smooths noise while bridging missing/occluded frames gracefully.

---

### 3.3 Landmark Sequence Trajectory Smoothing (`smoothPoseFrames`)

#### Algorithm Design
`smoothPoseFrames` processes a sequence of `PoseFrame[]` objects over time.

```typescript
export function smoothPoseFrames(
  frames: PoseFrame[],
  method: 'savitzky-golay' | 'kalman' = 'savitzky-golay',
  options?: {
    processNoise?: number;
    measurementNoise?: number;
  }
): PoseFrame[]
```

#### Execution Workflow
1. Handle empty input: if `!frames || frames.length === 0`, return `[]`.
2. Extract dimensions: `nFrames = frames.length`, `nLandmarks = frames[0].landmarks.length`.
3. Create deep structure copies of frames without mutating input frames:
   ```typescript
   const output: PoseFrame[] = frames.map((f) => ({
     timeMs: f.timeMs,
     landmarks: f.landmarks.map((lm) => ({ ...lm })),
     worldLandmarks: f.worldLandmarks ? f.worldLandmarks.map((lm) => ({ ...lm })) : undefined,
   }));
   ```
4. Process 2D/3D normalized `landmarks`:
   For each landmark index $j \in [0, nLandmarks - 1]$:
   - Construct 1D arrays $X, Y, Z$ of length $nFrames$.
   - Filter $X, Y, Z$ using the selected `method`:
     - If `method === 'kalman'`: `kalmanFilter1D(signal, options?.processNoise, options?.measurementNoise)`
     - Else: `savitzkyGolay5(signal)`
   - Reassign smoothed values back to `output[i].landmarks[j]`.
5. Process 3D `worldLandmarks` if present:
   - Repeat extraction, filtering, and reassignment for `output[i].worldLandmarks[j]`.
6. Return `output`.

---

## 4. Proposed Source Implementation Code

Below is the proposed implementation to be added to `src/lib/gait/signal.ts`:

```typescript
import type { PoseFrame } from "./types";

/**
 * 5-Point Savitzky-Golay Quadratic/Cubic Filter.
 * Convolves 1D signal with polynomial fitting coefficients [-3, 12, 17, 12, -3] / 35.
 * Uses reflection boundary padding for edge samples (i = 0, 1, n-2, n-1).
 */
export function savitzkyGolay5(signal: number[]): number[] {
  if (!signal || signal.length === 0) return [];
  const cleanSignal = signal.map((v) => (Number.isFinite(v) ? v : 0));
  const n = cleanSignal.length;

  if (n < 5) {
    return [...cleanSignal];
  }

  // Reflection boundary padding (2 points on left, 2 points on right)
  const padded = new Array<number>(n + 4);
  padded[0] = 2 * cleanSignal[0] - cleanSignal[2];
  padded[1] = 2 * cleanSignal[0] - cleanSignal[1];

  for (let i = 0; i < n; i++) {
    padded[i + 2] = cleanSignal[i];
  }

  padded[n + 2] = 2 * cleanSignal[n - 1] - cleanSignal[n - 2];
  padded[n + 3] = 2 * cleanSignal[n - 1] - cleanSignal[n - 3];

  const out = new Array<number>(n);
  // Convolution kernel: [-3, 12, 17, 12, -3] / 35
  for (let i = 0; i < n; i++) {
    const idx = i + 2;
    const sum =
      -3 * padded[idx - 2] +
      12 * padded[idx - 1] +
      17 * padded[idx] +
      12 * padded[idx + 1] -
      3 * padded[idx + 2];
    const val = sum / 35;
    out[i] = Number.isFinite(val) ? val : 0;
  }

  return out;
}

/**
 * 1D Scalar Kalman Filter for smoothing noisy position time-series.
 *
 * @param signal 1D array of noisy coordinates
 * @param processNoise Process noise variance Q (default: 1e-4)
 * @param measurementNoise Measurement noise variance R (default: 1e-2)
 */
export function kalmanFilter1D(
  signal: number[],
  processNoise = 1e-4,
  measurementNoise = 1e-2,
): number[] {
  if (!signal || signal.length === 0) return [];
  const n = signal.length;
  const out = new Array<number>(n);

  const Q = Math.max(1e-9, processNoise);
  const R = Math.max(1e-9, measurementNoise);

  let xHat = Number.isFinite(signal[0]) ? signal[0] : 0;
  let P = 1.0;
  out[0] = xHat;

  for (let k = 1; k < n; k++) {
    // Prediction step
    const xHatMinus = xHat;
    const PMinus = P + Q;

    const z = signal[k];
    if (Number.isFinite(z)) {
      // Measurement update step
      const K = PMinus / (PMinus + R);
      xHat = xHatMinus + K * (z - xHatMinus);
      P = (1 - K) * PMinus;
    } else {
      // Coast on prediction if measurement is non-finite
      xHat = xHatMinus;
      P = PMinus;
    }
    out[k] = Number.isFinite(xHat) ? xHat : 0;
  }

  return out;
}

/**
 * Applies 1D landmark coordinate temporal smoothing over frame sequences (PoseFrame[]).
 * Smooths x, y, z coordinates of landmarks (and worldLandmarks if present) across frames.
 *
 * @param frames Sequence of PoseFrame objects
 * @param method Smoothing method ('savitzky-golay' | 'kalman')
 * @param options Optional filter parameters (e.g. processNoise, measurementNoise)
 */
export function smoothPoseFrames(
  frames: PoseFrame[],
  method: "savitzky-golay" | "kalman" = "savitzky-golay",
  options?: {
    processNoise?: number;
    measurementNoise?: number;
  },
): PoseFrame[] {
  if (!frames || frames.length === 0) return [];

  const nFrames = frames.length;
  const numLandmarks = frames[0].landmarks?.length ?? 0;
  if (numLandmarks === 0) return frames.map((f) => ({ ...f }));

  const hasWorld = !!(frames[0].worldLandmarks && frames[0].worldLandmarks.length > 0);

  // Immutably clone frames
  const output: PoseFrame[] = frames.map((f) => ({
    timeMs: f.timeMs,
    landmarks: f.landmarks.map((lm) => ({ ...lm })),
    worldLandmarks: f.worldLandmarks ? f.worldLandmarks.map((lm) => ({ ...lm })) : undefined,
  }));

  const filterFn = (sig: number[]) => {
    if (method === "kalman") {
      return kalmanFilter1D(sig, options?.processNoise, options?.measurementNoise);
    }
    return savitzkyGolay5(sig);
  };

  // Process normalized landmarks
  for (let j = 0; j < numLandmarks; j++) {
    const xSig = new Array<number>(nFrames);
    const ySig = new Array<number>(nFrames);
    const zSig = new Array<number>(nFrames);

    for (let i = 0; i < nFrames; i++) {
      xSig[i] = frames[i].landmarks[j]?.x ?? 0;
      ySig[i] = frames[i].landmarks[j]?.y ?? 0;
      zSig[i] = frames[i].landmarks[j]?.z ?? 0;
    }

    const smoothX = filterFn(xSig);
    const smoothY = filterFn(ySig);
    const smoothZ = filterFn(zSig);

    for (let i = 0; i < nFrames; i++) {
      output[i].landmarks[j].x = smoothX[i];
      output[i].landmarks[j].y = smoothY[i];
      output[i].landmarks[j].z = smoothZ[i];
    }
  }

  // Process world landmarks
  if (hasWorld) {
    const numWorldLandmarks = frames[0].worldLandmarks!.length;
    for (let j = 0; j < numWorldLandmarks; j++) {
      const xSig = new Array<number>(nFrames);
      const ySig = new Array<number>(nFrames);
      const zSig = new Array<number>(nFrames);

      for (let i = 0; i < nFrames; i++) {
        xSig[i] = frames[i].worldLandmarks![j]?.x ?? 0;
        ySig[i] = frames[i].worldLandmarks![j]?.y ?? 0;
        zSig[i] = frames[i].worldLandmarks![j]?.z ?? 0;
      }

      const smoothX = filterFn(xSig);
      const smoothY = filterFn(ySig);
      const smoothZ = filterFn(zSig);

      for (let i = 0; i < nFrames; i++) {
        if (output[i].worldLandmarks && output[i].worldLandmarks[j]) {
          output[i].worldLandmarks![j].x = smoothX[i];
          output[i].worldLandmarks![j].y = smoothY[i];
          output[i].worldLandmarks![j].z = smoothZ[i];
        }
      }
    }
  }

  return output;
}
```

---

## 5. Comprehensive Unit Test Plan

The following test suites must be added to `src/lib/gait/__tests__/signal.test.ts`:

1. **`savitzkyGolay5` Test Suite**:
   - `reduces high-frequency noise while preserving quadratic trends`: Generate $y = t^2 + \text{noise}$, verify smoothed variance is significantly lower.
   - `handles short signals (n < 5) without throwing`: Check input length 0, 1, 2, 3, 4 returns clean array copy.
   - `handles NaNs and Infinities cleanly`: Pass `[1, NaN, 3, Infinity, 5]`, verify no NaN/Infinity in output.
   - `preserves constant DC signals`: Pass `fill(5.0)`, verify output points remain equal to `5.0`.

2. **`kalmanFilter1D` Test Suite**:
   - `filters noisy trajectory towards underlying true signal`: Generate sine wave + noise, verify lower RMSE.
   - `coasts over non-finite measurements (NaNs)`: Inject NaNs at mid-sequence, verify state continues smoothly without throwing or producing NaN.
   - `respects processNoise and measurementNoise parameters`: Test high vs low $R$, verify lower $R$ follows measurements closer while higher $R$ produces smoother response.

3. **`smoothPoseFrames` Test Suite**:
   - `smooths landmark trajectories across PoseFrame array immutably`: Verify output frames differ from noisy input frames, but original input frames array is unmutated.
   - `handles 2D landmarks and 3D worldLandmarks`: Create frames with both `landmarks` and `worldLandmarks`, verify both sets of coordinates are smoothed.
   - `supports both savitzky-golay and kalman methods`: Execute with `method = 'savitzky-golay'` and `method = 'kalman'`, verify valid smoothed outputs.
