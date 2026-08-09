import { computeFFTHarmonics } from "./signal";

/**
 * Trunk Smoothness & Rhythmicity Assessment via Harmonic Ratio (HR).
 *
 * Biomechanical Principles (Menz et al. 2003, Bellanca et al. 2013):
 * - Vertical Trunk Displacement (hipY): Completes 2 cycles per stride (1 per step).
 *   Even harmonics (2nd, 4th, 6th...) represent step symmetry/rhythmicity;
 *   odd harmonics represent step asymmetry.
 *   HR_vertical = Sum(Even Harmonics) / Sum(Odd Harmonics)
 *
 * - Lateral Trunk Displacement (hipX): Completes 1 cycle per stride (sway left then right).
 *   Odd harmonics (1st, 3rd, 5th...) represent stride rhythmicity;
 *   even harmonics represent lateral instability/wobble.
 *   HR_lateral = Sum(Odd Harmonics) / Sum(Even Harmonics)
 *
 * - Overall HR = sqrt(HR_vertical * HR_lateral) [Geometric Mean]
 *
 * @param hipY Time-series of mid-hip vertical displacement (Y)
 * @param hipX Time-series of mid-hip lateral displacement (X)
 * @param fps Effective frame rate in frames per second
 * @returns Object containing hrVertical, hrLateral, and overallHR
 */
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
