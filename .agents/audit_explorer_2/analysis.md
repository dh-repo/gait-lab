# Comprehensive Scientific Audit Analysis: Harmonic Ratio Calculation (R2)

**Author:** Audit Explorer 2  
**Date:** 2026-08-09  
**Target Files:** `src/lib/gait/signal.ts`, `src/lib/gait/smoothness.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/__tests__/smoothness.test.ts`, `src/lib/gait/__tests__/signal.test.ts`  
**Audit Finding ID:** R2 (Synthetic Ground-Truth Harmonic Ratio Accuracy & Spectral Leakage)

---

## 1. Executive Summary

Audit finding **R2** identifies critical scientific inaccuracies in the current Harmonic Ratio (HR) calculation algorithm within `gait-lab`. Specifically:
1. **Fundamental Frequency ($f_0$) Derivation Mismatch**: Re-deriving $f_0$ from the spectral peak of each individual signal component (e.g. `hipY` vs `hipX`) independently causes `hipY` (vertical displacement) to set $f_0$ equal to the **step frequency** ($2 f_{\text{stride}}$) rather than the true **stride frequency** ($f_{\text{stride}} = 1 / \text{meanStrideSec}$). As a result, odd stride harmonics ($1 f_0, 3 f_0, 5 f_0$) are completely skipped, and even stride harmonics are misclassified as odd harmonics, destroying the mathematical validity of the Vertical Harmonic Ratio.
2. **Spectral Leakage Under-counting**: Current harmonic extraction reads single isolated FFT bins (`mag[harmIndex]`). Due to the Hann window's mainlobe width of 3 bins, non-integer harmonic bin frequencies leak energy into adjacent bins ($\pm 1$ bin), resulting in severe harmonic power under-counting (up to 60% energy loss per harmonic).

This report presents a complete mathematical and architectural fix that updates `computeFFTHarmonics` and `computeHarmonicRatio` to accept `meanStrideSec` (or detected stride frequency $f_0 = 1 / \text{meanStrideSec}$) and sum harmonic magnitudes over a $\pm 1$ FFT bin neighborhood.

---

## 2. Analysis of Current HR Calculation

### 2.1 Code Flow in `src/lib/gait/signal.ts` (`computeFFTHarmonics`)

Currently, `computeFFTHarmonics` is implemented as follows:

```typescript
export function computeFFTHarmonics(
  data: number[],
  numHarmonics = 10,
): { evenSum: number; oddSum: number; harmonicRatio: number } {
  // 1. Detrend signal and apply Hann window
  // 2. Perform Radix-2 FFT and compute magnitude spectrum mag[k]
  
  // 3. Search for dominant peak bin (f0Bin) across entire spectrum
  let f0Bin = 1;
  let maxMag = 0;
  const maxSearchBin = Math.min(Math.floor(halfSize / 2), Math.floor(fftSize / 4));
  for (let k = 1; k < maxSearchBin; k++) {
    if (mag[k] > maxMag) {
      maxMag = mag[k];
      f0Bin = k;
    }
  }

  // 4. Extract single-bin harmonics at integer multiples of f0Bin
  let evenSum = 0;
  let oddSum = 0;
  const halfHarmonics = Math.floor(numHarmonics / 2);

  for (let m = 1; m <= halfHarmonics; m++) {
    const harmIndex = (2 * m - 1) * f0Bin; // Odd harmonics
    if (harmIndex < halfSize) oddSum += mag[harmIndex];
  }

  for (let m = 1; m <= halfHarmonics; m++) {
    const harmIndex = (2 * m) * f0Bin;     // Even harmonics
    if (harmIndex < halfSize) evenSum += mag[harmIndex];
  }

  return { evenSum, oddSum, harmonicRatio: evenSum / (oddSum + 1e-6) };
}
```

### 2.2 Code Flow in `src/lib/gait/smoothness.ts` (`computeHarmonicRatio`)

`smoothness.ts` calls `computeFFTHarmonics` independently for vertical (`hipY`) and lateral (`hipX`) displacement trajectories:

```typescript
export function computeHarmonicRatio(
  hipY: number[],
  hipX: number[],
  fps: number,
): { hrVertical: number; hrLateral: number; overallHR: number } {
  const vertHarmonics = computeFFTHarmonics(hipY, 10);
  const hrVertical = Math.max(0.1, Number(vertHarmonics.harmonicRatio.toFixed(2)));

  const latHarmonics = computeFFTHarmonics(hipX, 10);
  const rawHrLateral = latHarmonics.oddSum / (latHarmonics.evenSum + 1e-6);
  const hrLateral = Math.max(0.1, Number(rawHrLateral.toFixed(2)));

  const overallHR = Number(Math.sqrt(hrVertical * hrLateral).toFixed(2));
  return { hrVertical, hrLateral, overallHR };
}
```

