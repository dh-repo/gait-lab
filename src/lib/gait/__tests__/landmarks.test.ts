import { describe, it, expect } from "vitest";
import {
  mid,
  dist,
  angleDeg,
  torsoHeight,
  boundingBox,
  hipCenter,
  mean,
  std,
  range,
  clamp,
  pct,
  LM,
  POSE_CONNECTIONS,
  PERSON_COLORS,
} from "../landmarks";
import type { Landmark } from "../types";

describe("Biomechanical Landmarks Module (landmarks.ts)", () => {
  describe("Constants & Structural Topology", () => {
    it("defines 22 valid skeleton pose connections", () => {
      expect(Array.isArray(POSE_CONNECTIONS)).toBe(true);
      expect(POSE_CONNECTIONS.length).toBe(22);
      for (const [a, b] of POSE_CONNECTIONS) {
        expect(typeof a).toBe("number");
        expect(typeof b).toBe("number");
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(32);
        expect(b).toBeLessThanOrEqual(32);
      }
      expect(POSE_CONNECTIONS).toContainEqual([11, 12]);
      expect(POSE_CONNECTIONS).toContainEqual([23, 24]);
    });

    it("defines landmark indices correctly matching MediaPipe Pose layout", () => {
      expect(LM.NOSE).toBe(0);
      expect(LM.L_SHOULDER).toBe(11);
      expect(LM.R_SHOULDER).toBe(12);
      expect(LM.L_ELBOW).toBe(13);
      expect(LM.R_ELBOW).toBe(14);
      expect(LM.L_WRIST).toBe(15);
      expect(LM.R_WRIST).toBe(16);
      expect(LM.L_HIP).toBe(23);
      expect(LM.R_HIP).toBe(24);
      expect(LM.L_KNEE).toBe(25);
      expect(LM.R_KNEE).toBe(26);
      expect(LM.L_ANKLE).toBe(27);
      expect(LM.R_ANKLE).toBe(28);
      expect(LM.L_HEEL).toBe(29);
      expect(LM.R_HEEL).toBe(30);
      expect(LM.L_FOOT).toBe(31);
      expect(LM.R_FOOT).toBe(32);
    });

    it("provides 6 valid hex color codes for person tracking", () => {
      expect(PERSON_COLORS.length).toBe(6);
      for (const color of PERSON_COLORS) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("mid() - Midpoint Calculation", () => {
    it("calculates 3D midpoint and minimum visibility for valid landmarks", () => {
      const a: Landmark = { x: 0.2, y: 0.4, z: 0.1, visibility: 0.8 };
      const b: Landmark = { x: 0.4, y: 0.6, z: 0.3, visibility: 0.9 };
      const result = mid(a, b);
      expect(result.x).toBeCloseTo(0.3);
      expect(result.y).toBeCloseTo(0.5);
      expect(result.z).toBeCloseTo(0.2);
      expect(result.visibility).toBe(0.8);
    });

    it("handles null or undefined landmarks using default coordinates (0.5, 0.5, 0) and default visibility (1)", () => {
      const resNull = mid(null, undefined);
      expect(resNull).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 1 });
    });

    it("handles one null landmark and one valid landmark", () => {
      const a: Landmark = { x: 0.2, y: 0.4, z: 0.2, visibility: 0.6 };
      const res = mid(a, null);
      expect(res.x).toBeCloseTo(0.35); // (0.2 + 0.5) / 2
      expect(res.y).toBeCloseTo(0.45); // (0.4 + 0.5) / 2
      expect(res.z).toBeCloseTo(0.1);  // (0.2 + 0) / 2
      expect(res.visibility).toBe(0.6); // min(0.6, 1)
    });

    it("handles NaN or non-finite coordinates with fallbacks", () => {
      const a: Landmark = { x: NaN, y: Infinity, z: -Infinity, visibility: 0.5 };
      const b: Landmark = { x: 0.6, y: 0.8, z: 0.2, visibility: 0.7 };
      const result = mid(a, b);
      expect(result.x).toBeCloseTo(0.55); // (0.5 + 0.6) / 2
      expect(result.y).toBeCloseTo(0.65); // (0.5 + 0.8) / 2
      expect(result.z).toBeCloseTo(0.1);  // (0 + 0.2) / 2
      expect(result.visibility).toBe(0.5);
    });
  });

  describe("dist() - 2D Euclidean Distance", () => {
    it("computes 2D Euclidean distance between two valid points ignoring Z", () => {
      const a: Landmark = { x: 0, y: 0, z: 0 };
      const b: Landmark = { x: 3, y: 4, z: 10 };
      expect(dist(a, b)).toBeCloseTo(5.0);
    });

    it("handles null or undefined points treating them as (0, 0)", () => {
      const b: Landmark = { x: 3, y: 4, z: 0 };
      expect(dist(null, b)).toBeCloseTo(5.0);
      expect(dist(undefined, undefined)).toBe(0);
    });

    it("returns 0 for coincident points", () => {
      const a: Landmark = { x: 0.5, y: 0.5, z: 0.1 };
      expect(dist(a, a)).toBe(0);
    });

    it("returns 0 when computed distance is non-finite or contains NaN", () => {
      const a: Landmark = { x: NaN, y: 0, z: 0 };
      const b: Landmark = { x: 0, y: 0, z: 0 };
      expect(dist(a, b)).toBe(0);
    });
  });

  describe("angleDeg() - 3-Point Joint Angle", () => {
    it("calculates 90 degree right angle correctly", () => {
      const a: Landmark = { x: 0, y: 1, z: 0 };
      const b: Landmark = { x: 0, y: 0, z: 0 };
      const c: Landmark = { x: 1, y: 0, z: 0 };
      expect(angleDeg(a, b, c)).toBeCloseTo(90);
    });

    it("calculates 180 degree straight angle correctly", () => {
      const a: Landmark = { x: -1, y: 0, z: 0 };
      const b: Landmark = { x: 0, y: 0, z: 0 };
      const c: Landmark = { x: 1, y: 0, z: 0 };
      expect(angleDeg(a, b, c)).toBeCloseTo(180);
    });

    it("calculates acute angle (e.g. 45 degrees)", () => {
      const a: Landmark = { x: 1, y: 1, z: 0 };
      const b: Landmark = { x: 0, y: 0, z: 0 };
      const c: Landmark = { x: 1, y: 0, z: 0 };
      expect(angleDeg(a, b, c)).toBeCloseTo(45);
    });

    it("returns 180 when any landmark is missing, null, or undefined", () => {
      const b: Landmark = { x: 0, y: 0, z: 0 };
      const c: Landmark = { x: 1, y: 0, z: 0 };
      expect(angleDeg(null, b, c)).toBe(180);
      expect(angleDeg(b, undefined, c)).toBe(180);
      expect(angleDeg(b, c, null)).toBe(180);
    });

    it("returns 180 for degenerate zero-length vectors (e.g. vertex coincident with point)", () => {
      const b: Landmark = { x: 0, y: 0, z: 0 };
      expect(angleDeg(b, b, b)).toBe(180);
      const c: Landmark = { x: 1, y: 0, z: 0 };
      expect(angleDeg(b, b, c)).toBe(180);
    });

    it("handles non-finite coordinates gracefully using default fallback 0.5", () => {
      const a: Landmark = { x: NaN, y: 0.5, z: 0 };
      const b: Landmark = { x: 0.5, y: 0.5, z: 0 };
      const c: Landmark = { x: 0.5, y: 1.0, z: 0 };
      // a and b both resolve to (0.5, 0.5), so magnitude is 0, returning 180
      expect(angleDeg(a, b, c)).toBe(180);
    });
  });

  describe("torsoHeight() - Torso Height Calculation", () => {
    it("computes torso height from shoulders to hips", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      lm[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0 };
      lm[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0 };
      lm[LM.L_HIP] = { x: 0.4, y: 0.7, z: 0 };
      lm[LM.R_HIP] = { x: 0.6, y: 0.7, z: 0 };
      expect(torsoHeight(lm)).toBeCloseTo(0.5);
    });

    it("returns default 0.2 for empty, null, or short landmark array (< 25 items)", () => {
      expect(torsoHeight([])).toBe(0.2);
      expect(torsoHeight(null as any)).toBe(0.2);
      expect(torsoHeight(Array.from({ length: 20 }, () => ({ x: 0, y: 0, z: 0 })))).toBe(0.2);
    });

    it("returns default 0.2 if computed torso height is under 0.05 (collapsed torso)", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      lm[LM.L_SHOULDER] = { x: 0.5, y: 0.50, z: 0 };
      lm[LM.R_SHOULDER] = { x: 0.5, y: 0.50, z: 0 };
      lm[LM.L_HIP] = { x: 0.5, y: 0.51, z: 0 };
      lm[LM.R_HIP] = { x: 0.5, y: 0.51, z: 0 };
      expect(torsoHeight(lm)).toBe(0.2);
    });
  });

  describe("boundingBox() - Bounding Box Calculation", () => {
    it("computes padded bounding box for visible pose landmarks", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
      lm[11] = { x: 0.3, y: 0.2, z: 0, visibility: 0.9 };
      lm[12] = { x: 0.7, y: 0.8, z: 0, visibility: 0.9 };
      const box = boundingBox(lm);
      expect(box.x).toBeCloseTo(0.27); // 0.3 - 0.03 pad
      expect(box.y).toBeCloseTo(0.17); // 0.2 - 0.03 pad
      expect(box.w).toBeCloseTo(0.46); // (0.7 + 0.03) - 0.27
      expect(box.h).toBeCloseTo(0.66); // (0.8 + 0.03) - 0.17
    });

    it("returns default fallback box when array is empty or non-array", () => {
      expect(boundingBox([])).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
      expect(boundingBox(null as any)).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    });

    it("returns default fallback box when all landmarks have low visibility (< 0.2)", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.15 }));
      expect(boundingBox(lm)).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    });

    it("returns default fallback box when single point is visible (maxX <= minX)", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
      lm[0] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
      expect(boundingBox(lm)).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    });

    it("clamps bounding box coordinates within [0, 1] screen boundary", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.1 }));
      lm[0] = { x: 0.01, y: 0.01, z: 0, visibility: 0.9 };
      lm[1] = { x: 0.99, y: 0.99, z: 0, visibility: 0.9 };
      const box = boundingBox(lm);
      expect(box.x).toBe(0); // 0.01 - 0.03 clamped to 0
      expect(box.y).toBe(0); // 0.01 - 0.03 clamped to 0
      expect(box.w).toBe(1); // 0.99 + 0.03 clamped to 1
      expect(box.h).toBe(1); // 0.99 + 0.03 clamped to 1
    });
  });

  describe("hipCenter() - Hip Center Calculation", () => {
    it("computes hipCenter as midpoint between left and right hip", () => {
      const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
      lm[LM.L_HIP] = { x: 0.3, y: 0.6, z: 0, visibility: 0.9 };
      lm[LM.R_HIP] = { x: 0.5, y: 0.6, z: 0, visibility: 0.7 };
      const hip = hipCenter(lm);
      expect(hip.x).toBeCloseTo(0.4);
      expect(hip.y).toBeCloseTo(0.6);
      expect(hip.visibility).toBe(0.7);
    });

    it("returns default hipCenter for empty or short landmark array (< 25 items)", () => {
      expect(hipCenter([])).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
      expect(hipCenter(null as any)).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
      expect(hipCenter(Array.from({ length: 10 }, () => ({ x: 0, y: 0, z: 0 })))).toEqual({
        x: 0.5,
        y: 0.5,
        z: 0,
        visibility: 0.9,
      });
    });
  });

  describe("Statistical Helpers (mean, std, range, clamp, pct)", () => {
    it("mean() computes average of finite numbers and ignores NaNs/Infinities", () => {
      expect(mean([2, 4, 6])).toBe(4);
      expect(mean([2, NaN, 4, Infinity, 6])).toBe(4);
      expect(mean([])).toBe(0);
      expect(mean(null as any)).toBe(0);
      expect(mean([NaN, Infinity])).toBe(0);
    });

    it("std() computes population standard deviation", () => {
      expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0);
      expect(std([5])).toBe(0);
      expect(std([])).toBe(0);
      expect(std(null as any)).toBe(0);
      expect(std([2, NaN, Infinity])).toBe(0);
    });

    it("range() computes difference between max and min finite values", () => {
      expect(range([1, 5, 10])).toBe(9);
      expect(range([-5, 5])).toBe(10);
      expect(range([])).toBe(0);
      expect(range(null as any)).toBe(0);
      expect(range([NaN, Infinity])).toBe(0);
    });

    it("clamp() restricts value within bounds [a, b]", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(NaN, 0, 10)).toBe(0);
      expect(clamp(Infinity, 0, 10)).toBe(0);
    });

    it("pct() formats numbers as percentage strings", () => {
      expect(pct(0.756)).toBe("76%");
      expect(pct(0.756, 1)).toBe("75.6%");
      expect(pct(0.756, 2)).toBe("75.60%");
      expect(pct(NaN)).toBe("0%");
      expect(pct(Infinity)).toBe("0%");
    });
  });
});
