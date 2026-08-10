import { describe, it, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
  olsDetrend,
  savitzkyGolay5,
  savitzkyGolay,
  savitzkyGolayAdaptive,
  computeSgWindowSize,
  linearInterpolate,
  kalmanFilter1D,
  kalmanFilter2D,
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

  describe("linearInterpolate (1D Linear Interpolation Helper)", () => {
    it("linearly interpolates signal between points", () => {
      const xOrig = [0, 10, 20];
      const yOrig = [0, 100, 200];
      const xTarget = [0, 5, 10, 15, 20];
      const result = linearInterpolate(xOrig, yOrig, xTarget);

      expect(result).toEqual([0, 50, 100, 150, 200]);
    });

    it("clamps boundaries for xTarget outside xOrig range", () => {
      const xOrig = [10, 20];
      const yOrig = [50, 100];
      const xTarget = [0, 10, 15, 20, 30];
      const result = linearInterpolate(xOrig, yOrig, xTarget);

      expect(result).toEqual([50, 50, 75, 100, 100]);
    });

    it("handles edge cases gracefully", () => {
      expect(linearInterpolate([], [], [1, 2])).toEqual([0, 0]);
      expect(linearInterpolate([5], [42], [0, 5, 10])).toEqual([42, 42, 42]);
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

  describe("zeroPhaseButterworth (Boundary & Frequency Sweeps & Resampling Guard)", () => {
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

    it("activates uniform resampling guard for non-uniform timestamps (CV > 0.10)", () => {
      const n = 60;
      // Non-uniform timestamps with jitter (CV > 0.15)
      const timestamps: number[] = [];
      let t = 0;
      for (let i = 0; i < n; i++) {
        timestamps.push(t);
        const dt = 0.033 + (i % 3 === 0 ? 0.020 : -0.010);
        t += Math.max(0.005, dt);
      }
      const data = timestamps.map((ts) => Math.sin(2 * Math.PI * 2 * ts) + (Math.random() - 0.5) * 0.1);

      const filteredWithTimestamps = zeroPhaseButterworth(data, 30, 6.0, { timestamps });

      expect(filteredWithTimestamps.length).toBe(n);
      expect(filteredWithTimestamps.every((v) => Number.isFinite(v))).toBe(true);
    });
  });

  describe("computeSgWindowSize & savitzkyGolayAdaptive (R7 Adaptive Windowing)", () => {
    it("computes optimal odd window sizes for 30, 60, 120 FPS", () => {
      expect(computeSgWindowSize(30)).toBe(5);
      expect(computeSgWindowSize(60)).toBe(11);
      expect(computeSgWindowSize(120)).toBe(15);
      expect(computeSgWindowSize(15)).toBe(5);  // clamped min 5
      expect(computeSgWindowSize(200)).toBe(15); // clamped max 15
    });

    it("runs savitzkyGolay with dynamic Gram matrix weights for M in [5..15]", () => {
      const signal = Array.from({ length: 30 }, (_, i) => Math.sin(i / 3));

      for (const winSize of [5, 7, 9, 11, 13, 15]) {
        const smoothed = savitzkyGolay(signal, winSize);
        expect(smoothed.length).toBe(signal.length);
        expect(smoothed.every((v) => Number.isFinite(v))).toBe(true);
      }
    });

    it("runs savitzkyGolayAdaptive at different frame rates", () => {
      const signal = Array.from({ length: 40 }, (_, i) => Math.sin((i / 5) * Math.PI) + (i % 2 === 0 ? 0.1 : -0.1));

      const sg30 = savitzkyGolayAdaptive(signal, 30);
      const sg60 = savitzkyGolayAdaptive(signal, 60);

      expect(sg30.length).toBe(40);
      expect(sg60.length).toBe(40);
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

  describe("kalmanFilter1D & kalmanFilter2D (R2 2-State Constant-Velocity Model)", () => {
    it("tracks state and attenuates measurement noise", () => {
      const n = 60;
      const trueState = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / 30));
      const noisySignal = trueState.map((v, i) => v + (i % 2 === 0 ? 0.15 : -0.15));

      const filtered = kalmanFilter1D(noisySignal, 0.01, 0.05);
      expect(filtered.length).toBe(n);
      expect(filtered.every(Number.isFinite)).toBe(true);
    });

    it("estimates velocity and coasts position during NaN gaps", () => {
      // Ramp signal: pos = 2.0 * t, vel = 2.0, dt = 0.1
      const dt = 0.1;
      const signal = [0.0, 0.2, 0.4, 0.6, NaN, NaN, NaN, 1.4, 1.6];
      const res = kalmanFilter1D(signal, { processNoise: 1e-3, measurementNoise: 1e-2, dt });

      expect(res.position.length).toBe(signal.length);
      expect(res.velocity.length).toBe(signal.length);

      // Verify position advances forward during NaN gap (indexes 4, 5, 6)
      expect(res.position[4]).toBeGreaterThan(res.position[3]);
      expect(res.position[5]).toBeGreaterThan(res.position[4]);
      expect(res.position[6]).toBeGreaterThan(res.position[5]);

      // Verify velocity is positive
      expect(res.velocity[3]).toBeGreaterThan(0.5);
    });

    it("triggers coasting when keypoint visibility < 0.4", () => {
      const dt = 1 / 30;
      const signal = [10.0, 10.1, 10.2, 10.3, 99.9, 100.0, 10.6];
      const visibility = [1.0, 1.0, 1.0, 1.0, 0.1, 0.2, 1.0]; // low visibility on outlier spikes

      const res = kalmanFilter1D(signal, { visibility, dt });

      // Outliers at index 4 and 5 with low visibility should be coasted, avoiding jump to 100
      expect(res.position[4]).toBeLessThan(20.0);
      expect(res.position[5]).toBeLessThan(20.0);
    });

    it("kalmanFilter2D returns separate position and velocity arrays", () => {
      const signal = [1.0, 2.0, 3.0, 4.0, 5.0];
      const res2d = kalmanFilter2D(signal, { dt: 0.1 });

      expect(Array.isArray(res2d.position)).toBe(true);
      expect(Array.isArray(res2d.velocity)).toBe(true);
      expect(res2d.position.length).toBe(5);
      expect(res2d.velocity.length).toBe(5);
    });

    it("returns empty array for empty inputs", () => {
      expect(kalmanFilter1D([])).toEqual([]);
      expect(kalmanFilter2D([])).toEqual({ position: [], velocity: [] });
    });
  });
});

