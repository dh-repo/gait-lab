import { describe, test, expect } from "vitest";
import { resamplePoseFrames } from "../pose";
import { zeroPhaseButterworth } from "../signal";
import { detectGaitEventsZeni } from "../events";
import { symmetryAngle } from "../symmetry";
import { calculateDTE } from "../dte";
import type { PoseFrame, GaitMetrics } from "../types";

describe("Milestone 2 Empirical Challenger Stress Harness", () => {
  describe("1. resamplePoseFrames Catmull-Rom Interpolation Edge Cases", () => {
    test("handles < 4 frames (1, 2, 3 frames)", () => {
      const frame1: PoseFrame[] = [{ timeMs: 0, landmarks: [{ x: 1, y: 2, z: 3 }] }];
      expect(resamplePoseFrames(frame1)).toEqual(frame1);

      const frame2: PoseFrame[] = [
        { timeMs: 0, landmarks: [{ x: 1, y: 2, z: 3 }] },
        { timeMs: 100, landmarks: [{ x: 2, y: 3, z: 4 }] },
      ];
      expect(resamplePoseFrames(frame2)).toEqual(frame2);

      const frame3: PoseFrame[] = [
        { timeMs: 0, landmarks: [{ x: 1, y: 2, z: 3 }] },
        { timeMs: 50, landmarks: [{ x: 1.5, y: 2.5, z: 3.5 }] },
        { timeMs: 100, landmarks: [{ x: 2, y: 3, z: 4 }] },
      ];
      expect(resamplePoseFrames(frame3)).toEqual(frame3);
    });

    test("handles duplicate timestamps and zero duration", () => {
      const dupFrames: PoseFrame[] = [
        { timeMs: 100, landmarks: [{ x: 1, y: 1, z: 1 }] },
        { timeMs: 100, landmarks: [{ x: 1, y: 1, z: 1 }] },
        { timeMs: 100, landmarks: [{ x: 1, y: 1, z: 1 }] },
        { timeMs: 100, landmarks: [{ x: 1, y: 1, z: 1 }] },
      ];
      const res = resamplePoseFrames(dupFrames);
      expect(res).toEqual(dupFrames);
    });

    test("handles uneven timestamps accurately", () => {
      const unevenFrames: PoseFrame[] = [
        { timeMs: 0, landmarks: [{ x: 0, y: 0, z: 0 }] },
        { timeMs: 20, landmarks: [{ x: 0.2, y: 0.2, z: 0.2 }] },
        { timeMs: 150, landmarks: [{ x: 1.5, y: 1.5, z: 1.5 }] },
        { timeMs: 200, landmarks: [{ x: 2.0, y: 2.0, z: 2.0 }] },
      ];
      const res = resamplePoseFrames(unevenFrames, 30);
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].timeMs).toBe(0);
      expect(res.every((f) => !isNaN(f.landmarks[0].x))).toBe(true);
    });

    test("handles missing or sparse landmark elements gracefully", () => {
      const sparseFrames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 33, landmarks: [{ x: 1, y: 1, z: 1 }] },
        { timeMs: 66, landmarks: [] },
        { timeMs: 100, landmarks: [{ x: 2, y: 2, z: 2 }] },
      ];
      const res = resamplePoseFrames(sparseFrames, 30);
      expect(res.length).toBe(4);
      expect(res.every((f) => Array.isArray(f.landmarks))).toBe(true);
    });

    test("handles 0 FPS and negative FPS input", () => {
      const frames: PoseFrame[] = [
        { timeMs: 0, landmarks: [{ x: 0, y: 0, z: 0 }] },
        { timeMs: 33, landmarks: [{ x: 1, y: 1, z: 1 }] },
        { timeMs: 66, landmarks: [{ x: 2, y: 2, z: 2 }] },
        { timeMs: 100, landmarks: [{ x: 3, y: 3, z: 3 }] },
      ];
      const resZero = resamplePoseFrames(frames, 0);
      expect(resZero.length).toBe(1); // numSteps = floor(100 / Infinity) + 1 = 1

      const resNeg = resamplePoseFrames(frames, -30);
      expect(resNeg.length).toBe(0); // numSteps < 0 -> returns empty array
    });
  });

  describe("2. zeroPhaseButterworth Filter Stress & Boundary Harness", () => {
    test("preserves constant DC signals within transient boundary tolerance", () => {
      const constantData = new Array(50).fill(42.5);
      const filtered = zeroPhaseButterworth(constantData, 30, 6.0);
      expect(filtered.length).toBe(50);
      filtered.forEach((val) => {
        // Within 0.5 absolute tolerance (accounts for padLen=12 Q2 underdamped initial filter transient)
        expect(Math.abs(val - 42.5)).toBeLessThan(0.5);
      });
    });

    test("filters impulse signal symmetrically with zero phase shift", () => {
      const impulse = new Array(61).fill(0);
      impulse[30] = 100; // Single peak in center
      const filtered = zeroPhaseButterworth(impulse, 30, 6.0);

      const maxIndex = filtered.indexOf(Math.max(...filtered));
      expect(maxIndex).toBe(30); // Peak remains exactly centered at index 30 (zero phase delay)

      // Verify symmetry around peak
      for (let offset = 1; offset <= 10; offset++) {
        expect(filtered[30 - offset]).toBeCloseTo(filtered[30 + offset], 4);
      }
    });

    test("handles high-frequency noise suppression effectively", () => {
      const signal = new Array(100).fill(0).map((_, i) => Math.sin(i * 0.1) + (i % 2 === 0 ? 0.5 : -0.5));
      const filtered = zeroPhaseButterworth(signal, 30, 6.0);
      expect(filtered.length).toBe(100);

      // Derivative of filtered signal should be much smaller than raw noisy signal
      let rawDiffSum = 0;
      let filtDiffSum = 0;
      for (let i = 1; i < 100; i++) {
        rawDiffSum += Math.abs(signal[i] - signal[i - 1]);
        filtDiffSum += Math.abs(filtered[i] - filtered[i - 1]);
      }
      expect(filtDiffSum).toBeLessThan(rawDiffSum * 0.3);
    });

    test("returns copy for signals shorter than 5 frames", () => {
      const shortSignal = [10, 20, 30, 40];
      expect(zeroPhaseButterworth(shortSignal, 30, 6.0)).toEqual(shortSignal);
    });
  });

  describe("3. detectGaitEventsZeni Kinematic Event Detector Edge Cases", () => {
    test("handles zero movement (completely stationary subject)", () => {
      const stationaryFrames: PoseFrame[] = new Array(30).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }),
      }));

      const breakdown = detectGaitEventsZeni(stationaryFrames, 30);
      expect(breakdown.leftStancePct).toBe(60.0);
      expect(breakdown.rightStancePct).toBe(60.0);
      expect(breakdown.doubleSupportPct).toBe(20.0);
    });

    test("handles pure lateral movement (no forward/backward AP displacement)", () => {
      const lateralFrames: PoseFrame[] = new Array(60).fill(0).map((_, i) => {
        const xOffset = i * 0.005; // Moving purely sideways
        return {
          timeMs: i * 33.3,
          landmarks: new Array(33).fill(0).map(() => ({
            x: 0.5 + xOffset,
            y: 0.5,
            z: 0,
            visibility: 0.9,
          })),
        };
      });

      const breakdown = detectGaitEventsZeni(lateralFrames, 30);
      expect(breakdown).toBeDefined();
      expect(breakdown.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(breakdown.leftStancePct).toBeLessThanOrEqual(80);
    });

    test("handles extreme signal noise without throwing", () => {
      const noisyFrames: PoseFrame[] = new Array(60).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill(0).map(() => ({
          x: Math.random(),
          y: Math.random(),
          z: Math.random(),
          visibility: Math.random(),
        })),
      }));

      const breakdown = detectGaitEventsZeni(noisyFrames, 30);
      expect(breakdown.stepEvents).toBeDefined();
      expect(isNaN(breakdown.leftStancePct)).toBe(false);
    });
  });

  describe("4. symmetryAngle Boundary & Mathematical Mechanics", () => {
    test("returns 0% for identical values", () => {
      expect(symmetryAngle(0.65, 0.65)).toBe(0.0);
      expect(symmetryAngle(120, 120)).toBe(0.0);
    });

    test("handles negative values identically to positive values (absolute magnitude)", () => {
      expect(symmetryAngle(-0.65, 0.65)).toBe(0.0);
      expect(symmetryAngle(-10, -10)).toBe(0.0);
      expect(symmetryAngle(-10, 20)).toBe(symmetryAngle(10, 20));
    });

    test("handles zero values and caps maximum theoretical asymmetry at 50%", () => {
      expect(symmetryAngle(0, 0)).toBe(0.0);
      expect(symmetryAngle(10, 0)).toBe(50.0);
      expect(symmetryAngle(0, 10)).toBe(50.0);
      expect(symmetryAngle(100000, 0.0001)).toBeLessThanOrEqual(50.0);
    });
  });

    describe("6. calculateDTE Standardized Dual-Task Effect Mechanics", () => {
    const baseMetrics: GaitMetrics = {
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

    test("returns zero DTEs and no_interference for identical baseline and dual-task", () => {
      const res = calculateDTE(baseMetrics, baseMetrics);
      expect(res.cadenceDTE).toBe(0.0);
      expect(res.stepTimeCvDTE).toBe(0.0);
      expect(res.symmetryDTE).toBe(0.0);
      expect(res.cmiClassification).toBe("no_interference");
    });

    test("properly classifies motor prioritization when cadence improves > 5%", () => {
      const dualTask = { ...baseMetrics, cadenceSpm: 112 }; // +12% cadence
      const res = calculateDTE(baseMetrics, dualTask);
      expect(res.cadenceDTE).toBe(12.0);
      expect(res.cmiClassification).toBe("motor_prioritization");
    });

    test("properly classifies cognitive prioritization vs mutual interference", () => {
      // Cognitive prioritization: cadence drops by 8%, CV unchanged
      const cogPrio = { ...baseMetrics, cadenceSpm: 92 };
      const res1 = calculateDTE(baseMetrics, cogPrio);
      expect(res1.cmiClassification).toBe("cognitive_prioritization");

      // Mutual interference: cadence drops by 8%, CV worsens (increases from 0.04 to 0.05 -> DTE = -25%)
      const mutual = { ...baseMetrics, cadenceSpm: 92, stepTimeCV: 0.05 };
      const res2 = calculateDTE(baseMetrics, mutual);
      expect(res2.cmiClassification).toBe("mutual_interference");
    });

    test("handles zero baseline values without division-by-zero or NaN", () => {
      const zeroBase = { ...baseMetrics, cadenceSpm: 0, stepTimeCV: 0, symmetryScore: 0 };
      const res = calculateDTE(zeroBase, baseMetrics);
      expect(isNaN(res.cadenceDTE)).toBe(false);
      expect(isNaN(res.stepTimeCvDTE)).toBe(false);
      expect(isNaN(res.symmetryDTE)).toBe(false);
    });
  });
});
