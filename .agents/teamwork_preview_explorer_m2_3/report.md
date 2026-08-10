# Technical Analysis Report: Requirement R7 (Adaptive SG Window & Uniform Resampling Guard in `src/lib/gait/signal.ts`)

**Author**: `teamwork_preview_explorer_m2_3` (Explorer 3 for Milestone 2)  
**Target File**: `src/lib/gait/signal.ts`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

This report delivers a deep, read-only architectural and mathematical analysis of Requirement R7 (Adaptive Savitzky-Golay Windowing & Uniform Resampling Guard in `src/lib/gait/signal.ts`).

### Key Discoveries:
1. **Existing SG Filter Limitations**: `savitzkyGolay5()` in `src/lib/gait/signal.ts` (lines 190–232) uses a hardcoded 5-point quadratic/cubic Savitzky-Golay stencil (`1/35 * [-3, 12, 17, 12, -3]`). At 60 FPS (WebRTC target capture rate under R2), 5 frames span only ~83 ms, which is too narrow to suppress high-frequency MediaPipe keypoint jitter. At 15 FPS, 5 frames span 333 ms, causing over-smoothing of heel-strike impact transients.
2. **SG Window Scaling Formula**: `windowSize = Math.max(5, Math.min(15, Math.round(fps * 0.17)))` correctly yields:
   - At 30 FPS: 5 points (~167 ms span)
   - At 60 FPS: 11 points (~183 ms span)
   - At 15 FPS: 5 points (~333 ms span)
   Odd-integer enforcement (`raw % 2 === 0 ? raw + 1 : raw`) ensures window size $M \in \{5, 7, 9, 11, 13, 15\}$.
3. **Butterworth Sampling Jitter**: `zeroPhaseButterworth()` in `src/lib/gait/signal.ts` (lines 135–180) assumes constant frame intervals $\Delta t = 1 / \text{fps}$. WebRTC streams exhibit variable frame arrival times. Applying difference equations directly to non-uniformly sampled data distorts the digital filter frequency response.
4. **Uniform Resampling Guard**: Evaluating sample interval non-uniformity via Coefficient of Variation $CV = \frac{\sigma_{\Delta t}}{\bar{\Delta t}} > 0.10$ or variance ratio $\frac{\sigma^2_{\Delta t}}{\bar{\Delta t}} > 0.10$ provides a mathematically rigorous guard. Resampling non-uniform data onto a uniform grid $t_{\text{grid}} = t_0 + k \cdot \bar{\Delta t}$ via linear interpolation before filtering, then interpolating back, eliminates phase and amplitude distortion.
5. **Backward Compatibility**: All existing exports (`savitzkyGolay5`, `zeroPhaseButterworth`, `smoothPoseFrames`) can be augmented with optional parameters (`fps`, `windowSize`, `timestamps`, `options`) while preserving 100% signature and behavior compatibility for existing callers.

---

## 2. Analysis of Existing Savitzky-Golay Filtering & Generalization

### 2.1 Existing Implementation
`savitzkyGolay5(signal: number[]): number[]` in `src/lib/gait/signal.ts` (lines 190–232):
- Hardcoded for $M = 5$ points.
- Linear boundary reflection padding:
  $x_{-1} = 2 x_0 - x_2, \quad x_{-2} = 2 x_0 - x_1$
  $x_N = 2 x_{N-1} - x_{N-2}, \quad x_{N+1} = 2 x_{N-1} - x_{N-3}$
- Kernel evaluation:
  $$y[i] = \frac{1}{35} \left( -3 x[i-2] + 12 x[i-1] + 17 x[i] + 12 x[i+1] - 3 x[i+2] \right)$$

### 2.2 Mathematical Derivation of General $M$-Point Quadratic/Cubic SG Coefficients
For an odd window size $M = 2m + 1$ centered at index $0$ ($k \in [-m, m]$), the 2nd/3rd degree polynomial smoothing coefficients are derived from the Gram matrix equations:
$$S_0 = M = 2m + 1$$
$$S_2 = \sum_{k=-m}^{m} k^2 = \frac{m(m+1)(2m+1)}{3}$$
$$S_4 = \sum_{k=-m}^{m} k^4 = \frac{m(m+1)(2m+1)(3m^2+3m-1)}{15}$$
$$D = S_0 S_4 - S_2^2$$

