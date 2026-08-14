// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  reconstructPoseAtPhase,
  calculateDempsterCoM,
  landmarkToThreeVector,
  buildBilateralTrajectories,
  buildFullCycleTrajectories,
  type TrajectoryJoint,
} from "../poseReconstruction";
import type { Landmark, PoseFrame } from "../types";
import type { GaitAngleAnalysis } from "../angles";

describe("poseReconstruction Utility", () => {
  it("calculates Dempster (1955) weighted Center of Mass correctly", () => {
    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: 0.95,
    }));

    const com = calculateDempsterCoM(landmarks);
    expect(com.x).toBeCloseTo(0.5, 4);
    expect(com.y).toBeCloseTo(0.5, 4);
    expect(com.z).toBeCloseTo(0.0, 4);
  });

  it("handles occluded landmarks in Dempster CoM calculation", () => {
    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
      x: 0.8,
      y: 0.8,
      z: 0.2,
      visibility: 0.1, // Occluded
    }));

    const com = calculateDempsterCoM(landmarks);
    // Falls back to center defaults
    expect(com.x).toBeCloseTo(0.5, 2);
    expect(com.y).toBeCloseTo(0.5, 2);
    expect(com.z).toBeCloseTo(0.0, 2);
  });

  it("converts Landmark to Three.js coordinates", () => {
    const lm: Landmark = { x: 0.5, y: 1.0, z: 0.0, visibility: 1.0 };
    const vec = landmarkToThreeVector(lm, 1.25);
    expect(vec.x).toBeCloseTo(1.25, 4);
    expect(vec.y).toBeCloseTo(0.0, 4);
    expect(vec.z).toBeCloseTo(0.0, 4);
  });

  it("synthesizes 33 3D landmarks for null/undefined session using normative baseline", () => {
    const lms0 = reconstructPoseAtPhase(null, 0);
    expect(lms0).toHaveLength(33);
    for (let i = 0; i < 33; i++) {
      expect(lms0[i]).toBeDefined();
      expect(Number.isFinite(lms0[i].x)).toBe(true);
      expect(Number.isFinite(lms0[i].y)).toBe(true);
      expect(Number.isFinite(lms0[i].z)).toBe(true);
    }

    const lms50 = reconstructPoseAtPhase(undefined, 50);
    expect(lms50).toHaveLength(33);
    expect(lms50[25].y).not.toBe(lms0[25].y); // Knee position changes across gait cycle
  });

  it("reconstructs pose from GaitAngleAnalysis normalizedPoints", () => {
    const mockAnalysis: GaitAngleAnalysis = {
      isSuppressed: false,
      normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
        gaitCyclePct: i,
        kneeAngleLeft: 10 + 40 * Math.sin((i / 100) * Math.PI),
        kneeAngleRight: 10 + 40 * Math.sin(((i + 50) % 100 / 100) * Math.PI),
        hipAngleLeft: 20 * Math.cos((i / 100) * 2 * Math.PI),
        hipAngleRight: -20 * Math.cos((i / 100) * 2 * Math.PI),
        ankleAngleLeft: 5 * Math.sin((i / 100) * 2 * Math.PI),
        ankleAngleRight: -5 * Math.sin((i / 100) * 2 * Math.PI),
      })),
      leftStrides: [],
      rightStrides: [],
      metrics: {
        kneeRomLeft: 40,
        kneeRomRight: 40,
        kneePeakFlexionLeft: 50,
        kneePeakFlexionRight: 50,
        kneeAsymmetryPct: 0,
        hipRomLeft: 40,
        hipRomRight: 40,
        hipPeakFlexionLeft: 20,
        hipPeakExtensionLeft: -20,
        hipPeakFlexionRight: 20,
        hipPeakExtensionRight: -20,
        hipAsymmetryPct: 0,
        ankleRomLeft: 10,
        ankleRomRight: 10,
        anklePeakDorsiflexionLeft: 5,
        anklePeakDorsiflexionRight: 5,
        anklePeakPlantarflexionLeft: -5,
        anklePeakPlantarflexionRight: -5,
        ankleAsymmetryPct: 0,
      },
      normativeData: [],
    };

    const lmsAt20 = reconstructPoseAtPhase({ angleAnalysis: mockAnalysis }, 20);
    expect(lmsAt20).toHaveLength(33);
    expect(lmsAt20[27].x).toBeDefined(); // Left ankle
    expect(lmsAt20[28].x).toBeDefined(); // Right ankle
  });

  it("interpolates pose from raw PoseFrame array when provided", () => {
    const frameA: PoseFrame = {
      timeMs: 0,
      landmarks: Array.from({ length: 33 }, (_, i) => ({
        x: 0.4 + i * 0.01,
        y: 0.3 + i * 0.01,
        z: 0.1,
        visibility: 0.9,
      })),
    };
    const frameB: PoseFrame = {
      timeMs: 1000,
      landmarks: Array.from({ length: 33 }, (_, i) => ({
        x: 0.6 + i * 0.01,
        y: 0.5 + i * 0.01,
        z: 0.2,
        visibility: 0.9,
      })),
    };

    const lms = reconstructPoseAtPhase({ frames: [frameA, frameB] }, 50);
    expect(lms).toHaveLength(33);
    expect(lms[0].x).toBeCloseTo(0.5, 4); // Midpoint of 0.4 and 0.6
    expect(lms[0].y).toBeCloseTo(0.4, 4); // Midpoint of 0.3 and 0.5
    expect(lms[0].z).toBeCloseTo(0.15, 4); // Midpoint of 0.1 and 0.2
  });

  it("builds full-cycle trajectory curves for all supported joint types", () => {
    const joints: TrajectoryJoint[] = ["ankle", "knee", "wrist", "com"];

    for (const j of joints) {
      const trajectories = buildBilateralTrajectories(null, j, 11, 0);
      expect(trajectories.left).toHaveLength(11);
      expect(trajectories.right).toHaveLength(11);

      for (const pt of trajectories.left) {
        expect(pt).toBeInstanceOf(THREE.Vector3);
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }

      const singleTraj = buildFullCycleTrajectories(null, j, 11, 0);
      expect(singleTraj).toHaveLength(11);
    }

    const noneTraj = buildBilateralTrajectories(null, "none", 11);
    expect(noneTraj.left).toHaveLength(0);
    expect(noneTraj.right).toHaveLength(0);
  });
});
