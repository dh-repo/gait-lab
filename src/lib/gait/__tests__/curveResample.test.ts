import { describe, it, expect } from "vitest";
import type { JointAnglePoint, NormativeRangePoint } from "../angles";
import {
  resampleAngleCurve,
  resampleNormativeCurve,
} from "../curveResample";

/** Builds a curve of `n` points spanning 0..100% with a linear knee ramp. */
function linearCurve(n: number): JointAnglePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const pct = n === 1 ? 0 : (i * 100) / (n - 1);
    return {
      gaitCyclePct: pct,
      // Knee is a pure linear function of percentage, so any correct
      // interpolation must reproduce it exactly on the target grid.
      kneeAngleLeft: pct,
      kneeAngleRight: 100 - pct,
      hipAngleLeft: pct / 2,
      hipAngleRight: null,
      ankleAngleLeft: null,
      ankleAngleRight: null,
    };
  });
}

function normativeCurve(n: number): NormativeRangePoint[] {
  return Array.from({ length: n }, (_, i) => {
    const pct = n === 1 ? 0 : (i * 100) / (n - 1);
    return {
      gaitCyclePct: pct,
      kneeMean: pct,
      kneeMin: pct - 5,
      kneeMax: pct + 5,
      hipMean: pct / 2,
      hipMin: pct / 2 - 3,
      hipMax: pct / 2 + 3,
      ankleMean: -pct / 4,
      ankleMin: -pct / 4 - 2,
      ankleMax: -pct / 4 + 2,
    };
  });
}

