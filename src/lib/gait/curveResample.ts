/**
 * Gait-cycle curve resampling.
 *
 * Joint-angle curves are stored as arrays of points carrying their own
 * `gaitCyclePct`. Consumers that index those arrays positionally silently
 * misalign two curves of different length. These helpers project any curve
 * onto a fixed integer percent-of-gait-cycle grid so element `i` of two
 * resampled curves always refers to the same percentage.
 *
 * Pure geometry: linear interpolation only. No smoothing, no clamping,
 * no padding by repetition, no invented constants.
 */

import type { JointAnglePoint, NormativeRangePoint } from "./angles";

/** Angle fields carried by a JointAnglePoint. */
export const JOINT_ANGLE_FIELDS = [
  "kneeAngleLeft",
  "kneeAngleRight",
  "hipAngleLeft",
  "hipAngleRight",
  "ankleAngleLeft",
  "ankleAngleRight",
] as const;

/** Band fields carried by a NormativeRangePoint. */
export const NORMATIVE_RANGE_FIELDS = [
  "kneeMean",
  "kneeMin",
  "kneeMax",
  "hipMean",
  "hipMin",
  "hipMax",
  "ankleMean",
  "ankleMin",
  "ankleMax",
] as const;

/** A JointAnglePoint sampled exactly on the resampling grid. */
export type ResampledAnglePoint = JointAnglePoint;

/**
 * A NormativeRangePoint sampled on the grid. Bands become nullable because a
 * grid position that is not bracketed by two defined samples has no defined
 * value, and substituting 0 would draw a false band.
 */
export interface ResampledNormativePoint {
  gaitCyclePct: number;
  kneeMean: number | null;
  kneeMin: number | null;
  kneeMax: number | null;
  hipMean: number | null;
  hipMin: number | null;
  hipMax: number | null;
  ankleMean: number | null;
  ankleMin: number | null;
  ankleMax: number | null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Source percentage for point `index`. Uses the point's own `gaitCyclePct`
 * when the curve carries usable percentages; otherwise falls back to an
 * index-derived percentage spanning 0..100.
 */
function sourcePct(
  pct: unknown,
  index: number,
  length: number,
  useOwnPct: boolean,
): number {
  if (useOwnPct && isFiniteNumber(pct)) return pct;
  return length <= 1 ? 0 : (index * 100) / (length - 1);
}

/** True when at least one point carries a finite `gaitCyclePct`. */
function hasOwnPercentages(points: ReadonlyArray<{ gaitCyclePct?: unknown }>): boolean {
  return points.some((p) => isFiniteNumber(p.gaitCyclePct));
}

/**
 * Locates the bracketing source indices for a target percentage and returns
 * the interpolation weight. Assumes source percentages are non-decreasing,
 * which the normalization step in angles.ts guarantees.
 */
interface Bracket {
  lo: number;
  hi: number;
  /** 0 at `lo`, 1 at `hi`. */
  t: number;
}

function bracketFor(pcts: number[], target: number): Bracket {
  const n = pcts.length;
  if (n === 1) return { lo: 0, hi: 0, t: 0 };
  if (target <= pcts[0]) return { lo: 0, hi: 0, t: 0 };
  if (target >= pcts[n - 1]) return { lo: n - 1, hi: n - 1, t: 0 };

  // Binary search for the last index whose pct is <= target.
  let low = 0;
  let high = n - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (pcts[mid] <= target) low = mid;
    else high = mid;
  }
  const span = pcts[high] - pcts[low];
  const t = span > 0 ? (target - pcts[low]) / span : 0;
  return { lo: low, hi: high, t };
}

/** Linear interpolation between two possibly-null neighbours. */
function lerpNullable(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number,
): number | null {
  if (!isFiniteNumber(a) || !isFiniteNumber(b)) return null;
  if (t === 0) return a;
  if (t === 1) return b;
  return a + (b - a) * t;
}

function gridPercentages(gridSize: number): number[] {
  if (gridSize <= 1) return [0];
  return Array.from({ length: gridSize }, (_, i) => (i * 100) / (gridSize - 1));
}

/**
 * Resamples a joint-angle curve onto a fixed 0..100 grid of `gridSize` points,
 * where element `i` corresponds to `gaitCyclePct = i * 100 / (gridSize - 1)`.
 *
 * - Values are linearly interpolated between the two bracketing source points
 *   on their own `gaitCyclePct` values.
 * - If either bracketing value is null/undefined/non-finite, the output field
 *   is `null` (never 0, never the last defined sample).
 * - An empty input returns an empty array.
 */
export function resampleAngleCurve(
  points: readonly JointAnglePoint[],
  gridSize = 101,
): ResampledAnglePoint[] {
  if (points.length === 0) return [];
  const size = Math.max(1, Math.floor(gridSize));

  const useOwnPct = hasOwnPercentages(points);
  const srcPcts = points.map((p, i) =>
    sourcePct(p.gaitCyclePct, i, points.length, useOwnPct),
  );

  return gridPercentages(size).map((target) => {
    const { lo, hi, t } = bracketFor(srcPcts, target);
    const a = points[lo];
    const b = points[hi];
    const out: ResampledAnglePoint = {
      gaitCyclePct: target,
      kneeAngleLeft: null,
      kneeAngleRight: null,
      hipAngleLeft: null,
      hipAngleRight: null,
      ankleAngleLeft: null,
      ankleAngleRight: null,
    };
    for (const field of JOINT_ANGLE_FIELDS) {
      out[field] = lerpNullable(a[field], b[field], t);
    }
    return out;
  });
}

/**
 * Resamples a normative band curve onto the same grid as
 * {@link resampleAngleCurve}, with identical interpolation and null rules.
 */
export function resampleNormativeCurve(
  points: readonly NormativeRangePoint[],
  gridSize = 101,
): ResampledNormativePoint[] {
  if (points.length === 0) return [];
  const size = Math.max(1, Math.floor(gridSize));

  const useOwnPct = hasOwnPercentages(points);
  const srcPcts = points.map((p, i) =>
    sourcePct(p.gaitCyclePct, i, points.length, useOwnPct),
  );

  return gridPercentages(size).map((target) => {
    const { lo, hi, t } = bracketFor(srcPcts, target);
    const a = points[lo];
    const b = points[hi];
    const out: ResampledNormativePoint = {
      gaitCyclePct: target,
      kneeMean: null,
      kneeMin: null,
      kneeMax: null,
      hipMean: null,
      hipMin: null,
      hipMax: null,
      ankleMean: null,
      ankleMin: null,
      ankleMax: null,
    };
    for (const field of NORMATIVE_RANGE_FIELDS) {
      out[field] = lerpNullable(a[field], b[field], t);
    }
    return out;
  });
}
