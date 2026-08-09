/**
 * Proposed Fix for R2 Audit Finding: Harmonic Ratio (HR) & Fundamental Frequency (f0)
 *
 * Files affected:
 * 1. src/lib/gait/signal.ts (computeFFTHarmonics)
 * 2. src/lib/gait/smoothness.ts (computeHarmonicRatio)
 * 3. src/lib/gait/analysis.ts (computeGaitMetrics)
 */

// ============================================================================
// Proposed Changes for src/lib/gait/signal.ts (computeFFTHarmonics)
// ============================================================================

/**
 * Compute FFT Harmonics and Harmonic Ratio (HR).
 * Analyzes harmonic power distribution across even vs odd harmonics based on stride fundamental frequency f0.
 *
 * @param data 1D displacement/acceleration signal (e.g. hipY or hipX)
 * @param fps Effective sampling rate in Hz
 * @param strideFreq True stride fundamental frequency in Hz (f0 = 1 / meanStrideSec). If <= 0 or omitted, falls back to peak search.
 * @param numHarmonics Total number of harmonics to evaluate (default 10)
 */
export function computeFFTHarmonicsProposed(
  data: number[],
  fps: number,
  strideFreq?: number,
  numHarmonics = 10,
): { evenSum: number; oddSum: number; harmonicRatio: number } {
  if (!data || data.length < 8 || fps <= 0) {
    return { evenSum: 0, oddSum: 0, harmonicRatio: 1.0 };
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

  // Execute Radix-2 FFT
  fftRadix2(re, im);

  // Magnitude spectrum up to Nyquist
  const halfSize = fftSize >> 1;
  const mag = new Array<number>(halfSize);
  for (let i = 0; i < halfSize; i++) {
    mag[i] = (2.0 / n) * Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  }

  // Determine fundamental stride frequency f0 (Hz)
  let f0 = strideFreq ?? 0;

  // Fallback to peak detection if strideFreq is not provided or invalid
  if (f0 <= 0) {
    let f0Bin = 1;
    let maxMag = 0;
    const minBin = Math.max(1, Math.floor((0.4 * fftSize) / fps)); // ~0.4 Hz min
    const maxBin = Math.min(Math.floor(halfSize / 2), Math.floor((3.0 * fftSize) / fps)); // ~3.0 Hz max
    for (let k = minBin; k <= maxBin; k++) {
      if (mag[k] > maxMag) {
        maxMag = mag[k];
        f0Bin = k;
      }
    }
    f0 = (f0Bin * fps) / fftSize;
  }

  if (f0 <= 0) {
    f0 = 1.0; // Ultimate fallback
  }

  const binPerHz = fftSize / fps;

  let evenSum = 0;
  let oddSum = 0;

  // Evaluate harmonics k = 1..numHarmonics
  for (let k = 1; k <= numHarmonics; k++) {
    const fk = k * f0;
    const exactBin = fk * binPerHz;
    const centerBin = Math.round(exactBin);

    if (centerBin >= halfSize) break;

    // Sum harmonic magnitude over +/- 1 bin neighborhood around centerBin to account for Hann window leakage
    let harmonicMag = 0;
    const bMin = Math.max(1, centerBin - 1);
    const bMax = Math.min(halfSize - 1, centerBin + 1);

    for (let b = bMin; b <= bMax; b++) {
      harmonicMag += mag[b];
    }

    // Classify harmonic k: odd (1, 3, 5...) vs even (2, 4, 6...)
    if (k % 2 === 1) {
      oddSum += harmonicMag;
    } else {
      evenSum += harmonicMag;
    }
  }

  const harmonicRatio = evenSum / (oddSum + 1e-6);

  return { evenSum, oddSum, harmonicRatio };
}


// ============================================================================
// Proposed Changes for src/lib/gait/smoothness.ts (computeHarmonicRatio)
// ============================================================================

/**
 * Trunk Smoothness & Rhythmicity Assessment via Harmonic Ratio (HR).
 *
 * Biomechanical Principles (Menz et al. 2003, Bellanca et al. 2013, Pasciuto et al. 2015):
 * - Stride Fundamental Frequency f0 = 1 / meanStrideSec.
 * - Vertical Trunk Displacement (hipY): Completes 2 cycles per stride.
 *   Even harmonics of f0 (2, 4, 6...) correspond to step symmetry.
 *   Odd harmonics of f0 (1, 3, 5...) correspond to step asymmetry.
 *   HR_vertical = Sum(Even Harmonics) / Sum(Odd Harmonics)
 *
 * - Lateral Trunk Displacement (hipX): Completes 1 cycle per stride.
 *   Odd harmonics of f0 (1, 3, 5...) correspond to regular sway.
 *   Even harmonics of f0 (2, 4, 6...) correspond to lateral wobble/instability.
 *   HR_lateral = Sum(Odd Harmonics) / Sum(Even Harmonics)
 *
 * - Overall HR = sqrt(HR_vertical * HR_lateral) [Geometric Mean]
 *
 * @param hipY Time-series of mid-hip vertical displacement (Y)
 * @param hipX Time-series of mid-hip lateral displacement (X)
 * @param fps Effective frame rate in frames per second
 * @param meanStrideSec Average stride duration in seconds (derived from gait event detection)
 * @returns Object containing hrVertical, hrLateral, and overallHR
 */
export function computeHarmonicRatioProposed(
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
  const vertHarmonics = computeFFTHarmonicsProposed(hipY, fps, strideFreq, 10);
  const hrVertical = Math.max(0.1, Number(vertHarmonics.harmonicRatio.toFixed(2)));

  // Calculate lateral harmonics (oddSum / evenSum)
  const latHarmonics = computeFFTHarmonicsProposed(hipX, fps, strideFreq, 10);
  const rawHrLateral = latHarmonics.oddSum / (latHarmonics.evenSum + 1e-6);
  const hrLateral = Math.max(0.1, Number(rawHrLateral.toFixed(2)));

  // Geometric mean overall HR
  const overallHR = Number(Math.sqrt(hrVertical * hrLateral).toFixed(2));

  return { hrVertical, hrLateral, overallHR };
}