describe("Gait cycle curve resampling (curveResample.ts)", () => {
  describe("resampleAngleCurve", () => {
    it("produces a 101-length grid from 50-, 150-, and 101-point inputs", () => {
      for (const n of [50, 150, 101]) {
        const out = resampleAngleCurve(linearCurve(n));
        expect(out).toHaveLength(101);
        expect(out[0].gaitCyclePct).toBe(0);
        expect(out[100].gaitCyclePct).toBe(100);
      }
    });

    it("honours a custom gridSize", () => {
      const out = resampleAngleCurve(linearCurve(37), 51);
      expect(out).toHaveLength(51);
      out.forEach((p, i) => expect(p.gaitCyclePct).toBeCloseTo((i * 100) / 50, 10));
    });

    it("aligns two curves of different source lengths element-for-element", () => {
      const a = resampleAngleCurve(linearCurve(50));
      const b = resampleAngleCurve(linearCurve(150));
      expect(a).toHaveLength(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].gaitCyclePct).toBe(b[i].gaitCyclePct);
        expect(a[i].gaitCyclePct).toBeCloseTo((i * 100) / 100, 10);
        // Same underlying linear function sampled at the same percentage.
        expect(a[i].kneeAngleLeft!).toBeCloseTo(b[i].kneeAngleLeft!, 8);
        expect(a[i].kneeAngleLeft!).toBeCloseTo(a[i].gaitCyclePct, 8);
      }
    });

    it("round-trips a 101-point curve unchanged (identity case)", () => {
      const src = linearCurve(101);
      const out = resampleAngleCurve(src, 101);
      expect(out).toHaveLength(101);
      for (let i = 0; i < 101; i++) {
        expect(out[i].gaitCyclePct).toBeCloseTo(src[i].gaitCyclePct, 10);
        expect(out[i].kneeAngleLeft!).toBeCloseTo(src[i].kneeAngleLeft!, 10);
        expect(out[i].kneeAngleRight!).toBeCloseTo(src[i].kneeAngleRight!, 10);
        expect(out[i].hipAngleLeft!).toBeCloseTo(src[i].hipAngleLeft!, 10);
        expect(out[i].hipAngleRight).toBeNull();
      }
    });

    it("interpolates linearly between bracketing source points", () => {
      const src: JointAnglePoint[] = [
        {
          gaitCyclePct: 0,
          kneeAngleLeft: 0,
          kneeAngleRight: null,
          hipAngleLeft: null,
          hipAngleRight: null,
          ankleAngleLeft: null,
          ankleAngleRight: null,
        },
        {
          gaitCyclePct: 100,
          kneeAngleLeft: 40,
          kneeAngleRight: null,
          hipAngleLeft: null,
          hipAngleRight: null,
          ankleAngleLeft: null,
          ankleAngleRight: null,
        },
      ];
      const out = resampleAngleCurve(src);
      expect(out[25].kneeAngleLeft!).toBeCloseTo(10, 10);
      expect(out[50].kneeAngleLeft!).toBeCloseTo(20, 10);
      expect(out[100].kneeAngleLeft!).toBeCloseTo(40, 10);
    });

    it("propagates nulls as nulls and never substitutes 0 or repeats a sample", () => {
      const src = linearCurve(11);
      // Punch a hole in the middle of the knee-left trace.
      src[5].kneeAngleLeft = null;
      const out = resampleAngleCurve(src);

      // Every grid point bracketed by the null sample must be null.
      for (let i = 41; i <= 59; i++) {
        expect(out[i].kneeAngleLeft).toBeNull();
      }
      // Outside the hole, values remain defined and correct.
      expect(out[0].kneeAngleLeft!).toBeCloseTo(0, 8);
      expect(out[30].kneeAngleLeft!).toBeCloseTo(30, 8);
      expect(out[70].kneeAngleLeft!).toBeCloseTo(70, 8);
      // Fully-null field stays null everywhere; no zeros creep in.
      expect(out.every((p) => p.ankleAngleLeft === null)).toBe(true);
      expect(out.some((p) => p.ankleAngleLeft === 0)).toBe(false);
    });

    it("returns [] for empty input", () => {
      expect(resampleAngleCurve([])).toEqual([]);
      expect(resampleAngleCurve([], 51)).toEqual([]);
    });

    it("falls back to index-derived percentages only when no point carries one", () => {
      const src = linearCurve(51).map((p) => ({
        ...p,
        gaitCyclePct: Number.NaN,
      }));
      const out = resampleAngleCurve(src);
      expect(out).toHaveLength(101);
      expect(out[50].kneeAngleLeft!).toBeCloseTo(50, 8);
      expect(out[100].kneeAngleLeft!).toBeCloseTo(100, 8);
    });

    it("handles a single-point source without padding by repetition", () => {
      const out = resampleAngleCurve(linearCurve(1));
      expect(out).toHaveLength(101);
      expect(out.every((p) => p.kneeAngleLeft === 0)).toBe(true);
      expect(out[100].gaitCyclePct).toBe(100);
    });
  });

  describe("resampleNormativeCurve", () => {
    it("resamples bands onto the same grid and aligns across lengths", () => {
      const a = resampleNormativeCurve(normativeCurve(51));
      const b = resampleNormativeCurve(normativeCurve(101));
      expect(a).toHaveLength(101);
      expect(b).toHaveLength(101);
      for (let i = 0; i < 101; i++) {
        expect(a[i].gaitCyclePct).toBe(b[i].gaitCyclePct);
        expect(a[i].kneeMean!).toBeCloseTo(b[i].kneeMean!, 8);
        expect(a[i].kneeMin!).toBeCloseTo(a[i].gaitCyclePct - 5, 8);
        expect(a[i].kneeMax!).toBeCloseTo(a[i].gaitCyclePct + 5, 8);
        expect(a[i].ankleMean!).toBeCloseTo(-a[i].gaitCyclePct / 4, 8);
      }
    });

    it("round-trips a 101-point normative curve unchanged", () => {
      const src = normativeCurve(101);
      const out = resampleNormativeCurve(src, 101);
      for (let i = 0; i < 101; i++) {
        expect(out[i].hipMean!).toBeCloseTo(src[i].hipMean, 10);
        expect(out[i].hipMin!).toBeCloseTo(src[i].hipMin, 10);
        expect(out[i].hipMax!).toBeCloseTo(src[i].hipMax, 10);
      }
    });

    it("emits null rather than 0 when a bracketing band value is not finite", () => {
      const src = normativeCurve(11);
      (src[5] as { kneeMean: number }).kneeMean = Number.NaN;
      const out = resampleNormativeCurve(src);
      for (let i = 41; i <= 59; i++) {
        expect(out[i].kneeMean).toBeNull();
      }
      expect(out[10].kneeMean!).toBeCloseTo(10, 8);
    });

    it("returns [] for empty input", () => {
      expect(resampleNormativeCurve([])).toEqual([]);
    });
  });
});
