import { describe, test, expect } from "vitest";
import {
  olsDetrend,
  butterworthLowPass,
  linearInterpolate,
  zeroPhaseButterworth,
  computeSgWindowSize,
  savitzkyGolay,
  savitzkyGolayAdaptive,
  savitzkyGolay5,
  kalmanFilter1D,
  kalmanFilter2D,
  smoothPoseFrames,
} from "../signal";
import type { PoseFrame } from "../types";

describe("Milestone 2 Pass 2 Challenger 2: Empirical Stress Test Suite (signal.ts)", () => {
  describe("1. Boundary & Edge Case Stress (Empty, Single, 2-Element)", () => {
    test("Empty input [] across all signal processing functions", () => {
      expect(olsDetrend([])).toEqual([]);
      expect(butterworthLowPass([], 30)).toEqual([]);
      expect(linearInterpolate([], [], [])).toEqual([]);
      expect(zeroPhaseButterworth([], 30)).toEqual([]);
      expect(savitzkyGolay([])).toEqual([]);
      expect(savitzkyGolayAdaptive([])).toEqual([]);
      expect(savitzkyGolay5([])).toEqual([]);

      const k1d = kalmanFilter1D([]);
      expect(k1d).toEqual([]);
      expect(k1d.position).toEqual([]);
      expect(k1d.velocity).toEqual([]);

      const k2d = kalmanFilter2D([]);
      expect(k2d.position).toEqual([]);
      expect(k2d.velocity).toEqual([]);

      expect(smoothPoseFrames([], "savitzky-golay")).toEqual([]);
      expect(smoothPoseFrames([], "kalman")).toEqual([]);
      expect(smoothPoseFrames([], "none")).toEqual([]);
    });

    test("Single element input [42] across all signal processing functions", () => {
      expect(olsDetrend([42])).toEqual([42]);
      expect(butterworthLowPass([42], 30)).toEqual([42]);
      expect(linearInterpolate([0], [42], [0, 1])).toEqual([42, 42]);
      expect(zeroPhaseButterworth([42], 30)).toEqual([42]);
      expect(savitzkyGolay([42])).toEqual([42]);
      expect(savitzkyGolayAdaptive([42], 30)).toEqual([42]);
      expect(savitzkyGolay5([42])).toEqual([42]);

      const k1d = kalmanFilter1D([42]);
      expect(k1d).toEqual([42]);
      expect(k1d.position).toEqual([42]);
      expect(k1d.velocity).toEqual([0]);

      const k2d = kalmanFilter2D([42]);
      expect(k2d.position).toEqual([42]);
      expect(k2d.velocity).toEqual([0]);

      const dummyFrame: PoseFrame = {
        timeMs: 0,
        landmarks: [{ x: 42, y: 42, z: 42, visibility: 0.9 }],
      };
      expect(smoothPoseFrames([dummyFrame], "savitzky-golay")).toEqual([dummyFrame]);
      expect(smoothPoseFrames([dummyFrame], "kalman")).toEqual([dummyFrame]);
    });

    test("2-element signal [1, 2] across all signal processing functions", () => {
      const detrended = olsDetrend([1, 2]);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);
      expect(detrended).toEqual([0, 0]); // linear trend of [1, 2] is slope 1, mean 1.5, residuals 0

      expect(butterworthLowPass([1, 2], 30)).toEqual([1, 2]);
      expect(linearInterpolate([0, 1], [1, 2], [0, 0.5, 1])).toEqual([1, 1.5, 2]);
      expect(zeroPhaseButterworth([1, 2], 30)).toEqual([1, 2]);
      expect(savitzkyGolay([1, 2])).toEqual([1, 2]);
      expect(savitzkyGolayAdaptive([1, 2], 30)).toEqual([1, 2]);
      expect(savitzkyGolay5([1, 2])).toEqual([1, 2]);

      const k1d = kalmanFilter1D([1, 2], { dt: 0.1 });
      expect(k1d.length).toBe(2);
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.position[0]).toBe(1);
      expect(k1d.velocity[0]).toBe(0);

      const k2d = kalmanFilter2D([1, 2], { dt: 0.1 });
      expect(k2d.position.length).toBe(2);
      expect(k2d.velocity.length).toBe(2);
    });
  });

  describe("2. Non-Finite & Missing Value Stress (All NaNs, Leading/Trailing NaNs)", () => {
    test("Signal with all NaNs [NaN, NaN, NaN, NaN, NaN]", () => {
      const allNaNs = [NaN, NaN, NaN, NaN, NaN];

      const detrended = olsDetrend(allNaNs);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);

      const bw = butterworthLowPass(allNaNs, 30);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);

      const zbw = zeroPhaseButterworth(allNaNs, 30);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);

      const sg = savitzkyGolay(allNaNs, 5);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(allNaNs);
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.position.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.velocity.every((v) => Number.isFinite(v))).toBe(true);

      const k2d = kalmanFilter2D(allNaNs);
      expect(k2d.position.every((v) => Number.isFinite(v))).toBe(true);
      expect(k2d.velocity.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Signal with leading and trailing NaNs [NaN, NaN, 10, 20, 30, 40, 50, NaN, NaN]", () => {
      const leadingTrailingNaNs = [NaN, NaN, 10, 20, 30, 40, 50, NaN, NaN];

      const detrended = olsDetrend(leadingTrailingNaNs);
      expect(detrended.length).toBe(9);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);

      const bw = butterworthLowPass(leadingTrailingNaNs, 30);
      expect(bw.length).toBe(9);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);

      const zbw = zeroPhaseButterworth(leadingTrailingNaNs, 30);
      expect(zbw.length).toBe(9);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);

      const sg = savitzkyGolay(leadingTrailingNaNs, 5);
      expect(sg.length).toBe(9);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(leadingTrailingNaNs, { dt: 0.033 });
      expect(k1d.length).toBe(9);
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.position.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.velocity.every((v) => Number.isFinite(v))).toBe(true);
      // Index 0 and 1 are leading NaNs before first finite (idx 2) -> expected 0
      expect(k1d.position[0]).toBe(0);
      expect(k1d.position[1]).toBe(0);
      // Index 2 is first finite (10)
      expect(k1d.position[2]).toBe(10);
      // Trailing NaNs (idx 7, 8) coast smoothly via velocity prediction
      expect(k1d.position[7]).toBeGreaterThan(k1d.position[6]);
      expect(k1d.position[8]).toBeGreaterThan(k1d.position[7]);
    });

    test("Interleaved NaN gaps [10, NaN, 20, NaN, 30, NaN, 40]", () => {
      const gapped = [10, NaN, 20, NaN, 30, NaN, 40];
      const k1d = kalmanFilter1D(gapped, { dt: 0.033 });
      expect(k1d.length).toBe(7);
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
      // Ensure position advances smoothly despite missing observations
      expect(k1d.position[6]).toBeGreaterThan(30);
    });
  });

  describe("3. Extreme Numerical Scale Stress (1e6 and 1e-12)", () => {
    test("Extremely large values (1e6)", () => {
      const largeVals = [1e6, 1e6 + 10, 1e6 - 10, 1e6 + 5, 1e6 - 5, 1e6];

      const detrended = olsDetrend(largeVals);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);

      const bw = butterworthLowPass(largeVals, 30);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);

      const zbw = zeroPhaseButterworth(largeVals, 30);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);

      const sg = savitzkyGolay(largeVals, 5);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(largeVals, { dt: 0.033, processNoise: 1, measurementNoise: 10 });
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
      expect(k1d.position[0]).toBe(1e6);
    });

    test("Extremely subnormal values (1e-12)", () => {
      const subnormalVals = [1e-12, 2e-12, -1e-12, 3e-12, 0, 1e-12];

      const detrended = olsDetrend(subnormalVals);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);

      const bw = butterworthLowPass(subnormalVals, 30);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);

      const zbw = zeroPhaseButterworth(subnormalVals, 30);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);

      const sg = savitzkyGolay(subnormalVals, 5);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(subnormalVals, { dt: 0.033, processNoise: 1e-16, measurementNoise: 1e-14 });
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Mixed extreme scale range (1e-12 to 1e6)", () => {
      const mixedVals = [1e-12, 1.0, 1e6, -1e6, 0, 1e-12];

      const detrended = olsDetrend(mixedVals);
      expect(detrended.every((v) => Number.isFinite(v))).toBe(true);

      const bw = butterworthLowPass(mixedVals, 30);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);

      const zbw = zeroPhaseButterworth(mixedVals, 30);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);

      const sg = savitzkyGolay(mixedVals, 5);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(mixedVals);
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe("4. Dynamic Trajectory Stress (Sudden Sign-Flips & Parabolic Acceleration)", () => {
    test("Sudden sign-flips [100, -100, 100, -100, ...]", () => {
      const signFlips = [100, -100, 100, -100, 100, -100, 100, -100, 100, -100];

      const bw = butterworthLowPass(signFlips, 30, 6.0);
      expect(bw.every((v) => Number.isFinite(v))).toBe(true);
      // Low pass filter should attenuate rapid high frequency sign flips towards zero
      expect(Math.abs(bw[bw.length - 1])).toBeLessThan(50);

      const zbw = zeroPhaseButterworth(signFlips, 30, 6.0);
      expect(zbw.every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.abs(zbw[Math.floor(zbw.length / 2)])).toBeLessThan(50);

      const sg = savitzkyGolay(signFlips, 5);
      expect(sg.every((v) => Number.isFinite(v))).toBe(true);

      const k1d = kalmanFilter1D(signFlips, { dt: 0.033, processNoise: 1e-2, measurementNoise: 1e-1 });
      expect(k1d.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Parabolic trajectory (constant acceleration a = 9.81 m/s^2)", () => {
      const dt = 1 / 60;
      const a = 9.81;
      const n = 60; // 1 second at 60 FPS
      const trajectory = new Array<number>(n);
      const trueVel = new Array<number>(n);
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        trajectory[i] = 0.5 * a * t * t;
        trueVel[i] = a * t;
      }

      // Test Kalman filter 1D on constant acceleration
      const k1d = kalmanFilter1D(trajectory, { dt, processNoise: 1.0, measurementNoise: 1e-4 });
      expect(k1d.position.length).toBe(n);
      expect(k1d.velocity.length).toBe(n);

      // Position tracking error after initial transient (i >= 10)
      for (let i = 10; i < n; i++) {
        expect(Math.abs(k1d.position[i] - trajectory[i])).toBeLessThan(0.05);
      }

      // Test zeroPhaseButterworth on parabolic trajectory
      const zbw = zeroPhaseButterworth(trajectory, 60, 6.0);
      expect(zbw.length).toBe(n);
      for (let i = 10; i < n - 10; i++) {
        expect(Math.abs(zbw[i] - trajectory[i])).toBeLessThan(0.01);
      }

      // Test savitzkyGolayAdaptive on 60 FPS
      const sg = savitzkyGolayAdaptive(trajectory, 60);
      expect(sg.length).toBe(n);
      for (let i = 10; i < n - 10; i++) {
        expect(Math.abs(sg[i] - trajectory[i])).toBeLessThan(0.01);
      }
    });

    test("computeSgWindowSize scaling across FPS range (15 to 120)", () => {
      expect(computeSgWindowSize(15)).toBe(5);
      expect(computeSgWindowSize(30)).toBe(5);
      expect(computeSgWindowSize(60)).toBe(11);
      expect(computeSgWindowSize(90)).toBe(15); // max clamped to 15
      expect(computeSgWindowSize(120)).toBe(15);
      expect(computeSgWindowSize(0)).toBe(5);
      expect(computeSgWindowSize(-10)).toBe(5);
      expect(computeSgWindowSize(NaN)).toBe(5);
    });

    test("Uniform resampling guard in zeroPhaseButterworth with non-uniform dt", () => {
      const n = 60;
      const data = new Array<number>(n);
      const timestamps = new Array<number>(n);
      let currTime = 0;
      for (let i = 0; i < n; i++) {
        data[i] = Math.sin((2 * Math.PI * i) / 20);
        // Introduce non-uniform dt jitter
        const dt = 0.033 + (i % 2 === 0 ? 0.015 : -0.015);
        timestamps[i] = currTime;
        currTime += Math.max(0.005, dt);
      }

      const filtered = zeroPhaseButterworth(data, 30, 6.0, { timestamps });
      expect(filtered.length).toBe(n);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe("5. smoothPoseFrames End-to-End Stress Test", () => {
    test("smoothPoseFrames with NaN landmarks and visibility gating", () => {
      const frames: PoseFrame[] = new Array(10).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: [
          { x: i % 2 === 0 ? NaN : i * 0.1, y: 0.5, z: 0.1, visibility: i % 3 === 0 ? 0.1 : 0.9 },
          { x: 0.2, y: 0.3, z: 0.4, visibility: 0.9, presence: 0.95 },
        ],
        worldLandmarks: [
          { x: i * 0.05, y: 0.1, z: 0.2, visibility: 0.8 },
        ],
      }));

      const smoothedSG = smoothPoseFrames(frames, "savitzky-golay", { fps: 30 });
      expect(smoothedSG.length).toBe(10);
      expect(smoothedSG[0].landmarks.every((lm) => Number.isFinite(lm.x) && Number.isFinite(lm.y) && Number.isFinite(lm.z))).toBe(true);

      const smoothedKalman = smoothPoseFrames(frames, "kalman", { dt: 0.033, processNoise: 1e-4, measurementNoise: 1e-2 });
      expect(smoothedKalman.length).toBe(10);
      expect(smoothedKalman[0].landmarks.every((lm) => Number.isFinite(lm.x) && Number.isFinite(lm.y) && Number.isFinite(lm.z))).toBe(true);
      expect(smoothedKalman[0].worldLandmarks![0].x).toBeDefined();
      expect(Number.isFinite(smoothedKalman[0].worldLandmarks![0].x)).toBe(true);
    });
  });
});
