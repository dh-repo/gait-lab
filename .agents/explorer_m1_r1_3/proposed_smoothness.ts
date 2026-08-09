import { computeFFTHarmonics } from "./signal";

/**
 * Harmonic Ratio (HR) & Gait Smoothness Assessment.
 * 
 * Literature References:
 * - Menz, H. B., Lord, S. R., & Fitzpatrick, R. C. (2003).
 *   Acceleration patterns of the head and pelvis when walking on level and irregular surfaces.
 *   Gait & Posture, 18(1), 35-46.
 * - Bellanca, J. L., et al. (2013).
 *   Harmonic ratio: a review of methodologic variations in gait analysis.
 *   Journal of Biomechanics, 46(11), 1805-1810.
 * - Pasciuto, I., et al. (2015).
 *   Harmonic ratio calculation for gait smoothness assessment.
 *   Results in Physics, 5, 203-204.
 */

export interface HarmonicRatioResult {
  hrVertical: number;
  hrLateral: number;
  overallHR: number;
}

/**
 * Computes Trunk Harmonic Ratio (HR) via FFT for vertical and lateral trajectories.
 * 
 * - Vertical (hipY): dominant rhythm is step frequency (even harmonics).
 *   hrVertical = sum(even harmonics) / sum(odd harmonics)
 * - Lateral (hipX): dominant rhythm is stride frequency (odd harmonics).
 *   hrLateral = sum(odd harmonics) / sum(even harmonics)
 * - overallHR = geometric mean sqrt(hrVertical * hrLateral)
 */
export function computeHarmonicRatio(
  hipY: number[],
  hipX: number[],
  fps: number
): HarmonicRatioResult {
  // Insufficient data points for meaningful FFT harmonic decomposition
  if (!hipY || !hipX || hipY.length < 16 || hipX.length < 16) {
    return { hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 };
  }

  // Compute FFT harmonics (up to 10 harmonics)
  const vertHarmonics = computeFFTHarmonics(hipY, 10);
  const latHarmonics = computeFFTHarmonics(hipX, 10);

  // Vertical: Even harmonics / Odd harmonics
  const hrVertical =
    vertHarmonics.oddSum > 1e-6
      ? vertHarmonics.evenSum / vertHarmonics.oddSum
      : vertHarmonics.evenSum > 1e-6
      ? 10.0
      : 1.0;

  // Lateral: Odd harmonics / Even harmonics
  const hrLateral =
    latHarmonics.evenSum > 1e-6
      ? latHarmonics.oddSum / latHarmonics.evenSum
      : latHarmonics.oddSum > 1e-6
      ? 10.0
      : 1.0;

  // Ensure positive values
  const safeVert = Math.max(0.01, hrVertical);
  const safeLat = Math.max(0.01, hrLateral);

  // Overall HR as geometric mean
  const overallHR = Math.sqrt(safeVert * safeLat);

  return {
    hrVertical: Number(safeVert.toFixed(4)),
    hrLateral: Number(safeLat.toFixed(4)),
    overallHR: Number(overallHR.toFixed(4)),
  };
}
