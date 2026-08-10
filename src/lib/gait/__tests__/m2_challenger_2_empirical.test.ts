import { describe, expect, it } from "vitest";
import {
  calculateArmSwingAsymmetry,
  calculateTrunkSway,
  type GaitAngleAnalysis,
} from "../angles";
import { buildEducatedGuesses } from "../guesses";
import {
  calculateGPSAndMAP,
  calculateZScore,
  getNormativeReference,
} from "../normatives";
import type { GaitMetrics, Landmark } from "../types";

describe("M2 Empirical Stress Tests — Challenger 2", () => {
  // Helper to create mock landmark frame with customizable values
  function createMockFrame(overrides?: Partial<Landmark>): Landmark[] {
    const landmarks: Landmark[] = [];
    for (let i = 0; i < 33; i++) {
      landmarks.push({
        x: overrides?.x ?? 0.5,
        y: overrides?.y ?? 0.5,
        z: overrides?.z ?? 0.0,
        visibility: overrides?.visibility ?? 0.9,
      });
    }
    return landmarks;
  }

  describe("R6 & R7 Edge Cases & Robustness (NaN, Missing Keypoints, Single Frame, Zero Division)", () => {
    it("R6: handles empty landmark arrays and single frame input gracefully", () => {
      const emptyResult = calculateArmSwingAsymmetry([]);
      expect(emptyResult).toEqual({
        leftAmplitude: 0,
        rightAmplitude: 0,
        asymmetryIndex: 0,
        phaseCorrelation: 0,
      });

      const singleFrame = [createMockFrame()];
      const singleResult = calculateArmSwingAsymmetry(singleFrame);
      expect(Number.isFinite(singleResult.leftAmplitude)).toBe(true);
      expect(Number.isFinite(singleResult.rightAmplitude)).toBe(true);
      expect(Number.isFinite(singleResult.asymmetryIndex)).toBe(true);
      expect(Number.isFinite(singleResult.phaseCorrelation)).toBe(true);
      expect(singleResult.asymmetryIndex).toBe(0);
    });

    it("R6: handles NaN and low visibility landmarks without producing NaN results", () => {
      const nanFrame = createMockFrame({ x: NaN, y: NaN, z: NaN, visibility: NaN });
      const lowVisFrame = createMockFrame({ visibility: 0.1 });
      const frames = [nanFrame, lowVisFrame, createMockFrame()];

      const result = calculateArmSwingAsymmetry(frames);
      expect(Number.isNaN(result.leftAmplitude)).toBe(false);
      expect(Number.isNaN(result.rightAmplitude)).toBe(false);
      expect(Number.isNaN(result.asymmetryIndex)).toBe(false);
      expect(Number.isNaN(result.phaseCorrelation)).toBe(false);
    });

    it("R6: prevents zero division when arm amplitudes are zero or identical", () => {
      // Static landmarks (zero arm swing amplitude)
      const staticFrames = Array(15).fill(null).map(() => createMockFrame());
      const result = calculateArmSwingAsymmetry(staticFrames);

      expect(result.leftAmplitude).toBe(0);
      expect(result.rightAmplitude).toBe(0);
      expect(result.asymmetryIndex).toBe(0);
      expect(result.phaseCorrelation).toBe(0);
    });

    it("R6: handles truncated landmark frames (< 27 keypoints)", () => {
      const truncatedFrame = createMockFrame().slice(0, 14); // missing wrists (15/16)
      const frames = [truncatedFrame, truncatedFrame];
      const result = calculateArmSwingAsymmetry(frames);

      expect(result.asymmetryIndex).toBe(0);
      expect(result.leftAmplitude).toBe(0);
      expect(result.rightAmplitude).toBe(0);
    });

    it("R7: handles empty, single frame, and truncated landmark arrays for trunk sway", () => {
      const emptyResult = calculateTrunkSway([]);
      expect(emptyResult).toEqual({
        lateralExcursionDeg: 0,
        sagittalExcursionDeg: 0,
        harmonicRatio: 1.0,
      });

      const singleResult = calculateTrunkSway([createMockFrame()]);
      expect(Number.isFinite(singleResult.lateralExcursionDeg)).toBe(true);
      expect(Number.isFinite(singleResult.sagittalExcursionDeg)).toBe(true);
      expect(Number.isFinite(singleResult.harmonicRatio)).toBe(true);
      expect(singleResult.harmonicRatio).toBe(1.0);
    });

    it("R7: handles NaN coordinates and prevents zero division in FFT Harmonic Ratio", () => {
      const nanFrame = createMockFrame({ x: NaN, y: NaN, z: NaN });
      const staticFrames = Array(20).fill(null).map(() => createMockFrame());
      staticFrames[0] = nanFrame;

      const result = calculateTrunkSway(staticFrames);
      expect(Number.isNaN(result.lateralExcursionDeg)).toBe(false);
      expect(Number.isNaN(result.sagittalExcursionDeg)).toBe(false);
      expect(Number.isNaN(result.harmonicRatio)).toBe(false);
      expect(result.harmonicRatio).toBe(1.0); // flat signal oddSum is 0 -> fallback to 1.0
    });
  });

  describe("R8: Hypothesis Rule Confidence Scores, Z-Score Bounds, False Positive Resistance", () => {
    const normalMetrics: GaitMetrics = {
      fpsEffective: 30,
      avgStepTimeSec: 0.57,
      stepWidthVariability: 0.01,
      doubleSupportHint: 0.20,
      cadenceSpm: 105,
      gaitSpeedMps: 1.35,
      stepTimeCV: 0.02,
      strideTimeCV: 0.02,
      leftStancePct: 60.0,
      rightStancePct: 60.0,
      doubleSupportPct: 20.0,
      kneeFlexLeft: 60.0,
      kneeFlexRight: 60.0,
      meanStepWidth: 0.16,
      pelvicObliquity: 0.02,
      lateralSway: 0.03,
      armSwingLeft: 0.35,
      armSwingRight: 0.35,
      armSwingAsymmetry: 0.02,
      stepTimeAsymmetry: 0.02,
      strideAsymmetry: 0.02,
      kneeAsymmetry: 0.02,
      symmetryAngle: 1.5,
      viewAngle: "sagittal",
      viewConfidence: 0.95,
      durationSec: 10.0,
      stepCount: 18,
      stabilityScore: 90,
      symmetryScore: 92,
      automaticityScore: 88,
      mobilityScore: 90,
      rhythmScore: 89,
      overallScore: 90,
      verticalBounce: 0.03,
      pathSmoothness: 0.95,
    } as GaitMetrics;

    it("R8: resists false positives on normal healthy gait metrics", () => {
      const guesses = buildEducatedGuesses(normalMetrics, { age: 30, sex: "combined" });
      const ids = guesses.map((g) => g.id);

      expect(ids).not.toContain("steppage-gait");
      expect(ids).not.toContain("festinating-gait");
      expect(ids).not.toContain("scissoring-gait");
      expect(ids).not.toContain("waddling-gait");
      expect(ids).not.toContain("trendelenburg-sign");
      expect(ids).not.toContain("circumduction-gait");
    });

    it("R8: triggers steppage gait correctly with valid bounded confidence", () => {
      const steppageMetrics: GaitMetrics = {
        ...normalMetrics,
        kneeFlexLeft: 75.0, // High knee flexion (>2 SD)
        viewAngle: "sagittal",
      };
      (steppageMetrics as any).ankleDorsiflexion = -8.0; // Dorsiflexion deficit / foot drop

      const guesses = buildEducatedGuesses(steppageMetrics);
      const steppageGuess = guesses.find((g) => g.id === "steppage-gait");

      expect(steppageGuess).toBeDefined();
      expect(steppageGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(steppageGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: triggers festinating gait correctly with valid bounded confidence", () => {
      const festinatingMetrics: GaitMetrics = {
        ...normalMetrics,
        cadenceSpm: 135,
        gaitSpeedMps: 0.8, // short steps (0.35m)
        stepTimeCV: 0.10,
        armSwingLeft: 0.05,
        armSwingRight: 0.05,
      };

      const guesses = buildEducatedGuesses(festinatingMetrics);
      const festinatingGuess = guesses.find((g) => g.id === "festinating-gait");

      expect(festinatingGuess).toBeDefined();
      expect(festinatingGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(festinatingGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: triggers scissoring gait correctly with valid bounded confidence", () => {
      const scissoringMetrics: GaitMetrics = {
        ...normalMetrics,
        meanStepWidth: 0.04, // narrow step width (Z < -2.0)
        viewAngle: "frontal",
      };
      (scissoringMetrics as any).hipAdduction = 8.0;

      const guesses = buildEducatedGuesses(scissoringMetrics);
      const scissoringGuess = guesses.find((g) => g.id === "scissoring-gait");

      expect(scissoringGuess).toBeDefined();
      expect(scissoringGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(scissoringGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: triggers waddling gait correctly with valid bounded confidence", () => {
      const waddlingMetrics: GaitMetrics = {
        ...normalMetrics,
        pelvicObliquity: 0.18, // > 8 deg (0.14 rad)
        lateralSway: 0.09,
        viewAngle: "frontal",
      };

      const angleAnalysisMock: Partial<GaitAngleAnalysis> = {
        trunkSway: {
          lateralExcursionDeg: 9.5, // > 2 SD
          sagittalExcursionDeg: 3.0,
          harmonicRatio: 0.8,
        },
      };

      const guesses = buildEducatedGuesses(waddlingMetrics, {
        angleAnalysis: angleAnalysisMock as GaitAngleAnalysis,
      });
      const waddlingGuess = guesses.find((g) => g.id === "waddling-gait");

      expect(waddlingGuess).toBeDefined();
      expect(waddlingGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(waddlingGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: triggers Trendelenburg sign correctly with valid bounded confidence", () => {
      const trendelenburgMetrics: GaitMetrics = {
        ...normalMetrics,
        pelvicObliquity: 0.12, // ~ 6.9 deg (> 5 deg)
        viewAngle: "frontal",
      };

      const guesses = buildEducatedGuesses(trendelenburgMetrics);
      const trendelenburgGuess = guesses.find((g) => g.id === "trendelenburg-sign");

      expect(trendelenburgGuess).toBeDefined();
      expect(trendelenburgGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(trendelenburgGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: triggers circumduction gait correctly with valid bounded confidence", () => {
      const circumductionMetrics: GaitMetrics = {
        ...normalMetrics,
        kneeFlexLeft: 25.0, // stiff knee (< 32 deg)
        kneeFlexRight: 60.0,
        viewAngle: "sagittal",
      };
      (circumductionMetrics as any).swingLateralArc = 0.09; // Z > 2.0

      const guesses = buildEducatedGuesses(circumductionMetrics);
      const circumductionGuess = guesses.find((g) => g.id === "circumduction-gait");

      expect(circumductionGuess).toBeDefined();
      expect(circumductionGuess!.confidence).toBeGreaterThanOrEqual(0.0);
      expect(circumductionGuess!.confidence).toBeLessThanOrEqual(1.0);
    });

    it("R8: calculateZScore handles invalid / boundary SD and NaN inputs without throwing", () => {
      expect(calculateZScore(10, 10, 0)).toBe(0);
      expect(calculateZScore(10, 10, -5)).toBe(0);
      expect(calculateZScore(NaN, 10, 2)).toBe(0);
      expect(calculateZScore(10, Infinity, 2)).toBe(0);
      expect(calculateZScore(10, 10, NaN)).toBe(0);
    });
  });

  describe("R9: GPS & MAP 101-Point Curve Interpolation, Age Tier Defaults, Parameter Fallbacks", () => {
    it("R9: handles age tier bounds correctly (pediatric, young, middle, elderly, advanced_75_84, advanced_85_plus)", () => {
      const p15 = getNormativeReference("cadenceSpm", 15);
      expect(p15.citation).toBe("Bovi et al. (2011)");
      expect(p15.mean).toBe(126.0); // pediatric combined

      const y30 = getNormativeReference("cadenceSpm", 30);
      expect(y30.mean).toBe(115.1); // young combined

      const m55 = getNormativeReference("cadenceSpm", 55);
      expect(m55.mean).toBe(111.4); // middle combined

      const e70 = getNormativeReference("cadenceSpm", 70);
      expect(e70.mean).toBe(106.35); // elderly combined

      const a80 = getNormativeReference("cadenceSpm", 80);
      expect(a80.mean).toBe(101.25); // advanced_75_84 combined

      const a90 = getNormativeReference("cadenceSpm", 90);
      expect(a90.mean).toBe(94.75); // advanced_85_plus combined

      const noAge = getNormativeReference("cadenceSpm");
      expect(noAge.citation).toBe("Winter (2009)");
      expect(noAge.mean).toBe(105.0);
    });

    it("R9: falls back safely on unknown parameters or unknown sex inputs", () => {
      const unknownParam = getNormativeReference("nonExistentParam", 30, "female");
      expect(unknownParam.citation).toBe("Winter (2009)");

      const unknownSex = getNormativeReference("cadenceSpm", 30, "unknown_sex" as any);
      expect(unknownSex.mean).toBe(115.1); // combined sex fallback
    });

    it("R9: calculateGPSAndMAP computes 101-point RMSE and sub-scores correctly", () => {
      const mockPoints = Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 20.0,
        kneeAngleRight: 20.0,
        hipAngleLeft: 15.0,
        hipAngleRight: 15.0,
        ankleAngleLeft: 5.0,
        ankleAngleRight: 5.0,
      }));

      const mockAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
        armSwing: { leftAmplitude: 10, rightAmplitude: 10, asymmetryIndex: 0, phaseCorrelation: 1 },
        trunkSway: { lateralExcursionDeg: 3, sagittalExcursionDeg: 2, harmonicRatio: 1.5 },
      };

      const result = calculateGPSAndMAP(mockAnalysis);
      expect(result.gpsScore).toBeGreaterThan(0);
      expect(result.evaluatedJointCount).toBe(3); // Knee, Hip, Ankle
      expect(result.map.kneeFlexionExtension).toBeDefined();
      expect(result.map.hipFlexionExtension).toBeDefined();
      expect(result.map.ankleDorsiflexionPlantarflexion).toBeDefined();
      expect(result.citation).toBe("Baker et al. (2009)");
    });

    it("R9: returns default un-evaluated result when sagittal kinematics are suppressed", () => {
      const suppressedAnalysis: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Frontal camera view",
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: [],
        armSwing: { leftAmplitude: 0, rightAmplitude: 0, asymmetryIndex: 0, phaseCorrelation: 0 },
        trunkSway: { lateralExcursionDeg: 3, sagittalExcursionDeg: 2, harmonicRatio: 1.5 },
      };

      const result = calculateGPSAndMAP(suppressedAnalysis);
      expect(result.gpsScore).toBe(0);
      expect(result.evaluatedJointCount).toBe(0);
      expect(result.interpretation).toContain("suppressed");
    });
  });
});
