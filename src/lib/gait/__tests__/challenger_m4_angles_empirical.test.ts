import { describe, it, expect } from "vitest";
import {
  calculateKneeFlexion,
  calculateHipFlexion,
  calculateAnkleAngle,
  computeGaitAngleAnalysis,
} from "../angles";
import type { Landmark, PoseFrame } from "../types";
import type { GaitEvent } from "../events";
import { LM } from "../landmarks";

describe("Challenger Empirical Verification - angles.ts", () => {
  describe("1. Extreme & Edge-Case Landmark Inputs", () => {
    it("handles missing, undefined, null, zero-visibility, and low-visibility landmarks", () => {
      // Undefined or null arguments
      expect(calculateKneeFlexion(undefined, null, undefined)).toBe(0);
      expect(calculateHipFlexion(null, undefined, null, 1)).toBe(0);
      expect(calculateAnkleAngle(undefined, undefined, null, 1)).toBe(0);

      // Low visibility (< 0.3)
      const visLow: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.1 };
      const visHigh: Landmark = { x: 0.5, y: 0.8, z: 0, visibility: 0.9 };
      expect(calculateKneeFlexion(visLow, visHigh, visHigh)).toBe(0);
      expect(calculateHipFlexion(visHigh, visLow, visHigh, 1)).toBe(0);
      expect(calculateAnkleAngle(visHigh, visHigh, visLow, 1, visLow)).toBe(0);

      // Undefined visibility defaults to 1 according to visibility ?? 1 check
      const visUndef1: Landmark = { x: 0, y: 0, z: 0 };
      const visUndef2: Landmark = { x: 0, y: 1, z: 0 };
      const visUndef3: Landmark = { x: 1, y: 1, z: 0 };
      expect(calculateKneeFlexion(visUndef1, visUndef2, visUndef3)).toBeCloseTo(90, 1);
    });

    it("handles NaN, Infinity, and non-finite landmark coordinates", () => {
      const lmNaN: Landmark = { x: NaN, y: NaN, z: NaN, visibility: 0.9 };
      const lmInf: Landmark = { x: Infinity, y: -Infinity, z: Infinity, visibility: 0.9 };
      const lmValid: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };

      const kneeNaN = calculateKneeFlexion(lmNaN, lmValid, lmValid);
      expect(Number.isFinite(kneeNaN)).toBe(true);
      expect(kneeNaN).toBeGreaterThanOrEqual(0);

      const hipInf = calculateHipFlexion(lmInf, lmValid, lmValid, 1);
      expect(Number.isFinite(hipInf)).toBe(true);

      const ankleNaN = calculateAnkleAngle(lmNaN, lmInf, lmNaN, 1, lmValid);
      expect(Number.isFinite(ankleNaN)).toBe(true);
    });

    it("handles extreme planar distortion, huge scale, and negative coordinates", () => {
      const huge1: Landmark = { x: 1e8, y: 2e8, z: 0, visibility: 0.95 };
      const huge2: Landmark = { x: 1e8, y: 3e8, z: 0, visibility: 0.95 };
      const huge3: Landmark = { x: 2e8, y: 3e8, z: 0, visibility: 0.95 };

      const kneeFlexHuge = calculateKneeFlexion(huge1, huge2, huge3);
      expect(Number.isFinite(kneeFlexHuge)).toBe(true);
      expect(kneeFlexHuge).toBeGreaterThanOrEqual(0);

      const neg1: Landmark = { x: -500, y: -1000, z: -50, visibility: 0.9 };
      const neg2: Landmark = { x: -500, y: -500, z: 0, visibility: 0.9 };
      const neg3: Landmark = { x: 0, y: -500, z: 50, visibility: 0.9 };

      const hipFlexNeg = calculateHipFlexion(neg1, neg2, neg3, 1);
      expect(Number.isFinite(hipFlexNeg)).toBe(true);
    });

    it("handles collinear and identical overlapping landmarks", () => {
      const p: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
      expect(calculateKneeFlexion(p, p, p)).toBe(0);
      expect(calculateHipFlexion(p, p, p, 1)).toBe(0);
      // angleDeg returns 180 for zero-magnitude vectors; 90 - 180 = -90
      expect(calculateAnkleAngle(p, p, p, 1, p)).toBe(-90);
    });
  });

  describe("2. Single-Stride & Edge-Case Clip Scenarios", () => {
    function generateClip(frameCount: number, eventList: GaitEvent[]): {
      frames: PoseFrame[];
      events: GaitEvent[];
    } {
      const frames: PoseFrame[] = [];
      for (let i = 0; i < frameCount; i++) {
        const tSec = i * 0.0333;
        const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0.9,
        }));
        // Left leg simple oscillating kinematics
        landmarks[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.L_HIP] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.L_KNEE] = {
          x: 0.4 + 0.1 * Math.sin(2 * Math.PI * tSec),
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.L_ANKLE] = { x: 0.4, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.L_HEEL] = { x: 0.38, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.L_FOOT] = { x: 0.45, y: 0.92, z: 0, visibility: 0.9 };

        // Right leg opposite phase oscillation
        landmarks[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.R_HIP] = { x: 0.6, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.R_KNEE] = {
          x: 0.6 + 0.1 * Math.sin(2 * Math.PI * tSec + Math.PI),
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.R_ANKLE] = { x: 0.6, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.R_HEEL] = { x: 0.58, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.R_FOOT] = { x: 0.65, y: 0.92, z: 0, visibility: 0.9 };

        frames.push({
          timeMs: i * 33.3,
          landmarks,
        });
      }
      return { frames, events: eventList };
    }

    it("handles zero-stride clips (0 events) gracefully via fallback interpolation", () => {
      const { frames } = generateClip(45, []);
      const result = computeGaitAngleAnalysis(frames, [], "sagittal", 1);

      expect(result.leftStrides).toHaveLength(0);
      expect(result.rightStrides).toHaveLength(0);
      expect(result.normalizedPoints).toHaveLength(101);
      expect(result.metrics.kneeRomLeft).not.toBeNull();
      expect(result.metrics.kneeRomLeft!).toBeGreaterThanOrEqual(0);
    });

    it("handles single-stride clips (2 heel strikes per side)", () => {
      const events: GaitEvent[] = [
        { frame: 5, timeSec: 0.166, type: "heel_strike", side: "left" },
        { frame: 35, timeSec: 1.166, type: "heel_strike", side: "left" },
        { frame: 20, timeSec: 0.666, type: "toe_off", side: "left" },
        { frame: 15, timeSec: 0.5, type: "heel_strike", side: "right" },
        { frame: 45, timeSec: 1.5, type: "heel_strike", side: "right" },
        { frame: 30, timeSec: 1.0, type: "toe_off", side: "right" },
      ];
      const { frames } = generateClip(50, events);
      const result = computeGaitAngleAnalysis(frames, events, "sagittal", 1);

      expect(result.leftStrides).toHaveLength(1);
      expect(result.rightStrides).toHaveLength(1);
      expect(result.leftStrides[0].points).toHaveLength(101);
      expect(result.rightStrides[0].points).toHaveLength(101);
      expect(result.normalizedPoints).toHaveLength(101);
    });

    it("handles short/invalid strides (< 0.2s duration) by filtering them out", () => {
      const invalidEvents: GaitEvent[] = [
        { frame: 10, timeSec: 0.33, type: "heel_strike", side: "left" },
        { frame: 13, timeSec: 0.40, type: "heel_strike", side: "left" }, // 0.07s < 0.2s
      ];
      const { frames } = generateClip(30, invalidEvents);
      const result = computeGaitAngleAnalysis(frames, invalidEvents, "sagittal", 1);

      expect(result.leftStrides).toHaveLength(0);
      expect(result.normalizedPoints).toHaveLength(101);
    });

    it("handles extreme frame rate / zero-duration clips without division by zero", () => {
      const singleFrame: PoseFrame[] = [
        {
          timeMs: 0,
          landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
        },
      ];
      const result = computeGaitAngleAnalysis(singleFrame, [], "sagittal", 1);

      expect(result.normalizedPoints).toHaveLength(101);
      expect(result.metrics.kneeRomLeft).not.toBeNull();
      expect(Number.isFinite(result.metrics.kneeRomLeft!)).toBe(true);
    });
  });

  describe("3. Frontal Camera View Suppression", () => {
    it("suppresses sagittal plane joint kinematic angles for frontal view angle", () => {
      const frames: PoseFrame[] = [
        {
          timeMs: 0,
          landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
        },
      ];
      const result = computeGaitAngleAnalysis(frames, [], "frontal", 1);

      expect(result.isSuppressed).toBe(true);
      expect(result.suppressionReason).toBeDefined();
      expect(result.suppressionReason).toContain("frontal camera view");
      expect(result.normalizedPoints).toHaveLength(101);
    });
  });

  describe("4. Verification of Mathematical Invariants", () => {
    function generateNoisyFrames(frameCount = 90): PoseFrame[] {
      const frames: PoseFrame[] = [];
      for (let i = 0; i < frameCount; i++) {
        const tSec = i * 0.0333;
        const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
          x: 0.5 + (Math.random() - 0.5) * 0.1,
          y: 0.5 + (Math.random() - 0.5) * 0.1,
          z: (Math.random() - 0.5) * 0.1,
          visibility: 0.8 + Math.random() * 0.2,
        }));
        landmarks[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.L_HIP] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.L_KNEE] = {
          x: 0.4 + 0.15 * Math.sin(2 * Math.PI * 0.8 * tSec),
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.L_ANKLE] = { x: 0.4, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.L_HEEL] = { x: 0.38, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.L_FOOT] = { x: 0.45, y: 0.92, z: 0, visibility: 0.9 };

        landmarks[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.R_HIP] = { x: 0.6, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.R_KNEE] = {
          x: 0.6 + 0.05 * Math.sin(2 * Math.PI * 0.8 * tSec + Math.PI),
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.R_ANKLE] = { x: 0.6, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.R_HEEL] = { x: 0.58, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.R_FOOT] = { x: 0.65, y: 0.92, z: 0, visibility: 0.9 };

        frames.push({ timeMs: i * 33.3, landmarks });
      }
      return frames;
    }

    const events: GaitEvent[] = [
      { frame: 10, timeSec: 0.33, type: "heel_strike", side: "left" },
      { frame: 45, timeSec: 1.50, type: "heel_strike", side: "left" },
      { frame: 80, timeSec: 2.66, type: "heel_strike", side: "left" },
      { frame: 25, timeSec: 0.83, type: "heel_strike", side: "right" },
      { frame: 60, timeSec: 2.00, type: "heel_strike", side: "right" },
    ];

    it("verifies invariant: ROM >= 0 across all joints", () => {
      const frames = generateNoisyFrames();
      const res = computeGaitAngleAnalysis(frames, events, "sagittal", 1);
      const m = res.metrics;

      expect(m.kneeRomLeft!).toBeGreaterThanOrEqual(0);
      expect(m.kneeRomRight!).toBeGreaterThanOrEqual(0);
      expect(m.hipRomLeft!).toBeGreaterThanOrEqual(0);
      expect(m.hipRomRight!).toBeGreaterThanOrEqual(0);
      expect(m.ankleRomLeft!).toBeGreaterThanOrEqual(0);
      expect(m.ankleRomRight!).toBeGreaterThanOrEqual(0);
    });

    it("verifies invariant: Asymmetry % is strictly in [0, 100]", () => {
      const frames = generateNoisyFrames();
      const res = computeGaitAngleAnalysis(frames, events, "sagittal", 1);
      const m = res.metrics;

      expect(m.kneeAsymmetryPct!).toBeGreaterThanOrEqual(0);
      expect(m.kneeAsymmetryPct!).toBeLessThanOrEqual(100);

      expect(m.hipAsymmetryPct!).toBeGreaterThanOrEqual(0);
      expect(m.hipAsymmetryPct!).toBeLessThanOrEqual(100);

      expect(m.ankleAsymmetryPct!).toBeGreaterThanOrEqual(0);
      expect(m.ankleAsymmetryPct!).toBeLessThanOrEqual(100);
    });

    it("verifies invariant: 101-point output length for normalized points and normative data", () => {
      const frames = generateNoisyFrames();
      const res = computeGaitAngleAnalysis(frames, events, "sagittal", 1);

      expect(res.normalizedPoints).toHaveLength(101);
      expect(res.normativeData).toHaveLength(101);
      expect(res.normalizedPoints[0].gaitCyclePct).toBe(0);
      expect(res.normalizedPoints[100].gaitCyclePct).toBe(100);

      for (const stride of [...res.leftStrides, ...res.rightStrides]) {
        expect(stride.points).toHaveLength(101);
      }
    });

    it("verifies invariant: Non-NaN / Non-infinite values across all returned metrics and trajectory points", () => {
      const frames = generateNoisyFrames();
      const res = computeGaitAngleAnalysis(frames, events, "sagittal", 1);

      // Check normalized points
      for (const pt of res.normalizedPoints) {
        expect(Number.isFinite(pt.gaitCyclePct)).toBe(true);
        expect(Number.isFinite(pt.kneeAngleLeft!)).toBe(true);
        expect(Number.isFinite(pt.kneeAngleRight!)).toBe(true);
        expect(Number.isFinite(pt.hipAngleLeft!)).toBe(true);
        expect(Number.isFinite(pt.hipAngleRight!)).toBe(true);
        expect(Number.isFinite(pt.ankleAngleLeft!)).toBe(true);
        expect(Number.isFinite(pt.ankleAngleRight!)).toBe(true);
      }

      // Check metrics
      const mValues = Object.values(res.metrics);
      for (const val of mValues) {
        if (val !== null) {
          expect(Number.isFinite(val)).toBe(true);
          expect(Number.isNaN(val)).toBe(false);
        }
      }

      // Check normative data
      for (const normPt of res.normativeData) {
        expect(Number.isFinite(normPt.gaitCyclePct)).toBe(true);
        expect(Number.isFinite(normPt.kneeMean)).toBe(true);
        expect(Number.isFinite(normPt.kneeMin)).toBe(true);
        expect(Number.isFinite(normPt.kneeMax)).toBe(true);
        expect(Number.isFinite(normPt.hipMean)).toBe(true);
        expect(Number.isFinite(normPt.hipMin)).toBe(true);
        expect(Number.isFinite(normPt.hipMax)).toBe(true);
        expect(Number.isFinite(normPt.ankleMean)).toBe(true);
        expect(Number.isFinite(normPt.ankleMin)).toBe(true);
        expect(Number.isFinite(normPt.ankleMax)).toBe(true);
      }
    });
  });
});
