# Technical Analysis Report: 1D Landmark Coordinate Temporal Smoothing via 5-Point Savitzky-Golay Filter

**Author:** Explorer M1-2 (Signal Processing & Temporal Smoothing Specialist)  
**Date:** 2026-08-09  
**Target Repository:** `/Users/damian/GitHub/gait-lab`  
**Scope:** Milestone M1.2 — Requirement R1 (Computer Vision Model Fidelity & 1D Landmark Coordinate Temporal Filtering)  
**Primary Output Path:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_2/analysis.md`

---

## 1. Executive Summary

This report delivers the detailed technical analysis and design specification for **1D Landmark Coordinate Temporal Smoothing** in `gait-lab`. 

Keypoint coordinate jitter in raw MediaPipe pose estimations (caused by lighting fluctuations, camera noise, or subtle limb micro-occlusions) corrupts kinematic gait metrics—such as Zeni initial contact (heel strike) detection, vertical ankle acceleration minima, and knee/hip joint angle extremes—**before** down-stream 1D signal filters execute.

To resolve keypoint instability, we implement a **5-point Savitzky-Golay (SavGol) quadratic 1D temporal coordinate smoothing filter** across all 33 MediaPipe landmarks' $(x, y, z)$ spatial coordinates prior to metric calculation.

### Core Architectural Specifications:
1. **Convolution Kernel**: $\frac{1}{35} [-3, 12, 17, 12, -3]$ for 2nd/3rd degree local polynomial fitting.
2. **Boundary Reflection Padding ($N \ge 5$)**:
   $$\begin{aligned}
   x_{-1} &= 2 x_0 - x_1, & x_{-2} &= 2 x_0 - x_2 \\
   x_N &= 2 x_{N-1} - x_{N-2}, & x_{N+1} &= 2 x_{N-1} - x_{N-3}
   \end{aligned}$$
3. **Short Sequence Graceful Handling ($N < 5$)**: Returns input frames unaltered without throwing or distorting short clips.
4. **Metadata Preservation**: Preserves landmark `visibility`, `presence`, timestamp `timeMs`, and frame-level attributes completely untouched while maintaining strict immutability.
5. **API Export Contract**: Export `savitzkyGolay5` and `smoothPoseFrames` in `src/lib/gait/signal.ts` and add `LandmarkFrame` type alias for `PoseFrame`.

---

## 2. Current State Audit

### 2.1 Existing `src/lib/gait/signal.ts`
Currently, `signal.ts` contains:
- `olsDetrend(data: number[]): number[]`: Ordinary Least Squares linear detrending.
- `butterworthLowPass(data: number[], fps: number, cutoffHz?: number): number[]`: 4th-order causal low-pass biquad filter.
- `zeroPhaseButterworth(data: number[], fps: number, cutoffHz?: number): number[]`: Zero-phase forward-backward Butterworth low-pass filter.

**Gap:** `signal.ts` lacks 1D temporal landmark coordinate filtering capabilities.

### 2.2 Existing Landmark & Frame Types (`src/lib/gait/types.ts`)
```typescript
export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
};

export type PoseFrame = {
  timeMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};