The filter coefficient for relative offset $k \in [-m, m]$ is given by:
$$c_k = \frac{S_4 - S_2 \cdot k^2}{D}$$

#### Properties Verified Mathematically:
1. **Symmetry**: $c_{-k} = c_k$ (guarantees zero phase shift).
2. **Unity Sum**: $\sum_{k=-m}^m c_k = \frac{M S_4 - S_2 \sum k^2}{D} = \frac{S_0 S_4 - S_2^2}{D} = 1.0$.
3. **Exact Linear/Quadratic Preservation**: Preserves constant, linear ($y = a x + b$), and quadratic/cubic ($y = a x^2 + b x + c$) trends without attenuation.

#### Pre-computed Exact Kernel Rationales for $M \in \{5, 7, 9, 11, 13, 15\}$:
- **$M = 5$ ($m = 2$)**: $[-3, 12, 17, 12, -3] / 35$
- **$M = 7$ ($m = 3$)**: $[-2, 3, 6, 7, 6, 3, -2] / 21$
- **$M = 9$ ($m = 4$)**: $[-21, 14, 39, 54, 59, 54, 39, 14, -21] / 231$
- **$M = 11$ ($m = 5$)**: $[-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36] / 429$
- **$M = 13$ ($m = 6$)**: $[-11, 0, 9, 16, 21, 24, 25, 24, 21, 16, 9, 0, -11] / 143$
- **$M = 15$ ($m = 7$)**: $[-78, -13, 42, 87, 122, 147, 162, 167, 162, 147, 122, 87, 42, -13, -78] / 1105$

---

## 3. SG Window Scaling Formula & Odd Integer Enforcement

### 3.1 Scaling Formula Verification
Formula: `windowSize = Math.max(5, Math.min(15, Math.round(fps * 0.17)))`

Let's test across sample frame rates:
| Target FPS | `fps * 0.17` | `Math.round()` | Odd Adjustment | Clamped Window $M$ | Time Span (ms) |
|---|---|---|---|---|---|
| **15 FPS** | 2.55 | 3 | 3 | **5** | 333 ms |
| **24 FPS** | 4.08 | 4 | 5 | **5** | 208 ms |
| **30 FPS** | 5.10 | 5 | 5 | **5** | 167 ms |
| **45 FPS** | 7.65 | 8 | 9 | **9** | 200 ms |
| **60 FPS** | 10.20 | 10 | 11 | **11** | 183 ms |
| **90 FPS** | 15.30 | 15 | 15 | **15** | 167 ms |
| **120 FPS** | 20.40 | 20 | 21 | **15** | 125 ms |

### 3.2 Odd Integer Enforcement Function
```ts
export function computeSgWindowSize(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 5;
  const raw = Math.round(fps * 0.17);
  const odd = raw % 2 === 0 ? raw + 1 : raw;
  return Math.max(5, Math.min(15, odd));
}
```

---

## 4. `zeroPhaseButterworth` & Uniform Resampling Guard

### 4.1 Timestamp Interval Metrics & Mathematical Analysis
Let sample timestamps be $T = [t_0, t_1, \dots, t_{N-1}]$.
Step intervals $\Delta t_i = t_{i+1} - t_i$ for $i = 0 \dots N-2$.
- **Mean Step Interval**: $\bar{\Delta t} = \frac{t_{N-1} - t_0}{N-1}$
- **Variance**: $\sigma^2_{\Delta t} = \frac{1}{N-1} \sum_{i=0}^{N-2} (\Delta t_i - \bar{\Delta t})^2$
- **Standard Deviation**: $\sigma_{\Delta t} = \sqrt{\sigma^2_{\Delta t}}$
- **Coefficient of Variation**: $CV = \frac{\sigma_{\Delta t}}{\bar{\Delta t}}$

