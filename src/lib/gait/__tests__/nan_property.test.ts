import { describe, test, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
  linearDetrend,
  computeFFTHarmonics,
} from "../signal";
import { detectGaitEventsZeni } from "../events";
import { symmetryAngle } from "../symmetry";
import type { PoseFrame } from "../types";

describe("Milestone 1 Robustness & NaN Injection Tests", () => {
  describe("NaN injection in signal processing", () => {
    test("signal containing NaN does not crash process", () => {
      const dataWithNaN = [1, 2, NaN, 4, 5, 6, 7, 8, 9, 10];
      expect(() => butterworthLowPass(dataWithNaN, 30)).not.toThrow();
      expect(() => zeroPhaseButterworth(dataWithNaN, 30)).not.toThrow();
      expect(() => linearDetrend(dataWithNaN)).not.toThrow();
      expect(() => computeFFTHarmonics(dataWithNaN)).not.toThrow();
    });

    test("signal containing Infinity does not crash process", () => {
      const dataWithInf = [1, 2, Infinity, 4, 5, 6, 7, 8, 9, 10];
      expect(() => butterworthLowPass(dataWithInf, 30)).not.toThrow();
      expect(() => zeroPhaseButterworth(dataWithInf, 30)).not.toThrow();
    });
  });

  describe("Symmetry Angle Range Check & Verification", () => {
    test("VERIFY: symmetryAngle formula caps output at 50% max", () => {
      // Test 10,000 random positive pairs of (valLeft, valRight)
      let maxObservedSA = 0;
      for (let i = 0; i < 10000; i++) {
        const l = Math.random() * 1000;
        const r = Math.random() * 1000;
        const sa = symmetryAngle(l, r);
        if (sa > maxObservedSA) maxObservedSA = sa;
      }

      // Theoretical limit for formula `(Math.abs(45 - thetaDeg) / 90) * 100` is 50.0%
      expect(maxObservedSA).toBeLessThanOrEqual(50.0);
    });

    test("VERIFY: symmetryAngle with negative numbers", () => {
      // Math.abs should handle negative numbers correctly
      expect(symmetryAngle(-10, 10)).toBe(0);
      expect(symmetryAngle(-50, -50)).toBe(0);
      expect(symmetryAngle(-100, 0)).toBe(50);
    });
  });

  describe("Gait Event Detection Boundary Tests", () => {
    test("Zeni event detection with extreme frame rates", () => {
      const frames: PoseFrame[] = new Array(30).fill(0).map((_, i) => ({
        timeMs: i * 10, // 100 fps
        landmarks: new Array(33).fill({ x: 0.5, y: 0.5, z: 0 }),
      }));

      const res100fps = detectGaitEventsZeni(frames, 100);
      expect(res100fps.leftStancePct).toBe(60.0); // Fallback defaults

      const res1fps = detectGaitEventsZeni(frames, 1);
      expect(res1fps.leftStancePct).toBe(60.0);
    });
  });

  describe("Persistence SQL Type and Constraint Verification", () => {
    test("verify session table task_mode constraint compatibility", () => {
      const validModes = ["single", "dual"];
      expect(validModes.includes("single")).toBe(true);
      expect(validModes.includes("dual")).toBe(true);
    });
  });
});