```

### 2.3 Integration Target (`src/lib/gait/analysis.ts`)
In `computeGaitMetricsCore(rawFrames: PoseFrame[])`:
Raw pose frames currently enter `computeGaitMetricsCore` without coordinate smoothing. Post-hoc Butterworth low-pass filtering is applied *only* to derived 1D summary signals (e.g. `midHipX`, `leftWristRel`, `leftKneeAngle`) at lines 279–284. Pre-filtering the raw 3D landmark trajectories with `smoothPoseFrames(rawFrames)` will stabilize all downstream geometry, view detection, joint angles, and event detectors.

---

## 3. Mathematical Foundations of 5-Point Savitzky-Golay Filtering

### 3.1 Convolution Kernel Derivation
The 5-point Savitzky-Golay filter fits a local quadratic polynomial $p(t) = c_0 + c_1 t + c_2 t^2$ to five contiguous data points $t \in \{-2, -1, 0, 1, 2\}$ using unweighted least squares.

Solving the normal equations for the center point estimate $\hat{x}_0 = p(0) = c_0$ yields:
$$\hat{x}_0 = \frac{1}{35} \left( -3 x_{-2} + 12 x_{-1} + 17 x_0 + 12 x_1 - 3 x_2 \right)$$

#### Weight Vector:
$$\mathbf{W} = \frac{1}{35} \begin{bmatrix} -3 & 12 & 17 & 12 & -3 \end{bmatrix}$$

#### Conservation of Constant Signals (DC Gain = 1):
$$\sum_{k=-2}^2 W_k = \frac{-3 + 12 + 17 + 12 - 3}{35} = \frac{35}{35} = 1.0$$
This guarantees that a constant signal $x[k] = C$ is preserved with zero baseline shift ($\hat{x}[k] = C$).

### 3.2 Linear Boundary Reflection Padding ($N \ge 5$)
To compute smoothed values at boundary indices $i \in \{0, 1, N-2, N-1\}$ without phase shift or edge attenuation, boundary reflection padding extends the signal by 2 samples on each end:

#### Left Boundary Padding ($k < 0$):
$$\begin{aligned}
x_{-1} &= 2 x_0 - x_1 \\
x_{-2} &= 2 x_0 - x_2
\end{aligned}$$

#### Right Boundary Padding ($k \ge N$):
$$\begin{aligned}
x_N &= 2 x_{N-1} - x_{N-2} \\
x_{N+1} &= 2 x_{N-1} - x_{N-3}
\end{aligned}$$

### 3.3 Proof of Linear Trend Preservation at Boundaries
Consider a linear signal $x[k] = a k + b$.

Evaluating the left reflection padding:
$$\begin{aligned}
x_{-1} &= 2 b - (a + b) = -a + b = a(-1) + b \\
x_{-2} &= 2 b - (2a + b) = -2a + b = a(-2) + b
\end{aligned}$$

Applying the convolution kernel at index $i = 0$:
$$\begin{aligned}
\hat{x}[0] &= \frac{1}{35} \left[ -3(-2a+b) + 12(-a+b) + 17(b) + 12(a+b) - 3(2a+b) \right] \\
&= \frac{1}{35} \left[ (6 - 12 + 12 - 6)a + (-3 + 12 + 17 + 12 - 3)b \right] \\
&= \frac{1}{35} \left[ 0 \cdot a + 35 \cdot b \right] = b = x[0]
\end{aligned}$$

Evaluating the right reflection padding at index $i = N - 1$:
$$\begin{aligned}
x_N &= 2 [a(N-1)+b] - [a(N-2)+b] = a N + b = a(N) + b \\
x_{N+1} &= 2 [a(N-1)+b] - [a(N-3)+b] = a(N+1) + b
\end{aligned}$$
Applying the convolution kernel at index $i = N - 1$ similarly yields $\hat{x}[N-1] = x[N-1]$.

**Conclusion:** Linear boundary reflection padding guarantees **zero distortion ($0.000$ error)** for linear trajectories across all boundary indices $i \in \{0, 1, N-2, N-1\}$.

### 3.4 Noise Variance Reduction Derivation
For uncorrelated zero-mean i.i.d. noise with variance $\sigma^2$:
$$\text{Var}(\hat{x}_0) = \sum_{k=-2}^2 W_k^2 \, \sigma^2 = \frac{(-3)^2 + 12^2 + 17^2 + 12^2 + (-3)^2}{35^2} \, \sigma^2 = \frac{9 + 144 + 289 + 144 + 9}{1225} \, \sigma^2 = \frac{591}{1225} \, \sigma^2 \approx 0.48245 \, \sigma^2$$

**Noise Attenuation:** High-frequency coordinate jitter variance is reduced by **$51.75\%$** in a single pass while preserving sharp kinematic peak timing and transient velocity zero-crossings.

---

## 4. Proposed Implementation Architecture

### 4.1 `savitzkyGolay5` in `src/lib/gait/signal.ts`

```typescript
/**
 * 5-Point Savitzky-Golay 1D Temporal Smoothing Filter.
 * Fits a local 2nd/3rd degree polynomial to a moving window of 5 points using kernel 1/35 * [-3, 12, 17, 12, -3].
 * Uses linear boundary reflection padding for N >= 5 frames.
 * Gracefully returns input unaltered for N < 5 frames.
 */
export function savitzkyGolay5(signal: number[]): number[] {
  if (!signal || signal.length < 5) {
    return signal ? signal.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  }

  const clean = signal.map((v) => (Number.isFinite(v) ? v : 0));
  const n = clean.length;

  // Linear boundary reflection padding (N >= 5)
  // x_{-1} = 2*x_0 - x_1,   x_{-2} = 2*x_0 - x_2
  // x_N = 2*x_{N-1} - x_{N-2}, x_{N+1} = 2*x_{N-1} - x_{N-3}
  const padded = new Array<number>(n + 4);
  padded[0] = 2 * clean[0] - clean[2];
  padded[1] = 2 * clean[0] - clean[1];
  for (let i = 0; i < n; i++) {
    padded[i + 2] = clean[i];
  }
  padded[n + 2] = 2 * clean[n - 1] - clean[n - 2];
  padded[n + 3] = 2 * clean[n - 1] - clean[n - 3];

  const out = new Array<number>(n);
  const inv35 = 1 / 35;

  for (let i = 0; i < n; i++) {
    const idx = i + 2;
    out[i] = inv35 * (
      -3 * padded[idx - 2] +
      12 * padded[idx - 1] +
      17 * padded[idx] +
      12 * padded[idx + 1] -
       3 * padded[idx + 2]
    );
  }

  return out;
}
```

### 4.2 `smoothPoseFrames` in `src/lib/gait/signal.ts`

```typescript
import type { Landmark, PoseFrame } from "./types";

