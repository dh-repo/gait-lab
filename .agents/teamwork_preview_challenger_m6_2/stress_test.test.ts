import { describe, test, expect } from "vitest";
import { computeFFTHarmonics } from "../../src/lib/gait/signal";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";

describe("Empirical Stress Test Suite - Milestone M6", () => {
  // =========================================================================
  // 1. Array Edge Cases & Signal Lengths
  // =========================================================================
  describe("1. Array Edge Cases & Signal Lengths", () => {
    test("Short signals < 8 samples return safe default", () => {
      expect(computeFFTHarmonics([])).toEqual({ evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
      expect(computeFFTHarmonics([1, 2, 3])).toEqual({ evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
      expect(computeFFTHarmonics(new Array(7).fill(1.5))).toEqual({ evenSum: 0, oddSum: 0, harmonicRatio: 1.0 });
    });

    test("Short signals < 30 samples (e.g. N=8, 9, 10, 15, 20, 25, 29) execute without crashing", () => {
      const shortLengths = [8, 9, 10, 15, 20, 25, 29];
      for (const len of shortLengths) {
        const data = Array.from({ length: len }, (_, i) => Math.sin((2 * Math.PI * i) / 10));
        const res = computeFFTHarmonics(data, 30, 1.0, 10);
        expect(Number.isNaN(res.evenSum)).toBe(false);
        expect(Number.isNaN(res.oddSum)).toBe(false);
        expect(Number.isNaN(res.harmonicRatio)).toBe(false);
        expect(Number.isFinite(res.harmonicRatio)).toBe(true);
      }
    });

    test("Long signals > 1000 samples (N=1001, 1024, 2000, 4096) execute accurately", () => {
      const longLengths = [1001, 1024, 2000, 4096];
      for (const len of longLengths) {
        const data = Array.from({ length: len }, (_, i) =>
          Math.sin((2 * Math.PI * 2 * i) / 30) + 0.2 * Math.sin((2 * Math.PI * 1 * i) / 30)
        );
        const res = computeFFTHarmonics(data, 30, 1.0, 10);
        expect(res.evenSum).toBeGreaterThan(res.oddSum);
        expect(res.harmonicRatio).toBeGreaterThan(1.0);
        expect(Number.isFinite(res.harmonicRatio)).toBe(true);
      }
    });

    test("Prime signal lengths zero-padded to FFT size work correctly", () => {
      const primeLengths = [17, 31, 53, 97, 127, 257, 521, 1009];
      for (const len of primeLengths) {
        // Construct pure 2 Hz signal at 30 fps
        const data = Array.from({ length: len }, (_, i) => Math.sin((2 * Math.PI * 2 * i) / 30));
        const res = computeFFTHarmonics(data, 30, 1.0, 10);
        expect(Number.isFinite(res.harmonicRatio)).toBe(true);
        // Even harmonics (2 Hz = 2nd harmonic of 1 Hz stride) should dominate
        expect(res.evenSum).toBeGreaterThan(res.oddSum);
      }
    });
  });

  // =========================================================================
  // 2. Special Signal Contents (Zero power, DC offset, Noise, Extremes)
  // =========================================================================
  describe("2. Special Signal Content", () => {
    test("Zero power signal (all 0s) returns harmonicRatio = 0 without NaN", () => {
      const data = new Array(100).fill(0);
      const res = computeFFTHarmonics(data, 30, 1.0, 10);
      expect(res.evenSum).toBe(0);
      expect(res.oddSum).toBe(0);
      expect(res.harmonicRatio).toBe(0); // 0 / (0 + 1e-6) = 0
    });

    test("Constant DC offset (all 5s or all 100s) returns harmonicRatio = 0", () => {
      const data = new Array(100).fill(42.5);
      const res = computeFFTHarmonics(data, 30, 1.0, 10);
      expect(res.evenSum).toBeCloseTo(0, 5);
      expect(res.oddSum).toBeCloseTo(0, 5);
      expect(res.harmonicRatio).toBeCloseTo(0, 5);
    });

    test("Pure linear trend is detrended and produces zero harmonic power", () => {
      const data = Array.from({ length: 100 }, (_, i) => 2.5 * i + 10);
      const res = computeFFTHarmonics(data, 30, 1.0, 10);
      expect(res.evenSum).toBeCloseTo(0, 5);
      expect(res.oddSum).toBeCloseTo(0, 5);
    });

    test("Extreme Gaussian/White Noise produces finite ratios without crashing", () => {
      // Deterministic pseudorandom noise generator
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      const noise = Array.from({ length: 300 }, () => (rnd() - 0.5) * 1000);
      const res = computeFFTHarmonics(noise, 30, 1.0, 10);
      expect(Number.isFinite(res.evenSum)).toBe(true);
      expect(Number.isFinite(res.oddSum)).toBe(true);
      expect(Number.isFinite(res.harmonicRatio)).toBe(true);
    });

    test("Signal with single huge spike (impulse)", () => {
      const data = new Array(100).fill(0);
      data[50] = 1e6;
      const res = computeFFTHarmonics(data, 30, 1.0, 10);
      expect(Number.isFinite(res.harmonicRatio)).toBe(true);
    });
  });

  // =========================================================================
  // 3. Hann Window Spectral Leakage & Fractional Bin Frequencies
  // =========================================================================
  describe("3. Hann Window Spectral Leakage & Fractional Bin Frequencies", () => {
    test("Fractional bin frequency (signal freq falls between FFT bins)", () => {
      // At fps = 30, N = 128 (fftSize = 128), bin width = 30 / 128 = 0.234375 Hz.
      // Bin 8.5 is at 8.5 * (30 / 128) = 1.9921875 Hz.
      // Let's test a signal at frequency 1.9921875 Hz (fractional bin 8.5).
      const fps = 30;
      const N = 128;
      const targetFreq = 8.5 * (fps / N); // 1.9921875 Hz
      const strideFreq = targetFreq / 2; // 0.99609375 Hz so targetFreq is 2nd harmonic (even)

      const data = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * targetFreq * i) / fps));

      const res = computeFFTHarmonics(data, fps, strideFreq, 10);
      
      // With 3-bin Hann summation, energy of fractional bin 8.5 is captured across bins [8, 9, 10]
      expect(res.evenSum).toBeGreaterThan(0.1);
      expect(res.harmonicRatio).toBeGreaterThan(10); // Dominant 2nd harmonic
    });

    test("3-bin neighborhood summation recovers energy compared to single bin lookup", () => {
      const fps = 30;
      const N = 128; // bin width = 30/128 = 0.234375 Hz
      
      // Test integer bin (bin 8 -> 1.875 Hz) vs fractional bin (bin 8.5 -> 1.9921875 Hz)
      const intFreq = 8.0 * (fps / N);
      const fracFreq = 8.5 * (fps / N);

      const intData = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * intFreq * i) / fps));
      const fracData = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * fracFreq * i) / fps));

      const resInt = computeFFTHarmonics(intData, fps, intFreq / 2, 10);
      const resFrac = computeFFTHarmonics(fracData, fps, fracFreq / 2, 10);

      // The evenSum for fractional bin should recover > 70% of energy of integer bin due to 3-bin Hann summation
      const energyRatio = resFrac.evenSum / resInt.evenSum;
      expect(energyRatio).toBeGreaterThan(0.70);
    });

    test("Overlapping bin neighborhoods for low f0 or small FFT size", () => {
      // Small signal N = 16, fftSize = 16, fps = 30 => bin width = 1.875 Hz.
      // f0 = 0.8 Hz. Harmonic 1 (0.8 Hz) -> bin 0.427 -> centerBin 0 -> clamped bMin=1, bMax=1.
      // Harmonic 2 (1.6 Hz) -> bin 0.853 -> centerBin 1 -> bMin=1, bMax=2.
      // Harmonic 3 (2.4 Hz) -> bin 1.28 -> centerBin 1 -> bMin=1, bMax=2.
      const data = Array.from({ length: 16 }, (_, i) => Math.sin((2 * Math.PI * 1.6 * i) / 30));
      const res = computeFFTHarmonics(data, 30, 0.8, 5);

      expect(Number.isFinite(res.harmonicRatio)).toBe(true);
      expect(res.evenSum).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 4. Biomechanical Validity & Smoothness HR Module
  // =========================================================================
  describe("4. Biomechanical HR Smoothness Module Integration", () => {
    test("Symmetric gait vertical displacement produces high HR (even harmonics dominate)", () => {
      const fps = 30;
      const durationSec = 6.0;
      const N = Math.round(fps * durationSec);
      const meanStrideSec = 1.0; // f0 = 1 Hz stride frequency

      // Vertical hip displacement completes 2 cycles per stride (2 Hz)
      const hipY = Array.from({ length: N }, (_, i) =>
        Math.sin((2 * Math.PI * 2 * (i / fps))) * 0.05
      );
      // Lateral hip displacement completes 1 cycle per stride (1 Hz)
      const hipX = Array.from({ length: N }, (_, i) =>
        Math.cos((2 * Math.PI * 1 * (i / fps))) * 0.03
      );

      const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      // Vertical HR should be high for symmetric gait (> 3.0)
      expect(hrVertical).toBeGreaterThan(3.0);
      // Lateral HR should be high for 1 Hz sway (> 3.0)
      expect(hrLateral).toBeGreaterThan(3.0);
      expect(overallHR).toBeGreaterThan(3.0);
    });

    test("Asymmetric gait (injecting 1 Hz stride harmonic into hipY) drops vertical HR", () => {
      const fps = 30;
      const N = 180;
      const meanStrideSec = 1.0;

      // Asymmetric gait: add strong 1 Hz component (limb asymmetry) to 2 Hz step frequency
      const hipY = Array.from({ length: N }, (_, i) =>
        Math.sin((2 * Math.PI * 2 * (i / fps))) * 0.05 + // 2 Hz even harmonic
        Math.sin((2 * Math.PI * 1 * (i / fps))) * 0.05   // 1 Hz odd stride harmonic (asymmetry!)
      );
      const hipX = Array.from({ length: N }, (_, i) =>
        Math.cos((2 * Math.PI * 1 * (i / fps))) * 0.03
      );

      const { hrVertical } = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

      // Injected 1 Hz component increases oddSum, causing hrVertical to drop significantly (< 1.8)
      expect(hrVertical).toBeLessThan(1.8);
    });
  });

  // =========================================================================
  // 5. Parameter Boundary Checks & Legacy Compatibility
  // =========================================================================
  describe("5. Parameter Boundary Checks & Legacy Compatibility", () => {
    test("fps <= 16 with undefined strideFreq triggers legacy signature check", () => {
      const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
      // Passing 10 as second arg (legacy numHarmonics = 10)
      const res = computeFFTHarmonics(data, 10);
      expect(Number.isFinite(res.harmonicRatio)).toBe(true);
    });

    test("fps <= 16 WITH explicit strideFreq is treated as actual fps = 15, not numHarmonics", () => {
      const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * i) / 8));
      // fps = 15, strideFreq = 1.0
      const res = computeFFTHarmonics(data, 15, 1.0, 8);
      expect(Number.isFinite(res.harmonicRatio)).toBe(true);
    });

    test("Invalid strideFreq (undefined, <= 0) falls back gracefully to peak search", () => {
      const data = Array.from({ length: 64 }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / 64));
      const res1 = computeFFTHarmonics(data, 30, undefined, 10);
      const res2 = computeFFTHarmonics(data, 30, -1.0, 10);
      expect(res1.harmonicRatio).toBeGreaterThan(1.0);
      expect(res2.harmonicRatio).toBeGreaterThan(1.0);
    });
  });
});