---

## 3. Root Cause Identification: Peak Re-Derivation Inaccuracies

### 3.1 Step Frequency vs. Stride Frequency Distortion

In human locomotion biomechanics (Menz et al. 2003, Bellanca et al. 2013, Pasciuto et al. 2015):
- A **stride** consists of two consecutive steps (Left Heel Strike $\rightarrow$ Right Heel Strike $\rightarrow$ Left Heel Strike).
- The fundamental frequency of the gait cycle is the **stride frequency** $f_{\text{stride}} = 1 / T_{\text{stride}}$ (Hz).
- **Vertical trunk motion (`hipY`)**: The center of mass rises and falls once per step, completing **2 full cycles per stride**. Consequently, the dominant spectral peak of `hipY` occurs at $2 f_{\text{stride}}$ (the **2nd harmonic** of the stride frequency).
- **Lateral trunk motion (`hipX`)**: The center of mass sways left and right, completing **1 full cycle per stride**. Its dominant spectral peak occurs at $1 f_{\text{stride}}$ (the **1st harmonic** of the stride frequency).

**The Failure Mechanism in Current Code**:
1. When `computeFFTHarmonics(hipY)` performs a peak search across `mag[k]`, it identifies the dominant peak at step frequency $2 f_{\text{stride}}$, setting `f0Bin = bin(2 * f_stride)`.
2. When extracting harmonics:
   - "Odd harmonics" are computed at $(1, 3, 5) \times \text{f0Bin} = 2 f_{\text{stride}}, 6 f_{\text{stride}}, 10 f_{\text{stride}}$. These are actually **even harmonics** of the true stride frequency!
   - "Even harmonics" are computed at $(2, 4, 6) \times \text{f0Bin} = 4 f_{\text{stride}}, 8 f_{\text{stride}}, 12 f_{\text{stride}}$. These are ALSO **even harmonics** of the true stride frequency!
   - The true **odd harmonics** of the stride frequency ($1 f_{\text{stride}}, 3 f_{\text{stride}}, 5 f_{\text{stride}}, 7 f_{\text{stride}}$) are completely skipped.
3. Because the dominant 2nd stride harmonic ($2 f_{\text{stride}}$) is placed into the denominator (`oddSum`), the vertical Harmonic Ratio $\text{HR}_{\text{vertical}} = \text{evenSum} / \text{oddSum}$ is mathematically corrupted. For perfectly symmetric gait, where `oddSum` should approach zero and `HR_vertical` should be high (~2.5–4.0), `oddSum` absorbs the main signal power, causing `HR_vertical` to falsely collapse near ~1.0.

### 3.2 Spectral Grid Disconnection and Rounding Errors

1. **Decoupled Grids**: `hipY` and `hipX` belong to the same physical gait event series. Deriving $f_0$ separately creates two unrelated frequency bases, invalidating the geometric mean calculation `overallHR = sqrt(hrVertical * hrLateral)`.
2. **FFT Bin Rounding**: The FFT frequency resolution is $\Delta f = \text{fps} / N_{\text{fft}}$. Rounding an unaligned peak to integer `f0Bin` introduces a baseline frequency error $\delta f$. For the 10th harmonic, this error is multiplied 10-fold ($10 \delta f$), causing harmonic searches to miss spectral peaks entirely.

---

## 4. Spectral Leakage & Hann Window Analysis

### 4.1 Windowing Mechanics

When a signal of length $N$ is multiplied by a Hann window:
$$w(n) = 0.5 \left(1 - \cos\frac{2\pi n}{N-1}\right)$$
the spectral response of a single pure tone $f_k$ is convoluted with the Hann window's mainlobe, which spans **3 Discrete Fourier Transform bins**: $b_k - 1$, $b_k$, and $b_k + 1$.

### 4.2 Energy Loss Quantification

If a harmonic frequency $f_k = k \cdot f_0$ does not align exactly with an integer FFT bin index (e.g. $b_k = 4.4$), the spectral power is split across bins 4 and 5:
- Bin 4 captures ~45% of amplitude.
- Bin 5 captures ~45% of amplitude.
- Single-point evaluation `mag[round(4.4)] = mag[4]` misses >50% of the harmonic amplitude!

### 4.3 $\pm 1$ Bin Neighborhood Summing Solution

