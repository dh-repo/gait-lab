import { describe, it, expect } from "vitest";
import { mid, dist, angleDeg, torsoHeight, boundingBox, mean, std, range, clamp, pct } from "../../src/lib/gait/landmarks";
import { calculateMillimetersPerPixel, computeCalibrationScale, applyCalibrationToPoint } from "../../src/lib/gait/calibration";
import { solveLinearSystem8x8, computeHomographyMatrix, transformPoint, projectToFloorPlane } from "../../src/lib/gait/homography";
import { bufferedSpanSec, longestContinuousRun, defaultFacingMode } from "../../src/lib/gait/liveCapture";
import * as persistenceServer from "../../src/lib/gait/persistence.server";

describe("Empirical Challenger Stress Test (scratch_stress_test.test.ts)", () => {
  it("verifies landmarks.ts under extreme non-finite and boundary conditions", () => {
    expect(mid(null, null)).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 1 });
    expect(mid({ x: NaN, y: Infinity, z: -1 }, null)).toEqual({ x: 0.5, y: 0.625, z: -0.5, visibility: 1 });
    expect(dist({ x: NaN, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(180);
    expect(
      torsoHeight([
        ...Array(11).fill({ x: 0, y: 0 }),
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 },
        ...Array(10).fill({ x: 0, y: 0 }),
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ])
    ).toBe(0.2); // torso height < 0.05 falls back to 0.2
    expect(boundingBox(Array(33).fill({ x: 0.1, y: 0.1, visibility: 0.05 }))).toEqual({ x: 0.4, y: 0.2, w: 0.2, h: 0.6 });
    expect(mean([NaN, Infinity, 10])).toBe(10);
    expect(std([10])).toBe(0);
    expect(range([NaN, Infinity])).toBe(0);
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(pct(NaN)).toBe("0%");
  });

  it("verifies calibration.ts under zero and negative dimensions", () => {
    expect(calculateMillimetersPerPixel("card", { width: 0, height: 0 })).toBe(1.0);
    expect(calculateMillimetersPerPixel("apriltag", { width: -50, height: 10 })).toBe(1.0);
    expect(computeCalibrationScale(0, -10)).toEqual({
      mmPerPx: 1.0,
      markerType: "custom",
      knownLengthMm: -10,
      markerPixels: 0,
    });
    expect(applyCalibrationToPoint(100, 200, NaN)).toEqual({ xMm: 100, yMm: 200 });
  });

  it("verifies homography.ts under singular systems and zero w' denominator", () => {
    const singularSystem = Array(8).fill(Array(8).fill(0));
    expect(solveLinearSystem8x8(singularSystem, Array(8).fill(1))).toBeNull();

    const collinearImg = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const floorPts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(computeHomographyMatrix(collinearImg, floorPts)).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);

    const zeroWMatrix = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 0], // w' = 0
    ];
    expect(transformPoint({ x: 5, y: 10 }, zeroWMatrix)).toEqual({ x: 5, y: 10 });
    expect(projectToFloorPlane({ x: 5, y: 10 }, zeroWMatrix)).toEqual([5, 10]);
  });

  it("verifies liveCapture.ts under exact 0.35s vs 0.351s gap boundaries", () => {
    expect(bufferedSpanSec([])).toBe(0);

    const exact035Frames = [{ timeMs: 0, landmarks: [] }, { timeMs: 350, landmarks: [] }];
    const split0351Frames = [{ timeMs: 0, landmarks: [] }, { timeMs: 351, landmarks: [] }, { timeMs: 400, landmarks: [] }];
    expect(longestContinuousRun(exact035Frames).length).toBe(2);
    expect(longestContinuousRun(split0351Frames).length).toBe(2); // second run is [351, 400] (2 frames)
    expect(defaultFacingMode()).toBe("user");
  });

  it("verifies persistence.server.ts re-export completeness", () => {
    expect(typeof persistenceServer.saveGaitSession).toBe("function");
    expect(typeof persistenceServer.getPersistenceMode).toBe("function");
  });
});
