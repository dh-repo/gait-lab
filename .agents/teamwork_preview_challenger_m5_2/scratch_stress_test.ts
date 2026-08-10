import { mid, dist, angleDeg, torsoHeight, boundingBox, hipCenter, mean, std, range, clamp, pct, LM, POSE_CONNECTIONS, PERSON_COLORS } from "../../src/lib/gait/landmarks";
import { calculateMillimetersPerPixel, computeCalibrationScale, applyCalibrationToPoint } from "../../src/lib/gait/calibration";
import { solveLinearSystem8x8, computeHomographyMatrix, transformPoint, projectToFloorPlane } from "../../src/lib/gait/homography";
import { bufferedSpanSec, longestContinuousRun, defaultFacingMode } from "../../src/lib/gait/liveCapture";
import * as persistenceServer from "../../src/lib/gait/persistence.server";

console.log("=== EMPIRICAL STRESS TEST FOR M5 PASS 2 ===");

// 1. Landmarks
console.log("\n1. Testing landmarks.ts...");
console.log("mid(null, null):", mid(null, null));
console.log("mid({x: NaN, y: Infinity, z: -1}, null):", mid({ x: NaN, y: Infinity, z: -1 }, null));
console.log("dist({x: NaN, y: 0}, {x: 0, y: 0}):", dist({ x: NaN, y: 0 }, { x: 0, y: 0 }));
console.log("angleDeg(coincident):", angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }));
console.log("torsoHeight(zero height torso):", torsoHeight([
  ...Array(11).fill({ x: 0, y: 0 }),
  { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, // 11, 12
  ...Array(10).fill({ x: 0, y: 0 }),
  { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, // 23, 24
]));
console.log("boundingBox(all low visibility):", boundingBox(Array(33).fill({ x: 0.1, y: 0.1, visibility: 0.05 })));
console.log("stats mean([NaN, Infinity, 10]):", mean([NaN, Infinity, 10]));
console.log("stats std([10]):", std([10]));
console.log("stats pct(NaN):", pct(NaN));

// 2. Calibration
console.log("\n2. Testing calibration.ts...");
console.log("calculateMillimetersPerPixel('card', {width: 0, height: 0}):", calculateMillimetersPerPixel("card", { width: 0, height: 0 }));
console.log("calculateMillimetersPerPixel('apriltag', {width: -50, height: 10}):", calculateMillimetersPerPixel("apriltag", { width: -50, height: 10 }));
console.log("computeCalibrationScale(0, -10):", computeCalibrationScale(0, -10));
console.log("applyCalibrationToPoint(100, 200, NaN):", applyCalibrationToPoint(100, 200, NaN));

// 3. Homography
console.log("\n3. Testing homography.ts...");
console.log("solveLinearSystem8x8(singular):", solveLinearSystem8x8(Array(8).fill(Array(8).fill(0)), Array(8).fill(1)));
const collinearImg = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
const floorPts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
console.log("computeHomographyMatrix(collinear):", computeHomographyMatrix(collinearImg, floorPts));
const zeroWMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 0] // w' = 0
];
console.log("transformPoint with w'=0:", transformPoint({ x: 5, y: 10 }, zeroWMatrix));

// 4. LiveCapture
console.log("\n4. Testing liveCapture.ts...");
console.log("bufferedSpanSec([]):", bufferedSpanSec([]));
const exact035Frames = [{ timeMs: 0, landmarks: [] }, { timeMs: 350, landmarks: [] }];
const split0351Frames = [{ timeMs: 0, landmarks: [] }, { timeMs: 351, landmarks: [] }, { timeMs: 400, landmarks: [] }];
console.log("longestContinuousRun(exact 0.35s gap length):", longestContinuousRun(exact035Frames).length);
console.log("longestContinuousRun(0.351s gap length):", longestContinuousRun(split0351Frames).length);
console.log("defaultFacingMode(SSR):", defaultFacingMode());

// 5. Persistence.server
console.log("\n5. Testing persistence.server.ts re-exports...");
console.log("saveGaitSession exists:", typeof persistenceServer.saveGaitSession);
console.log("getPersistenceMode exists:", typeof persistenceServer.getPersistenceMode);

console.log("\n=== EMPIRICAL STRESS TEST COMPLETED SUCCESSFULLY ===");