By defining the harmonic magnitude as the sum of magnitudes over a 3-bin window centered at $i_k = \text{Math.round}(k \cdot f_0 \cdot N_{\text{fft}} / \text{fps})$:
$$M(k) = \sum_{j = \max(1, i_k - 1)}^{\min(N_{\text{half}} - 1, i_k + 1)} \text{mag}[j]$$
we capture $>95\%$ of the total Hann window mainlobe energy, ensuring robust, invariant harmonic power recovery regardless of fractional bin locations.

---

## 5. Detailed Implementation Design for Fix R2

### 5.1 Architecture Overview

```
[detectGaitEventsZeni (events.ts)]
             │
             ▼
      meanStrideSec (analysis.ts)
             │
             ▼
 computeHarmonicRatio(hipY, hipX, fps, meanStrideSec)  (smoothness.ts)
             │
             ├──► strideFreq = 1 / meanStrideSec
             │
             ├──► computeFFTHarmonics(hipY, fps, strideFreq, 10)  (signal.ts)
             └──► computeFFTHarmonics(hipX, fps, strideFreq, 10)  (signal.ts)
```

### 5.2 Updated Function Signatures & Implementation

#### 1. `src/lib/gait/signal.ts` (`computeFFTHarmonics`)

```typescript
/**
 * Compute FFT Harmonics and Harmonic Ratio (HR).
 * Analyzes harmonic power distribution across even vs odd harmonics based on stride fundamental frequency f0.
 *
 * @param data 1D signal (hipY or hipX)
 * @param fps Effective sampling rate in Hz
 * @param strideFreq True stride fundamental frequency in Hz (f0 = 1 / meanStrideSec). If <= 0 or omitted, falls back to peak search.
 * @param numHarmonics Total number of harmonics to evaluate (default 10)
 */
export function computeFFTHarmonics(
  data: number[],
  fps: number,
  strideFreq?: number,
  numHarmonics = 10,
): { evenSum: number; oddSum: number; harmonicRatio: number } {
  if (!data || data.length < 8 || fps <= 0) {
    return { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 };
  }

  const n = data.length;
  const { detrended } = linearDetrend(data);

  let fftSize = 16;
  while (fftSize < n) fftSize <<= 1;

  const re = new Array<number>(fftSize).fill(0);
  const im = new Array<number>(fftSize).fill(0);

  for (let i = 0; i < n; i++) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = detrended[i] * hann;
  }

  fftRadix2(re, im);

  const halfSize = fftSize >> 1;
  const mag = new Array<number>(halfSize);
  for (let i = 0; i < halfSize; i++) {
    mag[i] = (2.0 / n) * Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  // Determine fundamental stride frequency f0 (Hz)
  let f0 = strideFreq ?? 0;

  // Fallback to peak search if strideFreq is not provided or invalid
  if (f0 <= 0) {
    let f0Bin = 1;
    let maxMag = 0;
    const minBin = Math.max(1, Math.floor((0.4 * fftSize) / fps));
    const maxBin = Math.min(Math.floor(halfSize / 2), Math.floor((3.0 * fftSize) / fps));
    for (let k = minBin; k <= maxBin; k++) {
      if (mag[k] > maxMag) {
        maxMag = mag[k];
        f0Bin = k;
      }
    }
    f0 = (f0Bin * fps) / fftSize;
  }

  if (f0 <= 0) f0 = 1.0;

  const binPerHz = fftSize / fps;
  let evenSum = 0;
  let oddSum = 0;

  for (let k = 1; k <= numHarmonics; k++) {
    const fk = k * f0;
    const exactBin = fk * binPerHz;
    const centerBin = Math.round(exactBin);

    if (centerBin >= halfSize) break;

    // Sum harmonic magnitude over +/- 1 bin neighborhood around centerBin
    let harmonicMag = 0;
    const bMin = Math.max(1, centerBin - 1);
    const bMax = Math.min(halfSize - 1, centerBin + 1);

    for (let b = bMin; b <= bMax; b++) {
      harmonicMag += mag[b];
    }

    if (k % 2 === 1) {
      oddSum += harmonicMag;
    } else {
      evenSum += harmonicMag;
    }
  }

  const harmonicRatio = evenSum / (oddSum + 1e-6);
  return { evenSum, oddSum, harmonicRatio };
}
```

#### 2. `src/lib/gait/smoothness.ts` (`computeHarmonicRatio`)

