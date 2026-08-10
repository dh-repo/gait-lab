import { describe, test, expect } from "vitest";
import {
  zeroPhaseButterworth,
  savitzkyGolay5,
  kalmanFilter1D,
  olsDetrend,
} from "../signal";
import {
  detectGaitEventsZeni,
  detectFusedGaitEvents,
  findExtrema,
} from "../events";
import {
  filterSteadyStateStrides,
  matchPeople,
  mergeFragmentedTracks,
  biometricDistance,
  isLikelyHumanTrack,
  type PersonTrack,
} from "../analysis";
import type { PoseFrame, Landmark } from "../types";

describe("Milestone 2 Challenger Empirical Stress Suite", () => {
  describe("1. Signal Processing Edge Cases & Filtering Bounds (signal.ts)", () => {
    test("Butterworth low-pass caps cutoff frequency safely below Nyquist limit when fps is low", () => {
      const data = [1, 5, 2, 8, 3, 9, 4, 7, 2, 6];
      const res = zeroPhaseButterworth(data, 10, 6.0);
      expect(res.length).toBe(10);
      expect(res.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Butterworth zeroPhase handles constant DC signal with zero distortion", () => {
      const dcVal = 75.3;
      const data = new Array(60).fill(dcVal);
      const res = zeroPhaseButterworth(data, 30, 6.0);
      expect(res.length).toBe(60);
      for (let i = 5; i < 55; i++) {
        expect(res[i]).toBeCloseTo(dcVal, 1);
      }
    });

    test("Savitzky-Golay 5-point filter preserves exact linear trends", () => {
      const linear = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
      const res = savitzkyGolay5(linear);
      expect(res.length).toBe(10);
      for (let i = 0; i < 10; i++) {
        expect(res[i]).toBeCloseTo(linear[i], 5);
      }
    });

    test("1D Kalman Filter coasting mode holds prior state during NaN occlusions without state explosion", () => {
      // With constant input 1.2, state converges to 1.2
      const signalWithNan = [1.2, 1.2, 1.2, NaN, NaN, NaN, 1.2, 1.2];
      const filtered = kalmanFilter1D(signalWithNan, 1e-4, 1e-2);
      expect(filtered.length).toBe(8);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
      expect(filtered[3]).toBeCloseTo(1.2, 1);
      expect(filtered[4]).toBeCloseTo(1.2, 1);
      expect(filtered[5]).toBeCloseTo(1.2, 1);
    });

    test("OLS Detrend handles constant and zero-length / single-element arrays safely", () => {
      expect(olsDetrend([])).toEqual([]);
      expect(olsDetrend([5.0])).toEqual([5.0]);

      const constantSignal = [10, 10, 10, 10, 10];
      const detrended = olsDetrend(constantSignal);
      expect(detrended.every((v) => Math.abs(v) < 1e-9)).toBe(true);
    });
  });

  describe("2. Zeni Event Detection & Frontal-Y Fallback Thresholds (events.ts)", () => {
    test("Peak prominence threshold Math.max(0.0005, 0.12 * sigRange) detects subtle low-amplitude strikes", () => {
      const n = 90;
      const sig = new Array(n).fill(0).map((_, i) => {
        const base = 0.5 + 0.02 * Math.sin((2 * Math.PI * i) / 30);
        const microPeak = i % 15 === 0 ? 0.008 : 0;
        return base + microPeak;
      });

      const maxExtrema = findExtrema(sig, "max", 5);
      expect(maxExtrema.length).toBeGreaterThan(0);
    });

    test("Frontal-Y fallback triggers when apRange < 0.028 && apEventCount < 5", () => {
      const frames: PoseFrame[] = new Array(60).fill(0).map((_, i) => {
        const tMs = i * 33.3;
        const ankleYLeft = 0.85 + 0.03 * Math.sin((2 * Math.PI * i) / 20);
        const ankleYRight = 0.85 - 0.03 * Math.sin((2 * Math.PI * i) / 20);
        return {
          timeMs: tMs,
          landmarks: [
            ...new Array(23).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }),
            { x: 0.48, y: 0.5, z: 0, visibility: 0.9 }, // L_HIP 23
            { x: 0.52, y: 0.5, z: 0, visibility: 0.9 }, // R_HIP 24
            { x: 0.48, y: 0.7, z: 0, visibility: 0.9 }, // L_KNEE 25
            { x: 0.52, y: 0.7, z: 0, visibility: 0.9 }, // R_KNEE 26
            { x: 0.48, y: ankleYLeft, z: 0, visibility: 0.9 }, // L_ANKLE 27
            { x: 0.52, y: ankleYRight, z: 0, visibility: 0.9 }, // R_ANKLE 28
            { x: 0.48, y: ankleYLeft + 0.02, z: 0, visibility: 0.9 }, // L_HEEL 29
            { x: 0.52, y: ankleYRight + 0.02, z: 0, visibility: 0.9 }, // R_HEEL 30
            { x: 0.48, y: ankleYLeft + 0.02, z: 0, visibility: 0.9 }, // L_FOOT 31
            { x: 0.52, y: ankleYRight + 0.02, z: 0, visibility: 0.9 }, // R_FOOT 32
          ],
        };
      });

      const breakdown = detectGaitEventsZeni(frames, 30);
      expect(breakdown.stepEvents).toBeDefined();
      expect(breakdown.stepEvents.length).toBeGreaterThan(0);
      expect(isNaN(breakdown.leftStancePct)).toBe(false);
      expect(isNaN(breakdown.rightStancePct)).toBe(false);
    });

    test("ZUPT velocity gate produces 0 false heel strikes for completely stationary subject", () => {
      const stationaryFrames: PoseFrame[] = new Array(30).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill({ x: 0.5, y: 0.85, z: 0, visibility: 0.9 }),
      }));

      const events = detectFusedGaitEvents(stationaryFrames, 30, { zuptVelocityThreshold: 0.005 });
      expect(events).toEqual([]);
    });
  });

  describe("3. PoseTracker & Biometric Target Lock Stability (PoseTracker.ts & analysis.ts)", () => {
    test("Velocity motion projection maintains target lock when secondary candidate passes closely", () => {
      const nextId = { value: 1 };

      const targetFrame1: Landmark[] = new Array(33).fill(0).map(() => ({
        x: 0.2, y: 0.5, z: 0, visibility: 0.9,
      }));
      targetFrame1[11] = { x: 0.15, y: 0.3, z: 0 };
      targetFrame1[12] = { x: 0.25, y: 0.3, z: 0 };
      targetFrame1[23] = { x: 0.17, y: 0.5, z: 0 };
      targetFrame1[24] = { x: 0.23, y: 0.5, z: 0 };
      targetFrame1[27] = { x: 0.17, y: 0.8, z: 0 };
      targetFrame1[28] = { x: 0.23, y: 0.8, z: 0 };

      const tracks: PersonTrack[] = [];
      matchPeople([targetFrame1], tracks, nextId, 1);
      expect(tracks.length).toBe(1);
      const targetId = tracks[0].id;

      const targetFrame2 = targetFrame1.map((lm) => ({ ...lm, x: lm.x + 0.05 }));
      matchPeople([targetFrame2], tracks, nextId, 2);

      const targetFrame3 = targetFrame1.map((lm) => ({ ...lm, x: lm.x + 0.10 }));
      const secondaryFrame3 = targetFrame1.map((lm) => ({ ...lm, x: lm.x + 0.02 }));

      const assignments = matchPeople([secondaryFrame3, targetFrame3], tracks, nextId, 3);
      expect(assignments[1]).toBe(targetId);
    });

    test("biometricDistance differentiates human vs non-human pet profiles", () => {
      const tallBiped = { aspectRatio: 0.3, torsoLegRatio: 0.4, shoulderHipRatio: 1.3 };
      const shortBiped = { aspectRatio: 0.55, torsoLegRatio: 0.8, shoulderHipRatio: 0.9 };
      const petNoise = { aspectRatio: 1.4, torsoLegRatio: 1.8, shoulderHipRatio: 0.5 };

      const distBi = biometricDistance(tallBiped, shortBiped);
      const distPet = biometricDistance(tallBiped, petNoise);

      expect(distBi).toBeLessThan(0.45);
      expect(distPet).toBeGreaterThan(0.70);
    });

    test("isLikelyHumanTrack rejects quadrupeds and pet-like detections", () => {
      const petBio = { aspectRatio: 1.5, torsoLegRatio: 1.9, shoulderHipRatio: 0.4 };
      const petBox = { w: 0.3, h: 0.2 };
      expect(isLikelyHumanTrack(petBio, petBox)).toBe(false);

      const humanBio = { aspectRatio: 0.35, torsoLegRatio: 0.6, shoulderHipRatio: 1.2 };
      const humanBox = { w: 0.2, h: 0.6 };
      expect(isLikelyHumanTrack(humanBio, humanBox)).toBe(true);
    });

    test("mergeFragmentedTracks handles scale/turn shift without fragmenting tracklets", () => {
      // Tracklet 1 (first half of walk, facing camera): aspect 0.5, torsoLeg 0.6
      const track1: PersonTrack = {
        id: 1,
        firstHip: { x: 0.2, y: 0.5, z: 0 },
        lastHip: { x: 0.4, y: 0.5, z: 0 },
        frames: 10,
        box: { x: 0.3, y: 0.2, w: 0.25, h: 0.6 },
        areaSum: 1.5,
        hipYSum: 5.0,
        firstFrameIndex: 1,
        lastFrameIndex: 10,
        frameIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        velocity: { vx: 0.02, vy: 0 },
        biometrics: { aspectRatio: 0.42, torsoLegRatio: 0.6, shoulderHipRatio: 1.2 },
      };

      // Tracklet 2 (second half after short 2-frame occlusion, turned profile): aspect 0.28, torsoLeg 0.45
      const track2: PersonTrack = {
        id: 2,
        firstHip: { x: 0.44, y: 0.5, z: 0 },
        lastHip: { x: 0.6, y: 0.5, z: 0 },
        frames: 10,
        box: { x: 0.5, y: 0.2, w: 0.15, h: 0.6 },
        areaSum: 0.9,
        hipYSum: 5.0,
        firstFrameIndex: 13,
        lastFrameIndex: 22,
        frameIndices: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
        velocity: { vx: 0.02, vy: 0 },
        biometrics: { aspectRatio: 0.28, torsoLegRatio: 0.45, shoulderHipRatio: 1.1 },
      };

      const merged = mergeFragmentedTracks([track1, track2]);
      expect(merged.length).toBe(1);
      expect(merged[0].frames).toBe(20);
    });
  });

  describe("4. Steady-State Stride Filtering & Asymmetry Retention (analysis.ts)", () => {
    test("filterSteadyStateStrides trims lead-in acceleration and lead-out deceleration strides", () => {
      const strides = [1.4, 1.1, 0.7, 0.72, 0.68, 0.71, 0.69, 1.2, 1.5];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(strides);

      expect(excludedCount).toBeGreaterThan(0);
      expect(steadyStrides.length).toBeGreaterThanOrEqual(3);
      expect(steadyStrides.every((s) => s < 0.95)).toBe(true);
    });

    test("filterSteadyStateStrides retains valid pathological gait asymmetry", () => {
      const antalgicStrides = [0.85, 0.55, 0.84, 0.56, 0.86, 0.54, 0.85, 0.55];
      const { steadyStrides } = filterSteadyStateStrides(antalgicStrides);

      expect(steadyStrides.length).toBeGreaterThanOrEqual(6);
    });

    test("filterSteadyStateStrides handles minimal stride arrays (< 3 strides) without error", () => {
      expect(filterSteadyStateStrides([])).toEqual({ steadyStrides: [], excludedCount: 0 });
      expect(filterSteadyStateStrides([0.6])).toEqual({ steadyStrides: [0.6], excludedCount: 0 });
      expect(filterSteadyStateStrides([0.6, 0.7])).toEqual({ steadyStrides: [0.6, 0.7], excludedCount: 0 });
    });
  });
});
