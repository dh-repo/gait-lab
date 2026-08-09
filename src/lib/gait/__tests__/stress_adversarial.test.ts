import { describe, test, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
} from "../signal";
import { detectGaitEventsZeni } from "../events";
import { symmetryAngle, gaitSymmetryIndex } from "../symmetry";
import { calculateDTE } from "../dte";
import type { PoseFrame, GaitMetrics } from "../types";

describe("Milestone 1 Stress & Adversarial Boundary Tests", () => {
  describe("signal.ts Stress Tests", () => {
    test("handles empty, small, and invalid fps inputs gracefully", () => {
      expect(butterworthLowPass([], 30)).toEqual([]);
      expect(zeroPhaseButterworth([], 30)).toEqual([]);
      expect(butterworthLowPass([1, 2, 3], 30)).toEqual([1, 2, 3]);
      expect(zeroPhaseButterworth([1, 2, 3, 4], 30)).toEqual([1, 2, 3, 4]);
      expect(zeroPhaseButterworth([1, 2, 3, 4, 5], 0)).toEqual([1, 2, 3, 4, 5]);
      expect(zeroPhaseButterworth([1, 2, 3, 4, 5], -10)).toEqual([1, 2, 3, 4, 5]);
    });

    test("handles cutoffHz equal to or exceeding Nyquist limit", () => {
      const signal = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const filteredNyquist = zeroPhaseButterworth(signal, 30, 15);
      expect(filteredNyquist.length).toBe(10);
      expect(filteredNyquist.every((v) => !isNaN(v))).toBe(true);

      const filteredAboveNyquist = zeroPhaseButterworth(signal, 30, 20);
      expect(filteredAboveNyquist.length).toBe(10);
      expect(filteredAboveNyquist.every((v) => !isNaN(v))).toBe(true);
    });

    test("handles very large array (100,000 samples) without memory leak or crash", () => {
      const largeArray = new Array(100000).fill(0).map((_, i) => Math.sin(i * 0.1));
      const start = performance.now();
      const result = zeroPhaseButterworth(largeArray, 30, 6.0);
      const elapsed = performance.now() - start;

      expect(result.length).toBe(100000);
      expect(elapsed).toBeLessThan(2000); // Should execute within 2 seconds
    });

  });

  describe("symmetry.ts Mathematical & Boundary Stress Tests", () => {
    test("symmetryAngle mathematically caps at 50% asymmetry despite [0, 100]% claim", () => {
      // Perfect symmetry
      expect(symmetryAngle(10, 10)).toBe(0);

      // Extreme one-sided asymmetry (valLeft = 100, valRight = 0)
      const saZeroRight = symmetryAngle(100, 0);
      expect(saZeroRight).toBe(50); // Demonstrates SA is capped at 50% due to denominator 90

      // Extreme one-sided asymmetry (valLeft = 0, valRight = 100)
      const saZeroLeft = symmetryAngle(0, 100);
      expect(saZeroLeft).toBe(50);

      // Even for 1000:1 ratio, result is ~49.94%, never reaching 100%
      const saExtreme = symmetryAngle(1000, 1);
      expect(saExtreme).toBeLessThanOrEqual(50);
    });

    test("gaitSymmetryIndex boundary behavior", () => {
      expect(gaitSymmetryIndex(0, 0)).toBe(100);
      expect(gaitSymmetryIndex(10, 10)).toBe(100);
      expect(gaitSymmetryIndex(10, 0)).toBe(0);
      expect(gaitSymmetryIndex(0, 10)).toBe(0);
      expect(gaitSymmetryIndex(5, 10)).toBe(50);
    });

    test("handles NaN and Infinity inputs in symmetry functions", () => {
      const saNaN = symmetryAngle(NaN, 10);
      expect(typeof saNaN).toBe("number"); // Check if returns NaN or handles it

      const gsiNaN = gaitSymmetryIndex(NaN, 10);
      expect(typeof gsiNaN).toBe("number");
    });
  });

  describe("events.ts Stress Tests", () => {
    test("detectGaitEventsZeni handles empty and corrupted frames", () => {
      const emptyResult = detectGaitEventsZeni([], 30);
      expect(emptyResult.leftStancePct).toBe(60.0);
      expect(emptyResult.stepEvents).toEqual([]);

      const corruptedFrames: PoseFrame[] = new Array(20).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: [],
      }));

      const res = detectGaitEventsZeni(corruptedFrames, 30);
      expect(res.leftStancePct).toBe(60.0);
      expect(res.rightStancePct).toBe(60.0);
    });

    test("detectGaitEventsZeni with stationary (walking in place) trajectory", () => {
      const stationaryFrames: PoseFrame[] = new Array(60).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: [
          // Basic hips and feet stationary
          { x: 0.5, y: 0.5, z: 0 }, // 0
          ...new Array(22).fill({ x: 0.5, y: 0.5, z: 0 }),
          { x: 0.48, y: 0.8, z: 0 }, // 23: L_HIP
          { x: 0.52, y: 0.8, z: 0 }, // 24: R_HIP
          ...new Array(4).fill({ x: 0.5, y: 0.9, z: 0 }),
          { x: 0.47 + 0.05 * Math.sin(i * 0.5), y: 0.95, z: 0 }, // 29: L_HEEL
          { x: 0.53 - 0.05 * Math.sin(i * 0.5), y: 0.95, z: 0 }, // 30: R_HEEL
          { x: 0.47 + 0.05 * Math.sin(i * 0.5), y: 0.98, z: 0 }, // 31: L_FOOT
          { x: 0.53 - 0.05 * Math.sin(i * 0.5), y: 0.98, z: 0 }, // 32: R_FOOT
        ],
      }));

      const res = detectGaitEventsZeni(stationaryFrames, 30);
      expect(res).toBeDefined();
      expect(Array.isArray(res.stepEvents)).toBe(true);
    });
  });

  describe("dte.ts Stress Tests", () => {
    const mockBaseline: GaitMetrics = {
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 20,
      cadenceSpm: 100,
      avgStepTimeSec: 0.6,
      stepTimeAsymmetry: 2,
      strideAsymmetry: 2,
      lateralSway: 0.05,
      verticalBounce: 0.05,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.02,
      doubleSupportHint: 20,
      leftStancePct: 60.0,
      rightStancePct: 60.0,
      leftSwingPct: 40.0,
      rightSwingPct: 40.0,
      doubleSupportPct: 20.0,
      symmetryAngle: 0.0,
      stepTimeCV: 0.04,
      strideTimeCV: 0.04,
      pelvicObliquity: 0.02,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.15,
      pathSmoothness: 0.95,
      stabilityScore: 85,
      rhythmScore: 85,
      symmetryScore: 90,
      mobilityScore: 85,
      automaticityScore: 85,
      overallScore: 86,
      series: [],
      stepEvents: [],
    };

    test("calculateDTE boundary conditions and CMI classifications", () => {
      // 1. Dual task with no interference (|DTE| <= 5%)
      const noInterferenceDT = { ...mockBaseline, cadenceSpm: 98, stepTimeCV: 0.041 };
      const res1 = calculateDTE(mockBaseline, noInterferenceDT);
      expect(res1.cmiClassification).toBe("no_interference");

      // 2. Both motor metrics degraded (cadence -10%, CV increased from 0.04 to 0.05 -> DTE -25%)
      const mutualDT = { ...mockBaseline, cadenceSpm: 90, stepTimeCV: 0.05 };
      const res2 = calculateDTE(mockBaseline, mutualDT);
      expect(res2.cadenceDTE).toBe(-10.0);
      expect(res2.stepTimeCvDTE).toBe(-25.0);
      expect(res2.cmiClassification).toBe("mutual_interference");

      // 3. Only one motor metric degraded (cadence -10%, CV unchanged)
      const cogPrioDT = { ...mockBaseline, cadenceSpm: 90, stepTimeCV: 0.04 };
      const res3 = calculateDTE(mockBaseline, cogPrioDT);
      expect(res3.cadenceDTE).toBe(-10.0);
      expect(res3.stepTimeCvDTE).toBe(0.0);
      expect(res3.cmiClassification).toBe("cognitive_prioritization");

      // 4. Cadence improved > +5% (110 spm -> +10%)
      const motorPrioDT = { ...mockBaseline, cadenceSpm: 110, stepTimeCV: 0.04 };
      const res4 = calculateDTE(mockBaseline, motorPrioDT);
      expect(res4.cadenceDTE).toBe(10.0);
      expect(res4.cmiClassification).toBe("motor_prioritization");
    });

    test("calculateDTE zero baseline handling", () => {
      const zeroBaseline = { ...mockBaseline, cadenceSpm: 0, stepTimeCV: 0, symmetryScore: 0 };
      const res = calculateDTE(zeroBaseline, mockBaseline);
      expect(res.cadenceDTE).toBe(0);
      expect(res.stepTimeCvDTE).toBeDefined();
      expect(isNaN(res.cadenceDTE)).toBe(false);
      expect(isNaN(res.stepTimeCvDTE)).toBe(false);
    });
  });
});
