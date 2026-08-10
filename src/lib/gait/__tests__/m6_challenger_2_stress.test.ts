import { describe, it, expect } from "vitest";
import {
  calculateZScore,
  erf,
  calculatePercentile,
  getNormativeReference,
  calculateGDI,
  evaluateGaitNormatives,
  type SexCategory,
  type AgeGroupCategory,
} from "../normatives";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import type { GaitMetrics } from "../types";

describe("Milestone 6 Challenger 2 Empirical Stress Tests", () => {
  describe("1. Normative Lookup & Stratification (Winter 2009 & Bovi et al. 2011)", () => {
    it("returns Winter (2009) when neither age nor sex is specified", () => {
      const cadenceRef = getNormativeReference("cadenceSpm");
      expect(cadenceRef.citation).toBe("Winter (2009)");
      expect(cadenceRef.mean).toBe(105.0);
      expect(cadenceRef.sd).toBe(8.0);
    });

    it("returns Winter (2009) when sex is 'combined' and age is undefined", () => {
      const ref = getNormativeReference("cadenceSpm", undefined, "combined");
      expect(ref.citation).toBe("Winter (2009)");
      expect(ref.mean).toBe(105.0);
    });

    it("correctly categorizes age groups across exact boundary values in Bovi et al. (2011)", () => {
      // Age < 50 => young
      const young30 = getNormativeReference("cadenceSpm", 30, "male");
      const young49 = getNormativeReference("cadenceSpm", 49.9, "male");
      expect(young30.mean).toBe(112.4);
      expect(young49.mean).toBe(112.4);
      expect(young30.citation).toBe("Bovi et al. (2011)");

      // 50 <= Age <= 64 => middle
      const middle50 = getNormativeReference("cadenceSpm", 50, "male");
      const middle60 = getNormativeReference("cadenceSpm", 60, "male");
      const middle64 = getNormativeReference("cadenceSpm", 64, "male");
      expect(middle50.mean).toBe(108.6);
      expect(middle60.mean).toBe(108.6);
      expect(middle64.mean).toBe(108.6);

      // Age 65-74 => elderly, Age 75-84 => advanced_75_84
      const elderly65 = getNormativeReference("cadenceSpm", 65, "male");
      const elderly70 = getNormativeReference("cadenceSpm", 70, "male");
      const adv80 = getNormativeReference("cadenceSpm", 80, "male");
      expect(elderly65.mean).toBe(103.2);
      expect(elderly70.mean).toBe(103.2);
      expect(adv80.mean).toBe(98.5);
    });

    it("correctly stratifies by sex across all categories (male, female, combined)", () => {
      const youngMale = getNormativeReference("cadenceSpm", 25, "male");
      const youngFemale = getNormativeReference("cadenceSpm", 25, "female");
      const youngCombined = getNormativeReference("cadenceSpm", 25, "combined");

      expect(youngMale.mean).toBe(112.4);
      expect(youngFemale.mean).toBe(117.8);
      expect(youngCombined.mean).toBe(115.1);

      const elderlyMale = getNormativeReference("stancePct", 70, "male");
      const elderlyFemale = getNormativeReference("stancePct", 70, "female");
      const elderlyCombined = getNormativeReference("stancePct", 70, "combined");

      expect(elderlyMale.mean).toBe(62.8);
      expect(elderlyFemale.mean).toBe(62.1);
      expect(elderlyCombined.mean).toBe(62.45);
    });

    it("handles invalid or unexpected age/sex values gracefully", () => {
      // Invalid string sex defaults to 'combined'
      const invalidSex = getNormativeReference("cadenceSpm", 30, "unknown_sex");
      expect(invalidSex.mean).toBe(115.1); // young combined

      // Non-finite age defaults to combined age group
      const nanAge = getNormativeReference("cadenceSpm", NaN, "female");
      expect(nanAge.mean).toBe(113.8); // combined age, female

      const infAge = getNormativeReference("cadenceSpm", Infinity, "female");
      expect(infAge.mean).toBe(113.8); // combined age, female
    });

    it("normalizes parameter ID aliases correctly", () => {
      expect(getNormativeReference("cadence").paramId).toBe("cadenceSpm");
      expect(getNormativeReference("cadenceSpm").paramId).toBe("cadenceSpm");
      expect(getNormativeReference("stepTimeCV").paramId).toBe("stepTimeCV");
      expect(getNormativeReference("stance").paramId).toBe("stancePct");
      expect(getNormativeReference("stancePct").paramId).toBe("stancePct");
      expect(getNormativeReference("leftStancePct").paramId).toBe("stancePct");
      expect(getNormativeReference("rightStancePct").paramId).toBe("stancePct");
      expect(getNormativeReference("zeniStance").paramId).toBe("stancePct");
      expect(getNormativeReference("ds").paramId).toBe("doubleSupportPct");
      expect(getNormativeReference("doubleSupport").paramId).toBe("doubleSupportPct");
      expect(getNormativeReference("doubleSupportPct").paramId).toBe("doubleSupportPct");
      expect(getNormativeReference("doubleSupportHint").paramId).toBe("doubleSupportPct");
      expect(getNormativeReference("kneeFlex").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeFlexion").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeFlexionRom").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeFlexLeft").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeFlexRight").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeL").paramId).toBe("kneeFlexionRom");
      expect(getNormativeReference("kneeR").paramId).toBe("kneeFlexionRom");
    });
  });

  describe("2. GDI Calculations across Age and Sex Groups", () => {
    const ageGroups: { name: string; age: number }[] = [
      { name: "Young (<50)", age: 25 },
      { name: "Middle (50-64)", age: 55 },
      { name: "Elderly (65+)", age: 70 },
    ];
    const sexes: SexCategory[] = ["male", "female", "combined"];

    for (const ageGroup of ageGroups) {
      for (const sex of sexes) {
        it(`computes exact GDI = 100 for normative means in ${ageGroup.name} ${sex}`, () => {
          // Retrieve reference values for this age & sex group
          const cadenceRef = getNormativeReference("cadenceSpm", ageGroup.age, sex);
          const cvRef = getNormativeReference("stepTimeCV", ageGroup.age, sex);
          const stanceRef = getNormativeReference("stancePct", ageGroup.age, sex);
          const dsRef = getNormativeReference("doubleSupportPct", ageGroup.age, sex);
          const kneeRef = getNormativeReference("kneeFlexionRom", ageGroup.age, sex);

          const exactMeanMetrics: Partial<GaitMetrics> = {
            cadenceSpm: cadenceRef.mean,
            stepTimeCV: cvRef.mean,
            leftStancePct: stanceRef.mean,
            rightStancePct: stanceRef.mean,
            doubleSupportPct: dsRef.mean,
            kneeFlexLeft: kneeRef.mean,
            kneeFlexRight: kneeRef.mean,
          };

          const result = calculateGDI(exactMeanMetrics as GaitMetrics, { age: ageGroup.age, sex });
          expect(result.gdiScore).toBeCloseTo(100.0, 5);
          expect(result.zRms).toBeCloseTo(0.0, 5);
          expect(result.evaluatedCount).toBe(5);
        });

        it(`computes exact GDI = 90 for +1 SD deviation across parameters in ${ageGroup.name} ${sex}`, () => {
          const cadenceRef = getNormativeReference("cadenceSpm", ageGroup.age, sex);
          const cvRef = getNormativeReference("stepTimeCV", ageGroup.age, sex);
          const stanceRef = getNormativeReference("stancePct", ageGroup.age, sex);
          const dsRef = getNormativeReference("doubleSupportPct", ageGroup.age, sex);
          const kneeRef = getNormativeReference("kneeFlexionRom", ageGroup.age, sex);

          const devMetrics: Partial<GaitMetrics> = {
            cadenceSpm: cadenceRef.mean + cadenceRef.sd,
            stepTimeCV: cvRef.mean + cvRef.sd,
            leftStancePct: stanceRef.mean + stanceRef.sd,
            rightStancePct: stanceRef.mean + stanceRef.sd,
            doubleSupportPct: dsRef.mean + dsRef.sd,
            kneeFlexLeft: kneeRef.mean - kneeRef.sd,
            kneeFlexRight: kneeRef.mean - kneeRef.sd,
          };

          const result = calculateGDI(devMetrics as GaitMetrics, { age: ageGroup.age, sex });
          expect(result.gdiScore).toBeCloseTo(90.0, 5);
          expect(result.zRms).toBeCloseTo(1.0, 5);
        });

        it(`computes exact GDI = 80 for 2 SD deviation across parameters in ${ageGroup.name} ${sex}`, () => {
          const cadenceRef = getNormativeReference("cadenceSpm", ageGroup.age, sex);
          const cvRef = getNormativeReference("stepTimeCV", ageGroup.age, sex);
          const stanceRef = getNormativeReference("stancePct", ageGroup.age, sex);
          const dsRef = getNormativeReference("doubleSupportPct", ageGroup.age, sex);
          const kneeRef = getNormativeReference("kneeFlexionRom", ageGroup.age, sex);

          const devMetrics: Partial<GaitMetrics> = {
            cadenceSpm: cadenceRef.mean + 2 * cadenceRef.sd,
            stepTimeCV: cvRef.mean + 2 * cvRef.sd,
            leftStancePct: stanceRef.mean + 2 * stanceRef.sd,
            rightStancePct: stanceRef.mean + 2 * stanceRef.sd,
            doubleSupportPct: dsRef.mean + 2 * dsRef.sd,
            kneeFlexLeft: kneeRef.mean - 2 * kneeRef.sd,
            kneeFlexRight: kneeRef.mean - 2 * kneeRef.sd,
          };

          const result = calculateGDI(devMetrics as GaitMetrics, { age: ageGroup.age, sex });
          expect(result.gdiScore).toBeCloseTo(80.0, 5);
          expect(result.zRms).toBeCloseTo(2.0, 5);
        });
      }
    }

    it("handles partial metrics gracefully when computing GDI", () => {
      const partialMetrics: Partial<GaitMetrics> = {
        cadenceSpm: 105,
      };
      const result = calculateGDI(partialMetrics as GaitMetrics);
      expect(result.gdiScore).toBe(100.0);
      expect(result.evaluatedCount).toBe(1);
    });

    it("prefers doubleSupportPct over doubleSupportHint when both present", () => {
      const metrics: Partial<GaitMetrics> = {
        doubleSupportPct: 20.8,
        doubleSupportHint: 0.5, // 50%
      };
      const result = calculateGDI(metrics as GaitMetrics);
      expect(result.paramZScores["doubleSupportPct"]).toBe(0); // 20.8 is mean of Winter (2009)
    });

    it("uses doubleSupportHint scaled * 100 when doubleSupportPct is missing", () => {
      const metrics: Partial<GaitMetrics> = {
        doubleSupportHint: 0.208, // 20.8%
      };
      const result = calculateGDI(metrics as GaitMetrics);
      expect(result.paramZScores["doubleSupportPct"]).toBeCloseTo(0, 5);
    });
  });

  describe("3. Hypothesis Triggering in buildEducatedGuesses", () => {
    it("triggers 'gdi-severe-deviation' with 'elevated' severity when GDI < 80", () => {
      // 2.1 SD deviation across metrics => GDI = 100 - 10 * 2.1 = 79.0 < 80
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105 + 2.1 * 8,
        stepTimeCV: 0.02 + 2.1 * 0.006,
        leftStancePct: 60.5 + 2.1 * 2,
        rightStancePct: 60.5 + 2.1 * 2,
        doubleSupportPct: 20.8 + 2.1 * 2.5,
        kneeFlexLeft: 58 - 2.1 * 4.5,
        kneeFlexRight: 58 - 2.1 * 4.5,
        overallScore: 50,
        stabilityScore: 50,
        symmetryScore: 50,
        rhythmScore: 50,
        mobilityScore: 50,
        automaticityScore: 50,
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
        strideTimeCV: 0.02,
      };

      const guesses = buildEducatedGuesses(metrics as GaitMetrics);
      const severeGdi = guesses.find((g) => g.id === "gdi-severe-deviation");
      const moderateGdi = guesses.find((g) => g.id === "gdi-moderate-deviation");

      expect(severeGdi).toBeDefined();
      expect(severeGdi?.severity).toBe("elevated");
      expect(severeGdi?.patternTag).toBe("GDI Severe Deviation (<80)");
      expect(moderateGdi).toBeUndefined();
    });

    it("triggers 'gdi-moderate-deviation' with 'moderate' severity when 80 <= GDI < 90", () => {
      // 1.5 SD deviation across metrics => GDI = 100 - 10 * 1.5 = 85.0 (80 <= GDI < 90)
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105 + 1.5 * 8,
        stepTimeCV: 0.02 + 1.5 * 0.006,
        leftStancePct: 60.5 + 1.5 * 2,
        rightStancePct: 60.5 + 1.5 * 2,
        doubleSupportPct: 20.8 + 1.5 * 2.5,
        kneeFlexLeft: 58 - 1.5 * 4.5,
        kneeFlexRight: 58 - 1.5 * 4.5,
        overallScore: 60,
        stabilityScore: 60,
        symmetryScore: 60,
        rhythmScore: 60,
        mobilityScore: 60,
        automaticityScore: 60,
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
        strideTimeCV: 0.02,
      };

      const guesses = buildEducatedGuesses(metrics as GaitMetrics);
      const severeGdi = guesses.find((g) => g.id === "gdi-severe-deviation");
      const moderateGdi = guesses.find((g) => g.id === "gdi-moderate-deviation");

      expect(moderateGdi).toBeDefined();
      expect(moderateGdi?.severity).toBe("moderate");
      expect(moderateGdi?.patternTag).toBe("GDI Moderate Deviation (80-89)");
      expect(severeGdi).toBeUndefined();
    });

    it("does NOT trigger GDI deviation guesses when GDI >= 90", () => {
      // 0.5 SD deviation across metrics => GDI = 100 - 10 * 0.5 = 95.0 >= 90
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105 + 0.5 * 8,
        stepTimeCV: 0.02 + 0.5 * 0.006,
        leftStancePct: 60.5 + 0.5 * 2,
        rightStancePct: 60.5 + 0.5 * 2,
        doubleSupportPct: 20.8 + 0.5 * 2.5,
        kneeFlexLeft: 58 - 0.5 * 4.5,
        kneeFlexRight: 58 - 0.5 * 4.5,
        overallScore: 80,
        stabilityScore: 80,
        symmetryScore: 80,
        rhythmScore: 80,
        mobilityScore: 80,
        automaticityScore: 80,
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
        strideTimeCV: 0.02,
      };

      const guesses = buildEducatedGuesses(metrics as GaitMetrics);
      const severeGdi = guesses.find((g) => g.id === "gdi-severe-deviation");
      const moderateGdi = guesses.find((g) => g.id === "gdi-moderate-deviation");

      expect(severeGdi).toBeUndefined();
      expect(moderateGdi).toBeUndefined();
    });

    it("triggers 'normative-percentile-extreme' when metric percentile is < 5th or > 95th", () => {
      // Z = +1.65 => percentile ~95.05% > 95th
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105 + 1.65 * 8, // +1.65 SD => percentile > 95th
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58,
        kneeFlexRight: 58,
        overallScore: 70,
        stabilityScore: 70,
        symmetryScore: 70,
        rhythmScore: 70,
        mobilityScore: 70,
        automaticityScore: 70,
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
        strideTimeCV: 0.02,
      };

      const guesses = buildEducatedGuesses(metrics as GaitMetrics);
      const extremePercentile = guesses.find((g) => g.id === "normative-percentile-extreme");

      expect(extremePercentile).toBeDefined();
      expect(extremePercentile?.severity).toBe("moderate");
      expect(extremePercentile?.evidence.some((e) => e.includes("Cadence"))).toBe(true);
    });

    it("does NOT trigger 'normative-percentile-extreme' when metric percentile is within [5th, 95th]", () => {
      // Z = +1.60 => percentile ~94.52% <= 95th
      const metrics: Partial<GaitMetrics> = {
        cadenceSpm: 105 + 1.60 * 8, // Z = +1.60 => percentile ~94.5%
        stepTimeCV: 0.02,
        leftStancePct: 60.5,
        rightStancePct: 60.5,
        doubleSupportPct: 20.8,
        kneeFlexLeft: 58,
        kneeFlexRight: 58,
        overallScore: 80,
        stabilityScore: 80,
        symmetryScore: 80,
        rhythmScore: 80,
        mobilityScore: 80,
        automaticityScore: 80,
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
        strideTimeCV: 0.02,
      };

      const guesses = buildEducatedGuesses(metrics as GaitMetrics);
      const extremePercentile = guesses.find((g) => g.id === "normative-percentile-extreme");

      expect(extremePercentile).toBeUndefined();
    });
  });

  describe("4. Pure Math & Corner-Case Safety", () => {
    it("calculateZScore safety invariants", () => {
      expect(calculateZScore(100, 100, 0)).toBe(0);
      expect(calculateZScore(100, 100, -1)).toBe(0);
      expect(calculateZScore(NaN, 100, 5)).toBe(0);
      expect(calculateZScore(100, NaN, 5)).toBe(0);
      expect(calculateZScore(100, 100, NaN)).toBe(0);
      expect(calculateZScore(Infinity, 100, 5)).toBe(0);
      expect(calculateZScore(100, Infinity, 5)).toBe(0);
      expect(calculateZScore(100, 100, Infinity)).toBe(0);
    });

    it("erf accuracy & symmetry invariants", () => {
      expect(erf(0)).toBe(0);
      expect(erf(1)).toBeCloseTo(0.8427, 4);
      expect(erf(-1)).toBeCloseTo(-0.8427, 4);
      expect(erf(5)).toBeCloseTo(1.0, 4);
      expect(erf(-5)).toBeCloseTo(-1.0, 4);
      expect(erf(NaN)).toBe(1); // Documented quirk: erf(NaN) returns 1 due to !Number.isFinite check returning x < 0 ? -1 : 1
      expect(erf(Infinity)).toBe(1);
      expect(erf(-Infinity)).toBe(-1);
    });

    it("calculatePercentile bounds & mapping invariants", () => {
      expect(calculatePercentile(0)).toBeCloseTo(50.0, 1);
      expect(calculatePercentile(1.0)).toBeCloseTo(84.13, 1);
      expect(calculatePercentile(-1.0)).toBeCloseTo(15.87, 1);
      expect(calculatePercentile(10.0)).toBe(99.9);
      expect(calculatePercentile(-10.0)).toBe(0.1);
      expect(calculatePercentile(NaN)).toBe(50.0);
    });
  });
});
