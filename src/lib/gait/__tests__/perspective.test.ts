import { describe, it, expect } from "vitest";
import {
  estimateCameraPerspective,
  estimateRealtimePerspective,
  extractAnthropometricRatios,
  estimateGroundPlaneNormal,
  estimateCameraYaw,
  estimateDistanceAndHeight,
  generateAlignmentGuidance,
  createPerspectiveRectificationMatrix,
  rectifyLandmark,
  rectifyPoseFrame,
  rectifyPoseFrames,
  correctAngleForPerspective,
  NORMATIVE_THIGH_SHANK_RATIO,
  NORMATIVE_TORSO_LEG_RATIO,
} from "../perspective";
import type { Landmark, PoseFrame } from "../types";
import { LM } from "../landmarks";

function createOrthogonalSagittalFrame(opts: {
  pitchRad?: number;
  yawRad?: number;
  rollRad?: number;
  thighLen?: number;
  shankLen?: number;
  torsoLen?: number;
} = {}): PoseFrame {
  const pitch = opts.pitchRad ?? 0;
  const yaw = opts.yawRad ?? Math.PI / 2; // 90° = sagittal
  const roll = opts.rollRad ?? 0;

  const thigh = opts.thighLen ?? 0.25;
  const shank = opts.shankLen ?? (opts.thighLen ? opts.thighLen / NORMATIVE_THIGH_SHANK_RATIO : 0.238);
  const torso = opts.torsoLen ?? (thigh + shank) * NORMATIVE_TORSO_LEG_RATIO;

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  // Helper to place landmark in 3D then project to 2D
  const projectPoint = (x3: number, y3: number, z3: number): Landmark => {
    // Rotate by pitch around X, yaw around Y, roll around Z
    // Yaw
    const x_y = cosY * x3 + sinY * z3;
    const y_y = y3;
    const z_y = -sinY * x3 + cosY * z3;

    // Pitch
    const x_p = x_y;
    const y_p = cosP * y_y - sinP * z_y;
    const z_p = sinP * y_y + cosP * z_y;

    // Roll
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const x_r = cosR * x_p - sinR * y_p;
    const y_r = sinR * x_p + cosR * y_p;
    const z_r = z_p;

    return {
      x: 0.5 + x_r,
      y: 0.5 + y_r,
      z: z_r,
      visibility: 0.95,
      presence: 0.95,
    };
  };

  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

  // Head / Nose
  landmarks[LM.NOSE] = projectPoint(0, -torso - 0.15, 0);

  // Shoulders (L: +X, R: -X)
  landmarks[LM.L_SHOULDER] = projectPoint(0.08, -torso, 0);
  landmarks[LM.R_SHOULDER] = projectPoint(-0.08, -torso, 0);

  // Hips
  landmarks[LM.L_HIP] = projectPoint(0.05, 0, 0);
  landmarks[LM.R_HIP] = projectPoint(-0.05, 0, 0);

  // Knees (vertical below hip)
  landmarks[LM.L_KNEE] = projectPoint(0.05, thigh, 0);
  landmarks[LM.R_KNEE] = projectPoint(-0.05, thigh, 0);

  // Ankles (vertical below knee)
  landmarks[LM.L_ANKLE] = projectPoint(0.05, thigh + shank, 0);
  landmarks[LM.R_ANKLE] = projectPoint(-0.05, thigh + shank, 0);

  // Heels
  landmarks[LM.L_HEEL] = projectPoint(0.05, thigh + shank, -0.04);
  landmarks[LM.R_HEEL] = projectPoint(-0.05, thigh + shank, -0.04);

  // Feet / Toes
  landmarks[LM.L_FOOT] = projectPoint(0.05, thigh + shank, 0.08);
  landmarks[LM.R_FOOT] = projectPoint(-0.05, thigh + shank, 0.08);

  const worldLandmarks: Landmark[] = landmarks.map((l) => ({
    x: (l.x - 0.5) * 2,
    y: (l.y - 0.5) * 2,
    z: l.z,
    visibility: 0.95,
  }));

  return {
    timeMs: 1000,
    landmarks,
    worldLandmarks,
  };
}

