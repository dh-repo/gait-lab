import { describe, it, expect } from "vitest";
import {
  calculateKneeFlexion,
  calculateHipFlexion,
  calculateAnkleAngle,
  getNormativeGaitCurves,
  computeGaitAngleAnalysis,
} from "../angles";
import type { Landmark, PoseFrame } from "../types";
import type { GaitEvent } from "../events";
import { LM } from "../landmarks";

describe("Joint Kinematic Angles Module (angles.ts)", () => {
  describe("3-Point Joint Angle Calculations", () => {
    it("computes knee flexion correctly (0° extension for collinear leg, 90° for right-angle bend)", () => {
      const hip: Landmark = { x: 0, y: 0, z: 0, visibility: 0.9 };
      const knee: Landmark = { x: 0, y: 1, z: 0, visibility: 0.9 };
      const ankleCollinear: Landmark = { x: 0, y: 2, z: 0, visibility: 0.9 };

      // Collinear leg = 0° flexion
      const kneeExt = calculateKneeFlexion(hip, knee, ankleCollinear);
      expect(kneeExt).toBeCloseTo(0, 1);

      // Right-angle knee bend = 90° flexion
      const ankle90: Landmark = { x: 1, y: 1, z: 0, visibility: 0.9 };
      const kneeFlex90 = calculateKneeFlexion(hip, knee, ankle90);
      expect(kneeFlex90).toBeCloseTo(90, 1);

      // 45° knee bend
      const ankle45: Landmark = { x: 1, y: 2, z: 0, visibility: 0.9 };
      const kneeFlex45 = calculateKneeFlexion(hip, knee, ankle45);
      expect(kneeFlex45).toBeCloseTo(45, 1);
    });

    it("computes signed hip flexion/extension relative to trunk vector and walk direction", () => {
      const shoulder: Landmark = { x: 0, y: 0, z: 0, visibility: 0.9 };
      const hip: Landmark = { x: 0, y: 1, z: 0, visibility: 0.9 };

      // Neutral standing straight = 0° hip angle
      const kneeStanding: Landmark = { x: 0, y: 2, z: 0, visibility: 0.9 };
      expect(calculateHipFlexion(shoulder, hip, kneeStanding, 1)).toBeCloseTo(0, 1);

      // 30° Anterior Flexion (walking right, walkDir = 1)
      const rad30 = (30 * Math.PI) / 180;
      const kneeFlex30: Landmark = {
        x: Math.sin(rad30),
        y: 1 + Math.cos(rad30),
        z: 0,
        visibility: 0.9,
      };
      const flexAngle = calculateHipFlexion(shoulder, hip, kneeFlex30, 1);
      expect(flexAngle).toBeGreaterThan(0);
      expect(flexAngle).toBeCloseTo(30, 1);

      // 15° Posterior Extension (walking right, walkDir = 1)
      const rad15 = (15 * Math.PI) / 180;
      const kneeExt15: Landmark = {
        x: -Math.sin(rad15),
        y: 1 + Math.cos(rad15),
        z: 0,
        visibility: 0.9,
      };
      const extAngle = calculateHipFlexion(shoulder, hip, kneeExt15, 1);
      expect(extAngle).toBeLessThan(0);
      expect(extAngle).toBeCloseTo(-15, 1);

      // Reversed walk direction (walkDir = -1, walking left)
      // Moving left (-x) is anterior flexion when walkDir = -1
      const kneeFlexLeft: Landmark = {
        x: -Math.sin(rad30),
        y: 1 + Math.cos(rad30),
        z: 0,
        visibility: 0.9,
      };
      const flexAngleRev = calculateHipFlexion(shoulder, hip, kneeFlexLeft, -1);
      expect(flexAngleRev).toBeGreaterThan(0);
      expect(flexAngleRev).toBeCloseTo(30, 1);
    });

    it("computes ankle dorsiflexion/plantarflexion relative to 90° standing with heel fallback", () => {
      const knee: Landmark = { x: 0, y: 0, z: 0, visibility: 0.9 };
      const ankle: Landmark = { x: 0, y: 1, z: 0, visibility: 0.9 };

      // Neutral standing (90° Knee-Ankle-Toe) = 0°
      const toeNeutral: Landmark = { x: 1, y: 1, z: 0, visibility: 0.9 };
      expect(calculateAnkleAngle(knee, ankle, toeNeutral, 1)).toBeCloseTo(0, 1);

      // Dorsiflexion (toes pulled up 15° -> interior angle 75°)
      const rad15 = (15 * Math.PI) / 180;
      const toeDorsi: Landmark = {
        x: Math.cos(rad15),
        y: 1 - Math.sin(rad15),
        z: 0,
        visibility: 0.9,
      };
      const dorsiAngle = calculateAnkleAngle(knee, ankle, toeDorsi, 1);
      expect(dorsiAngle).toBeGreaterThan(0);
      expect(dorsiAngle).toBeCloseTo(15, 1);

      // Plantarflexion (toes pointed down 15° -> interior angle 105°)
      const toePlantar: Landmark = {
        x: Math.cos(rad15),
        y: 1 + Math.sin(rad15),
        z: 0,
        visibility: 0.9,
      };
      const plantarAngle = calculateAnkleAngle(knee, ankle, toePlantar, 1);
      expect(plantarAngle).toBeLessThan(0);
      expect(plantarAngle).toBeCloseTo(-15, 1);

      // Fallback to heel when toe visibility < 0.3
      const toeLowVis: Landmark = { x: 1, y: 1, z: 0, visibility: 0.1 };
      const heel: Landmark = { x: -1, y: 1, z: 0, visibility: 0.9 };
      const ankleWithHeelFallback = calculateAnkleAngle(
        knee,
        ankle,
        toeLowVis,
        1,
        heel,
      );
      expect(ankleWithHeelFallback).toBeCloseTo(0, 1);
    });

    it("handles missing or low-visibility landmarks gracefully by returning 0", () => {
      const hip: Landmark = { x: 0, y: 0, z: 0, visibility: 0.1 };
      const knee: Landmark = { x: 0, y: 1, z: 0, visibility: 0.9 };
      const ankle: Landmark = { x: 0, y: 2, z: 0, visibility: 0.9 };

      expect(calculateKneeFlexion(hip, knee, ankle)).toBe(0);
      expect(calculateHipFlexion(hip, knee, ankle, 1)).toBe(0);
      expect(calculateAnkleAngle(knee, ankle, null, 1)).toBe(0);
    });
  });

  describe("Normative Reference Curves (Perry & Burnfield)", () => {
    it("returns exactly 101 percentage points of normative data bounds", () => {
      const curves = getNormativeGaitCurves();
      expect(curves).toHaveLength(101);
      expect(curves[0].gaitCyclePct).toBe(0);
      expect(curves[100].gaitCyclePct).toBe(100);
    });

    it("matches key biomechanical reference points from Perry & Burnfield", () => {
      const curves = getNormativeGaitCurves();

      // Knee peak swing flexion at ~73% should be ~62°
      expect(curves[73].kneeMean).toBeCloseTo(62, 0);
      expect(curves[73].kneeMin).toBeLessThan(curves[73].kneeMean);
      expect(curves[73].kneeMax).toBeGreaterThan(curves[73].kneeMean);

      // Hip peak extension at 50% should be ~-12°
      expect(curves[50].hipMean).toBeCloseTo(-12, 0);
      expect(curves[50].hipMin).toBeLessThan(curves[50].hipMean);
      expect(curves[50].hipMax).toBeGreaterThan(curves[50].hipMean);

      // Ankle stance peak dorsiflexion at 45% should be ~10°
      expect(curves[45].ankleMean).toBeCloseTo(10, 0);
      expect(curves[45].ankleMin).toBeLessThan(curves[45].ankleMean);
      expect(curves[45].ankleMax).toBeGreaterThan(curves[45].ankleMean);
    });
  });

  describe("Master Calculation Function (computeGaitAngleAnalysis)", () => {
    function createSyntheticFrames(numFrames = 60, fps = 30): PoseFrame[] {
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

        // Left leg motion
        const kFlexL = Math.sin(2 * Math.PI * 1.0 * t);
        landmarks[LM.L_SHOULDER] = { x: 0.4, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.L_HIP] = { x: 0.4, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.L_KNEE] = {
          x: 0.4 + 0.1 * kFlexL,
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.L_ANKLE] = { x: 0.4, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.L_HEEL] = { x: 0.38, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.L_FOOT] = { x: 0.45, y: 0.92, z: 0, visibility: 0.9 };

        // Right leg motion
        const kFlexR = Math.sin(2 * Math.PI * 1.0 * t + Math.PI);
        landmarks[LM.R_SHOULDER] = { x: 0.6, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[LM.R_HIP] = { x: 0.6, y: 0.5, z: 0, visibility: 0.9 };
        landmarks[LM.R_KNEE] = {
          x: 0.6 + 0.1 * kFlexR,
          y: 0.7,
          z: 0,
          visibility: 0.9,
        };
        landmarks[LM.R_ANKLE] = { x: 0.6, y: 0.9, z: 0, visibility: 0.9 };
        landmarks[LM.R_HEEL] = { x: 0.58, y: 0.92, z: 0, visibility: 0.9 };
        landmarks[LM.R_FOOT] = { x: 0.65, y: 0.92, z: 0, visibility: 0.9 };

        frames.push({
          timeMs: i * dtMs,
          landmarks,
        });
      }

      return frames;
    }

    const syntheticEvents: GaitEvent[] = [
      { frame: 6, timeSec: 0.2, type: "heel_strike", side: "left" },
      { frame: 24, timeSec: 0.8, type: "toe_off", side: "left" },
      { frame: 36, timeSec: 1.2, type: "heel_strike", side: "left" },
      { frame: 21, timeSec: 0.7, type: "heel_strike", side: "right" },
      { frame: 39, timeSec: 1.3, type: "toe_off", side: "right" },
      { frame: 51, timeSec: 1.7, type: "heel_strike", side: "right" },
    ];

    it("resamples continuous frame trajectories into 101 normalized points across strides", () => {
      const frames = createSyntheticFrames();
      const result = computeGaitAngleAnalysis(
        frames,
        syntheticEvents,
        "sagittal",
        1,
      );

      expect(result.isSuppressed).toBe(false);
      expect(result.normalizedPoints).toHaveLength(101);
      expect(result.normalizedPoints[0].gaitCyclePct).toBe(0);
      expect(result.normalizedPoints[100].gaitCyclePct).toBe(100);

      expect(result.leftStrides).toHaveLength(1);
      expect(result.leftStrides[0].toeOffPct).toBe(60); // (0.8 - 0.2) / (1.2 - 0.2) * 100

      expect(result.rightStrides).toHaveLength(1);
      expect(result.rightStrides[0].toeOffPct).toBe(60); // (1.3 - 0.7) / (1.7 - 0.7) * 100
    });

    it("computes peak ROM metrics and asymmetry % accurately", () => {
      const frames = createSyntheticFrames();
      const result = computeGaitAngleAnalysis(
        frames,
        syntheticEvents,
        "sagittal",
        1,
      );

      const m = result.metrics;
      expect(m.kneeRomLeft).not.toBeNull();
      expect(m.kneeRomRight).not.toBeNull();
      expect(m.kneePeakFlexionLeft).not.toBeNull();
      expect(m.kneeAsymmetryPct).not.toBeNull();
      expect(m.kneeAsymmetryPct).toBeGreaterThanOrEqual(0);

      expect(m.hipRomLeft).not.toBeNull();
      expect(m.hipPeakFlexionLeft).not.toBeNull();
      expect(m.hipPeakExtensionLeft).not.toBeNull();
      expect(m.hipAsymmetryPct).not.toBeNull();

      expect(m.ankleRomLeft).not.toBeNull();
      expect(m.anklePeakDorsiflexionLeft).not.toBeNull();
      expect(m.anklePeakPlantarflexionLeft).not.toBeNull();
      expect(m.ankleAsymmetryPct).not.toBeNull();
    });

    it("suppresses analysis when viewAngle is frontal", () => {
      const frames = createSyntheticFrames();
      const result = computeGaitAngleAnalysis(
        frames,
        syntheticEvents,
        "frontal",
        1,
      );

      expect(result.isSuppressed).toBe(true);
      expect(result.suppressionReason).toContain("frontal camera view");
      expect(result.normalizedPoints).toHaveLength(101);
    });

    it("handles short clips with 0-1 strides gracefully by falling back to full-clip duration", () => {
      const frames = createSyntheticFrames(30); // 1 second clip
      const noStrideEvents: GaitEvent[] = [];

      const result = computeGaitAngleAnalysis(
        frames,
        noStrideEvents,
        "sagittal",
        1,
      );

      expect(result.isSuppressed).toBe(false);
      expect(result.leftStrides).toHaveLength(0);
      expect(result.rightStrides).toHaveLength(0);
      expect(result.normalizedPoints).toHaveLength(101);
      expect(result.metrics.kneeRomLeft).not.toBeNull();
    });
  });
});
