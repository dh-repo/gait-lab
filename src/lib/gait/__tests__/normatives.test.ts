import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  erf,
  calculatePercentile,
  getNormativeReference,
  calculateGDI,
  evaluateGaitNormatives,
  calculateGPSAndMAP,
} from "../normatives";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import type { GaitMetrics } from "../types";

describe("normatives.ts", () => {
  describe("calculateZScore", () => {
    it("computes exact z-scores for valid inputs", () => {
      expect(calculateZScore(105, 105, 8)).toBe(0);
      expect(calculateZScore(113, 105, 8)).toBe(1.0);
      expect(calculateZScore(89, 105, 8)).toBe(-2.0);
    });

    it("returns 0 for sd <= 0 or invalid non-finite numbers", () => {
      expect(calculateZScore(100, 100, 0)).toBe(0);
      expect(calculateZScore(100, 100, -2)).toBe(0);
      expect(calculateZScore(NaN, 100, 5)).toBe(0);
      expect(calculateZScore(100, NaN, 5)).toBe(0);
      expect(calculateZScore(100, 100, Infinity)).toBe(0);
    });
  });

  describe("erf and calculatePercentile", () => {
    it("erf computes mathematical error function properties", () => {
      expect(erf(0)).toBe(0);
      expect(erf(1)).toBeGreaterThan(0.8);
      expect(erf(-1)).toBe(-erf(1));
    });

    it("calculatePercentile maps z-scores to normal CDF percentages", () => {
      expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
      expect(calculatePercentile(1.96)).toBeCloseTo(97.5, 1);
      expect(calculatePercentile(-1.96)).toBeCloseTo(2.5, 1);
    });

    it("clamps extreme z-scores within bounds [0.1, 99.9]", () => {
      expect(calculatePercentile(10.0)).toBe(99.9);
      expect(calculatePercentile(-10.0)).toBe(0.1);
    });
  });

  describe("getNormativeReference", () => {
    it("returns Winter (2009) baseline by default", () => {
      const ref = getNormativeReference("cadenceSpm");
      expect(ref.citation).toBe("Winter (2009)");
      expect(ref.mean).toBe(105.0);
      expect(ref.sd).toBe(8.0);
      expect(ref.min95).toBeCloseTo(105 - 1.96 * 8, 2);
      expect(ref.max95).toBeCloseTo(105 + 1.96 * 8, 2);
    });

    it("returns Bovi et al. (2011) age/sex stratified datasets when requested", () => {
      const youngMale = getNormativeReference("cadenceSpm", 25, "male");
      expect(youngMale.citation).toBe("Bovi et al. (2011)");
      expect(youngMale.mean).toBe(112.4);

      const elderlyFemale = getNormativeReference("cadenceSpm", 72, "female");
      expect(elderlyFemale.citation).toBe("Bovi et al. (2011)");
      expect(elderlyFemale.mean).toBe(109.5);
    });

    it("handles aliases for metric parameter IDs", () => {
      const stanceRef = getNormativeReference("zeniStance");
      expect(stanceRef.paramId).toBe("stancePct");
      expect(stanceRef.mean).toBe(60.5);

      const kneeRef = getNormativeReference("kneeFlexLeft");
      expect(kneeRef.paramId).toBe("kneeFlexionRom");
      expect(kneeRef.mean).toBe(58.0);
    });
  });

  describe("calculateGDI and evaluateGaitNormatives", () => {
    it("returns GDI = 100 for normative mean metrics", () => {
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
      expect(result.interpretation).toContain("Normal normative gait alignment");
    });

    it("returns GDI = 90 for 1 SD deviation across parameters", () => {
      const devMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 113.0, // +1 SD (105 + 8)
        stepTimeCV: 0.026, // +1 SD (0.02 + 0.006)
        leftStancePct: 62.5, // +1 SD (60.5 + 2.0)
        rightStancePct: 62.5,
        doubleSupportPct: 23.3, // +1 SD (20.8 + 2.5)
        kneeFlexLeft: 53.5, // -1 SD (58.0 - 4.5)
        kneeFlexRight: 53.5,
      };
      const result = calculateGDI(devMetrics as GaitMetrics);
      expect(result.gdiScore).toBeCloseTo(90.0, 1);
      expect(result.zRms).toBeCloseTo(1.0, 1);
      expect(result.interpretation).toContain("Mild gait deviation");
    });

    it("returns GDI = 80 for 2 SD deviation across parameters", () => {
      const devMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 121.0, // +2 SD (105 + 16)
        stepTimeCV: 0.032, // +2 SD (0.02 + 0.012)
        leftStancePct: 64.5, // +2 SD (60.5 + 4.0)
        rightStancePct: 64.5,
        doubleSupportPct: 25.8, // +2 SD (20.8 + 5.0)
        kneeFlexLeft: 49.0, // -2 SD (58.0 - 9.0)
        kneeFlexRight: 49.0,
      };
      const result = calculateGDI(devMetrics as GaitMetrics);
      expect(result.gdiScore).toBeCloseTo(80.0, 1);
      expect(result.zRms).toBeCloseTo(2.0, 1);
      expect(result.interpretation).toContain("Moderate gait deviation");
    });

    it("clamps extreme GDI scores to [0, 130]", () => {
      const extremeMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 250,
        stepTimeCV: 0.30,
        leftStancePct: 90,
        rightStancePct: 90,
      };
      const result = calculateGDI(extremeMetrics as GaitMetrics);
      expect(result.gdiScore).toBe(0);
      expect(result.interpretation).toContain("Severe gait deviation");
    });

    it("evaluateGaitNormatives returns both GDI result and parameter evaluations array", () => {
      const dummyMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 105,
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
      };
      const { gdi, evaluations } = evaluateGaitNormatives(dummyMetrics as GaitMetrics, { age: 30, sex: "male" });
      expect(gdi.gdiScore).toBeGreaterThan(0);
      expect(evaluations.length).toBeGreaterThan(0);
      expect(evaluations[0].citation).toBe("Bovi et al. (2011)");
    });
  });

  describe("Integration with ratings.ts and guesses.ts", () => {
    it("buildStructuredReport attaches GDI and normative z-scores to report and metric ratings", () => {
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105,
        stepTimeCV: 0.02,
        doubleSupportPct: 20.8,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        kneeFlexLeft: 58.0,
        kneeFlexRight: 58.0,
        overallScore: 85,
        stabilityScore: 80,
        symmetryScore: 85,
        rhythmScore: 85,
        mobilityScore: 85,
        automaticityScore: 85,
        viewAngle: "sagittal",
        viewConfidence: 0.9,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 12,
        verticalBounce: 0.03,
        armSwingLeft: 0.3,
        armSwingRight: 0.3,
        armSwingAsymmetry: 0.05,
        stepTimeAsymmetry: 0.02,
        pathSmoothness: 0.9,
        stepEvents: [],
        strideTimeCV: 0.02,
      };

      const report = buildStructuredReport(metrics as GaitMetrics, [], {
        taskMode: "single",
        analyzedFrames: 100,
      });

      expect(report.gdi).toBeDefined();
      expect(report.gdi?.gdiScore).toBeCloseTo(100, 1);
      expect(report.normativeEvaluations).toBeDefined();

      const cadenceRating = report.metrics.find((m) => m.id === "cadence");
      expect(cadenceRating?.zScore).toBeDefined();
      expect(cadenceRating?.percentile).toBeDefined();
    });

    it("buildEducatedGuesses produces GDI deviation and extreme percentile hypothesis rules", () => {
      const severeMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 60, // severe cadence deviation
        stepTimeCV: 0.15, // severe CV deviation (> 95th percentile)
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
        doubleSupportHint: 0.4,
        stepEvents: [],
        strideTimeCV: 0.15,
      };

      const guesses = buildEducatedGuesses(severeMetrics as GaitMetrics);

      const severeGdiGuess = guesses.find((g) => g.id === "gdi-severe-deviation");
      expect(severeGdiGuess).toBeDefined();
      expect(severeGdiGuess?.severity).toBe("elevated");

      const extremePercentileGuess = guesses.find((g) => g.id === "normative-percentile-extreme");
      expect(extremePercentileGuess).toBeDefined();
      expect(extremePercentileGuess?.severity).toBe("moderate");
    });
  });

  describe("R9: Gait Profile Score (GPS) & Movement Analysis Profile (MAP)", () => {
    it("returns GPS = 0.0 and MAP sub-scores = 0.0 when patient curves match normative means perfectly", () => {
      const normCurves = Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 10,
        kneeAngleRight: 10,
        hipAngleLeft: 20,
        hipAngleRight: 20,
        ankleAngleLeft: 0,
        ankleAngleRight: 0,
      }));

      const mockNormData = Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeMean: 10,
        kneeMin: 0,
        kneeMax: 20,
        hipMean: 20,
        hipMin: 10,
        hipMax: 30,
        ankleMean: 0,
        ankleMin: -10,
        ankleMax: 10,
      }));

      const angleAnalysis: any = {
        isSuppressed: false,
        normalizedPoints: normCurves,
        normativeData: mockNormData,
      };

      const result = calculateGPSAndMAP(angleAnalysis);
      expect(result.gpsScore).toBe(0.0);
      expect(result.map.kneeFlexionExtension).toBe(0.0);
      expect(result.map.hipFlexionExtension).toBe(0.0);
      expect(result.map.ankleDorsiflexionPlantarflexion).toBe(0.0);
      expect(result.interpretation).toContain("Normal normative kinematic profile");
    });

    it("detects pathological joint angle deviation with GPS > 5.0°", () => {
      const devCurves = Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 25, // +15° deviation from norm (10°)
        kneeAngleRight: 25,
        hipAngleLeft: 20,
        hipAngleRight: 20,
        ankleAngleLeft: 0,
        ankleAngleRight: 0,
      }));

      const mockNormData = Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeMean: 10,
        kneeMin: 0,
        kneeMax: 20,
        hipMean: 20,
        hipMin: 10,
        hipMax: 30,
        ankleMean: 0,
        ankleMin: -10,
        ankleMax: 10,
      }));

      const angleAnalysis: any = {
        isSuppressed: false,
        normalizedPoints: devCurves,
        normativeData: mockNormData,
      };

      const result = calculateGPSAndMAP(angleAnalysis);
      expect(result.gpsScore).toBeGreaterThan(5.0);
      expect(result.map.kneeFlexionExtension).toBeCloseTo(15.0, 1);
      expect(result.interpretation).toContain("gait deviation");
    });

    it("returns zero score and suppressed message when frontal camera view is suppressed", () => {
      const angleAnalysis: any = {
        isSuppressed: true,
        suppressionReason: "Frontal view",
        normalizedPoints: [],
      };

      const result = calculateGPSAndMAP(angleAnalysis);
      expect(result.gpsScore).toBe(0.0);
      expect(result.interpretation).toContain("suppressed in frontal camera view");
    });

    it("supports expanded age tiers (<18, 75-84, 85+)", () => {
      const pedRef = getNormativeReference("cadenceSpm", 12, "combined");
      expect(pedRef.citation).toBe("Bovi et al. (2011)");

      const adv80Ref = getNormativeReference("cadenceSpm", 80, "combined");
      expect(adv80Ref.citation).toBe("Bovi et al. (2011)");

      const adv90Ref = getNormativeReference("cadenceSpm", 90, "combined");
      expect(adv90Ref.citation).toBe("Bovi et al. (2011)");
    });

    it("supports pediatric stratified gait speed and step length (Bovi et al. 2011)", () => {
      const pedSpeed = getNormativeReference("gaitSpeed", 10, "female");
      expect(pedSpeed.citation).toBe("Bovi et al. (2011)");
      expect(pedSpeed.mean).toBe(1.12);
      expect(pedSpeed.sd).toBe(0.13);

      const pedStepLen = getNormativeReference("stepLength", 10, "female");
      expect(pedStepLen.citation).toBe("Bovi et al. (2011)");
      expect(pedStepLen.mean).toBe(0.53);
      expect(pedStepLen.sd).toBe(0.05);
    });

    it("supports baseline normative parameters (hipRom, ankleRom)", () => {
      const hipRomRef = getNormativeReference("hipRom");
      expect(hipRomRef.mean).toBe(42.0);

      const ankleRomRef = getNormativeReference("ankleRom");
      expect(ankleRomRef.mean).toBe(27.0);
    });
  });
});
