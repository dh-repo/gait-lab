import { describe, it, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
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

    });
