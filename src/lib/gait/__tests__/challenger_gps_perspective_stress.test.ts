import { describe, it, expect } from "vitest";
import {
  getGPSNormativeCurves,
  calculateGVS,
  computeFullGPSAndMAP,
  evaluateGPSDelta,
} from "../gpsNormatives";
import {
  estimateCameraPerspective,
  estimateRealtimePerspective,
  createPerspectiveRectificationMatrix,
  rectifyLandmark,
  rectifyPoseFrames,
  correctAngleForPerspective,
  NORMATIVE_THIGH_SHANK_RATIO,
  NORMATIVE_TORSO_LEG_RATIO,
} from "../perspective";
import type { Landmark, PoseFrame } from "../types";
import { LM } from "../landmarks";
import type { GaitAngleAnalysis } from "../angles";

/**
 * Synthetic PoseFrame generator for perspective stress testing
 */
function createSyntheticPerspectiveFrame(opts: {
  pitchDeg?: number;
  yawDeg?: number;
  rollDeg?: number;
  thighLen?: number;
  shankLen?: number;
  torsoLen?: number;
  visibility?: number;
  corruptLandmarks?: boolean;
}): PoseFrame {
  const pitchRad = ((opts.pitchDeg ?? 0) * Math.PI) / 180;
  const yawRad = ((opts.yawDeg ?? 90) * Math.PI) / 180;
  const rollRad = ((opts.rollDeg ?? 0) * Math.PI) / 180;
  const visibility = opts.visibility ?? 0.95;

  const thigh = opts.thighLen ?? 0.25;
  const shank = opts.shankLen ?? (opts.thighLen ? opts.thighLen / NORMATIVE_THIGH_SHANK_RATIO : 0.238);
  const torso = opts.torsoLen ?? (thigh + shank) * NORMATIVE_TORSO_LEG_RATIO;

  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);

  const projectPoint = (x3: number, y3: number, z3: number): Landmark => {
    // Yaw around Y
    const x_y = cosY * x3 + sinY * z3;
    const y_y = y3;
    const z_y = -sinY * x3 + cosY * z3;

    // Pitch around X
    const x_p = x_y;
    const y_p = cosP * y_y - sinP * z_y;
    const z_p = sinP * y_y + cosP * z_y;

    // Roll around Z
    const x_r = cosR * x_p - sinR * y_p;
    const y_r = sinR * x_p + cosR * y_p;
    const z_r = z_p;

    return {
      x: 0.5 + x_r,
      y: 0.5 + y_r,
      z: z_r,
      visibility,
      presence: visibility,
    };
  };

  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility }));

  if (!opts.corruptLandmarks) {
    landmarks[LM.NOSE] = projectPoint(0, -torso - 0.15, 0);
    landmarks[LM.L_SHOULDER] = projectPoint(0.08, -torso, 0);
    landmarks[LM.R_SHOULDER] = projectPoint(-0.08, -torso, 0);
    landmarks[LM.L_HIP] = projectPoint(0.05, 0, 0);
    landmarks[LM.R_HIP] = projectPoint(-0.05, 0, 0);
    landmarks[LM.L_KNEE] = projectPoint(0.05, thigh, 0);
    landmarks[LM.R_KNEE] = projectPoint(-0.05, thigh, 0);
    landmarks[LM.L_ANKLE] = projectPoint(0.05, thigh + shank, 0);
    landmarks[LM.R_ANKLE] = projectPoint(-0.05, thigh + shank, 0);
    landmarks[LM.L_HEEL] = projectPoint(0.05, thigh + shank, -0.04);
    landmarks[LM.R_HEEL] = projectPoint(-0.05, thigh + shank, -0.04);
    landmarks[LM.L_FOOT] = projectPoint(0.05, thigh + shank, 0.08);
    landmarks[LM.R_FOOT] = projectPoint(-0.05, thigh + shank, 0.08);
  }

  const worldLandmarks: Landmark[] = landmarks.map((l) => ({
    x: (l.x - 0.5) * 2,
    y: (l.y - 0.5) * 2,
    z: l.z,
    visibility,
  }));

  return {
    timeMs: 1000,
    landmarks,
    worldLandmarks,
  };
}