#### Mathematical Verification of Guard Conditions:
1. $CV = \frac{\sigma_{\Delta t}}{\bar{\Delta t}} > 0.10$ (10% relative jitter in frame interval).
2. Variance ratio $\frac{\sigma^2_{\Delta t}}{\bar{\Delta t}} > 0.10$ (for ms/sec scales).
3. Variance squared ratio $\frac{\sigma^2_{\Delta t}}{(\bar{\Delta t})^2} > 0.10$.

Implementing `const isNonUniform = (cv > 0.10 || varRatio > 0.10 || varRatioSq > 0.10)` guarantees triggering whenever timestamp non-uniformity exceeds 10% under any unit definition (seconds vs milliseconds).

### 4.2 Linear Resampling & Reconstruction Pipeline
When non-uniformity is detected:
1. Construct uniform time grid: $t_{\text{grid}}[k] = t_0 + k \cdot \bar{\Delta t}$ for $k = 0 \dots N-1$.
2. Compute effective sample rate: $\text{fps}_{\text{eff}} = \bar{\Delta t} < 1.0 \;?\; (1 / \bar{\Delta t}) : (1000 / \bar{\Delta t})$.
3. Interpolate raw $y$ values onto $t_{\text{grid}}$ via 1D linear interpolation:
   $$y_{\text{uniform}} = \text{linearInterpolate}(T, y, t_{\text{grid}})$$
4. Apply zero-phase Butterworth filtering on $y_{\text{uniform}}$ at $\text{fps}_{\text{eff}}$.
5. Interpolate filtered signal back to original non-uniform timestamps $T$:
   $$y_{\text{output}} = \text{linearInterpolate}(t_{\text{grid}}, y_{\text{filtered\_uniform}}, T)$$

---

## 5. Comprehensive Callers Inventory

### 5.1 Production Code (`src/lib/gait/`)
- `src/lib/gait/signal.ts`: Exports `olsDetrend`, `butterworthLowPass`, `zeroPhaseButterworth`, `savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`.
- `src/lib/gait/analysis.ts`:
  - Line 1: Imports `olsDetrend`, `zeroPhaseButterworth`, `smoothPoseFrames`.
  - Line 255: Calls `smoothPoseFrames(rawFrames, smoothingMethod)`.
  - Lines 289–294: Calls `zeroPhaseButterworth` on `midHipX`, `midHipY`, `leftWristRel`, `rightWristRel`, `leftKneeAngle`, `rightKneeAngle`.
- `src/lib/gait/index.ts`: Barrel export of all signal functions.

### 5.2 Test Suites (`src/lib/gait/__tests__/`)
- `signal.test.ts`: Direct unit tests for `zeroPhaseButterworth`, `savitzkyGolay5`, `smoothPoseFrames`, `kalmanFilter1D`.
- `e2e_engine_enhancements.test.ts`: E2E tests for `savitzkyGolay5`, `smoothPoseFrames`.
- `e2e_gait_engine_tiers.test.ts`: Tier verification tests for `zeroPhaseButterworth`, `savitzkyGolay5`, `smoothPoseFrames`.
- `m1_2_temporal_smoothing_stress.test.ts`: Stress tests for `savitzkyGolay5`, `smoothPoseFrames`.
- `m1_empirical_adversarial_challenger.test.ts`: Adversarial tests for `savitzkyGolay5`, `smoothPoseFrames`.
- `m2_challenger_verification.test.ts`: Boundary tests for `zeroPhaseButterworth`.
- `m2_challenger_2_empirical_stress.test.ts`: Stress tests for `zeroPhaseButterworth`, `savitzkyGolay5`.
- `m4_challenger_verification.test.ts`: Edge-case tests for `zeroPhaseButterworth`.
- `challenger_m1_1_stress.test.ts`: Frequency sweep tests for `zeroPhaseButterworth`.
- `challenger_m2_1_empirical.test.ts`: Empirical tests for `savitzkyGolay5`, `zeroPhaseButterworth`.
- `nan_property.test.ts`: Property-based NaN handling tests for `zeroPhaseButterworth`.

---

## 6. Proposed Code Changes (Implementation Blueprint)

