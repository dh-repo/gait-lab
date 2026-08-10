import { describe, it, expect } from "vitest";
import { symmetryAngle, gaitSymmetryIndex } from "../symmetry";

describe("Gait Symmetry Module (symmetry.ts)", () => {
  describe("symmetryAngle (Zifchock Symmetry Angle - SA)", () => {
    it("calculates 0% for equal inputs and reference-free symmetry", () => {
      expect(symmetryAngle(10, 10)).toBe(0.0);
      expect(symmetryAngle(0.5, 0.5)).toBe(0.0);

      // Reference limb invariance: SA(L, R) == SA(R, L)
      const sa1 = symmetryAngle(10, 5);
      const sa2 = symmetryAngle(5, 10);
      expect(sa1).toBeCloseTo(sa2, 5);
      expect(sa1).toBeGreaterThan(0);
      expect(sa1).toBeLessThan(100);
    });

    it("handles near-zero epsilon threshold (1e-6)", () => {
      // Both inputs below 1e-6 -> returns 0.0%
      expect(symmetryAngle(1e-7, 1e-7)).toBe(0.0);
      expect(symmetryAngle(5e-7, 2e-7)).toBe(0.0);

      // Inputs above 1e-6 -> calculated normally
      expect(symmetryAngle(1e-4, 1e-4)).toBe(0.0);
      expect(symmetryAngle(1e-4, 5e-5)).toBeGreaterThan(0);
    });

    it("verifies exact mathematical values for specific limb ratios", () => {
      // 1:1 ratio -> 0%
      expect(symmetryAngle(100, 100)).toBe(0.0);

      // 2:1 ratio (100, 50) -> atan2(100, 50) = 63.4349deg => |45 - 63.4349|/45 * 100 = 40.966% -> rounded to 40.97%
      const sa2_1 = symmetryAngle(100, 50);
      expect(sa2_1).toBeCloseTo(40.97, 1);

      // 3:1 ratio (30, 10) -> atan2(30, 10) = 71.565deg => |45 - 71.565|/45 * 100 = 59.033% -> rounded to 59.03%
      const sa3_1 = symmetryAngle(30, 10);
      expect(sa3_1).toBeCloseTo(59.03, 1);

      // 10:1 ratio (100, 10) -> atan2(100, 10) = 84.289deg => |45 - 84.289|/45 * 100 = 87.310% -> rounded to 87.31%
      const sa10_1 = symmetryAngle(100, 10);
      expect(sa10_1).toBeCloseTo(87.31, 1);
    });

    it("enforces absolute maximum cap of 100.0%", () => {
      // One limb zero -> 100.0%
      expect(symmetryAngle(10, 0)).toBe(100.0);
      expect(symmetryAngle(0, 100)).toBe(100.0);

      // Both zero -> 0.0%
      expect(symmetryAngle(0, 0)).toBe(0.0);
    });

    it("handles negative and mixed sign limb inputs via absolute values", () => {
      expect(symmetryAngle(-10, 5)).toBe(symmetryAngle(10, 5));
      expect(symmetryAngle(-15.5, -15.5)).toBe(0.0);
      expect(symmetryAngle(-10, -5)).toBe(symmetryAngle(10, 5));
    });
  });

  describe("gaitSymmetryIndex (GSI)", () => {
    it("calculates Gait Symmetry Index (GSI) correctly", () => {
      // 1:1 ratio -> 100.0%
      expect(gaitSymmetryIndex(10, 10)).toBe(100.0);

      // 2:1 ratio (10, 5) -> (5 / 10) * 100 = 50.0%
      expect(gaitSymmetryIndex(10, 5)).toBe(50.0);
      expect(gaitSymmetryIndex(5, 10)).toBe(50.0);

      // 3:1 ratio (30, 10) -> (10 / 30) * 100 = 33.33%
      expect(gaitSymmetryIndex(30, 10)).toBeCloseTo(33.33, 1);

      // 10:1 ratio (100, 10) -> (10 / 100) * 100 = 10.0%
      expect(gaitSymmetryIndex(100, 10)).toBe(10.0);

      // One limb zero -> 0.0%
      expect(gaitSymmetryIndex(10, 0)).toBe(0.0);

      // Both zero -> 100.0%
      expect(gaitSymmetryIndex(0, 0)).toBe(100.0);
    });

    it("handles near-zero epsilon threshold for GSI", () => {
      // Both inputs below 1e-6 -> 100.0%
      expect(gaitSymmetryIndex(1e-7, 1e-7)).toBe(100.0);
      expect(gaitSymmetryIndex(5e-7, 2e-7)).toBe(100.0);
    });

    it("handles negative inputs via absolute values", () => {
      expect(gaitSymmetryIndex(-10, 5)).toBe(50.0);
      expect(gaitSymmetryIndex(-20, -10)).toBe(50.0);
    });
  });
});