export type LandmarkFrame = PoseFrame;

/**
 * Applies 5-point Savitzky-Golay 1D temporal coordinate smoothing across all 33 keypoints'
 * (x, y, z) spatial coordinates across pose frames.
 *
 * Handles landmark visibility, presence, and timestamp metadata untouched.
 * Returns input frames unaltered when N < 5.
 */
export function smoothPoseFrames<T extends PoseFrame>(frames: T[]): T[] {
  if (!frames || frames.length < 5) {
    return frames ? frames.slice() : [];
  }

  const n = frames.length;
  const numLandmarks = frames[0]?.landmarks?.length ?? 0;
  if (numLandmarks === 0) {
    return frames.slice();
  }

  // 1. Smooth 2D/3D image landmarks (x, y, z)
  const smoothedX: number[][] = [];
  const smoothedY: number[][] = [];
  const smoothedZ: number[][] = [];

  for (let j = 0; j < numLandmarks; j++) {
    const xSig = new Array<number>(n);
    const ySig = new Array<number>(n);
    const zSig = new Array<number>(n);

    for (let i = 0; i < n; i++) {
      const lm = frames[i].landmarks[j];
      xSig[i] = lm?.x ?? 0;
      ySig[i] = lm?.y ?? 0;
      zSig[i] = lm?.z ?? 0;
    }

    smoothedX.push(savitzkyGolay5(xSig));
    smoothedY.push(savitzkyGolay5(ySig));
    smoothedZ.push(savitzkyGolay5(zSig));
  }

  // 2. Smooth 3D worldLandmarks if present
  const hasWorld = Boolean(frames[0]?.worldLandmarks && frames[0].worldLandmarks.length > 0);
  const numWorldLandmarks = hasWorld ? frames[0].worldLandmarks!.length : 0;
  const smoothedWorldX: number[][] = [];
  const smoothedWorldY: number[][] = [];
  const smoothedWorldZ: number[][] = [];

  if (hasWorld) {
    for (let j = 0; j < numWorldLandmarks; j++) {
      const wxSig = new Array<number>(n);
      const wySig = new Array<number>(n);
      const wzSig = new Array<number>(n);

      for (let i = 0; i < n; i++) {
        const wlm = frames[i].worldLandmarks?.[j];
        wxSig[i] = wlm?.x ?? 0;
        wySig[i] = wlm?.y ?? 0;
        wzSig[i] = wlm?.z ?? 0;
      }

      smoothedWorldX.push(savitzkyGolay5(wxSig));
      smoothedWorldY.push(savitzkyGolay5(wySig));
      smoothedWorldZ.push(savitzkyGolay5(wzSig));
    }
  }

  // 3. Construct smoothed frames preserving visibility, presence, timeMs, and metadata
  return frames.map((origFrame, i) => {
    const newLandmarks: Landmark[] = origFrame.landmarks.map((origLm, j) => ({
      ...origLm,
      x: smoothedX[j][i],
      y: smoothedY[j][i],
      z: smoothedZ[j][i],
    }));

    let newWorldLandmarks: Landmark[] | undefined;
    if (hasWorld && origFrame.worldLandmarks) {
      newWorldLandmarks = origFrame.worldLandmarks.map((origWlm, j) => ({
        ...origWlm,
        x: smoothedWorldX[j][i],
        y: smoothedWorldY[j][i],
        z: smoothedWorldZ[j][i],
      }));
    }

    return {
      ...origFrame,
      landmarks: newLandmarks,
      ...(newWorldLandmarks ? { worldLandmarks: newWorldLandmarks } : {}),
    };
  });
}
```

### 4.3 Type Alias in `src/lib/gait/types.ts`
Add `export type LandmarkFrame = PoseFrame;` to `types.ts` and export it in `signal.ts` so both names remain fully compatible throughout the codebase.

### 4.4 Upstream Integration into `src/lib/gait/analysis.ts`
Inside `computeGaitMetricsCore(rawFrames: PoseFrame[])`:

```typescript
import { smoothPoseFrames } from "./signal";

