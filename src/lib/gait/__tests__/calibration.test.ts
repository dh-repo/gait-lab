import { describe, it, expect } from "vitest";
import {
  calculateMillimetersPerPixel,
  computeCalibrationScale,
  applyCalibrationToPoint,
} from "../calibration";

describe("Floor-Plane Marker Calibration Module (calibration.ts)", () => {
  describe("calculateMillimetersPerPixel()", () => {
    it("calculates mm/px for standard credit card marker (85.6 mm)", () => {
      const scale = calculateMillimetersPerPixel("card", { width: 100, height: 50 });
      expect(scale).toBeCloseTo(0.856);
    });

    it("calculates mm/px for standard QR tag marker (50.0 mm)", () => {
      const scale = calculateMillimetersPerPixel("qr", { width: 100, height: 100 });
      expect(scale).toBeCloseTo(0.5);
    });

    it("calculates mm/px for standard AprilTag marker (100.0 mm)", () => {
      const scale = calculateMillimetersPerPixel("apriltag", { width: 200, height: 200 });
      expect(scale).toBeCloseTo(0.5);
    });

    it("defaults to credit card width (85.6 mm) for custom or unknown marker types", () => {
      const scaleCustom = calculateMillimetersPerPixel("custom", { width: 85.6, height: 85.6 });
      expect(scaleCustom).toBeCloseTo(1.0);

      const scaleUnknown = calculateMillimetersPerPixel("my_special_marker", { width: 85.6, height: 85.6 });
      expect(scaleUnknown).toBeCloseTo(1.0);
    });

    it("returns fallback 1.0 for zero or negative pixel width", () => {
      expect(calculateMillimetersPerPixel("card", { width: 0, height: 50 })).toBe(1.0);
      expect(calculateMillimetersPerPixel("card", { width: -10, height: 50 })).toBe(1.0);
    });

    it("returns fallback 1.0 for null or undefined pixel dimensions", () => {
      expect(calculateMillimetersPerPixel("card", null as any)).toBe(1.0);
      expect(calculateMillimetersPerPixel("card", undefined as any)).toBe(1.0);
    });

    it("handles sub-pixel dimensions correctly", () => {
      const scale = calculateMillimetersPerPixel("card", { width: 0.5, height: 0.5 });
      expect(scale).toBeCloseTo(171.2);
    });

    it("handles high-resolution pixel dimensions correctly", () => {
      const scale = calculateMillimetersPerPixel("card", { width: 8560, height: 4280 });
      expect(scale).toBeCloseTo(0.01);
    });
  });

  describe("computeCalibrationScale()", () => {
    it("computes scale from pixel measurement and known physical mm length", () => {
      const res = computeCalibrationScale(100, 50);
      expect(res.mmPerPx).toBeCloseTo(0.5);
      expect(res.markerType).toBe("custom");
      expect(res.knownLengthMm).toBe(50);
      expect(res.markerPixels).toBe(100);
    });

    it("returns fallback scale 1.0 for zero or negative marker pixels or known length", () => {
      const resZeroPx = computeCalibrationScale(0, 50);
      expect(resZeroPx.mmPerPx).toBe(1.0);
      expect(resZeroPx.markerType).toBe("custom");
      expect(resZeroPx.knownLengthMm).toBe(50);
      expect(resZeroPx.markerPixels).toBe(0);

      const resNegPx = computeCalibrationScale(-20, 50);
      expect(resNegPx.mmPerPx).toBe(1.0);
      expect(resNegPx.markerPixels).toBe(-20);

      const resZeroMm = computeCalibrationScale(100, 0);
      expect(resZeroMm.mmPerPx).toBe(1.0);
      expect(resZeroMm.knownLengthMm).toBe(0);
      expect(resZeroMm.markerPixels).toBe(100);

      const resNegMm = computeCalibrationScale(100, -50);
      expect(resNegMm.mmPerPx).toBe(1.0);
      expect(resNegMm.knownLengthMm).toBe(-50);
    });
  });

  describe("applyCalibrationToPoint()", () => {
    it("converts pixel coordinates to physical millimeters using scale factor", () => {
      const pt = applyCalibrationToPoint(100, 200, 0.5);
      expect(pt.xMm).toBeCloseTo(50);
      expect(pt.yMm).toBeCloseTo(100);
    });

    it("falls back to scale 1.0 for non-finite, zero, or negative scale factors", () => {
      expect(applyCalibrationToPoint(100, 200, 0)).toEqual({ xMm: 100, yMm: 200 });
      expect(applyCalibrationToPoint(100, 200, -0.5)).toEqual({ xMm: 100, yMm: 200 });
      expect(applyCalibrationToPoint(100, 200, NaN)).toEqual({ xMm: 100, yMm: 200 });
      expect(applyCalibrationToPoint(100, 200, Infinity)).toEqual({ xMm: 100, yMm: 200 });
      expect(applyCalibrationToPoint(100, 200, -Infinity)).toEqual({ xMm: 100, yMm: 200 });
    });

    it("handles origin point (0, 0) and negative coordinates", () => {
      expect(applyCalibrationToPoint(0, 0, 0.5)).toEqual({ xMm: 0, yMm: 0 });
      expect(applyCalibrationToPoint(-50, -100, 0.5)).toEqual({ xMm: -25, yMm: -50 });
    });
  });
});
