/**
 * Gait Symmetry Calculation Module
 *
 * Implements:
 * 1. Zifchock Symmetry Angle (SA) - Reference-free gait asymmetry metric (Zifchock et al. 2008)
 * 2. Gait Symmetry Index (GSI) - Ratio of min/max limb metrics
 */

/**
 * Zifchock's Symmetry Angle (SA).
 * Quantifies asymmetry in percentage [0, 100]% independently of reference limb selection.
 *
 * SA = (|45deg - arctan(valLeft / valRight)| / 90deg) * 100%
 *
 * @param valLeft Metric value for left limb
 * @param valRight Metric value for right limb
 * @returns Symmetry Angle percentage [0, 100]% (0% = perfect symmetry)
 */
export function symmetryAngle(valLeft: number, valRight: number): number {
  const absL = Math.abs(valLeft);
  const absR = Math.abs(valRight);

  // If both magnitudes are essentially zero, gait is perfectly symmetric
  if (absL < 1e-6 && absR < 1e-6) {
    return 0.0;
  }

  // Angle in degrees from positive x-axis (valRight) to y-axis (valLeft)
  const thetaRad = Math.atan2(absL, absR);
  let thetaDeg = (thetaRad * 180) / Math.PI;

  // Handle angle wrapping / quadrant check if needed
  if (thetaDeg > 90) {
    thetaDeg = 180 - thetaDeg;
  }

  const rawSA = (Math.abs(45 - thetaDeg) / 90) * 100;

  // Clamp to valid range [0, 100]%
  const clampedSA = Math.max(0.0, Math.min(100.0, rawSA));
  return Number(clampedSA.toFixed(2));
}

/**
 * Gait Symmetry Index (GSI).
 *
 * NOTE: This is a literature utility (Robinson-style ratio symmetry index) retained
 * with unit coverage in `__tests__/symmetry.test.ts`. It is NOT currently consumed by
 * the analysis pipeline — no production caller exists in `src/`. Do not read its
 * presence as wired behaviour; `symmetryAngle` is the index the engine actually uses.
 * Computes simple ratio of smaller limb magnitude to larger limb magnitude in percentage [0, 100]%.
 *
 * GSI = (min(|valLeft|, |valRight|) / max(|valLeft|, |valRight|)) * 100%
 *
 * @param valLeft Metric value for left limb
 * @param valRight Metric value for right limb
 * @returns Gait Symmetry Index percentage [0, 100]% (100% = perfect symmetry)
 */
export function gaitSymmetryIndex(valLeft: number, valRight: number): number {
  const absL = Math.abs(valLeft);
  const absR = Math.abs(valRight);

  const maxVal = Math.max(absL, absR);
  const minVal = Math.min(absL, absR);

  if (maxVal < 1e-6) {
    return 100.0;
  }

  const rawGSI = (minVal / maxVal) * 100;
  const clampedGSI = Math.max(0.0, Math.min(100.0, rawGSI));
  return Number(clampedGSI.toFixed(2));
}