describe("Markerless Optical Camera Perspective & Homography Calibration Engine", () => {
  describe("1. Anthropometric Invariant Ratio Extraction", () => {
    it("computes Winter 2009 / Dempster 1955 segment ratios for normal stance", () => {
      const frame = createOrthogonalSagittalFrame({ thighLen: 0.25, shankLen: 0.238 });
      const ratios = extractAnthropometricRatios(frame.landmarks, "sagittal");

      expect(ratios.normativeThighShankRatio).toBe(NORMATIVE_THIGH_SHANK_RATIO);
      expect(ratios.normativeTorsoLegRatio).toBe(NORMATIVE_TORSO_LEG_RATIO);
      expect(ratios.thighShankRatio).toBeCloseTo(1.05, 1);
      expect(ratios.anthroPitchDeg).toBeLessThan(10.0);
    });

    it("returns safe defaults when landmark array is incomplete or missing", () => {
      const ratios = extractAnthropometricRatios([], "sagittal");
      expect(ratios.thighShankRatio).toBe(NORMATIVE_THIGH_SHANK_RATIO);
      expect(ratios.anthroPitchDeg).toBe(0);
    });
  });

  describe("2. Ground Plane Normal & Floor Vanishing Point Geometry", () => {
    it("estimates vertical ground normal for level camera", () => {
      const frame = createOrthogonalSagittalFrame({ pitchRad: 0, rollRad: 0 });
      const { normal, pitchFloorDeg, rollFloorDeg } = estimateGroundPlaneNormal([frame]);

      expect(normal[1]).toBeLessThan(0); // Upward pointing normal (-Y)
      expect(Math.abs(pitchFloorDeg)).toBeLessThan(5.0);
      expect(Math.abs(rollFloorDeg)).toBeLessThan(5.0);
    });

    it("estimates downward pitch tilt when floor plane normal is inclined", () => {
      const pitchRad = (15 * Math.PI) / 180;
      const frame = createOrthogonalSagittalFrame({ pitchRad });
      const { pitchFloorDeg } = estimateGroundPlaneNormal([frame]);

      expect(pitchFloorDeg).toBeGreaterThan(5.0);
    });

    it("handles empty frames array gracefully", () => {
      const { normal, pitchFloorDeg, rollFloorDeg } = estimateGroundPlaneNormal([]);
      expect(normal).toEqual([0, -1, 0]);
      expect(pitchFloorDeg).toBe(0);
      expect(rollFloorDeg).toBe(0);
    });
  });

  describe("3. Optical Yaw (Azimuth) Estimation", () => {
    it("identifies pure sagittal view (~90°) from bilateral depth difference", () => {
      const frame = createOrthogonalSagittalFrame({ yawRad: Math.PI / 2 });
      const { yawDeg } = estimateCameraYaw([frame], "sagittal");

      expect(yawDeg).toBeGreaterThan(75.0);
      expect(yawDeg).toBeLessThanOrEqual(95.0);
    });

    it("identifies pure frontal view (~0°) from bilateral width projection", () => {
      const frame = createOrthogonalSagittalFrame({ yawRad: 0 });
      const { yawDeg } = estimateCameraYaw([frame], "frontal");

      expect(yawDeg).toBeLessThan(15.0);
    });
  });

  describe("4. Pinhole Camera Distance and Height Estimation", () => {
    it("estimates distance proportional to normalized bounding box height", () => {
      const frame = createOrthogonalSagittalFrame();
      const { distanceMeters, cameraHeightMeters } = estimateDistanceAndHeight([frame], 0, 1.72, 1.15);

      expect(distanceMeters).toBeGreaterThan(1.5);
      expect(distanceMeters).toBeLessThan(6.0);
      expect(cameraHeightMeters).toBeGreaterThan(0.5);
      expect(cameraHeightMeters).toBeLessThan(2.5);
    });

    it("handles empty frames with robust fallbacks", () => {
      const { distanceMeters, cameraHeightMeters } = estimateDistanceAndHeight([], 0);
      expect(distanceMeters).toBe(2.8);
      expect(cameraHeightMeters).toBe(1.4);
    });
  });

  describe("5. 3-Tier Clinical Warning System & Guidance", () => {
    it("classifies <= 10° deviation as nominal with green badge status", () => {
      const frame = createOrthogonalSagittalFrame({ pitchRad: (4 * Math.PI) / 180, yawRad: Math.PI / 2 });
      const params = estimateCameraPerspective([frame]);

      expect(params.isOrthogonal).toBe(true);
      expect(params.warningLevel).toBe("nominal");
      expect(params.obliqueDeviationDeg).toBeLessThanOrEqual(10.0);
      expect(params.foreshorteningFactor).toBeGreaterThan(0.95);
    });

    it("classifies > 10° and <= 20° deviation as warning with repositioning advice", () => {
      const frame = createOrthogonalSagittalFrame({ pitchRad: (14 * Math.PI) / 180, yawRad: Math.PI / 2 });
      const params = estimateCameraPerspective([frame]);

      expect(params.isOrthogonal).toBe(false);
      expect(params.warningLevel).toBe("warning");
      expect(params.warningMessage).toContain("Non-orthogonal camera view");
      expect(params.guidance.guidanceText.length).toBeGreaterThan(0);
    });

    it("classifies > 20° deviation as critical with severe distortion alert", () => {
      const frame = createOrthogonalSagittalFrame({
        pitchRad: (24 * Math.PI) / 180,
        yawRad: (65 * Math.PI) / 180,
      });
      const params = estimateCameraPerspective([frame]);

      expect(params.isOrthogonal).toBe(false);
      expect(params.warningLevel).toBe("critical");
      expect(params.warningMessage).toContain("Severe non-orthogonal");
    });

    it("generates exact physical tripod height, tilt, and yaw guidance values", () => {
      const guidance = generateAlignmentGuidance(15.0, 70.0, 3.0, 1.5, "sagittal", 10.0);

      expect(guidance.tiltAdjustmentDeg).toBe(-15.0);
      expect(guidance.yawAdjustmentDeg).toBe(20.0);
      expect(guidance.heightAdjustmentCm).toBeLessThan(0); // Lower tripod
      expect(guidance.guidanceText.some((g) => g.includes("Lower tripod") || g.includes("tilt camera up"))).toBe(true);
    });
  });

  describe("6. 3D Spatial Rotation Matrix Rectification", () => {
    it("creates orthonormal 3x3 rotation matrix (R^T * R = I, det(R) = 1.0)", () => {
      const R = createPerspectiveRectificationMatrix(15.0, 20.0, 5.0);

      // Check dimensions
      expect(R.length).toBe(3);
      expect(R[0].length).toBe(3);

      // Check R * R^T = I
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          let dot = 0;
          for (let k = 0; k < 3; k++) {
            dot += R[i][k] * R[j][k];
          }
          if (i === j) {
            expect(dot).toBeCloseTo(1.0, 5);
          } else {
            expect(dot).toBeCloseTo(0.0, 5);
          }
        }
      }

      // Check det(R) = 1.0
      const det =
        R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
        R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
        R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);

      expect(det).toBeCloseTo(1.0, 5);
    });

    it("rectifies 3D landmark coordinates accurately", () => {
      const R = createPerspectiveRectificationMatrix(0, 0, 0); // Identity
      const lm: Landmark = { x: 0.6, y: 0.7, z: 0.2, visibility: 0.9 };
      const center = { x: 0.5, y: 0.5, z: 0.0 };

      const rectified = rectifyLandmark(lm, R, center);
      expect(rectified.x).toBeCloseTo(0.6, 5);
      expect(rectified.y).toBeCloseTo(0.7, 5);
      expect(rectified.z).toBeCloseTo(0.2, 5);
    });

    it("rectifies entire PoseFrame and preserves landmark count and metadata", () => {
      const frame = createOrthogonalSagittalFrame({ pitchRad: (15 * Math.PI) / 180 });
      const params = estimateCameraPerspective([frame]);
      const rectified = rectifyPoseFrame(frame, params);

      expect(rectified.landmarks.length).toBe(frame.landmarks.length);
      expect(rectified.timeMs).toBe(frame.timeMs);
      if (frame.worldLandmarks) {
        expect(rectified.worldLandmarks?.length).toBe(frame.worldLandmarks.length);
      }
    });

    it("rectifies batch of pose frames via rectifyPoseFrames", () => {
      const frames = [createOrthogonalSagittalFrame(), createOrthogonalSagittalFrame()];
      const params = estimateCameraPerspective(frames);
      const batch = rectifyPoseFrames(frames, params);

      expect(batch.length).toBe(2);
    });
  });

  describe("7. 2D Analytical Joint Angle Perspective Correction", () => {
    it("corrects apparent 45° angle under 15° pitch to true angle (~46.0°)", () => {
      // theta_true = arctan(tan(45°) / (cos(15°) * cos(0°)))
      // tan(45°) / cos(15°) = 1.0 / 0.9659258 = 1.035276 -> arctan(1.035276) = 46.0°
      const corrected = correctAngleForPerspective(45.0, 15.0, 0.0);
      expect(corrected).toBeCloseTo(46.0, 1);
    });

    it("corrects apparent 30° angle under 20° yaw deviation to true angle (~31.6°)", () => {
      // tan(30°) / cos(20°) = 0.57735 / 0.93969 = 0.61440 -> arctan(0.61440) = 31.57°
      const corrected = correctAngleForPerspective(30.0, 0.0, 20.0);
      expect(corrected).toBeCloseTo(31.57, 1);
    });

    it("preserves 0° angle unchanged", () => {
      const corrected = correctAngleForPerspective(0.0, 15.0, 10.0);
      expect(corrected).toBe(0.0);
    });

    it("preserves negative sign for extension angles", () => {
      const corrected = correctAngleForPerspective(-20.0, 12.0, 0.0);
      expect(corrected).toBeLessThan(0);
      expect(Math.abs(corrected)).toBeGreaterThan(20.0);
    });

    it("handles extreme / near-singular angles gracefully without NaN", () => {
      const corrected = correctAngleForPerspective(89.0, 89.0, 0.0);
      expect(Number.isFinite(corrected)).toBe(true);
      expect(isNaN(corrected)).toBe(false);
    });
  });

  describe("8. Single Frame Realtime Estimation", () => {
    it("estimateRealtimePerspective runs synchronously and matches multi-frame interface", () => {
      const frame = createOrthogonalSagittalFrame();
      const res = estimateRealtimePerspective(frame);

      expect(res).toHaveProperty("pitchDeg");
      expect(res).toHaveProperty("yawDeg");
      expect(res).toHaveProperty("warningLevel");
      expect(res).toHaveProperty("guidance");
      expect(res).toHaveProperty("foreshorteningFactor");
    });
  });
});