describe("Empirical Challenger 1 — Stress Testing Mathematical & Kinematic Engines", () => {
  describe("Section 1: Baker et al. (2009) GVS and GPS Calculations", () => {
    it("1.1 Perfect match with normative curves -> returns exactly 0.0° for all 9 GVS, side GPS, and overall GPS", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        pelvicTiltAngleLeft: nc.pelvicTiltMean,
        pelvicTiltAngleRight: nc.pelvicTiltMean,
        pelvicObliquityAngleLeft: nc.pelvicObliquityMean,
        pelvicObliquityAngleRight: nc.pelvicObliquityMean,
        pelvicRotationAngleLeft: nc.pelvicRotationMean,
        pelvicRotationAngleRight: nc.pelvicRotationMean,
        hipAngleLeft: nc.hipFlexionMean,
        hipAngleRight: nc.hipFlexionMean,
        hipAbductionAngleLeft: nc.hipAbductionMean,
        hipAbductionAngleRight: nc.hipAbductionMean,
        hipRotationAngleLeft: nc.hipRotationMean,
        hipRotationAngleRight: nc.hipRotationMean,
        kneeAngleLeft: nc.kneeFlexionMean,
        kneeAngleRight: nc.kneeFlexionMean,
        ankleAngleLeft: nc.ankleFlexionMean,
        ankleAngleRight: nc.ankleFlexionMean,
        footProgressionAngleLeft: nc.footProgressionMean,
        footProgressionAngleRight: nc.footProgressionMean,
      }));

      const analysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const result = computeFullGPSAndMAP(analysis);
      expect(result.overallGPS).toBe(0.0);
      expect(result.leftGPS).toBe(0.0);
      expect(result.rightGPS).toBe(0.0);
      expect(result.asymmetryDeltaGPS).toBe(0.0);
      expect(result.evaluatedVariableCount).toBe(9);
      expect(result.severity).toBe("normal");

      for (const entry of result.gvsEntries) {
        expect(entry.leftGVS).toBe(0.0);
        expect(entry.rightGVS).toBe(0.0);
        expect(entry.overallGVS).toBe(0.0);
        expect(entry.isSuppressed).toBe(false);
        expect(entry.severity).toBe("normal");
      }
    });

    it("1.2 Uniform offset of +10.0° on Knee Flexion -> returns exactly 10.0° GVS", () => {
      const normCurves = getGPSNormativeCurves();
      const mockPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean + 10.0,
        kneeAngleRight: nc.kneeFlexionMean + 10.0,
      }));

      const analysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: mockPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const result = computeFullGPSAndMAP(analysis);
      const kneeEntry = result.gvsEntries.find((e) => e.variable === "kneeFlexion");
      expect(kneeEntry).toBeDefined();
      expect(kneeEntry?.leftGVS).toBe(10.0);
      expect(kneeEntry?.rightGVS).toBe(10.0);
      expect(kneeEntry?.overallGVS).toBe(10.0);
      expect(kneeEntry?.severity).toBe("severe");
      expect(kneeEntry?.isSuppressed).toBe(false);
    });

    it("1.3 Handling of missing/suppressed channels -> gracefully reports isSuppressed / null without NaN or exceptions", () => {
      // Case A: GaitAngleAnalysis explicitly suppressed (e.g. frontal view)
      const suppressedAnalysis: GaitAngleAnalysis = {
        isSuppressed: true,
        suppressionReason: "Kinematics suppressed in frontal camera view.",
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      };

      const resA = computeFullGPSAndMAP(suppressedAnalysis);
      expect(resA.overallGPS).toBe(0);
      expect(resA.leftGPS).toBeNull();
      expect(resA.rightGPS).toBeNull();
      expect(resA.asymmetryDeltaGPS).toBeNull();
      expect(resA.evaluatedVariableCount).toBe(0);
      expect(resA.severity).toBe("normal");
      expect(resA.interpretation).toContain("suppressed");
      for (const entry of resA.gvsEntries) {
        expect(entry.isSuppressed).toBe(true);
        expect(entry.overallGVS).toBeNull();
      }

      // Case B: Sparse tracking with missing transverse & frontal channels (only Knee tracked)
      const normCurves = getGPSNormativeCurves();
      const sparsePoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean + 4.0,
        kneeAngleRight: nc.kneeFlexionMean + 4.0,
        // All other channels null/undefined
      }));

      const resB = computeFullGPSAndMAP({
        isSuppressed: false,
        normalizedPoints: sparsePoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      });

      expect(resB.evaluatedVariableCount).toBe(1);
      expect(resB.overallGPS).toBe(4.0);
      const kneeEntry = resB.gvsEntries.find((e) => e.variable === "kneeFlexion");
      expect(kneeEntry?.isSuppressed).toBe(false);
      expect(kneeEntry?.overallGVS).toBe(4.0);

      const unmeasuredEntry = resB.gvsEntries.find((e) => e.variable === "footProgression");
      expect(unmeasuredEntry?.isSuppressed).toBe(true);
      expect(unmeasuredEntry?.overallGVS).toBeNull();
      expect(unmeasuredEntry?.suppressionReason).toContain("transverse");
    });

    it("1.4 Longitudinal delta evaluation: test ΔGPS = -1.8° correctly triggers >= 1.6° MCID improvement flag", () => {
      const delta1 = evaluateGPSDelta(7.5, 5.7); // Δ = -1.8°
      expect(delta1.deltaGPS).toBe(-1.8);
      expect(delta1.isClinicallyMeaningful).toBe(true);
      expect(delta1.direction).toBe("improved");
      expect(delta1.message).toContain("meaningful kinematic improvement");

      // Exact MCID boundary cases:
      const deltaBoundaryImproved = evaluateGPSDelta(6.6, 5.0); // Δ = -1.6°
      expect(deltaBoundaryImproved.deltaGPS).toBe(-1.6);
      expect(deltaBoundaryImproved.isClinicallyMeaningful).toBe(true);
      expect(deltaBoundaryImproved.direction).toBe("improved");

      const deltaBoundaryDeteriorated = evaluateGPSDelta(5.0, 6.6); // Δ = +1.6°
      expect(deltaBoundaryDeteriorated.deltaGPS).toBe(1.6);
      expect(deltaBoundaryDeteriorated.isClinicallyMeaningful).toBe(true);
      expect(deltaBoundaryDeteriorated.direction).toBe("deteriorated");

      const deltaSubBoundary = evaluateGPSDelta(6.0, 4.41); // Δ = -1.59° (< 1.6°)
      expect(deltaSubBoundary.deltaGPS).toBe(-1.59);
      expect(deltaSubBoundary.isClinicallyMeaningful).toBe(false);
      expect(deltaSubBoundary.direction).toBe("unchanged");
    });

    it("1.5 GVS RMSE numerical stability: handles corrupt, infinite, NaN, and sparse input arrays", () => {
      const normMean = new Array(50).fill(20.0);

      // Fewer than 10 valid points -> returns null
      const sparse = new Array(50).fill(null);
      sparse[0] = 20.0;
      sparse[1] = 25.0;
      expect(calculateGVS(sparse, normMean)).toBeNull();

      // Exactly 9 points -> null, exactly 10 points -> computed
      for (let i = 0; i < 9; i++) sparse[i] = 20.0;
      expect(calculateGVS(sparse, normMean)).toBeNull();
      sparse[9] = 20.0;
      expect(calculateGVS(sparse, normMean)).toBe(0.0);

      // Dirty values containing NaN, Infinity, -Infinity
      const dirty = new Array(50).fill(20.0);
      dirty[10] = NaN;
      dirty[11] = Infinity;
      dirty[12] = -Infinity;
      dirty[13] = null;
      dirty[14] = undefined;
      expect(calculateGVS(dirty, normMean)).toBe(0.0);

      // Extreme values (e.g. 1000° offset)
      const extreme = normMean.map((v) => v + 1000.0);
      expect(calculateGVS(extreme, normMean)).toBe(1000.0);
    });

    it("1.6 Age stratification boundary verification across lifespan cohorts", () => {
      const ages = [-5, 0, 10, 17, 18, 50, 64, 65, 74, 75, 84, 85, 105, NaN, undefined];
      for (const age of ages) {
        const curves = getGPSNormativeCurves(age as number);
        expect(curves).toHaveLength(101);
        for (const pt of curves) {
          expect(Number.isFinite(pt.kneeFlexionMean)).toBe(true);
          expect(Number.isFinite(pt.hipFlexionMean)).toBe(true);
          expect(Number.isFinite(pt.ankleFlexionMean)).toBe(true);
          expect(Number.isFinite(pt.pelvicTiltMean)).toBe(true);
        }
      }
    });

    it("1.7 Unilateral evaluation: handles one limb completely absent without crashing", () => {
      const normCurves = getGPSNormativeCurves();
      const leftOnlyPoints = normCurves.map((nc) => ({
        gaitCyclePct: nc.gaitCyclePct,
        kneeAngleLeft: nc.kneeFlexionMean + 6.0,
        kneeAngleRight: null,
      }));

      const res = computeFullGPSAndMAP({
        isSuppressed: false,
        normalizedPoints: leftOnlyPoints as any,
        leftStrides: [],
        rightStrides: [],
        metrics: {} as any,
        normativeData: undefined as any,
      });

      expect(res.leftGPS).toBe(6.0);
      expect(res.rightGPS).toBeNull();
      expect(res.asymmetryDeltaGPS).toBeNull();
      expect(res.overallGPS).toBe(6.0);
      expect(res.evaluatedVariableCount).toBe(1);
    });
  });

  describe("Section 2: Markerless Optical Camera Perspective & Rectification Engine", () => {
    it("2.1 Perfect orthogonal sagittal view (pitch 0°, yaw 90°) -> returns isOrthogonal = true, warningLevel = 'nominal'", () => {
      const frame = createSyntheticPerspectiveFrame({ pitchDeg: 0, yawDeg: 90, rollDeg: 0 });
      const params = estimateCameraPerspective([frame], { targetView: "sagittal" });

      expect(params.isOrthogonal).toBe(true);
      expect(params.warningLevel).toBe("nominal");
      expect(Math.abs(params.pitchDeg)).toBeLessThan(5.0);
      expect(Math.abs(params.yawDeg - 90.0)).toBeLessThan(5.0);
      expect(params.obliqueDeviationDeg).toBeLessThanOrEqual(10.0);
      expect(params.foreshorteningFactor).toBeGreaterThan(0.98);
      expect(params.guidance.guidanceText.some((g) => g.includes("optimal") || g.includes("nominal"))).toBe(true);
    });

    it("2.2 Downward pitch of +15° -> returns pitchDeg ~ 15.0°, warningLevel = 'warning' (>10° tilt threshold)", () => {
      const frame = createSyntheticPerspectiveFrame({ pitchDeg: 15, yawDeg: 90, rollDeg: 0 });
      const params = estimateCameraPerspective([frame], { targetView: "sagittal" });

      expect(params.isOrthogonal).toBe(false);
      expect(params.warningLevel).toBe("warning");
      expect(params.pitchDeg).toBeGreaterThan(10.0);
      expect(params.pitchDeg).toBeLessThan(20.0);
      expect(params.obliqueDeviationDeg).toBeGreaterThan(10.0);
      expect(params.obliqueDeviationDeg).toBeLessThanOrEqual(20.0);
      expect(params.warningMessage).toContain("Non-orthogonal camera view");
    });

    it("2.3 Oblique yaw of 65° (25° deviation from sagittal) -> returns warningLevel = 'critical'", () => {
      const frame = createSyntheticPerspectiveFrame({ pitchDeg: 0, yawDeg: 65, rollDeg: 0 });
      const params = estimateCameraPerspective([frame], { targetView: "sagittal" });

      expect(params.isOrthogonal).toBe(false);
      expect(params.warningLevel).toBe("critical");
      expect(params.obliqueDeviationDeg).toBeGreaterThanOrEqual(20.0);
      expect(params.warningMessage).toContain("Severe non-orthogonal");
    });

    it("2.4 Matrix properties: verify R_rect^T * R_rect = I and det(R_rect) = 1.0 across dense Euler angle grid", () => {
      const testAngles = [
        [0, 0, 0],
        [15, 0, 0],
        [0, 20, 0],
        [0, 0, 10],
        [15, 20, 5],
        [-25, 30, -15],
        [45, -45, 30],
        [-60, 60, -45],
        [80, -80, 80],
      ];

      for (const [p, y, r] of testAngles) {
        const R = createPerspectiveRectificationMatrix(p, y, r);

        // Dimensions
        expect(R.length).toBe(3);
        expect(R[0].length).toBe(3);

        // Orthonormality check: R * R^T = I
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

        // Determinant check: det(R) = +1.0 (SO(3) special orthogonal group)
        const det =
          R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
          R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
          R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);

        expect(det).toBeCloseTo(1.0, 5);
      }
    });

    it("2.5 2D angle correction formula: verify apparent angle under 15° pitch rectifies accurately", () => {
      // Analytical ground truth:
      // theta_true = arctan( tan(theta_app) / (cos(pitch) * cos(yawDev)) )
      // At pitch = 15°, yawDev = 0°: cos(15°) ≈ 0.9659258
      // Apparent 45.0° -> tan(45°) / 0.9659258 = 1.035276 -> arctan(1.035276) = 46.00°
      const corr45 = correctAngleForPerspective(45.0, 15.0, 0.0);
      expect(corr45).toBeCloseTo(46.0, 1);

      // Apparent 30.0° -> tan(30°) / 0.9659258 = 0.57735 / 0.9659258 = 0.59772 -> arctan = 30.87°
      const corr30 = correctAngleForPerspective(30.0, 15.0, 0.0);
      expect(corr30).toBeCloseTo(30.87, 1);

      // Apparent 60.0° -> tan(60°) / 0.9659258 = 1.73205 / 0.9659258 = 1.79315 -> arctan = 60.85°
      const corr60 = correctAngleForPerspective(60.0, 15.0, 0.0);
      expect(corr60).toBeCloseTo(60.85, 1);

      // Compound pitch = 15° + yawDev = 20°:
      // cos(15°) * cos(20°) = 0.9659258 * 0.9396926 = 0.907673
      // Apparent 45.0° -> 1.0 / 0.907673 = 1.101718 -> arctan = 47.77°
      const corrCompound = correctAngleForPerspective(45.0, 15.0, 20.0);
      expect(corrCompound).toBeCloseTo(47.77, 1);

      // 0.0° remains 0.0°
      expect(correctAngleForPerspective(0.0, 15.0, 20.0)).toBe(0.0);

      // Negative angles preserve negative direction
      const corrNeg = correctAngleForPerspective(-30.0, 15.0, 0.0);
      expect(corrNeg).toBeCloseTo(-30.87, 1);
    });

    it("2.6 Landmark rectification inversion consistency: R^T * R transforms back to original landmark", () => {
      const pitch = 20.0;
      const yaw = 15.0;
      const roll = -10.0;
      const R_forward = createPerspectiveRectificationMatrix(pitch, yaw, roll);
      // Inverse rotation matrix is transpose
      const R_inv = [
        [R_forward[0][0], R_forward[1][0], R_forward[2][0]],
        [R_forward[0][1], R_forward[1][1], R_forward[2][1]],
        [R_forward[0][2], R_forward[1][2], R_forward[2][2]],
      ];

      const originalLm: Landmark = { x: 0.72, y: 0.35, z: -0.18, visibility: 0.99 };
      const center = { x: 0.5, y: 0.5, z: 0.0 };

      const transformed = rectifyLandmark(originalLm, R_forward, center);
      const reconstructed = rectifyLandmark(transformed, R_inv, center);

      expect(reconstructed.x).toBeCloseTo(originalLm.x, 5);
      expect(reconstructed.y).toBeCloseTo(originalLm.y, 5);
      expect(reconstructed.z).toBeCloseTo(originalLm.z!, 5);
    });

    it("2.7 Realtime & batch perspective rectification with corrupted / edge-case pose frames", () => {
      // Empty frames
      const emptyParams = estimateCameraPerspective([]);
      expect(emptyParams.isOrthogonal).toBe(true);
      expect(emptyParams.warningLevel).toBe("nominal");

      // Corrupted frames with missing landmarks
      const corruptFrame = createSyntheticPerspectiveFrame({ corruptLandmarks: true });
      const corruptParams = estimateRealtimePerspective(corruptFrame);
      expect(corruptParams).toBeDefined();
      expect(Number.isFinite(corruptParams.pitchDeg)).toBe(true);
      expect(Number.isFinite(corruptParams.yawDeg)).toBe(true);

      // Batch rectification of frames
      const frames = [
        createSyntheticPerspectiveFrame({ pitchDeg: 12 }),
        createSyntheticPerspectiveFrame({ pitchDeg: 12 }),
      ];
      const rectifiedFrames = rectifyPoseFrames(frames, corruptParams);
      expect(rectifiedFrames).toHaveLength(2);
      expect(rectifiedFrames[0].landmarks).toHaveLength(33);
    });
  });
});