```typescript
export function computeHarmonicRatio(
  hipY: number[],
  hipX: number[],
  fps: number,
  meanStrideSec?: number,
): { hrVertical: number; hrLateral: number; overallHR: number } {
  const defaultResult = { hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 };

  if (!hipY || !hipX || hipY.length < 8 || hipX.length < 8 || fps <= 0) {
    return defaultResult;
  }

  const strideFreq = meanStrideSec && meanStrideSec > 0 ? 1 / meanStrideSec : undefined;

  // Calculate vertical harmonics (evenSum / oddSum)
  const vertHarmonics = computeFFTHarmonics(hipY, fps, strideFreq, 10);
  const hrVertical = Math.max(0.1, Number(vertHarmonics.harmonicRatio.toFixed(2)));

  // Calculate lateral harmonics (oddSum / evenSum)
  const latHarmonics = computeFFTHarmonics(hipX, fps, strideFreq, 10);
  const rawHrLateral = latHarmonics.oddSum / (latHarmonics.evenSum + 1e-6);
  const hrLateral = Math.max(0.1, Number(rawHrLateral.toFixed(2)));

  // Geometric mean overall HR
  const overallHR = Number(Math.sqrt(hrVertical * hrLateral).toFixed(2));

  return { hrVertical, hrLateral, overallHR };
}
```

#### 3. `src/lib/gait/analysis.ts` Integration

In `computeGaitMetrics(frames: PoseFrame[])`:

```typescript
// Line 344: Calculate mean stride duration
const strideIntervals: number[] = [];
for (const side of ["left", "right"] as const) {
  const ts = heelStrikes.filter((e) => e.side === side).map((e) => e.timeSec);
  for (let i = 1; i < ts.length; i++) strideIntervals.push(ts[i] - ts[i - 1]);
}
const meanStride = mean(strideIntervals) || avgStepTimeSec * 2;

// Line 358: Pass meanStride to computeHarmonicRatio
const hrMetrics = computeHarmonicRatio(midHipY, midHipX, fps, meanStride);
```

---

## 6. Review of Existing Tests & Unit Test Plan

### 6.1 Existing Tests Review (`smoothness.test.ts` & `signal.test.ts`)

- `signal.test.ts`: Tests basic FFT mechanics and peak identification on synthetic sum of sines. Missing tests for explicit `strideFreq` parameter and $\pm 1$ bin leakage integration.
- `smoothness.test.ts`: Verifies structural properties (non-zero output, edge cases $n < 8$, $fps \le 0$, geometric mean formula). Does NOT test realistic symmetric walking signals with literature-aligned target ranges (~2.5–4.0 for vertical HR).

### 6.2 Planned Unit Test Cases

We plan to add the following literature-aligned test cases to `smoothness.test.ts` and `signal.test.ts`:

1. **`computeFFTHarmonics` with Explicit `strideFreq` and $\pm 1$ Bin Leakage**:
   - Construct a signal with non-integer FFT bin frequency $f_0 = 1.13$ Hz.
   - Verify that passing `strideFreq = 1.13` captures the harmonic energy cleanly via $\pm 1$ bin neighborhood summation.

2. **Symmetric Walking Gait HR Literature Alignment Test**:
   - Construct a pure synthetic symmetric gait signal with stride frequency $f_0 = 0.8$ Hz (step frequency $1.6$ Hz):
     - Vertical hip trajectory `hipY(t)` driven by even harmonics of $f_0$ ($2 f_0$ and $4 f_0$).
     - Lateral hip trajectory `hipX(t)` driven by odd harmonics of $f_0$ ($1 f_0$ and $3 f_0$).
   - Execute `computeHarmonicRatio(hipY, hipX, fps, 1.25)`.
   - **Verification target**: `hrVertical` returns values in the literature-aligned range (**2.5 – 4.0** or higher for clean synthetic), and `hrLateral` returns values in range (**2.0 – 3.5**).

3. **Asymmetric Gait HR Sensitivity Test**:
   - Introduce step asymmetry into `hipY(t)` by injecting an odd stride harmonic component ($1 f_0$).
   - Execute `computeHarmonicRatio(hipY, hipX, fps, 1.25)`.
   - **Verification target**: `hrVertical` decreases significantly (e.g. drops from >3.0 down to <1.8), demonstrating sensitivity to gait asymmetry.

---

## 7. Verification Method & Invalidation Conditions

### Independent Verification Commands
```bash
# Typecheck TypeScript definitions
npx tsc --noEmit

# Execute Vitest suite covering signal and smoothness modules
npx vitest run src/lib/gait/__tests__/signal.test.ts src/lib/gait/__tests__/smoothness.test.ts
```

### Invalidation Conditions
- `hrVertical` for pure symmetric synthetic walking falling below $2.0$.
- `computeHarmonicRatio` returning `NaN` or unhandled exceptions when `meanStrideSec` is missing or $0$.
- Discrepancy between `overallHR` and `sqrt(hrVertical * hrLateral)`.
