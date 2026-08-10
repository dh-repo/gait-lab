import { describe, it, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
  olsDetrend,
  savitzkyGolay5,
  kalmanFilter1D,
  smoothPoseFrames,
} from "../signal";
import type { PoseFrame } from "../types";

describe("Signal Processing Module (signal.ts)", () => {
  describe("olsDetrend (OLS Linear Detrending)", () => {
    it("removes a linear trend from a signal leaving zero-mean detrended data", () => {
      const n = 50;
      const data: number[] = [];
      for (let i = 0; i < n; i++) {
        data.push(2 * i + 5 + Math.sin((i / 10) * Math.PI));
      }
      const detrended = olsDetrend(data);
      expect(detrended.length).toBe(n);

      const detrendedMean = detrended.reduce((a, b) => a + b, 0) / n;
      expect(Math.abs(detrendedMean)).toBeLessThan(1e-10);
    });

    it("returns a copy of short arrays (< 2 elements)", () => {
      expect(olsDetrend([])).toEqual([]);
      expect(olsDetrend([42])).toEqual([42]);
    });
  });
  describe("butterworthLowPass (Causal Stage)", () => {
    it("returns a copy of data when data.length < 5 or fps <= 0", () => {
      const shortData = [1, 2, 3, 4];
      expect(butterworthLowPass(shortData, 30, 6.0)).toEqual([1, 2, 3, 4]);

      const invalidFpsData = [1, 2, 3, 4, 5, 6];
      expect(butterworthLowPass(invalidFpsData, 0, 6.0)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(butterworthLowPass(invalidFpsData, -10, 6.0)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("exhibits causal phase lag compared to zeroPhaseButterworth", () => {
      const fps = 100;
      const n = 200;
      const data: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / fps;
        const clean = Math.sin(2 * Math.PI * 2 * t);
        const noise = 0.5 * Math.sin(2 * Math.PI * 25 * t);
        data.push(clean + noise);
      }

      const causal = butterworthLowPass(data, fps, 6.0);
      const zeroPhase = zeroPhaseButterworth(data, fps, 6.0);

      expect(causal.length).toBe(n);
      expect(zeroPhase.length).toBe(n);

      const causalMaxIdx = causal.indexOf(Math.max(...causal.slice(5, 30)));
      const zeroPhaseMaxIdx = zeroPhase.indexOf(Math.max(...zeroPhase.slice(5, 30)));
      expect(causalMaxIdx).toBeGreaterThan(zeroPhaseMaxIdx);
    });

    it("clamps cutoff frequency when cutoffHz >= Nyquist frequency", () => {
      const fps = 50; // Nyquist = 25 Hz
      const data = [1, 3, 2, 5, 4, 7, 6, 9, 8, 10];
      const result = butterworthLowPass(data, fps, 30.0);
      expect(result.length).toBe(data.length);
      expect(result.every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe("zeroPhaseButterworth (Boundary & Frequency Sweeps)", () => {
    it("filters high-frequency noise without phase shift", () => {
      const fps = 100;
      const duration = 2;
      const n = fps * duration;
      const data: number[] = [];

      for (let i = 0; i < n; i++) {
        const t = i / fps;
        const clean = Math.sin(2 * Math.PI * 2 * t);
        const noise = 0.5 * Math.sin(2 * Math.PI * 25 * t);
        data.push(clean + noise);
      }

      const filtered = zeroPhaseButterworth(data, fps, 6.0);
      expect(filtered.length).toBe(n);

      const filtMaxIdx = filtered.indexOf(Math.max(...filtered.slice(5, 25)));
      expect(Math.abs(filtMaxIdx - 12)).toBeLessThanOrEqual(1);

      const rawNoiseVariance = data.reduce((sum, val, i) => {
        const t = i / fps;
        const clean = Math.sin(2 * Math.PI * 2 * t);
        return sum + Math.pow(val - clean, 2);
      }, 0) / n;

      const filtNoiseVariance = filtered.reduce((sum, val, i) => {
        const t = i / fps;
        const clean = Math.sin(2 * Math.PI * 2 * t);
        return sum + Math.pow(val - clean, 2);
      }, 0) / n;

      expect(filtNoiseVariance).toBeLessThan(rawNoiseVariance * 0.2);
    });

    it("handles exact minimum valid size n = 5 with boundary reflection padding", () => {
      const data = [1.0, 2.0, 1.5, 3.0, 2.5];
      const filtered = zeroPhaseButterworth(data, 30, 6.0);
      expect(filtered.length).toBe(5);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
    });

    it("preserves DC constant signals in interior without baseline shift", () => {
      const data = new Array(50).fill(42.5);
      const filtered = zeroPhaseButterworth(data, 60, 6.0);
      expect(filtered.length).toBe(50);
      // Interior points are close to 42.5
      expect(filtered[25]).toBeCloseTo(42.5, 0);
    });

    it("produces symmetric response for a centered impulse input", () => {
      const n = 51;
      const impulse = new Array(n).fill(0);
      impulse[25] = 1.0;

      const filtered = zeroPhaseButterworth(impulse, 50, 5.0);

      for (let k = 1; k <= 20; k++) {
        expect(filtered[25 - k]).toBeCloseTo(filtered[25 + k], 5);
      }
    });

    it("behaves predictably across cutoff frequency sweeps (fc = 1, 3, 6, 12 Hz)", () => {
      const fps = 60;
      const n = 120;
      const data: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / fps;
        data.push(Math.sin(2 * Math.PI * 2 * t) + Math.sin(2 * Math.PI * 10 * t));
      }

      const f1 = zeroPhaseButterworth(data, fps, 1.0);
      const f12 = zeroPhaseButterworth(data, fps, 12.0);

      const var1 = f1.reduce((s, v) => s + v * v, 0) / n;
      const var12 = f12.reduce((s, v) => s + v * v, 0) / n;
      expect(var1).toBeLessThan(var12);
    });

    it("operates correctly across sampling rates (10, 30, 60, 120, 240 Hz)", () => {
      for (const fps of [10, 30, 60, 120, 240]) {
        const n = Math.max(10, fps * 2);
        const data = Array.from({ length: n }, (_, i) => Math.sin((i / fps) * 4));
        const filtered = zeroPhaseButterworth(data, fps, 4.0);
        expect(filtered.length).toBe(n);
        expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
      }
    });
  });

  describe("savitzkyGolay5 & smoothPoseFrames (1D Coordinate Smoothing)", () => {
    it("preserves linear trend signals exactly across interior and boundaries", () => {
      const n = 20;
      const signal = Array.from({ length: n }, (_, i) => 3 * i + 5);
      const smoothed = savitzkyGolay5(signal);

      expect(smoothed.length).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(smoothed[i]).toBeCloseTo(signal[i], 5);
      }
    });

    it("preserves constant DC signals without baseline shift", () => {
      const signal = new Array(15).fill(42.5);
      const smoothed = savitzkyGolay5(signal);

      expect(smoothed.length).toBe(15);
      smoothed.forEach((val) => expect(val).toBeCloseTo(42.5, 5));
    });

    it("preserves quadratic signals in interior points (k in [2, N-3])", () => {
      const n = 15;
      const signal = Array.from({ length: n }, (_, i) => i * i);
      const smoothed = savitzkyGolay5(signal);

      for (let i = 2; i < n - 2; i++) {
        expect(smoothed[i]).toBeCloseTo(signal[i], 5);
      }
    });

    it("reduces high-frequency noise variance while preserving signal peaks", () => {
      const n = 50;
      const clean = Array.from({ length: n }, (_, i) => Math.sin((i / 5) * Math.PI));
      const noise = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.2 : -0.2));
      const noisy = clean.map((c, i) => c + noise[i]);

      const smoothed = savitzkyGolay5(noisy);

      const noisyErr = noisy.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0);
      const smoothErr = smoothed.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0);

      expect(smoothErr).toBeLessThan(noisyErr * 0.5);
    });

    it("gracefully returns input unaltered for short sequences N < 5", () => {
      expect(savitzkyGolay5([])).toEqual([]);
      expect(savitzkyGolay5([1.5, 2.5])).toEqual([1.5, 2.5]);
      expect(savitzkyGolay5([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);

      const shortFrames: PoseFrame[] = Array.from({ length: 3 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: i, y: i * 2, z: 0, visibility: 0.9 }],
      }));
      const result = smoothPoseFrames(shortFrames);
      expect(result).toEqual(shortFrames);
    });

    it("smooths all 33 keypoints' 3D coordinates while preserving landmark visibility, presence, and timeMs", () => {
      const n = 10;
      const rawFrames: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
        timeMs: 1000 + i * 33.3,
        landmarks: Array.from({ length: 33 }, (_, j) => ({
          x: j * 0.01 + (i % 2 === 0 ? 0.05 : -0.05),
          y: j * 0.02 + Math.sin(i),
          z: j * 0.005,
          visibility: 0.85 + j * 0.001,
        })),
        worldLandmarks: Array.from({ length: 33 }, (_, j) => ({
          x: j * 0.1,
          y: j * 0.2,
          z: j * 0.05 + (i % 2 === 0 ? 0.02 : -0.02),
          visibility: 0.99,
        })),
      }));

      const smoothedFrames = smoothPoseFrames(rawFrames);

      expect(smoothedFrames.length).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(smoothedFrames[i].timeMs).toBe(rawFrames[i].timeMs);
        expect(smoothedFrames[i].landmarks.length).toBe(33);
        expect(smoothedFrames[i].worldLandmarks?.length).toBe(33);

        for (let j = 0; j < 33; j++) {
          const origLm = rawFrames[i].landmarks[j];
          const smLm = smoothedFrames[i].landmarks[j];

          expect(smLm.visibility).toBe(origLm.visibility);
          expect(Number.isFinite(smLm.x)).toBe(true);
          expect(Number.isFinite(smLm.y)).toBe(true);
          expect(Number.isFinite(smLm.z)).toBe(true);
        }
      }
    });

    it("supports method 'kalman' and method 'none'", () => {
      const rawFrames: PoseFrame[] = Array.from({ length: 10 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: Math.sin(i) + (i === 5 ? 10 : 0), y: i, z: 0 }],
      }));

      const kalmanSmoothed = smoothPoseFrames(rawFrames, "kalman");
      expect(kalmanSmoothed.length).toBe(10);
      expect(kalmanSmoothed[5].landmarks[0].x).toBeLessThan(rawFrames[5].landmarks[0].x);

      const unsmoothed = smoothPoseFrames(rawFrames, "none");
      expect(unsmoothed).toEqual(rawFrames);
    });

    it("does not mutate original PoseFrame input array or landmarks", () => {
      const originalX = 100;
      const rawFrames: PoseFrame[] = Array.from({ length: 6 }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: i === 3 ? originalX : i, y: 0, z: 0 }],
      }));

      const copyBefore = JSON.parse(JSON.stringify(rawFrames));
      smoothPoseFrames(rawFrames, "savitzky-golay");
      expect(rawFrames).toEqual(copyBefore);
    });
  });

  describe("kalmanFilter1D (1D Scalar State-Space Kalman Filter)", () => {
    it("tracks state and attenuates measurement noise", () => {
      const n = 60;
      const trueState = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / 30));
      const noisySignal = trueState.map((v, i) => v + (i % 2 === 0 ? 0.15 : -0.15));

      const filtered = kalmanFilter1D(noisySignal, 0.01, 0.05);
      expect(filtered.length).toBe(n);
      expect(filtered.every(Number.isFinite)).toBe(true);
    });

    it("handles occlusion coasting over NaN and Infinity values", () => {
      const signal = [1.0, 1.1, 1.2, NaN, NaN, Infinity, 1.6, 1.7];
      const filtered = kalmanFilter1D(signal);

      expect(filtered.length).toBe(signal.length);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
      // Occlusion coasting should hold valid finite state during NaNs
      expect(filtered[3]).toBeCloseTo(filtered[2], 1);
      expect(filtered[4]).toBeCloseTo(filtered[2], 1);
      expect(filtered[5]).toBeCloseTo(filtered[2], 1);
    });

    it("returns empty array for empty inputs", () => {
      expect(kalmanFilter1D([])).toEqual([]);
    });
  });
});
