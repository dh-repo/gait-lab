import { describe, it, expect } from "vitest";
import {
  solveLinearSystem8x8,
  computeHomographyMatrix,
  transformPoint,
  projectToFloorPlane,
} from "../homography";

describe("2D Floor Planar Homography Module (homography.ts)", () => {
  describe("solveLinearSystem8x8()", () => {
    it("solves 8x8 identity system A * x = b correctly", () => {
      const A = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 8 }, (_, j) => (i === j ? 1 : 0))
      );
      const b = [1, 2, 3, 4, 5, 6, 7, 8];
      const x = solveLinearSystem8x8(A, b);
      expect(x).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it("solves a general invertible 8x8 linear system accurately", () => {
      // Create a known system: A = 2 * I + small off-diagonal shift
      const A = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 8 }, (_, j) => (i === j ? 2 : (i + j) % 2 === 0 ? 0.1 : 0))
      );
      const b = [2, 4, 6, 8, 10, 12, 14, 16];
      const x = solveLinearSystem8x8(A, b);
      expect(x).not.toBeNull();
      if (x) {
        for (let i = 0; i < 8; i++) {
          let sum = 0;
          for (let j = 0; j < 8; j++) {
            sum += A[i][j] * x[j];
          }
          expect(sum).toBeCloseTo(b[i], 5);
        }
      }
    });

    it("performs partial pivoting when diagonal element is zero", () => {
      // Create an 8x8 system where A[0][0] = 0, but A[1][0] = 1
      const A = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 8 }, (_, j) => {
          if (i === 0 && j === 0) return 0;
          if (i === 0 && j === 1) return 1;
          if (i === 1 && j === 0) return 1;
          if (i === 1 && j === 1) return 0;
          return i === j ? 1 : 0;
        })
      );
      const b = [10, 20, 3, 4, 5, 6, 7, 8];
      const x = solveLinearSystem8x8(A, b);
      expect(x).not.toBeNull();
      if (x) {
        expect(x[0]).toBeCloseTo(20);
        expect(x[1]).toBeCloseTo(10);
      }
    });

    it("returns null for a singular matrix with all-zero row or column", () => {
      const A = Array.from({ length: 8 }, () => new Array(8).fill(0));
      const b = new Array(8).fill(1);
      expect(solveLinearSystem8x8(A, b)).toBeNull();
    });

    it("returns null when pivot magnitude is under 1e-9 (near-singular matrix)", () => {
      const A = Array.from({ length: 8 }, (_, i) =>
        Array.from({ length: 8 }, (_, j) => (i === j ? 1e-10 : 0))
      );
      const b = new Array(8).fill(1);
      expect(solveLinearSystem8x8(A, b)).toBeNull();
    });
  });

  describe("computeHomographyMatrix()", () => {
    it("returns 3x3 identity fallback when inputs have fewer than 4 points or are null/undefined", () => {
      const identity = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      expect(computeHomographyMatrix([], [])).toEqual(identity);
      expect(computeHomographyMatrix(null as any, null as any)).toEqual(identity);
      expect(
        computeHomographyMatrix(
          [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
          [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
        )
      ).toEqual(identity);
    });

    it("returns 3x3 identity fallback when image points are collinear (triArea < 1e-7)", () => {
      const identity = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const imgPts = [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 20, y: 40 },
        { x: 30, y: 60 },
      ];
      const floorPts = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      expect(computeHomographyMatrix(imgPts, floorPts)).toEqual(identity);
    });

    it("computes accurate matrix for pure translation and scaling", () => {
      // Scale by 2, shift by (10, 20)
      const imgPts = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const floorPts = [
        { x: 10, y: 20 },
        { x: 210, y: 20 },
        { x: 210, y: 220 },
        { x: 10, y: 220 },
      ];
      const H = computeHomographyMatrix(imgPts, floorPts);
      expect(H[0][0]).toBeCloseTo(2, 4);
      expect(H[0][1]).toBeCloseTo(0, 4);
      expect(H[0][2]).toBeCloseTo(10, 4);
      expect(H[1][0]).toBeCloseTo(0, 4);
      expect(H[1][1]).toBeCloseTo(2, 4);
      expect(H[1][2]).toBeCloseTo(20, 4);
      expect(H[2][0]).toBeCloseTo(0, 4);
      expect(H[2][1]).toBeCloseTo(0, 4);
      expect(H[2][2]).toBeCloseTo(1.0, 4);
    });

    it("computes accurate matrix for oblique perspective trapezoid-to-rectangle transformation", () => {
      // Image trapezoid mapping to a rectangle on floor
      const imgPts = [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 350, y: 300 },
        { x: 50, y: 300 },
      ];
      const floorPts = [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 2000 },
        { x: 0, y: 2000 },
      ];
      const H = computeHomographyMatrix(imgPts, floorPts);
      expect(H.length).toBe(3);
      expect(H[2][2]).toBe(1.0);

      // Verify corner mappings under transformPoint
      const p0 = transformPoint(imgPts[0], H);
      expect(p0.x).toBeCloseTo(0, 1);
      expect(p0.y).toBeCloseTo(0, 1);

      const p1 = transformPoint(imgPts[1], H);
      expect(p1.x).toBeCloseTo(1000, 1);
      expect(p1.y).toBeCloseTo(0, 1);

      const p2 = transformPoint(imgPts[2], H);
      expect(p2.x).toBeCloseTo(1000, 1);
      expect(p2.y).toBeCloseTo(2000, 1);

      const p3 = transformPoint(imgPts[3], H);
      expect(p3.x).toBeCloseTo(0, 1);
      expect(p3.y).toBeCloseTo(2000, 1);
    });

    it("supports point inputs supplied as tuples [x, y]", () => {
      const imgPts: [number, number][] = [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ];
      const floorPts: [number, number][] = [
        [0, 0],
        [200, 0],
        [200, 200],
        [0, 200],
      ];
      const H = computeHomographyMatrix(imgPts, floorPts);
      expect(H[0][0]).toBeCloseTo(2, 4);
      expect(H[1][1]).toBeCloseTo(2, 4);
      expect(H[2][2]).toBe(1.0);
    });
  });

  describe("transformPoint()", () => {
    it("transforms origin and unit square points under identity matrix", () => {
      const H = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      expect(transformPoint({ x: 0, y: 0 }, H)).toEqual({ x: 0, y: 0 });
      expect(transformPoint({ x: 50, y: 100 }, H)).toEqual({ x: 50, y: 100 });
    });

    it("transforms point using affine/perspective matrix with projective division", () => {
      const H = [
        [2, 0, 10],
        [0, 2, 20],
        [0, 0, 1],
      ];
      const pt = transformPoint({ x: 5, y: 10 }, H);
      expect(pt.x).toBeCloseTo(20);
      expect(pt.y).toBeCloseTo(40);
    });

    it("accepts tuple point input [x, y]", () => {
      const H = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      expect(transformPoint([15, 25], H)).toEqual({ x: 15, y: 25 });
    });

    it("prevents division by zero when homogeneous w' denominator is near zero (|w'| <= 1e-9)", () => {
      const H = [
        [2, 0, 5],
        [0, 2, 5],
        [0, 0, 0], // w' = 0
      ];
      const pt = transformPoint({ x: 10, y: 20 }, H);
      // w falls back to 1.0, so x' / 1 = 2*10 + 5 = 25, y' / 1 = 2*20 + 5 = 45
      expect(pt.x).toBe(25);
      expect(pt.y).toBe(45);
    });
  });

  describe("projectToFloorPlane()", () => {
    it("projects point onto floor plane returning [x, y] tuple format", () => {
      const H = [
        [2, 0, 10],
        [0, 3, 15],
        [0, 0, 1],
      ];
      const resTuple = projectToFloorPlane([5, 5], H);
      expect(resTuple).toEqual([20, 30]);

      const resObj = projectToFloorPlane({ x: 5, y: 5 }, H);
      expect(resObj).toEqual([20, 30]);
    });
  });
});
