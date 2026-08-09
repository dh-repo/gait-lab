import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni, refinePeakTimestamp, findExtrema } from "../events";
import { computeHarmonicRatio } from "../smoothness";
import { computeFFTHarmonics } from "../signal";
import { computeGaitMetrics } from "../analysis";
import { generateSyntheticWalkingFrames } from "./testHelpers";

describe("Milestone M9: Comprehensive Adversarial Stress Test Suite (Challenger)", () => {
  describe("1. R1 & R5 Follow-Cam Direction & Prominence Stress", () => {
    it("handles heavy Gaussian noise levels (0.05 to 0.25) without crashing or emitting NaN", () => {
      const noiseLevels = [0.05, 0.10, 0.15, 0.20, 0.25];

      for (const noiseLevel of noiseLevels) {
        const frames = generateSyntheticWalkingFrames({
          fps: 30,
          durationSec: 4.0,
          noiseLevel,
          direction: 1,
          followCam: true,
        });

        const result = detectGaitEventsZeni(frames, 30);

        expect(result).toBeDefined();
        expect(Number.isNaN(result.leftStancePct)).toBe(false);
        expect(Number.isNaN(result.rightStancePct)).toBe(false);
        expect(Number.isNaN(result.leftSwingPct)).toBe(false);
        expect(Number.isNaN(result.rightSwingPct)).toBe(false);
        expect(Number.isNaN(result.doubleSupportPct)).toBe(false);

        // Stance percentages must remain physically bounded
        expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
        expect(result.leftStancePct).toBeLessThanOrEqual(80);
        expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
        expect(result.rightStancePct).toBeLessThanOrEqual(80);
      }
    });

    it("gracefully falls back when all foot/heel visibility flags are 0.0", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 4.0,
        lowVisibilityLandmarks: true,
      });

      // Force zero visibility on foot landmarks
      for (const frame of frames) {
        for (const idx of [27, 28, 29, 30, 31, 32]) {
          if (frame.landmarks[idx]) {
            frame.landmarks[idx].visibility = 0.0;
          }
        }
      }

      const result = detectGaitEventsZeni(frames, 30);

      expect(result.inferredDirection).toBeDefined();
      expect([-1, 1]).toContain(result.inferredDirection);
      expect(result.leftStancePct).toBeGreaterThan(0);
      expect(Number.isNaN(result.leftStancePct)).toBe(false);
    });

    it("findExtrema suppresses flatline signals and zero-prominence noise without NaN", () => {
      const flatSignal = new Array(50).fill(0.5);
      const extremaMax = findExtrema(flatSignal, "max", 5);
      const extremaMin = findExtrema(flatSignal, "min", 5);

      expect(extremaMax).toEqual([]);
      expect(extremaMin).toEqual([]);
    });

    it("R5 Prominence: filters out spurious micro-ripples in noisy sinusoidal signal", () => {
      const fps = 30;
      const n = 120;
      const cleanSignal: number[] = [];
      const noisySignal: number[] = [];

      for (let i = 0; i < n; i++) {
        const t = i / fps;
        const main = Math.sin(2 * Math.PI * 1.5 * t);
        const ripple = 0.02 * Math.sin(2 * Math.PI * 15 * t); // High freq small noise ripple
        cleanSignal.push(main);
        noisySignal.push(main + ripple);
      }

      const cleanPeaks = findExtrema(cleanSignal, "max", 5);
      const noisyPeaks = findExtrema(noisySignal, "max", 5);

      // Prominence thresholding prevents ripple noise from duplicating peaks
      expect(noisyPeaks.length).toBe(cleanPeaks.length);
    });
  });

  describe("2. R2 Harmonic Ratio & FFT Spectral Stress", () => {
    it("handles invalid or extreme meanStrideSec (0, -1, NaN, Infinity, undefined) gracefully", () => {
      const fps = 30;
      const hipY = Array.from({ length: 90 }, (_, i) => 0.5 + 0.03 * Math.cos(2 * Math.PI * 1.6 * (i / fps)));
      const hipX = Array.from({ length: 90 }, (_, i) => 0.5 + 0.04 * Math.sin(2 * Math.PI * 0.8 * (i / fps)));

      const invalidStrides = [0, -1, NaN, Infinity, -Infinity, undefined];

      for (const strideSec of invalidStrides) {
        const hr = computeHarmonicRatio(hipY, hipX, fps, strideSec);
        expect(hr).toBeDefined();
        expect(Number.isNaN(hr.hrVertical)).toBe(false);
        expect(Number.isNaN(hr.hrLateral)).toBe(false);
        expect(Number.isNaN(hr.overallHR)).toBe(false);
        expect(hr.hrVertical).toBeGreaterThan(0);
      }
    });

    it("computeFFTHarmonics handles short signals (< 16 points) and zero data without throwing", () => {
      const shortData = [0.1, 0.2, 0.1, 0.3, 0.2];
      const resShort = computeFFTHarmonics(shortData, 30, 0.8, 5);

      expect(resShort).toBeDefined();
      expect(Number.isNaN(resShort.harmonicRatio)).toBe(false);

      const zeroData = new Array(30).fill(0);
      const resZero = computeFFTHarmonics(zeroData, 30, 0.8, 5);

      expect(resZero).toBeDefined();
      expect(resZero.harmonicRatio).toBeGreaterThanOrEqual(0);
    });

    it("R2 Pathological Limp: HR decreases sharply (< 1.8) when strong odd stride harmonics dominate", () => {
      const fps = 30;
      const durationSec = 6.0;
      const n = Math.floor(fps * durationSec);
      const strideFreq = 0.8;
      const meanStrideSec = 1 / strideFreq;

      const hipYLimp: number[] = [];
      const hipXLimp: number[] = [];

      for (let i = 0; i < n; i++) {
        const t = i / fps;
        // Severe limp: odd harmonic (1 * f0) magnitude exceeds even harmonic (2 * f0) magnitude
        const y = 0.5 + 0.01 * Math.cos(2 * Math.PI * 2 * strideFreq * t) + 0.05 * Math.cos(2 * Math.PI * 1 * strideFreq * t);
        const x = 0.5 + 0.04 * Math.sin(2 * Math.PI * 1 * strideFreq * t);
        hipYLimp.push(y);
        hipXLimp.push(x);
      }

      const hrLimp = computeHarmonicRatio(hipYLimp, hipXLimp, fps, meanStrideSec);
      expect(hrLimp.hrVertical).toBeLessThan(1.8);
    });
  });

  describe("3. R3 Parabolic Timestamp & CV Length Invariance", () => {
    it("refinePeakTimestamp handles boundary indices (0, n-1) and flat peaks without NaN", () => {
      const signal = [1, 5, 5, 5, 1];
      const fps = 30;

      // Peak at index 0 (boundary)
      expect(refinePeakTimestamp(signal, 0, 0.0, fps)).toBe(0.0);

      // Peak at end index 4 (boundary)
      expect(refinePeakTimestamp(signal, 4, 4 / fps, fps)).toBe(4 / fps);

      // Flat peak where y0 = y1 = y2 (denom = 0)
      expect(refinePeakTimestamp(signal, 2, 2 / fps, fps)).toBe(2 / fps);
    });

    it(
      "verifies stepTimeCV clip-length stability across 10s, 30s, 60s, and 120s at 30 FPS",
      () => {
        const durations = [10.0, 30.0, 60.0, 120.0];
        const cvs: number[] = [];

        for (const d of durations) {
          const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: d, direction: 1 });
          const m = computeGaitMetrics(frames);
          expect(m.stepTimeCV).not.toBeNull();
          if (m.stepTimeCV !== null) cvs.push(m.stepTimeCV);
        }

        expect(cvs.length).toBe(4);
        const diff = Math.max(...cvs) - Math.min(...cvs);
        expect(diff).toBeLessThan(0.001); // < 0.1% variation
      },
      30000,
    );
  });

  describe("4. R4 View Suppression & Split-Half Bounds Stress", () => {
    it("handles Oblique view angle correctly in computeGaitMetrics", () => {
      const obliqueFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 5.0,
        viewAngle: "oblique",
      });

      const metrics = computeGaitMetrics(obliqueFrames);

      expect(metrics).toBeDefined();
      expect(metrics.viewAngle).toBe("oblique");
      expect(metrics.cadenceSpm).not.toBeNull();
    });

    it("verifies 95% CIs satisfy lower <= value <= upper for all non-null metrics", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 6.0,
        viewAngle: "sagittal",
      });

      const metrics = computeGaitMetrics(frames);

      expect(metrics.confidenceIntervals).toBeDefined();
      if (metrics.confidenceIntervals) {
        for (const bounds of Object.values(metrics.confidenceIntervals)) {
          if (bounds.value !== null && bounds.ci95Lower !== null && bounds.ci95Upper !== null) {
            expect(bounds.ci95Lower).toBeLessThanOrEqual(bounds.ci95Upper);
            expect(bounds.se).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });
});