function computeGaitMetricsCore(rawFrames: PoseFrame[]): GaitMetrics {
  if (rawFrames.length < 5) {
    return emptyMetrics(rawFrames);
  }

  // Requirement R1: Apply 1D temporal coordinate smoothing on all keypoints prior to metrics
  const frames = smoothPoseFrames(rawFrames);

  // Proceed with view detection, Zeni event detection, angles, and metrics using smoothed frames...
}
```

---

## 5. Specified Unit Test Suite for `src/lib/gait/__tests__/signal.test.ts`

To guarantee 100% test coverage and verify compliance, add the following test cases to `signal.test.ts`:

```typescript
describe("savitzkyGolay5 & smoothPoseFrames (1D Coordinate Smoothing)", () => {
  it("preserves linear trend signals exactly across interior and boundaries", () => {
    const n = 20;
    const signal = Array.from({ length: n }, (_, i) => 3 * i + 5);
    const smoothed = savitzkyGolay5(signal);

    expect(smoothed.length).toBe(n);
    for (let i = 0; i < n; i++) {
      expect(smoothed[i]).toBeCloseTo(signal[i], 5);
    }
  });

  it("preserves constant DC signals without baseline shift", () => {
    const signal = new Array(15).fill(42.5);
    const smoothed = savitzkyGolay5(signal);

    expect(smoothed.length).toBe(15);
    smoothed.forEach((val) => expect(val).toBeCloseTo(42.5, 5));
  });

  it("preserves quadratic signals in interior points (k in [2, N-3])", () => {
    const n = 15;
    const signal = Array.from({ length: n }, (_, i) => i * i);
    const smoothed = savitzkyGolay5(signal);

    for (let i = 2; i < n - 2; i++) {
      expect(smoothed[i]).toBeCloseTo(signal[i], 5);
    }
  });

  it("reduces high-frequency noise variance while preserving signal peaks", () => {
    const n = 50;
    const clean = Array.from({ length: n }, (_, i) => Math.sin((i / 5) * Math.PI));
    const noise = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.2 : -0.2));
    const noisy = clean.map((c, i) => c + noise[i]);

    const smoothed = savitzkyGolay5(noisy);

    const noisyErr = noisy.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0);
    const smoothErr = smoothed.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0);

    expect(smoothErr).toBeLessThan(noisyErr * 0.5);
  });

  it("gracefully returns input unaltered for short sequences N < 5", () => {
    expect(savitzkyGolay5([])).toEqual([]);
    expect(savitzkyGolay5([1.5, 2.5])).toEqual([1.5, 2.5]);
    expect(savitzkyGolay5([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);

    const shortFrames: PoseFrame[] = Array.from({ length: 3 }, (_, i) => ({
      timeMs: i * 33,
      landmarks: [{ x: i, y: i * 2, z: 0, visibility: 0.9, presence: 0.95 }],
    }));
    const result = smoothPoseFrames(shortFrames);
    expect(result).toEqual(shortFrames);
  });

  it("smooths all 33 keypoints' 3D coordinates while preserving landmark visibility, presence, and timeMs", () => {
    const n = 10;
    const rawFrames: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
      timeMs: 1000 + i * 33.3,
      landmarks: Array.from({ length: 33 }, (_, j) => ({
        x: j * 0.01 + (i % 2 === 0 ? 0.05 : -0.05),
        y: j * 0.02 + Math.sin(i),
        z: j * 0.005,
        visibility: 0.85 + j * 0.001,
        presence: 0.90 + j * 0.001,
      })),
      worldLandmarks: Array.from({ length: 33 }, (_, j) => ({
        x: j * 0.1,
        y: j * 0.2,
        z: j * 0.05 + (i % 2 === 0 ? 0.02 : -0.02),
        visibility: 0.99,
      })),
    }));

    const smoothedFrames = smoothPoseFrames(rawFrames);

    expect(smoothedFrames.length).toBe(n);
    for (let i = 0; i < n; i++) {
      expect(smoothedFrames[i].timeMs).toBe(rawFrames[i].timeMs);
      expect(smoothedFrames[i].landmarks.length).toBe(33);
      expect(smoothedFrames[i].worldLandmarks?.length).toBe(33);

      for (let j = 0; j < 33; j++) {
        const origLm = rawFrames[i].landmarks[j];
        const smLm = smoothedFrames[i].landmarks[j];

        expect(smLm.visibility).toBe(origLm.visibility);
        expect(smLm.presence).toBe(origLm.presence);
        expect(Number.isFinite(smLm.x)).toBe(true);
        expect(Number.isFinite(smLm.y)).toBe(true);
        expect(Number.isFinite(smLm.z)).toBe(true);
      }
    }
  });
});
```

---

## 6. Verification Method & Success Criteria

1. **Unit Test Pass Rate**: `npx vitest run src/lib/gait/__tests__/signal.test.ts` passes 100%.
2. **Regression Verification**: `npm test` passes all 81 existing test suites.
3. **Typecheck & Lint**: `npm run typecheck` passes with 0 errors; `npm run lint` passes with 0 errors.
4. **Build Verification**: `npm run build` succeeds cleanly.
