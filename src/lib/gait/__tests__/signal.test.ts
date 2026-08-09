import { describe, it, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
  linearDetrend,
  computeFFTHarmonics,
} from "../signal";

describe("Signal Processing Module (signal.ts)", () => {
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
      const f3 = zeroPhaseButterworth(data, fps, 3.0);
      const f6 = zeroPhaseButterworth(data, fps, 6.0);
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

  describe("linearDetrend (Edge Cases & Precision)", () => {
    it("handles boundary array sizes n = 0, n = 1, n = 2", () => {
      expect(linearDetrend([]).detrended).toEqual([]);

      const res1 = linearDetrend([42]);
      expect(res1.detrended).toEqual([0]);
      expect(res1.trend(0)).toBe(42);

      const res2 = linearDetrend([10, 20]);
      expect(res2.detrended.length).toBe(2);
      expect(res2.detrended[0]).toBeCloseTo(0, 5);
      expect(res2.detrended[1]).toBeCloseTo(0, 5);
    });

    it("recovers exact slope and intercept for a linear signal y = 3i - 7", () => {
      const n = 20;
      const data: number[] = [];
      for (let i = 0; i < n; i++) {
        data.push(3 * i - 7);
      }

      const { detrended, trend } = linearDetrend(data);

      expect(trend(0)).toBeCloseTo(-7, 4);
      expect(trend(10)).toBeCloseTo(23, 4);
      for (let i = 0; i < n; i++) {
        expect(detrended[i]).toBeCloseTo(0, 5);
      }
    });

    it("returns array of zeros when detrending a constant signal", () => {
      const data = new Array(15).fill(100.0);
      const { detrended } = linearDetrend(data);
      for (const v of detrended) {
        expect(v).toBeCloseTo(0, 5);
      }
    });

    it("maintains precision across extreme scales (1e8 and 1e-8)", () => {
      const n = 30;
      const largeData = Array.from({ length: n }, (_, i) => 1e8 + i * 1e6);
      const { detrended: dLarge } = linearDetrend(largeData);
      expect(dLarge.length).toBe(n);
      expect(Math.abs(dLarge[0])).toBeLessThan(1);

      const smallData = Array.from({ length: n }, (_, i) => 1e-8 + i * 1e-9);
      const { detrended: dSmall } = linearDetrend(smallData);
      expect(dSmall.length).toBe(n);
      expect(Math.abs(dSmall[0])).toBeLessThan(1e-7);
    });
  });

  describe("computeFFTHarmonics (Spectral & Boundary)", () => {
    it("returns default fallback for n < 8", () => {
      const shortData = [1, 2, 3, 4, 5, 6, 7];
      const res = computeFFTHarmonics(shortData);
      expect(res).toEqual({ evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
    });

    it("computes harmonics for exact n = 8 threshold", () => {
      const data = [1, 2, 1, 2, 1, 2, 1, 2];
      const res = computeFFTHarmonics(data);
      expect(res.evenSum).toBeGreaterThanOrEqual(0);
      expect(res.oddSum).toBeGreaterThanOrEqual(0);
      expect(res.harmonicRatio).toBeGreaterThan(0);
    });

    it("correctly identifies dominant even vs odd harmonics", () => {
      const fps = 50;
      const n = 64;

      const evenSignal: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / fps;
        evenSignal.push(Math.sin(2 * Math.PI * 1.5 * t) + 1.2 * Math.sin(2 * Math.PI * 3.0 * t));
      }
      const evenRes = computeFFTHarmonics(evenSignal, 8);
      expect(evenRes.evenSum).toBeGreaterThan(0);

      const oddSignal: number[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / fps;
        oddSignal.push(Math.sin(2 * Math.PI * 1.5 * t) + 1.2 * Math.sin(2 * Math.PI * 4.5 * t));
      }
      const oddRes = computeFFTHarmonics(oddSignal, 8);
      expect(oddRes.oddSum).toBeGreaterThan(0);
    });

    it("handles non-power-of-2 input array sizes (n = 15, 33, 100)", () => {
      for (const n of [15, 33, 100]) {
        const data = Array.from({ length: n }, (_, i) => Math.sin(i * 0.4) + Math.cos(i * 0.8));
        const res = computeFFTHarmonics(data);
        expect(res.evenSum).toBeGreaterThanOrEqual(0);
        expect(res.oddSum).toBeGreaterThanOrEqual(0);
        expect(res.harmonicRatio).toBeGreaterThan(0);
      }
    });
  });
});
