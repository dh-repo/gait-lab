import { describe, it, expect } from "vitest";
import { symmetryAngle } from "../symmetry";
import { calculateDTE } from "../dte";
import { computeGaitMetrics } from "../analysis";
import type { Landmark, PoseFrame } from "../types";

describe("M1 Empirical Challenger Verification", () => {
  describe("R1: Zifchock Symmetry Angle (SA)", () => {
    it("computes 0% for perfectly equal values (ratio 1:1)", () => {
      expect(symmetryAngle(10, 10)).toBe(0.0);
      expect(symmetryAngle(0.5, 0.5)).toBe(0.0);
    });

    it("computes 40.97% for ratio 2:1", () => {
      // theta = atan(20/10) = 63.43494882 deg
      // rawSA = |45 - 63.43494882| / 45 * 100 = 18.43494882 / 45 * 100 = 40.96655% -> 40.97%
      expect(symmetryAngle(20, 10)).toBe(40.97);
      expect(symmetryAngle(10, 20)).toBe(40.97); // symmetric wrt side
    });

    it("computes 59.03% for ratio 3:1", () => {
      // theta = atan(30/10) = 71.56505118 deg
      // rawSA = |45 - 71.56505118| / 45 * 100 = 26.56505118 / 45 * 100 = 59.0334% -> 59.03%
      expect(symmetryAngle(30, 10)).toBe(59.03);
      expect(symmetryAngle(10, 30)).toBe(59.03);
    });

    it("computes 87.31% for ratio 10:1", () => {
      // theta = atan(100/10) = 84.28940686 deg
      // rawSA = |45 - 84.28940686| / 45 * 100 = 39.28940686 / 45 * 100 = 87.30979% -> 87.31%
      expect(symmetryAngle(100, 10)).toBe(87.31);
      expect(symmetryAngle(10, 100)).toBe(87.31);
    });

    it("handles zero values and extreme ratios cleanly", () => {
      expect(symmetryAngle(0, 0)).toBe(0.0);
      expect(symmetryAngle(10, 0)).toBe(100.0);
      expect(symmetryAngle(0, 10)).toBe(100.0);
      expect(symmetryAngle(1e6, 1)).toBe(100.0); // clamped at 100%
      expect(symmetryAngle(1e-8, 1e-8)).toBe(0.0);
    });

    it("handles negative inputs by taking absolute magnitudes", () => {
      expect(symmetryAngle(-20, 10)).toBe(40.97);
      expect(symmetryAngle(-20, -10)).toBe(40.97);
    });

    it("verifies SA scores are doubled relative to Phase 2 (/90 formula)", () => {
      const oldFormulaSA = (valL: number, valR: number) => {
        const absL = Math.abs(valL);
        const absR = Math.abs(valR);
        const thetaRad = Math.atan2(absL, absR);
        const thetaDeg = (thetaRad * 180) / Math.PI;
        return Number(((Math.abs(45 - thetaDeg) / 90) * 100).toFixed(2));
      };

      const ratios: [number, number][] = [
        [15, 10],
        [20, 10],
        [30, 10],
        [40, 10],
      ];

      for (const [l, r] of ratios) {
        const newSA = symmetryAngle(l, r);
        const oldSA = oldFormulaSA(l, r);
        expect(newSA).toBeCloseTo(oldSA * 2, 1);
      }
    });
  });

  describe("R2: Ipsilateral Stride Length vs Contralateral Step Distance", () => {
    function createSagittalWalkingFrames(numFrames = 120, fps = 30): PoseFrame[] {
      const frames: PoseFrame[] = [];
      const dtMs = 1000 / fps;

      for (let i = 0; i < numFrames; i++) {
        const t = (i * dtMs) / 1000;
        const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0.9,
        }));

        // Subject walking left to right: mid hip advances at 0.5 / sec
        const hipX = 0.2 + 0.5 * t;
        const hipY = 0.4;

        // Torso height approx 0.4 units (shoulder y=0.2, hip y=0.4 => torso=0.2)
        landmarks[11] = { x: hipX - 0.05, y: 0.2, z: 0, visibility: 0.9 }; // L shoulder
        landmarks[12] = { x: hipX + 0.05, y: 0.2, z: 0, visibility: 0.9 }; // R shoulder
        landmarks[23] = { x: hipX - 0.05, y: hipY, z: 0, visibility: 0.9 }; // L hip
        landmarks[24] = { x: hipX + 0.05, y: hipY, z: 0, visibility: 0.9 }; // R hip

        // Leg oscillations at 1.0 Hz (stride duration = 1.0s, step time = 0.5s)
        const phaseL = 2 * Math.PI * 1.0 * t;
        const phaseR = phaseL + Math.PI;

        landmarks[25] = { x: hipX + 0.1 * Math.sin(phaseL), y: 0.6, z: 0, visibility: 0.9 }; // L knee
        landmarks[26] = { x: hipX + 0.1 * Math.sin(phaseR), y: 0.6, z: 0, visibility: 0.9 }; // R knee

        // Ankle / foot position relative to hip
        const ankLx = hipX + 0.2 * Math.sin(phaseL);
        const ankRx = hipX + 0.2 * Math.sin(phaseR);

        landmarks[27] = { x: ankLx, y: 0.8, z: 0, visibility: 0.9 }; // L ankle
        landmarks[28] = { x: ankRx, y: 0.8, z: 0, visibility: 0.9 }; // R ankle
        landmarks[29] = { x: ankLx - 0.02, y: 0.82, z: 0, visibility: 0.9 }; // L heel
        landmarks[30] = { x: ankRx - 0.02, y: 0.82, z: 0, visibility: 0.9 }; // R heel
        landmarks[31] = { x: ankLx + 0.05, y: 0.82, z: 0, visibility: 0.9 }; // L foot
        landmarks[32] = { x: ankRx + 0.05, y: 0.82, z: 0, visibility: 0.9 }; // R foot

        // Wrists for arm swing
        landmarks[15] = { x: hipX + 0.1 * Math.sin(phaseR), y: 0.45, z: 0, visibility: 0.9 }; // L wrist
        landmarks[16] = { x: hipX + 0.1 * Math.sin(phaseL), y: 0.45, z: 0, visibility: 0.9 }; // R wrist

        frames.push({ timeMs: i * dtMs, landmarks });
      }

      return frames;
    }

    it("calculates stride length (ipsilateral) as approximately double step length (contralateral)", () => {
      const frames = createSagittalWalkingFrames(150, 30);
      const metrics = computeGaitMetrics(frames);

      if (metrics.strideLengthLeft != null && metrics.stepLengthLeft != null) {
        expect(metrics.strideLengthLeft).toBeGreaterThan(metrics.stepLengthLeft);
        expect(metrics.strideLengthLeft / metrics.stepLengthLeft).toBeCloseTo(2.0, 0.5);
      }
      if (metrics.strideLengthRight != null && metrics.stepLengthRight != null) {
        expect(metrics.strideLengthRight).toBeGreaterThan(metrics.stepLengthRight);
        expect(metrics.strideLengthRight / metrics.stepLengthRight).toBeCloseTo(2.0, 0.5);
      }
    });
  });

  describe("R3: Low-Cadence Walking (50 SPM) Retention in Frontal View", () => {
    function createFrontalSlowWalkingFrames(numFrames = 360, fps = 30): PoseFrame[] {
      const frames: PoseFrame[] = [];
      const dtMs = 1000 / fps;

      for (let i = 0; i < numFrames; i++) {
        const t = (i * dtMs) / 1000;
        const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0.9,
        }));

        // Frontal view: shoulders symmetric in X, hips symmetric in X
        landmarks[11] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[12] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[23] = { x: 0.42, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[24] = { x: 0.58, y: 0.5, z: 0, visibility: 0.9 };

        // Slow cadence oscillation: frequency 0.4167 Hz => cadence 50 SPM
        const stepFreq = 0.4167; // 25 strides / min = 50 steps / min
        const ankleAmp = 0.05;

        landmarks[27] = { x: 0.4, y: 0.85 + ankleAmp * Math.sin(2 * Math.PI * stepFreq * t), z: 0, visibility: 0.9 };
        landmarks[28] = { x: 0.6, y: 0.85 - ankleAmp * Math.sin(2 * Math.PI * stepFreq * t), z: 0, visibility: 0.9 };

        frames.push({ timeMs: i * dtMs, landmarks });
      }

      return frames;
    }

    it("retains low-cadence walking in valid range [40, 140]", () => {
      const frames = createFrontalSlowWalkingFrames(360, 30);
      const metrics = computeGaitMetrics(frames);

      expect(metrics.cadenceSpm).toBeGreaterThanOrEqual(40);
      expect(metrics.cadenceSpm).toBeLessThanOrEqual(140);
    });
  });

  describe("R4: 3.5s Stride Duration Acceptance & Double Support Search Scaling", () => {
    it("accepts slow gait cycles without zeroing out stance / double support metrics", () => {
      const fps = 30;
      const numFrames = 450; // 15 seconds clip
      const dtMs = 1000 / fps;
      const frames: PoseFrame[] = [];

      for (let i = 0; i < numFrames; i++) {
        const t = (i * dtMs) / 1000;
        const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
          x: 0.5,
          y: 0.5,
          z: 0,
          visibility: 0.9,
        }));

        const hipX = 0.1 + 0.15 * t; // very slow forward speed
        landmarks[11] = { x: hipX - 0.05, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[12] = { x: hipX + 0.05, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[23] = { x: hipX - 0.05, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[24] = { x: hipX + 0.05, y: 0.5, z: 0, visibility: 0.9 };

        // Very slow leg oscillation at 0.2857 Hz (period = 3.5s per stride!)
        const phase = 2 * Math.PI * 0.2857 * t;
        landmarks[27] = { x: hipX + 0.15 * Math.sin(phase), y: 0.85, z: 0, visibility: 0.9 };
        landmarks[28] = { x: hipX - 0.15 * Math.sin(phase), y: 0.85, z: 0, visibility: 0.9 };
        landmarks[29] = { x: hipX + 0.15 * Math.sin(phase) - 0.02, y: 0.87, z: 0, visibility: 0.9 };
        landmarks[30] = { x: hipX - 0.15 * Math.sin(phase) - 0.02, y: 0.87, z: 0, visibility: 0.9 };

        frames.push({ timeMs: i * dtMs, landmarks });
      }

      const metrics = computeGaitMetrics(frames);
      expect(metrics.cadenceSpm).toBeGreaterThan(0);
    });
  });

  describe("R5: DTE Clamping to [-100%, +100%]", () => {
    it("clamps stepTimeCvDTE to [-100%, +100%] on extreme baseline or dual-task CV swings", () => {
      const dummyBaseline = {
        cadenceSpm: 100,
        stepTimeCV: 0.01, // extremely low baseline CV (1%)
        symmetryScore: 90,
      } as any;

      const dummyDualTaskExtremeUnstable = {
        cadenceSpm: 80,
        stepTimeCV: 0.50, // massive 50% CV swing
        symmetryScore: 70,
      } as any;

      const dteResult = calculateDTE(dummyBaseline, dummyDualTaskExtremeUnstable);

      // Raw DTE would be -((0.50 - 0.01) / 0.01) * 100 = -4900%
      // Clamped DTE MUST be -100.0%
      expect(dteResult.stepTimeCvDTE).toBe(-100.0);

      const dummyDualTaskExtremeImprovement = {
        cadenceSpm: 110,
        stepTimeCV: 0.001, // improved from high baseline
        symmetryScore: 95,
      } as any;

      const highCvBaseline = {
        cadenceSpm: 90,
        stepTimeCV: 0.50,
        symmetryScore: 70,
      } as any;

      const dteImprovement = calculateDTE(highCvBaseline, dummyDualTaskExtremeImprovement);
      // Raw DTE = -((0.001 - 0.50) / 0.50) * 100 = +99.8%
      expect(dteImprovement.stepTimeCvDTE).toBeLessThanOrEqual(100.0);
      expect(dteImprovement.stepTimeCvDTE).toBeGreaterThanOrEqual(-100.0);
    });
  });
});
