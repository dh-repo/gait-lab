import { describe, it, expect } from "vitest";
import { computeFFTHarmonics } from "../signal";
import { computeHarmonicRatio } from "../smoothness";

/**
 * Challenger Stress Test Harness for Milestone 6 (M6)
 * Empirical stress testing of `computeHarmonicRatio` and `computeFFTHarmonics`.
 *
 * Scope:
 * 1. Symmetric walking signals across frequencies (0.5 Hz - 2.0 Hz).
 * 2. Asymmetric walking signals (amplitude & timing asymmetry).
 * 3. Non-integer bin frequencies and Hann window spectral leakage.
 * 4. Boundary and extreme edge cases (short duration, noisy signals, zero inputs).
 * 5. Adversarial input stress testing (NaN, Infinity, extreme FPS, negative stride frequencies).
 */
describe("M6 Empirical Stress Harness (Challenger)", () => {
  /**
   * Helper to generate synthetic vertical hip displacement signal.
   */
  function generateHipY({
    fps = 30,
    durationSec = 6.0,
    strideFreq = 1.0,
    evenAmplitudes = [1.0, 0.35, 0.10], // A2, A4, A6
    oddAmplitudes = [0.0, 0.0],         // A1, A3 (0 for pure symmetric)
    noiseLevel = 0.01,
  }: {
    fps?: number;
    durationSec?: number;
    strideFreq?: number;
    evenAmplitudes?: number[];
    oddAmplitudes?: number[];
    noiseLevel?: number;
  }) {
    const N = Math.floor(fps * durationSec);
    const hipY: number[] = new Array(N);

    const f0 = strideFreq;
    const A1 = oddAmplitudes[0] ?? 0;
    const A2 = evenAmplitudes[0] ?? 1.0;
    const A3 = oddAmplitudes[1] ?? 0;
    const A4 = evenAmplitudes[1] ?? 0.35;
    const A6 = evenAmplitudes[2] ?? 0.10;

    for (let i = 0; i < N; i++) {
      const t = i / fps;
      const signal =
        A1 * Math.sin(2 * Math.PI * 1 * f0 * t) +
        A2 * Math.cos(2 * Math.PI * 2 * f0 * t) +
        A3 * Math.sin(2 * Math.PI * 3 * f0 * t) +
        A4 * Math.cos(2 * Math.PI * 4 * f0 * t) +
        A6 * Math.cos(2 * Math.PI * 6 * f0 * t);

      const noise = noiseLevel * Math.sin(17 * i + 0.3);
      hipY[i] = 0.5 + signal * 0.05 + noise;
    }

    return hipY;
  }

  /**
   * Helper to generate synthetic lateral hip displacement signal.
   */
  function generateHipX({
    fps = 30,
    durationSec = 6.0,
    strideFreq = 1.0,
    oddAmplitudes = [1.0, 0.30], // A1, A3
    evenAmplitudes = [0.0],       // A2 (instability)
    noiseLevel = 0.01,
  }: {
    fps?: number;
    durationSec?: number;
    strideFreq?: number;
    oddAmplitudes?: number[];
    evenAmplitudes?: number[];
    noiseLevel?: number;
  }) {
    const N = Math.floor(fps * durationSec);
    const hipX: number[] = new Array(N);

    const f0 = strideFreq;
    const A1 = oddAmplitudes[0] ?? 1.0;
    const A2 = evenAmplitudes[0] ?? 0;
    const A3 = oddAmplitudes[1] ?? 0.30;

    for (let i = 0; i < N; i++) {
      const t = i / fps;
      const signal =
        A1 * Math.sin(2 * Math.PI * 1 * f0 * t) +
        A2 * Math.cos(2 * Math.PI * 2 * f0 * t) +
        A3 * Math.sin(2 * Math.PI * 3 * f0 * t);

      const noise = noiseLevel * Math.cos(13 * i + 0.5);
      hipX[i] = 0.5 + signal * 0.05 + noise;
    }

    return hipX;
  }

  describe("1. Symmetric Walking Signals (Literature Alignment ~2.5 - 4.0 and higher for pure harmonics)", () => {
    it("confirms literature-aligned hrVertical (>= 2.5) for realistic symmetric gait at f_stride = 1.0 Hz", () => {
      const fps = 30;
      const strideFreq = 1.0;
      const meanStrideSec = 1.0 / strideFreq;

      const hipY = generateHipY({ fps, strideFreq, noiseLevel: 0.005 });
      const hipX = generateHipX({ fps, strideFreq, noiseLevel: 0.005 });

      const result = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      expect(result.hrVertical).toBeGreaterThanOrEqual(2.5);
      expect(result.hrLateral).toBeGreaterThanOrEqual(2.0);
    });

    it("confirms hrVertical > 5.0 for pure symmetric harmonics without noise", () => {
      const fps = 30;
      const strideFreq = 1.0;
      const meanStrideSec = 1.0 / strideFreq;
      const hipY = generateHipY({
        fps,
        strideFreq,
        evenAmplitudes: [1.0, 0.3],
        oddAmplitudes: [0.0, 0.0],
        noiseLevel: 0.0,
      });
      const hipX = generateHipX({ fps, strideFreq, noiseLevel: 0.0 });

      const result = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      expect(result.hrVertical).toBeGreaterThan(5.0);
    });
  });

  describe("2. Asymmetric Walking Signals & Sensitivity Analysis", () => {
    it("confirms hrVertical decreases significantly as odd harmonic asymmetry increases", () => {
      const fps = 30;
      const strideFreq = 1.0;
      const meanStrideSec = 1.0 / strideFreq;

      const hipX = generateHipX({ fps, strideFreq });

      const asymmetries = [0.0, 0.1, 0.25, 0.5, 0.8, 1.0];
      const hrs: number[] = [];

      for (const a1 of asymmetries) {
        const hipY = generateHipY({
          fps,
          strideFreq,
          evenAmplitudes: [1.0, 0.3],
          oddAmplitudes: [a1, 0.0],
          noiseLevel: 0.005,
        });

        const res = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);
        hrs.push(res.hrVertical);
      }

      for (let i = 1; i < hrs.length; i++) {
        expect(hrs[i]).toBeLessThan(hrs[i - 1]);
      }

      const symmetricHR = hrs[0];
      const asymmetricHR = hrs[hrs.length - 1];
      expect(asymmetricHR).toBeLessThan(symmetricHR * 0.1);
      expect(asymmetricHR).toBeLessThan(1.5);
    });

    it("detects step timing asymmetry simulated via piecewise warped sine wave", () => {
      const fps = 30;
      const durationSec = 6.0;
      const strideFreq = 1.0;
      const meanStrideSec = 1.0 / strideFreq;
      const N = fps * durationSec;

      const hipY: number[] = new Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / fps;
        const cycleProgress = (t % meanStrideSec) / meanStrideSec;
        let phase: number;
        if (cycleProgress < 0.6) {
          phase = (cycleProgress / 0.6) * Math.PI;
        } else {
          phase = Math.PI + ((cycleProgress - 0.6) / 0.4) * Math.PI;
        }
        hipY[i] = 0.5 + 0.05 * Math.cos(2 * phase);
      }

      const hipX = generateHipX({ fps, strideFreq });

      const resultSymmetric = computeHarmonicRatio(
        generateHipY({ fps, strideFreq, noiseLevel: 0 }),
        hipX,
        fps,
        meanStrideSec
      );
      const resultAsymmetric = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      expect(resultAsymmetric.hrVertical).toBeLessThan(resultSymmetric.hrVertical * 0.1);
    });
  });

  describe("3. Frequency Variations Sweep (f_stride = 0.5 Hz to 2.0 Hz)", () => {
    const frequencies = [0.5, 0.8, 1.0, 1.25, 1.5, 1.75, 2.0];

    frequencies.forEach((f0) => {
      it(`maintains correct HR computation at f_stride = ${f0} Hz`, () => {
        const fps = 30;
        const meanStrideSec = 1.0 / f0;
        const hipY = generateHipY({ fps, strideFreq: f0, noiseLevel: 0.005 });
        const hipX = generateHipX({ fps, strideFreq: f0, noiseLevel: 0.005 });

        const result = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

        expect(result.hrVertical).toBeGreaterThanOrEqual(2.2);
        expect(result.hrLateral).toBeGreaterThanOrEqual(1.8);
        expect(result.overallHR).toBeGreaterThanOrEqual(2.0);
      });
    });
  });

  describe("4. Non-Integer Bin Frequencies & Hann Window Leakage", () => {
    it("captures energy accurately when harmonic frequencies lie between integer FFT bins", () => {
      const fps = 30;
      const strideFreq = 1.137;

      const N = fps * 6.0;
      const hipY = new Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / fps;
        hipY[i] = Math.cos(2 * Math.PI * 2 * strideFreq * t);
      }

      const resWithStride = computeFFTHarmonics(hipY, fps, strideFreq, 10);

      expect(resWithStride.evenSum).toBeGreaterThan(0.4);
      expect(resWithStride.harmonicRatio).toBeGreaterThan(5.0);
    });
  });

  describe("5. Edge Cases & Adversarial Robustness", () => {
    it("handles fallback to peak detection when meanStrideSec is undefined or non-positive", () => {
      const fps = 30;
      const strideFreq = 1.0;
      const hipY = generateHipY({ fps, strideFreq });
      const hipX = generateHipX({ fps, strideFreq });

      const resultUndefined = computeHarmonicRatio(hipY, hipX, fps, undefined);
      expect(resultUndefined.hrVertical).toBeGreaterThan(0);

      const resultZero = computeHarmonicRatio(hipY, hipX, fps, 0);
      expect(resultZero.hrVertical).toBeGreaterThan(0);

      const resultNegative = computeHarmonicRatio(hipY, hipX, fps, -1.0);
      expect(resultNegative.hrVertical).toBeGreaterThan(0);
    });

    it("handles short signals (N = 16 frames)", () => {
      const fps = 30;
      const hipY = [0.5, 0.52, 0.55, 0.53, 0.5, 0.48, 0.45, 0.47, 0.5, 0.52, 0.55, 0.53, 0.5, 0.48, 0.45, 0.47];
      const hipX = [0.5, 0.51, 0.52, 0.53, 0.54, 0.53, 0.52, 0.51, 0.5, 0.49, 0.48, 0.47, 0.46, 0.47, 0.48, 0.49];

      const result = computeHarmonicRatio(hipY, hipX, fps, 1.0);

      expect(Number.isNaN(result.hrVertical)).toBe(false);
      expect(Number.isNaN(result.hrLateral)).toBe(false);
      expect(Number.isNaN(result.overallHR)).toBe(false);
    });

    it("returns default values (1.0) gracefully for empty or invalid arrays", () => {
      const result1 = computeHarmonicRatio([], [], 30);
      expect(result1).toEqual({ hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 });

      const result2 = computeHarmonicRatio([0.5, 0.6], [0.5, 0.6], 30);
      expect(result2).toEqual({ hrVertical: 1.0, hrLateral: 1.0, overallHR: 1.0 });
    });

    it("operates stably under extreme sampling rates (120 FPS and 15 FPS)", () => {
      const strideFreq = 1.2;
      const meanStrideSec = 1.0 / strideFreq;

      const hipY120 = generateHipY({ fps: 120, durationSec: 4.0, strideFreq });
      const hipX120 = generateHipX({ fps: 120, durationSec: 4.0, strideFreq });
      const res120 = computeHarmonicRatio(hipY120, hipX120, 120, meanStrideSec);

      expect(res120.hrVertical).toBeGreaterThanOrEqual(2.5);

      const hipY15 = generateHipY({ fps: 15, durationSec: 6.0, strideFreq });
      const hipX15 = generateHipX({ fps: 15, durationSec: 6.0, strideFreq });
      const res15 = computeHarmonicRatio(hipY15, hipX15, 15, meanStrideSec);

      expect(res15.hrVertical).toBeGreaterThanOrEqual(2.0);
    });

    it("survives signals with zero AC variation (flat line) without NaN or division by zero", () => {
      const flatY = new Array(120).fill(0.5);
      const flatX = new Array(120).fill(0.5);

      const res = computeHarmonicRatio(flatY, flatX, 30, 1.0);

      expect(Number.isNaN(res.hrVertical)).toBe(false);
      expect(Number.isNaN(res.hrLateral)).toBe(false);
      expect(Number.isNaN(res.overallHR)).toBe(false);
      expect(res.hrVertical).toBeGreaterThanOrEqual(0.1);
      expect(res.hrLateral).toBeGreaterThanOrEqual(0.1);
    });
  });
});
