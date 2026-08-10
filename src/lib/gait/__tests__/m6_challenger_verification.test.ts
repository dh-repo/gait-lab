import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  erf,
  calculatePercentile,
  getNormativeReference,
  calculateGDI,
  evaluateGaitNormatives,
} from "../normatives";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import type { GaitMetrics } from "../types";

describe("Milestone 6 Challenger Verification: Empirical Stress & Bounds", () => {
  describe("Focus Area 1: calculateGDI Bounds and Precision", () => {
    it("1.1 returns exactly 100 for normative means (Winter 2009 baseline)", () => {
      const normMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 105.0,
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
      };
      const result = calculateGDI(normMetrics as GaitMetrics);
      expect(result.gdiScore).toBe(100.0);
      expect(result.zRms).toBe(0.0);
      expect(result.evaluatedCount).toBe(5);
      expect(result.interpretation).toBe("Normal normative gait alignment (within 0 SD deviation).");
    });

    it("1.2 returns ~90 for 1 SD RMS deviation across parameters", () => {
      const dev1Sd: Partial<GaitMetrics> = {
        cadenceSpm: 113.0, // +1 SD (105 + 8)
        stepTimeCV: 0.026, // +1 SD (0.02 + 0.006)
        leftStancePct: 62.5, // +1 SD (60.5 + 2.0)
        rightStancePct: 62.5,
        doubleSupportPct: 23.3, // +1 SD (20.8 + 2.5)
        kneeFlexLeft: 53.5, // -1 SD (58.0 - 4.5)
        kneeFlexRight: 53.5,
      };
      const result = calculateGDI(dev1Sd as GaitMetrics);
      expect(result.zRms).toBeCloseTo(1.0, 5);
      expect(result.gdiScore).toBeCloseTo(90.0, 5);
      expect(result.interpretation).toBe("Mild gait deviation (within 1 SD of normative mean).");
    });

    it("1.3 returns ~80 for 2 SD RMS deviation across parameters", () => {
      const dev2Sd: Partial<GaitMetrics> = {
        cadenceSpm: 121.0, // +2 SD (105 + 16)
        stepTimeCV: 0.032, // +2 SD (0.02 + 0.012)
        leftStancePct: 64.5, // +2 SD (60.5 + 4.0)
        rightStancePct: 64.5,
        doubleSupportPct: 25.8, // +2 SD (20.8 + 5.0)
        kneeFlexLeft: 49.0, // -2 SD (58.0 - 9.0)
        kneeFlexRight: 49.0,
      };
      const result = calculateGDI(dev2Sd as GaitMetrics);
      expect(result.zRms).toBeCloseTo(2.0, 5);
      expect(result.gdiScore).toBeCloseTo(80.0, 5);
      expect(result.interpretation).toBe("Moderate gait deviation (1–2 SD from normative mean).");
    });

    it("1.4 remains strictly bounded in [0, 130] under extreme pathological metrics", () => {
      const extremePathological: Partial<GaitMetrics> = {
        cadenceSpm: 300, // extreme cadence
        stepTimeCV: 1.0, // 100% CV
        leftStancePct: 95.0,
        rightStancePct: 95.0,
        doubleSupportPct: 80.0,
        kneeFlexLeft: 5.0,
        kneeFlexRight: 5.0,
      };
      const result = calculateGDI(extremePathological as GaitMetrics);
      expect(result.gdiScore).toBeGreaterThanOrEqual(0);
      expect(result.gdiScore).toBeLessThanOrEqual(130);
      expect(result.gdiScore).toBe(0);
      expect(result.interpretation).toBe("Severe gait deviation (>2 SD from normative mean).");
    });

    it("1.5 remains bounded in [0, 130] under invalid / non-finite / zero metrics", () => {
      const invalidMetrics: Partial<GaitMetrics> = {
        cadenceSpm: -50,
        stepTimeCV: NaN,
        leftStancePct: Infinity,
        rightStancePct: -Infinity,
        doubleSupportPct: undefined,
      };
      const result = calculateGDI(invalidMetrics as GaitMetrics);
      expect(Number.isFinite(result.gdiScore)).toBe(true);
      expect(result.gdiScore).toBeGreaterThanOrEqual(0);
      expect(result.gdiScore).toBeLessThanOrEqual(130);
    });

    it("1.6 respects age/sex stratified normative references when provided", () => {
      // Elderly female (age 72, sex female) Bovi normatives: cadence mean = 109.5, sd = 8.8
      const elderlyFemaleMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 109.5,
      };
      const result = calculateGDI(elderlyFemaleMetrics as GaitMetrics, { age: 72, sex: "female" });
      expect(result.gdiScore).toBe(100.0);
      expect(result.paramZScores["cadenceSpm"]).toBe(0.0);
    });
  });

  describe("Focus Area 2: calculateZScore Robustness & Accuracy", () => {
    it("2.1 returns exact mathematical values for standard inputs", () => {
      expect(calculateZScore(105, 105, 8)).toBe(0);
      expect(calculateZScore(113, 105, 8)).toBe(1.0);
      expect(calculateZScore(89, 105, 8)).toBe(-2.0);
      expect(calculateZScore(109, 105, 8)).toBe(0.5);
    });

    it("2.2 handles zero standard deviation without throwing or returning NaN", () => {
      const res = calculateZScore(100, 100, 0);
      expect(res).toBe(0);
      expect(Number.isNaN(res)).toBe(false);
    });

    it("2.3 handles negative standard deviation without throwing or returning NaN", () => {
      const res1 = calculateZScore(100, 100, -5);
      expect(res1).toBe(0);
      expect(Number.isNaN(res1)).toBe(false);

      const res2 = calculateZScore(110, 100, -2.5);
      expect(res2).toBe(0);
      expect(Number.isNaN(res2)).toBe(false);
    });

    it("2.4 handles non-finite values safely", () => {
      expect(calculateZScore(NaN, 100, 5)).toBe(0);
      expect(calculateZScore(100, NaN, 5)).toBe(0);
      expect(calculateZScore(100, 100, NaN)).toBe(0);
      expect(calculateZScore(Infinity, 100, 5)).toBe(0);
      expect(calculateZScore(-Infinity, 100, 5)).toBe(0);
      expect(calculateZScore(100, 100, Infinity)).toBe(0);
    });
  });

  describe("Focus Area 3: calculatePercentile Precision & Clamping", () => {
    it("3.1 maps Z = 0 to exactly 50%", () => {
      expect(calculatePercentile(0)).toBe(50.0);
    });

    it("3.2 maps Z = 1.96 to ~97.5%", () => {
      const p = calculatePercentile(1.96);
      expect(p).toBeCloseTo(97.5, 1);
      expect(p).toBeGreaterThan(97.4);
      expect(p).toBeLessThan(97.6);
    });

    it("3.3 maps Z = -1.96 to ~2.5%", () => {
      const p = calculatePercentile(-1.96);
      expect(p).toBeCloseTo(2.5, 1);
      expect(p).toBeGreaterThan(2.4);
      expect(p).toBeLessThan(2.6);
    });

    it("3.4 clamps percentile strictly to [0.1, 99.9] for extreme Z-scores", () => {
      expect(calculatePercentile(10.0)).toBe(99.9);
      expect(calculatePercentile(100.0)).toBe(99.9);
      expect(calculatePercentile(-10.0)).toBe(0.1);
      expect(calculatePercentile(-100.0)).toBe(0.1);
    });

    it("3.5 returns 50.0 for non-finite Z-scores", () => {
      expect(calculatePercentile(NaN)).toBe(50.0);
      expect(calculatePercentile(Infinity)).toBe(50.0);
      expect(calculatePercentile(-Infinity)).toBe(50.0);
    });
  });

  describe("Focus Area 4: Dataset Lookups and Integration Verification", () => {
    it("4.1 normalizes parameter aliases in getNormativeReference", () => {
      expect(getNormativeReference("cadence").paramId).toBe("cadenceSpm");
      expect(getNormativeReference("zeniStance").paramId).toBe("stancePct");
      expect(getNormativeReference("doubleSupportHint").paramId).toBe("doubleSupportPct");
      expect(getNormativeReference("kneeFlexLeft").paramId).toBe("kneeFlexionRom");
    });

    it("4.2 integrates with buildStructuredReport and attaches normative metadata", () => {
      // Bovi 2011 young male means: cadence 112.4, stepTimeCV 0.021, stance 60.2
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 112.4,
        stepTimeCV: 0.021,
        leftStancePct: 60.2,
        rightStancePct: 60.2,
        overallScore: 85,
        stabilityScore: 85,
        symmetryScore: 85,
        rhythmScore: 85,
        mobilityScore: 85,
        automaticityScore: 85,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 10,
        verticalBounce: 0.03,
        armSwingLeft: 0.3,
        armSwingRight: 0.3,
        armSwingAsymmetry: 0.05,
        stepTimeAsymmetry: 0.02,
        pathSmoothness: 0.9,
        stepEvents: [],
        strideTimeCV: 0.021,
      };

      const report = buildStructuredReport(metrics as GaitMetrics, [], {
        taskMode: "single",
        analyzedFrames: 100,
        age: 35,
        sex: "male",
      });

      expect(report.gdi).toBeDefined();
      expect(report.gdi?.gdiScore).toBe(100);
      expect(report.normativeEvaluations).toBeDefined();
      expect(report.normativeEvaluations?.length).toBeGreaterThan(0);

      const cadenceMetric = report.metrics.find((m) => m.id === "cadence");
      expect(cadenceRatingHasNormatives(cadenceMetric)).toBe(true);
    });

    it("4.3 triggers GDI and normative percentile rules in buildEducatedGuesses", () => {
      const severeMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 60, // severe deviation
        stepTimeCV: 0.12, // severe deviation
        overallScore: 40,
        stabilityScore: 40,
        symmetryScore: 40,
        rhythmScore: 40,
        mobilityScore: 40,
        automaticityScore: 40,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 5,
        verticalBounce: 0.03,
        armSwingLeft: 0.1,
        armSwingRight: 0.1,
        armSwingAsymmetry: 0.05,
        stepTimeAsymmetry: 0.02,
        pathSmoothness: 0.5,
        stepEvents: [],
        strideTimeCV: 0.12,
      };

      const guesses = buildEducatedGuesses(severeMetrics as GaitMetrics);
      const severeGdi = guesses.find((g) => g.id === "gdi-severe-deviation");
      const extremePercentile = guesses.find((g) => g.id === "normative-percentile-extreme");

      expect(severeGdi).toBeDefined();
      expect(severeGdi?.severity).toBe("elevated");

      expect(extremePercentile).toBeDefined();
      expect(extremePercentile?.severity).toBe("moderate");
    });
  });
});

function cadenceRatingHasNormatives(metricRating: any): boolean {
  return (
    metricRating !== undefined &&
    typeof metricRating.zScore === "number" &&
    typeof metricRating.percentile === "number" &&
    typeof metricRating.normativeMean === "number" &&
    typeof metricRating.normativeSd === "number"
  );
}