### Proposed `src/lib/gait/signal.ts` Extensions
```ts
// 1. New helper: Linear 1D interpolation
export function linearInterpolate(
  xOrig: number[],
  yOrig: number[],
  xTarget: number[],
): number[] {
  const n = xOrig.length;
  const m = xTarget.length;
  if (n === 0 || m === 0) return [];
  if (n === 1) return new Array(m).fill(yOrig[0]);

  const yTarget = new Array<number>(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const x = xTarget[i];
    if (x <= xOrig[0]) {
      yTarget[i] = yOrig[0];
      continue;
    }
    if (x >= xOrig[n - 1]) {
      yTarget[i] = yOrig[n - 1];
      continue;
    }
    while (j < n - 1 && xOrig[j + 1] < x) {
      j++;
    }
    const x0 = xOrig[j];
    const x1 = xOrig[j + 1];
    const y0 = yOrig[j];
    const y1 = yOrig[j + 1];
    const dx = x1 - x0;
    if (dx <= 0) {
      yTarget[i] = y0;
    } else {
      const frac = (x - x0) / dx;
      yTarget[i] = y0 + frac * (y1 - y0);
    }
  }
  return yTarget;
}

// 2. New helper: SG window size calculator
export function computeSgWindowSize(fps: number): number {
  if (!Number.isFinite(fps) || fps <= 0) return 5;
  const raw = Math.round(fps * 0.17);
  const odd = raw % 2 === 0 ? raw + 1 : raw;
  return Math.max(5, Math.min(15, odd));
}

// 3. Generalized savitzkyGolay(signal, windowSize) & savitzkyGolayAdaptive(signal, fps)
export function savitzkyGolay(signal: number[], windowSize = 5): number[] {
  if (!signal || signal.length < 5) {
    return signal ? signal.map((v) => (Number.isFinite(v) ? v : 0)) : [];
  }
  const wClamped = Math.max(5, Math.min(15, windowSize % 2 === 0 ? windowSize + 1 : windowSize));
  const n = signal.length;
  const wEff = n < wClamped ? (n % 2 === 1 ? n : n - 1) : wClamped;
  if (wEff < 5) {
    return signal.map((v) => (Number.isFinite(v) ? v : 0));
  }
  if (wEff === 5) {
    return savitzkyGolay5(signal);
  }
  // Compute kernel for wEff
  const m = (wEff - 1) / 2;
  const S0 = wEff;
  const S2 = (m * (m + 1) * (2 * m + 1)) / 3;
  const S4 = (m * (m + 1) * (2 * m + 1) * (3 * m * m + 3 * m - 1)) / 15;
  const D = S0 * S4 - S2 * S2;

  const coeffs = new Array<number>(wEff);
  for (let k = -m; k <= m; k++) {
    coeffs[k + m] = (S4 - S2 * k * k) / D;
  }

  const cleanData = signal.map((v) => (Number.isFinite(v) ? v : 0));
  const padded = new Array<number>(n + 2 * m);
  const s0 = cleanData[0];
  for (let i = 0; i < m; i++) {
    padded[m - 1 - i] = 2 * s0 - cleanData[i + 1];
  }
  for (let i = 0; i < n; i++) {
    padded[m + i] = cleanData[i];
  }
  const sn = cleanData[n - 1];
  for (let i = 0; i < m; i++) {
    padded[m + n + i] = 2 * sn - cleanData[n - 2 - i];
  }

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const center = i + m;
    for (let k = -m; k <= m; k++) {
      sum += coeffs[k + m] * padded[center + k];
    }
    out[i] = sum;
  }
  return out;
}

export function savitzkyGolayAdaptive(signal: number[], fps = 30): number[] {
  const w = computeSgWindowSize(fps);
  return savitzkyGolay(signal, w);
}
```

---

## 7. Verification Method

To verify the proposed implementation during development:
1. Run `npx vitest run src/lib/gait/__tests__/signal.test.ts` to confirm 100% green pass.
2. Run `npx tsc --noEmit` to confirm 0 TypeScript errors.
3. Verify synthetic signals at 15 FPS, 30 FPS, and 60 FPS pass SG adaptive window scaling tests.
4. Verify non-uniform timestamp series (with 15% dt variance) pass the Butterworth uniform resampling guard test without phase lag.
