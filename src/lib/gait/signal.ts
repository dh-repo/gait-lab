/**
 * Scientific Signal Processing Module for Gait Analysis
 *
 * Implements:
 * 1. 4th-Order Zero-Phase Low-Pass Butterworth Filter (fc = 6.0 Hz default)
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
  if (n === 0) return [];
  const out = new Array<number>(n);
  const { b0, b1, b2, a1, a2 } = coeffs;

  const initVal = Number.isFinite(data[0]) ? data[0] : 0;
  let x1 = initVal;
  let x2 = initVal;
  let y1 = initVal;
  let y2 = initVal;

  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(data[i]) ? data[i] : 0;
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
 * Ordinary Least Squares (OLS) Linear Detrending.
 * Removes linear trend from input data array.
 */
export function olsDetrend(data: number[]): number[] {
  if (!data || data.length < 2) return data ? data.slice() : [];
  const n = data.length;
  const xMean = (n - 1) / 2;
  let ySum = 0;
  for (let i = 0; i < n; i++) {
    ySum += Number.isFinite(data[i]) ? data[i] : 0;
  }
  const yMean = ySum / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const yVal = Number.isFinite(data[i]) ? data[i] : 0;
    const xDiff = i - xMean;
    num += xDiff * (yVal - yMean);
    den += xDiff * xDiff;
  }
  const slope = den !== 0 ? num / den : 0;
  return data.map((y, i) => {
    const yVal = Number.isFinite(y) ? y : 0;
    return yVal - (yMean + slope * (i - xMean));
  });
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
  const padLen = Math.min(24, n - 1);

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


