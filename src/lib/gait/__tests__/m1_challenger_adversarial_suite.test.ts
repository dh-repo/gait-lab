import { describe, it, expect } from "vitest";
import { filterSteadyStateStrides, computeGaitMetrics, analyzeGait } from "../analysis";
import { detectGaitEventsZeni, findExtrema, refinePeakTimestamp } from "../events";
import { generateSyntheticWalkingFrames, generateStationaryPoseFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Milestone 1 Empirical Adversarial Challenge: Algorithm Thresholds & Edge Cases", () => {
  describe("1. filterSteadyStateStrides (Threshold = 0.40 / 40%)", () => {
    it("1.1 Empty and small arrays (< 3 elements) return input copy without filtering", () => {
      expect(filterSteadyStateStrides([])).toEqual({ steadyStrides: [], excludedCount: 0 });
      expect(filterSteadyStateStrides([0.6])).toEqual({ steadyStrides: [0.6], excludedCount: 0 });
      expect(filterSteadyStateStrides([0.5, 0.7])).toEqual({ steadyStrides: [0.5, 0.7], excludedCount: 0 });
    });

    it("1.2 Retains boundary strides with relative deviation <= 40%", () => {
      // Median = 1.0. Boundary 0.65s (35% diff) and 1.35s (35% diff)
      const input = [0.65, 1.0, 1.0, 1.0, 1.35];
      const res = filterSteadyStateStrides(input);
      expect(res.steadyStrides.length).toBe(5);
      expect(res.excludedCount).toBe(0);
    });

    it("1.3 Excludes lead-in/lead-out boundary strides with relative deviation > 40%", () => {
      // Median = 1.0. Lead-in 0.45s (55% diff > 40%) and lead-out 1.55s (55% diff > 40%)
      const input = [0.45, 0.95, 1.0, 1.05, 1.55];
      const res = filterSteadyStateStrides(input);
      expect(res.steadyStrides).toEqual([0.95, 1.0, 1.05]);
      expect(res.excludedCount).toBe(2);
    });

    it("1.4 Preserves valid asymmetric gait step variation (25%-38% relative deviation)", () => {
      // Hemiparetic asymmetric gait: alternating 0.7s and 1.0s step times. Median = 1.0 or 0.85 depending on sort.
      // Array: [0.7, 1.0, 0.7, 1.0, 0.7, 1.0] -> sorted: [0.7, 0.7, 0.7, 1.0, 1.0, 1.0], median = 1.0
      // 0.7 vs 1.0 relative deviation = |0.7 - 1.0|/1.0 = 30%. With M1 40% threshold, 30% deviation is NOT discarded.
      const input = [0.7, 1.0, 0.7, 1.0, 0.7, 1.0];
      const res = filterSteadyStateStrides(input);
      expect(res.steadyStrides.length).toBe(6);
      expect(res.excludedCount).toBe(0);
    });

    it("1.5 Handles zero durations, negative numbers, and missing durationSec fields safely", () => {
      expect(filterSteadyStateStrides([0, 0, 0])).toEqual({ steadyStrides: [0, 0, 0], excludedCount: 0 });
      expect(filterSteadyStateStrides([-0.5, -0.5, -0.5])).toEqual({ steadyStrides: [-0.5, -0.5, -0.5], excludedCount: 0 });
      
      const strideObjs = [{ durationSec: 0.8 }, { durationSec: 1.0 }, { durationSec: 1.2 }];
      const resObj = filterSteadyStateStrides(strideObjs);
      expect(resObj.steadyStrides.length).toBe(3);
      expect(resObj.excludedCount).toBe(0);
    });

    it("1.6 Robustness to NaN, Infinity, and -Infinity inputs without infinite loops or crashes", () => {
      expect(() => filterSteadyStateStrides([1.0, NaN, 1.0, 1.0])).not.toThrow();
      expect(() => filterSteadyStateStrides([Infinity, 1.0, 1.0, 1.0])).not.toThrow();
      expect(() => filterSteadyStateStrides([-Infinity, 1.0, 1.0, -Infinity])).not.toThrow();
      
      const resNaN = filterSteadyStateStrides([1.0, NaN, 1.0, 1.0]);
      expect(resNaN.steadyStrides).toBeDefined();
      expect(resNaN.excludedCount).toBeGreaterThanOrEqual(0);
    });

    it("1.7 Non-empty input always leaves at least 1 steady stride", () => {
      const extremeStrides = [0.01, 1.0, 100.0];
      const res = filterSteadyStateStrides(extremeStrides);
      expect(res.steadyStrides.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("2. detectGaitEventsZeni & minGap Threshold (minGap = 0.18 * FPS)", () => {
    it("2.1 Resolves rapid step cadences (150ms-250ms step intervals) without peak suppression", () => {
      // 30 FPS video with fast cadence (~200 SPM => step duration ~150ms = 4.5 frames at 30 FPS)
      const fastFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });
      // Compress frame times to simulate rapid 2.0x step frequency
      const fastCadenceFrames: PoseFrame[] = fastFrames.map((f, i) => ({
        timeMs: (i / 30) * 1000 * 0.5, // 2x speed -> 200 ms steps
        landmarks: f.landmarks,
      }));

      const res = detectGaitEventsZeni(fastCadenceFrames, 60); // 60 effective FPS
      expect(res.stepEvents.length).toBeGreaterThan(6);

      const strikes = res.stepEvents.filter((e) => e.type === "heel_strike");
      // Check inter-strike timing interval consistency
      for (let i = 1; i < strikes.length; i++) {
        const dt = strikes[i].timeSec - strikes[i - 1].timeSec;
        expect(dt).toBeGreaterThanOrEqual(0.10); // >100ms
        expect(Number.isFinite(dt)).toBe(true);
      }
    });

    it("2.2 Frontal view fallback: handles collapsing AP displacement with minGap = 0.18 * FPS and rapid step cadences", () => {
      const frontalFrames = generateSyntheticWalkingFrames({
        viewAngle: "frontal",
        fps: 30,
        durationSec: 5.0,
      });

      const res = detectGaitEventsZeni(frontalFrames, 30);
      expect(res.stepEvents).toBeDefined();
      expect(res.stepEvents.length).toBeGreaterThanOrEqual(4);

      const hs = res.stepEvents.filter((e) => e.type === "heel_strike");
      expect(hs.length).toBeGreaterThanOrEqual(2);

      // Verify double support & stance % stay within valid range
      expect(res.leftStancePct).toBeGreaterThanOrEqual(20);
      expect(res.leftStancePct).toBeLessThanOrEqual(90);
      expect(res.rightStancePct).toBeGreaterThanOrEqual(20);
      expect(res.rightStancePct).toBeLessThanOrEqual(90);
      expect(res.doubleSupportPct).toBeGreaterThanOrEqual(5);
      expect(res.doubleSupportPct).toBeLessThanOrEqual(50);
    });

    it("2.3 Low FPS (5 FPS) and High FPS (120 FPS) data handling", () => {
      const lowFpsFrames = generateSyntheticWalkingFrames({ fps: 5, durationSec: 4.0 });
      const resLow = detectGaitEventsZeni(lowFpsFrames, 5);
      expect(resLow.stepEvents).toBeDefined();

      const highFpsFrames = generateSyntheticWalkingFrames({ fps: 120, durationSec: 3.0 });
      const resHigh = detectGaitEventsZeni(highFpsFrames, 120);
      expect(resHigh.stepEvents).toBeDefined();
      expect(resHigh.stepEvents.length).toBeGreaterThan(4);
    });

    it("2.4 Edge case FPS values (0, negative, NaN, Infinity)", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0 });
      
      expect(detectGaitEventsZeni(frames, 0).stepEvents).toEqual([]);
      expect(detectGaitEventsZeni(frames, -30).stepEvents).toEqual([]);
      expect(() => detectGaitEventsZeni(frames, NaN)).not.toThrow();
      expect(() => detectGaitEventsZeni(frames, Infinity)).not.toThrow();
    });

    it("2.5 findExtrema with minGap = 0.18 * FPS behavior", () => {
      const signal = [0, 1, 0, 1, 0, 1, 0, 1, 0];
      // minGap = 2
      const peaks = findExtrema(signal, "max", 2, 0.1);
      expect(peaks.length).toBeGreaterThan(0);
      for (let i = 1; i < peaks.length; i++) {
        expect(peaks[i] - peaks[i - 1]).toBeGreaterThanOrEqual(2);
      }
    });

    it("2.6 refinePeakTimestamp subframe timestamp accuracy and boundary clamping", () => {
      const signal = [0.1, 0.9, 0.2];
      const refined = refinePeakTimestamp(signal, 1, 1.0, 30);
      expect(refined).toBeGreaterThanOrEqual(1.0 - 0.5 / 30);
      expect(refined).toBeLessThanOrEqual(1.0 + 0.5 / 30);

      // Boundary inputs
      expect(refinePeakTimestamp(signal, 0, 0.0, 30)).toBe(0.0);
      expect(refinePeakTimestamp(signal, 2, 2.0, 30)).toBe(2.0);
      expect(refinePeakTimestamp(signal, 1, 1.0, 0)).toBe(1.0);
      expect(refinePeakTimestamp([], 0, 0.0, 30)).toBe(0.0);
    });
  });

  describe("3. End-to-End Metrics & Monotonic Confidence Intervals Stress", () => {
    it("3.1 Monotonic CI Expansion across speed perturbation levels (1.0x, 1.25x, 1.6x)", () => {
      const half1 = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
      const tEnd = half1[half1.length - 1].timeMs;

      const speedFactors = [1.0, 1.25, 1.6];
      const ciWidths: number[] = [];

      for (const factor of speedFactors) {
        const rawHalf2 = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
        const half2Rescaled: PoseFrame[] = rawHalf2.map((f, i) => ({
          timeMs: tEnd + (i + 1) * (1000 / (30 * factor)),
          landmarks: f.landmarks,
        }));
        const frames = [...half1, ...half2Rescaled];
        const m = computeGaitMetrics(frames);
        const ci = m.confidenceIntervals?.cadenceSpm;
        const width = (ci?.ci95Upper ?? 0) - (ci?.ci95Lower ?? 0);
        ciWidths.push(width);
      }

      // Monotonic expansion check
      expect(ciWidths[0]).toBeLessThanOrEqual(ciWidths[1] + 1e-6);
      expect(ciWidths[1]).toBeLessThanOrEqual(ciWidths[2] + 1e-6);
    });

    it("3.2 Pathological asymmetric gait (Scenario 2 fix): stepTimeCV remains > 0.03 and does not collapse", () => {
      const asymFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 6.0,
        asymmetryFactor: 1.6,
      });

      const metrics = computeGaitMetrics(asymFrames);
      expect(metrics.stepTimeCV).toBeGreaterThan(0.03);
      expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
      expect(isNaN(metrics.stepTimeCV)).toBe(false);
    });

    it("3.3 Full analysis result structure and non-NaN guarantees", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });
      const result = analyzeGait(frames);

      expect(result.metrics).toBeDefined();
      expect(result.guesses).toBeDefined();
      expect(result.metrics.cadenceSpm).toBeGreaterThan(0);
      expect(isNaN(result.metrics.overallScore)).toBe(false);
      expect(result.metrics.overallScore).toBeGreaterThanOrEqual(5);
      expect(result.metrics.overallScore).toBeLessThanOrEqual(98);
    });
  });
});
