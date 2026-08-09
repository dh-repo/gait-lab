/**
 * Scientific Signal Processing Module for Gait Analysis
 *
 * Implements:
 * 1. 4th-Order Zero-Phase Low-Pass Butterworth Filter (fc = 6.0 Hz default)
 * 2. Linear Detrending via Ordinary Least Squares (OLS)
 * 3. Cooley-Tukey Radix-2 FFT and Harmonic Decomposition
 */

/**
 * 2nd-order Biquad Filter Section (Direct Form I / II Transposed)
 */
interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/**
 * Compute Biquad Coefficients for a low-pass filter stage.
 */
function computeBiquadLowPass(fps: number, cutoffHz: number, Q: number): BiquadCoeffs {
  // Cap cutoff frequency below Nyquist limit
  const nyquist = fps / 2;
  const fc = Math.min(cutoffHz, nyquist * 0.95);
  const K = Math.tan((Math.PI * fc) / fps);
  const norm = 1 + K / Q + K * K;

  const b0 = (K * K) / norm;
  const b1 = (2 * K * K) / norm;
  const b2 = (K * K) / norm;
  const a1 = (2 * (K * K - 1)) / norm;
  const a2 = (1 - K / Q + K * K) / norm;

  return { b0, b1, b2, a1, a2 };
}

/**
 * Apply a single Biquad filter stage to a data array.
 */
function applyBiquad(data: number[], coeffs: BiquadCoeffs): number[] {
  const n = data.length;
  const out = new Array<number>(n);
  const { b0, b1, b2, a1, a2 } = coeffs;

  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  for (let i = 0; i < n; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;

    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }

  return out;
}

/**
 * Causal 4th-Order Low-Pass Butterworth Digital Filter.
 * Formed by cascading two 2nd-order biquad stages with Butterworth pole Q values:
 * Q1 = 1 / (2 * cos(pi / 8)) ≈ 0.5411961
 * Q2 = 1 / (2 * cos(3 * pi / 8)) ≈ 1.3065630
 */
export function butterworthLowPass(
  data: number[],
  fps: number,
  cutoffHz = 6.0,
): number[] {
  if (!data || data.length < 5 || fps <= 0) {
    return data ? [...data.map((v) => (Number.isFinite(v) ? v : 0))] : [];
  }

  // Sanitize non-finite values
  const cleanData = data.map((v) => (Number.isFinite(v) ? v : 0));

  const Q1 = 1 / (2 * Math.cos(Math.PI / 8));
  const Q2 = 1 / (2 * Math.cos((3 * Math.PI) / 8));

  const coeffs1 = computeBiquadLowPass(fps, cutoffHz, Q1);
  const coeffs2 = computeBiquadLowPass(fps, cutoffHz, Q2);

  const stage1 = applyBiquad(cleanData, coeffs1);
  const stage2 = applyBiquad(stage1, coeffs2);
  return stage2.map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * Zero-Phase 4th-Order Low-Pass Butterworth Digital Filter (filtfilt equivalent).
 * Applies forward filtering, array reversal, backward filtering, and boundary padding
 * to eliminate phase delay/distortion.
 */
export function zeroPhaseButterworth(
  data: number[],
  fps: number,
  cutoffHz = 6.0,
): number[] {
  if (!data || data.length < 5 || fps <= 0) {
    return data ? [...data.map((v) => (Number.isFinite(v) ? v : 0))] : [];
  }

  const cleanData = data.map((v) => (Number.isFinite(v) ? v : 0));
  const n = cleanData.length;
  const padLen = Math.min(12, n - 1);

  // Boundary reflection padding
  const padded = new Array<number>(n + 2 * padLen);

  // Left padding: reflection around data[0]
  for (let i = 0; i < padLen; i++) {
    padded[i] = 2 * cleanData[0] - cleanData[padLen - i];
  }

  // Original data
  for (let i = 0; i < n; i++) {
    padded[padLen + i] = cleanData[i];
  }

  // Right padding: reflection around data[n - 1]
  for (let i = 0; i < padLen; i++) {
    padded[padLen + n + i] = 2 * cleanData[n - 1] - cleanData[n - 2 - i];
  }

  // Forward pass
  const forwardFiltered = butterworthLowPass(padded, fps, cutoffHz);

  // Reverse array
  const reversed = forwardFiltered.reverse();

  // Backward pass
  const backwardFiltered = butterworthLowPass(reversed, fps, cutoffHz);

  // Re-reverse array
  const finalFiltered = backwardFiltered.reverse();

  // Extract unpadded slice
  return finalFiltered.slice(padLen, padLen + n).map((v) => (Number.isFinite(v) ? v : 0));
}

/**
 * Linear Detrending using Ordinary Least Squares (OLS).
 * Removes linear baseline trend y = alpha + beta * i from a 1D signal.
 */
export function linearDetrend(data: number[]): {
  detrended: number[];
  trend: (i: number) => number;
} {
  if (!data || data.length === 0) {
    return { detrended: [], trend: () => 0 };
  }

  const n = data.length;
  if (n === 1) {
    const val = data[0];
    return { detrended: [0], trend: () => val };
  }

  let sumI = 0;
  let sumY = 0;
  let sumII = 0;
  let sumIY = 0;

  for (let i = 0; i < n; i++) {
    const y = data[i];
    sumI += i;
    sumY += y;
    sumII += i * i;
    sumIY += i * y;
  }

  const denom = n * sumII - sumI * sumI;
  let beta = 0;
  let alpha = sumY / n;

  if (Math.abs(denom) > 1e-12) {
    beta = (n * sumIY - sumI * sumY) / denom;
    alpha = (sumY - beta * sumI) / n;
  }

  const trendFn = (i: number) => alpha + beta * i;
  const detrended = data.map((y, i) => y - trendFn(i));

  return { detrended, trend: trendFn };
}

/**
 * Cooley-Tukey Radix-2 Complex FFT implementation.
 */
function fftRadix2(re: number[], im: number[]): void {
  const n = re.length;

  // Bit reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tempR = re[i];
      const tempI = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tempR;
      im[j] = tempI;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Iterative Cooley-Tukey
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;

      for (let k = 0; k < halfLen; k++) {
        const posEven = i + k;
        const posOdd = i + k + halfLen;

        const uR = re[posEven];
        const uI = im[posEven];

        const vR = re[posOdd] * wR - im[posOdd] * wI;
        const vI = re[posOdd] * wI + im[posOdd] * wR;

        re[posEven] = uR + vR;
        im[posEven] = uI + vI;

        re[posOdd] = uR - vR;
        im[posOdd] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        const nextWI = wR * wStepI + wI * wStepR;
        wR = nextWR;
        wI = nextWI;
      }
    }
  }
}

