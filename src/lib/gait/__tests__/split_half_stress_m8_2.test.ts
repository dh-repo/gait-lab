import { describe, it, expect } from "vitest";
import { computeGaitMetrics } from "../analysis";
import { generateSyntheticWalkingFrames, generateStationaryPoseFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Milestone M8 Empirical Stress Harness: Split-Half Reliability & 95% CIs", () => {
  it("1. Mathematical Accuracy: verifies SE_split = |M1 - M2| / sqrt(2) and 95% CI bounds", () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });
    const metrics = computeGaitMetrics(frames);

    expect(metrics.confidenceIntervals).toBeDefined();
    const ci = metrics.confidenceIntervals!;

    // Check all expected keys are present
    const expectedKeys = [
      "cadenceSpm",
      "cadence",
      "stepTimeCV",
      "symmetryAngle",
      "symmetryIndex",
      "strideTimeCV",
      "leftStancePct",
      "rightStancePct",
      "doubleSupportPct",
      "kneeFlexLeft",
      "kneeFlexRight",
      "lateralSway",
      "meanStepWidth",
      "pelvicObliquity",
    ];

    for (const key of expectedKeys) {
      expect(ci[key]).toBeDefined();
      const bounds = ci[key];
      if (bounds && bounds.value !== null && bounds.half1 !== null && bounds.half1 !== undefined && bounds.half2 !== null && bounds.half2 !== undefined) {
        const h1 = bounds.half1;
        const h2 = bounds.half2;
        const val = bounds.value;
        const expectedDiff = Number(Math.abs(h1 - h2).toFixed(3));
        const expectedSE = Number((Math.abs(h1 - h2) / Math.sqrt(2)).toFixed(3));
        const rawLower = val - 1.96 * (Math.abs(h1 - h2) / Math.sqrt(2));
        const expectedLower = Number(Math.max(0, rawLower).toFixed(3));
        const expectedUpper = Number((val + 1.96 * (Math.abs(h1 - h2) / Math.sqrt(2))).toFixed(3));

        expect(bounds.splitHalfDiff).toBeCloseTo(expectedDiff, 2);
        expect(bounds.se).toBeCloseTo(expectedSE, 2);
        expect(bounds.ci95Lower).toBeCloseTo(expectedLower, 2);
        expect(bounds.ci95Upper).toBeCloseTo(expectedUpper, 2);
      }
    }
  });

  it("2. Steady vs Perturbed Gait: SE_split and CI width expand significantly under perturbed gait", () => {
    // Steady gait: constant frequency throughout
    const steadyFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });

    // Perturbed gait: Half 1 at normal speed, Half 2 at high perturbation (e.g. 2x speed shift)
    const half1 = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
    // Generate half2 with altered timing/asymmetry
    const half2Altered = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 5.0,
      asymmetryFactor: 1.8, // asymmetric / perturbed walking in half 2
    });

    // Re-timestamp half 2 to follow half 1
    const tEndHalf1 = half1[half1.length - 1].timeMs;
    const dt = 1000 / 30;
    const half2Rebased: PoseFrame[] = half2Altered.map((f, i) => ({
      timeMs: tEndHalf1 + (i + 1) * dt,
      landmarks: f.landmarks,
    }));

    const perturbedFrames = [...half1, ...half2Rebased];

    const steadyMetrics = computeGaitMetrics(steadyFrames);
    const perturbedMetrics = computeGaitMetrics(perturbedFrames);

    const steadyCI = steadyMetrics.confidenceIntervals?.symmetryAngle;
    const perturbedCI = perturbedMetrics.confidenceIntervals?.symmetryAngle;

    expect(steadyCI).toBeDefined();
    expect(perturbedCI).toBeDefined();

    const steadyWidth = (steadyCI!.ci95Upper ?? 0) - (steadyCI!.ci95Lower ?? 0);
    const perturbedWidth = (perturbedCI!.ci95Upper ?? 0) - (perturbedCI!.ci95Lower ?? 0);

    // Perturbed gait must result in larger split-half difference and wider 95% CIs
    expect(perturbedCI!.splitHalfDiff!).toBeGreaterThan(steadyCI!.splitHalfDiff!);
    expect(perturbedWidth).toBeGreaterThan(steadyWidth);
  });

  it("3. Monotonicity: CI bounds expand monotonically with increasing intra-clip variance between Half 1 and Half 2", () => {
    const half1 = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 }); // 30 fps, 150 frames
    const tEnd = half1[half1.length - 1].timeMs;

    // Create 3 levels of speed perturbation for Half 2: 1.0x (no shift), 1.25x speed, 1.6x speed
    const speedFactors = [1.0, 1.25, 1.6];
    const ciWidths: number[] = [];

    for (const factor of speedFactors) {
      // Scale frame timestamps in half 2 to simulate faster walking pace
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

    // Verify monotonic expansion: width(level 0) <= width(level 1) <= width(level 2)
    expect(ciWidths[0]).toBeLessThanOrEqual(ciWidths[1]);
    expect(ciWidths[1]).toBeLessThanOrEqual(ciWidths[2]);
  });

  it("4. Short Clips (<10 frames): split-half reliability testing is safely skipped", () => {
    const testCounts = [0, 3, 4, 5, 8, 9];

    for (const count of testCounts) {
      const fullFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 1.0 });
      const shortFrames = fullFrames.slice(0, count);
      const metrics = computeGaitMetrics(shortFrames);

      expect(metrics).toBeDefined();
      // For clips < 10 frames, confidenceIntervals should be empty/undefined or have no split-half entries
      if (count < 5) {
        expect(metrics.stepCount).toBe(0);
      }
      expect(metrics.confidenceIntervals?.cadenceSpm).toBeUndefined();
    }
  });

  it("5. Boundary Case (10 frames): split-half reliability testing activates at exactly 10 frames", () => {
    const fullFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0 });
    const tenFrames = fullFrames.slice(0, 10);
    const metrics = computeGaitMetrics(tenFrames);

    expect(metrics.confidenceIntervals).toBeDefined();
    expect(metrics.confidenceIntervals?.cadenceSpm).toBeDefined();
    expect(metrics.confidenceIntervals?.cadenceSpm?.half1).toBeDefined();
    expect(metrics.confidenceIntervals?.cadenceSpm?.half2).toBeDefined();
  });

  it("6. View Angle Suppression & Null Metrics: handles suppressed view metrics safely", () => {
    const frontalFrames = generateSyntheticWalkingFrames({ viewAngle: "frontal", fps: 30, durationSec: 6.0 });
    const metrics = computeGaitMetrics(frontalFrames);

    expect(metrics.confidenceIntervals).toBeDefined();
    const ci = metrics.confidenceIntervals!;

    // Knee flex is sagittal-only -> under frontal view, value and CI bounds must be null
    expect(metrics.kneeFlexLeft).toBeNull();
    expect(ci.kneeFlexLeft.value).toBeNull();
    expect(ci.kneeFlexLeft.ci95Lower).toBeNull();
    expect(ci.kneeFlexLeft.ci95Upper).toBeNull();
    expect(ci.kneeFlexLeft.se).toBeNull();
    expect(ci.kneeFlexLeft.splitHalfDiff).toBeNull();

    const sagittalFrames = generateSyntheticWalkingFrames({ viewAngle: "sagittal", fps: 30, durationSec: 6.0 });
    const metricsSag = computeGaitMetrics(sagittalFrames);
    const ciSag = metricsSag.confidenceIntervals!;

    // Lateral sway is frontal-only -> under sagittal view, value and CI bounds must be null
    expect(metricsSag.lateralSway).toBeNull();
    expect(ciSag.lateralSway.value).toBeNull();
    expect(ciSag.lateralSway.ci95Lower).toBeNull();
    expect(ciSag.lateralSway.ci95Upper).toBeNull();
  });

  it("7. Odd Frame Counts: split-half calculations handle odd frame counts (e.g. 11, 15, 31) without errors", () => {
    const oddCounts = [11, 15, 25, 31, 45, 61];

    for (const count of oddCounts) {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 }).slice(0, count);
      const metrics = computeGaitMetrics(frames);

      expect(metrics.confidenceIntervals).toBeDefined();
      const cadenceCI = metrics.confidenceIntervals?.cadenceSpm;
      expect(cadenceCI).toBeDefined();
      expect(typeof cadenceCI?.value).toBe("number");
      expect(typeof cadenceCI?.ci95Lower).toBe("number");
      expect(typeof cadenceCI?.ci95Upper).toBe("number");
      expect(isNaN(cadenceCI?.ci95Lower as number)).toBe(false);
      expect(isNaN(cadenceCI?.ci95Upper as number)).toBe(false);
    }
  });

  it("8. Stationary Clips: handles zero-motion stationary pose sequences safely", () => {
    const stationaryFrames = generateStationaryPoseFrames(30, 4.0);
    const metrics = computeGaitMetrics(stationaryFrames);

    expect(metrics.confidenceIntervals).toBeDefined();
    const ci = metrics.confidenceIntervals?.cadenceSpm;
    expect(ci).toBeDefined();
    expect(ci?.value).toBe(0);
    expect(ci?.ci95Lower).toBe(0);
    expect(ci?.ci95Upper).toBe(0);
  });
});
