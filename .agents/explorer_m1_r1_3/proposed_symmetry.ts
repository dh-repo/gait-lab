/**
 * Zifchock's Symmetry Angle (SA) and Gait Symmetry Index (GSI).
 * 
 * Literature References:
 * - Zifchock, R. A., Davis, I., Higginson, J., & Royer, T. (2008).
 *   The symmetry angle: a novel, robust method of quantifying asymmetry.
 *   Gait & Posture, 27(4), 622-627.
 * - Robinson, R. O., Herzog, W., & Nigg, B. M. (1987).
 *   Use of force platform variables to quantify the effects of chiropractic manipulation on gait symmetry.
 *   Journal of Manipulative and Physiological Therapeutics, 10(4), 172-176.
 */

/**
 * Calculates Zifchock's Symmetry Angle (SA).
 * Formula: SA = (|45° - atan(valLeft / valRight)| / 90°) * 100%
 * Handles cases where valLeft/valRight > 1 or negative/zero values.
 * Returns SA in percentage [0, 100]%. Perfect symmetry = 0%.
 */
export function symmetryAngle(valLeft: number, valRight: number): number {
  const absLeft = Math.abs(valLeft);
  const absRight = Math.abs(valRight);

  // Both zero or near-zero -> perfectly symmetric (0%)
  if (absLeft < 1e-6 && absRight < 1e-6) return 0;
  // One zero, one non-zero -> max quadrant asymmetry (50%)
  if (absLeft < 1e-6 || absRight < 1e-6) return 50;

  // atan(X_L / X_R) in degrees
  const angleRad = Math.atan(absLeft / absRight);
  const angleDeg = angleRad * (180 / Math.PI);

  // Deviation from 45 degree line of symmetry
  const sa = (Math.abs(45 - angleDeg) / 90) * 100;
  return Math.min(100, Math.max(0, sa));
}

/**
 * Calculates Gait Symmetry Index (GSI).
 * GSI represents the ratio of the smaller value to the larger value as a percentage.
 * Returns GSI in percentage [0, 100]%. Perfect symmetry = 100%.
 */
export function gaitSymmetryIndex(valLeft: number, valRight: number): number {
  const absLeft = Math.abs(valLeft);
  const absRight = Math.abs(valRight);

  if (absLeft < 1e-6 && absRight < 1e-6) return 100;

  const maxVal = Math.max(absLeft, absRight);
  const minVal = Math.min(absLeft, absRight);

  if (maxVal < 1e-6) return 100;

  return (minVal / maxVal) * 100;
}
