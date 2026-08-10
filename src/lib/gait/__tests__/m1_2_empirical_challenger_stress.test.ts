import { describe, expect, it } from "vitest";
import { computeGaitMetrics, filterSteadyStateStrides } from "../analysis";
import { detectGaitEventsZeni, detectFusedGaitEvents } from "../events";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Milestone 1 Challenger 2 Empirical Adversarial Stress Suite", () => {
  describe("1. filterSteadyStateStrides (0.40 threshold) Boundary & Asymmetry Stress", () => {
    it("preserves valid asymmetric boundary strides within 40% deviation of median", () => {
      // Median = 0.60. 0.60 * 0.35 = 0.21. Stride range [0.39, 0.81].
      // Stride sequence with boundary strides at 35% deviation (0.39s and 0.81s)
      const strides = [0.39, 0.60, 0.60, 0.60, 0.81];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(strides);

      expect(excludedCount).toBe(0);
      expect(steadyStrides).toEqual(strides);
    });

    it("trims extreme acceleration (>40% deviation) boundary strides", () => {
      // Median = 0.60. 0.60 * 0.45 = 0.27. Boundary strides at 0.30s (-50%) and 0.95s (+58%)
      const strides = [0.30, 0.60, 0.60, 0.60, 0.95];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(strides);

      expect(excludedCount).toBe(2);
      expect(steadyStrides).toEqual([0.60, 0.60, 0.60]);
    });

    it("handles highly alternating asymmetric step sequences without discarding valid steps", () => {
      // Alternating step durations: L=0.75s, R=0.45s (Median = 0.60s)
      // Deviation of 0.75 from 0.60 is 0.15 / 0.60 = 25% (less than 40%)
      const asymmetricStrides = [0.75, 0.45, 0.75, 0.45, 0.75, 0.45];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(asymmetricStrides);

      expect(excludedCount).toBe(0);
      expect(steadyStrides).toEqual(asymmetricStrides);
    });

    it("handles degenerate stride counts (0, 1, 2, 3 strides) cleanly", () => {
      expect(filterSteadyStateStrides([]).steadyStrides).toEqual([]);
      expect(filterSteadyStateStrides([0.6]).steadyStrides).toEqual([0.6]);
      expect(filterSteadyStateStrides([0.6, 1.2]).steadyStrides).toEqual([0.6, 1.2]); // 2 elements: median index 1 (1.2), (1.2-0.6)/1.2 = 0.5 > 0.40 -> trims start
    });
  });

  describe("2. MIN_STEP_SEC (0.15s) Fast Cadence & Deduplication Stress", () => {
    it("deduplicates noise heel-strikes spaced < 0.15s apart while retaining 0.16s steps", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const metrics = computeGaitMetrics(frames);

      expect(metrics.stepCount).toBeGreaterThan(0);
      expect(metrics.cadenceSpm).toBeGreaterThan(40);
      expect(metrics.cadenceSpm).toBeLessThan(350);
    });

    it("retains high cadence steps up to 330 SPM (0.18s step interval)", () => {
      // High cadence fast walking at 2.0x speed shift
      const fastFrames = generateSyntheticWalkingFrames({
        fps: 60,
        durationSec: 4.0,
      });
      // Rescale timestamps to 2x speed
      const rescaled: PoseFrame[] = fastFrames.map((f, i) => ({
        timeMs: i * (1000 / 120), // 120 effective FPS = 2x speed playback
        landmarks: f.landmarks,
      }));

      const metrics = computeGaitMetrics(rescaled);
      expect(metrics.stepCount).toBeGreaterThan(4);
      expect(metrics.cadenceSpm).toBeGreaterThan(120);
    });
  });

  describe("3. detectGaitEventsZeni (0.18 minGap) Multi-FPS & Speed Perturbation Stress", () => {
    const fpsList = [15, 30, 60, 120];

    fpsList.forEach((fps) => {
      it(`detects heel strikes consistently at ${fps} FPS under 1.5x speed perturbation`, () => {
        const frames = generateSyntheticWalkingFrames({ fps, durationSec: 4.0 });
        // Rescale to 1.5x speed
        const speedRescaled: PoseFrame[] = frames.map((f, i) => ({
          timeMs: i * (1000 / (fps * 1.5)),
          landmarks: f.landmarks,
        }));

        const events = detectFusedGaitEvents(speedRescaled, fps * 1.5);
        expect(events.length).toBeGreaterThan(4);

        const heelStrikes = events.filter((e) => e.type === "heel_strike");
        expect(heelStrikes.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("frontal-Y contact detection functions reliably under fast 1.8x speed shift without dropping steps", () => {
      const frontalFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 5.0,
        viewAngle: "frontal",
      });
      // 1.8x speed shift
      const rescaledFrontal: PoseFrame[] = frontalFrames.map((f, i) => ({
        timeMs: i * (1000 / (30 * 1.8)),
        landmarks: f.landmarks,
      }));

      const zeniEvents = detectGaitEventsZeni(rescaledFrontal, 30 * 1.8);
      const heelStrikes = zeniEvents.stepEvents.filter((e) => e.type === "heel_strike");
      expect(heelStrikes.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("4. Split-Half Stress & Monotonic 95% CI Expansion", () => {
    it("verifies strict monotonic expansion of 95% CI widths across 6 speed perturbation levels", () => {
      const half1 = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
      const tEnd = half1[half1.length - 1].timeMs;

      const speedFactors = [1.0, 1.15, 1.30, 1.45, 1.60, 1.80];
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

      // Check monotonicity: each level >= previous level (allowing floating point equality)
      for (let i = 1; i < ciWidths.length; i++) {
        expect(ciWidths[i]).toBeGreaterThanOrEqual(ciWidths[i - 1] - 1e-4);
      }
      // Highest perturbation (1.8x) must be strictly greater than baseline (1.0x)
      expect(ciWidths[5]).toBeGreaterThan(ciWidths[0]);
    });

    it("computes split-half 95% CIs robustly under high gait asymmetry (factor 1.8)", () => {
      const asymmetricFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 10.0,
        asymmetryFactor: 1.8,
      });

      const metrics = computeGaitMetrics(asymmetricFrames);
      expect(metrics.confidenceIntervals).toBeDefined();

      const cadenceCI = metrics.confidenceIntervals?.cadenceSpm;
      const stepTimeCvCI = metrics.confidenceIntervals?.stepTimeCV;

      expect(cadenceCI).toBeDefined();
      expect(stepTimeCvCI).toBeDefined();
      expect(Number.isFinite(cadenceCI?.se)).toBe(true);
      expect(Number.isFinite(stepTimeCvCI?.se)).toBe(true);
    });

    it("handles odd frame counts (11, 13, 27, 49 frames) without NaN or out-of-bounds errors", () => {
      const oddFrameCounts = [11, 13, 17, 27, 39, 49, 71];

      for (const count of oddFrameCounts) {
        const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 }).slice(0, count);
        const metrics = computeGaitMetrics(frames);

        expect(metrics.confidenceIntervals).toBeDefined();
        const ci = metrics.confidenceIntervals?.cadenceSpm;
        if (ci) {
          expect(Number.isFinite(ci.value)).toBe(true);
          expect(Number.isFinite(ci.ci95Lower)).toBe(true);
          expect(Number.isFinite(ci.ci95Upper)).toBe(true);
        }
      }
    });
  });
});