/**
 * Compute FFT Harmonics and Harmonic Ratio (HR).
 * Analyzes harmonic power distribution across even vs odd harmonics.
 *
 * @param data 1D signal (hipY or hipX)
 * @param fps Effective sampling rate in Hz
 * @param strideFreq True stride fundamental frequency in Hz (f0 = 1 / meanStrideSec). If <= 0 or omitted, falls back to peak search.
 * @param numHarmonics Total number of harmonics to evaluate (default 10)
 */
export function computeFFTHarmonics(
  data: number[],
  fps?: number,
  strideFreq?: number,
  numHarmonics = 10,
): { evenSum: number; oddSum: number; harmonicRatio: number } {
  if (!data || data.length < 8) {
    return { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 };
  }

  let effectiveNumHarmonics = numHarmonics;
  let effectiveFps = fps;
  const effectiveStrideFreq = strideFreq;

  if (typeof fps === "number" && fps <= 16 && strideFreq === undefined) {
    effectiveNumHarmonics = fps;
    effectiveFps = undefined;
  }

  const n = data.length;

  // Linear detrending before windowing
  const { detrended } = linearDetrend(data);

  // Next power of 2 for zero-padding
  let fftSize = 16;
  while (fftSize < n) {
    fftSize <<= 1;
  }

  const re = new Array<number>(fftSize).fill(0);
  const im = new Array<number>(fftSize).fill(0);

  // Apply Hann window
  for (let i = 0; i < n; i++) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re[i] = detrended[i] * hann;
  }

  // Execute FFT
  fftRadix2(re, im);

  // Magnitude spectrum up to Nyquist
  const halfSize = fftSize >> 1;
  const mag = new Array<number>(halfSize);
  for (let i = 0; i < halfSize; i++) {
    mag[i] = (2.0 / n) * Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  // Determine fundamental stride frequency f0 (Hz) and f0Bin
  let f0 = 0;
  let f0Bin = 1;

  if (effectiveStrideFreq && effectiveStrideFreq > 0) {
    f0 = effectiveStrideFreq;
    const samplingFps = effectiveFps && effectiveFps > 0 ? effectiveFps : 30;
    f0Bin = Math.max(1, Math.round((f0 * fftSize) / samplingFps));
  } else {
    // Fallback to dominant peak bin search in lower frequency range (1..fftSize/4)
    let maxMag = 0;
    const maxSearchBin = Math.min(Math.floor(halfSize / 2), Math.floor(fftSize / 4));
    for (let k = 1; k < maxSearchBin; k++) {
      if (mag[k] > maxMag) {
        maxMag = mag[k];
        f0Bin = k;
      }
    }
    const samplingFps = effectiveFps && effectiveFps > 0 ? effectiveFps : 30;
    f0 = (f0Bin * samplingFps) / fftSize;
  }

  if (f0 <= 0) f0 = 1.0;
  const samplingFps = effectiveFps && effectiveFps > 0 ? effectiveFps : 30;
  const binPerHz = fftSize / samplingFps;

  let evenSum = 0;
  let oddSum = 0;

  for (let k = 1; k <= effectiveNumHarmonics; k++) {
    const fk = k * f0;
    const exactBin = fk * binPerHz;
    const centerBin = Math.round(exactBin);

    if (centerBin >= halfSize) break;

    // Sum harmonic magnitude over +/- 1 bin neighborhood around centerBin to capture Hann window spectral leakage
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
