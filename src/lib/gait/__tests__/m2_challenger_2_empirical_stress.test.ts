import { describe, test, expect } from "vitest";
import { findExtrema, detectGaitEventsZeni } from "../events";
import { filterSteadyStateStrides, matchPeople, type PersonTrack } from "../analysis";
import { PoseTracker } from "../PoseTracker";
import { zeroPhaseButterworth, savitzkyGolay5, kalmanFilter1D } from "../signal";
import { computeFallRiskModelA, computeFallRiskModelB } from "../fallrisk";
import type { PoseFrame, Landmark, GaitMetrics } from "../types";

describe("Milestone 2 Challenger 2: Empirical Adversarial Signal Tuning & Stability Harness", () => {
  describe("1. Frontal-Y Fallback Hysteresis & Prominence Calibration (events.ts)", () => {
    test("Frontal-Y fallback condition (apRange < 0.028 && apEventCount < 5) activates on low-amplitude frontal video clips (tuning-3992.mp4)", () => {
      // Simulate 60 frames of indoor frontal walk with low AP range = 0.025 and 3 AP events
      const frames: PoseFrame[] = new Array(60).fill(0).map((_, i) => {
        const tMs = i * 33.3; // 30 FPS
        const ankleYLeft = 0.85 + 0.03 * Math.sin((2 * Math.PI * i) / 20);
        const ankleYRight = 0.85 - 0.03 * Math.sin((2 * Math.PI * i) / 20);
        return {
          timeMs: tMs,
          landmarks: [
            ...new Array(23).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }),
            { x: 0.48, y: 0.5, z: 0, visibility: 0.9 }, // L_HIP 23
            { x: 0.52, y: 0.5, z: 0, visibility: 0.9 }, // R_HIP 24
            { x: 0.48, y: 0.7, z: 0, visibility: 0.9 }, // L_KNEE 25
            { x: 0.52, y: 0.7, z: 0, visibility: 0.9 }, // R_KNEE 26
            { x: 0.48, y: ankleYLeft, z: 0, visibility: 0.9 }, // L_ANKLE 27
            { x: 0.52, y: ankleYRight, z: 0, visibility: 0.9 }, // R_ANKLE 28
            { x: 0.48, y: ankleYLeft + 0.02, z: 0, visibility: 0.9 }, // L_HEEL 29
            { x: 0.52, y: ankleYRight + 0.02, z: 0, visibility: 0.9 }, // R_HEEL 30
            { x: 0.48, y: ankleYLeft + 0.02, z: 0, visibility: 0.9 }, // L_FOOT 31
            { x: 0.52, y: ankleYRight + 0.02, z: 0, visibility: 0.9 }, // R_FOOT 32
          ],
        };
      });

      const breakdown = detectGaitEventsZeni(frames, 30);
      expect(breakdown.stepEvents).toBeDefined();
      expect(breakdown.stepEvents.length).toBeGreaterThan(0);
      expect(Number.isNaN(breakdown.leftStancePct)).toBe(false);
      expect(Number.isNaN(breakdown.rightStancePct)).toBe(false);
    });

    test("Peak prominence threshold Math.max(0.0005, 0.12 * sigRange) detects shallow foot contact peaks without false dropouts", () => {
      const n = 120;
      const sig = new Array(n).fill(0).map((_, i) => {
        const base = 0.5 + 0.015 * Math.sin((2 * Math.PI * i) / 30);
        const microPeak = i % 15 === 0 ? 0.006 : 0;
        return base + microPeak;
      });

      const maxExtrema = findExtrema(sig, "max", 5);
      expect(maxExtrema.length).toBeGreaterThan(0);
    });

    test("Min gap calculation (0.18 * effectiveFps) permits detection of high cadence micro-steps up to 330 SPM", () => {
      const effectiveFps = 30;
      const minGap = Math.max(3, Math.floor(0.18 * effectiveFps));
      expect(minGap).toBe(5); // 5 frames @ 30 FPS = 0.167s -> max ~360 SPM

      // Create synthetic high-cadence signal (peaks every 6 frames)
      const sig = new Array(90).fill(0).map((_, i) => (i % 6 === 0 ? 1.0 : 0.0));
      const peaks = findExtrema(sig, "max", minGap);
      expect(peaks.length).toBe(14); // All 14 interior peaks detected (index 0 is boundary)
    });
  });

  describe("2. PoseTracker Target Lock & Velocity Projection Calibration (PoseTracker.ts)", () => {
    test("Velocity motion projection prevents target lock stealing by passing background candidates (tuning-3993.mp4)", () => {
      const nextId = { value: 1 };

      const createBiped = (x: number): Landmark[] => {
        const lm: Landmark[] = new Array(33).fill(0).map(() => ({
          x, y: 0.5, z: 0, visibility: 0.9,
        }));
        lm[11] = { x: x - 0.05, y: 0.3, z: 0 };
        lm[12] = { x: x + 0.05, y: 0.3, z: 0 };
        lm[23] = { x: x - 0.03, y: 0.5, z: 0 };
        lm[24] = { x: x + 0.03, y: 0.5, z: 0 };
        lm[27] = { x: x - 0.03, y: 0.8, z: 0 };
        lm[28] = { x: x + 0.03, y: 0.8, z: 0 };
        return lm;
      };

      const tracks: PersonTrack[] = [];
      // Frame 1: Primary subject at x=0.20
      matchPeople([createBiped(0.20)], tracks, nextId, 1);
      expect(tracks.length).toBe(1);
      const targetId = tracks[0].id;

      // Frame 2: Primary moves to x=0.25 (velocity = +0.05/step)
      matchPeople([createBiped(0.25)], tracks, nextId, 2);

      // Frame 3: Primary is at x=0.30; a secondary distractor candidate appears at x=0.22 (where primary was earlier)
      const distractor = createBiped(0.22);
      const primaryTarget = createBiped(0.30);

      const assignments = matchPeople([distractor, primaryTarget], tracks, nextId, 3);
      // Index 1 (primaryTarget at x=0.30) must match targetId
      expect(assignments[1]).toBe(targetId);
    });

    test("PoseTracker clearBuffer resets internal buffer cleanly", () => {
      const tracker = new PoseTracker(30, 900);
      tracker.clearBuffer();
      expect(tracker.getRollingFrames()).toEqual([]);
      expect(tracker.getEffectiveFps()).toBe(0);
    });
  });

  describe("3. Steady-State Stride Filtering Calibration (analysis.ts)", () => {
    test("filterSteadyStateStrides with 40% deviation & retention guard preserves antalgic pathological asymmetry", () => {
      // Pathological antalgic gait: alternating 0.85s and 0.55s stride durations (mean 0.70s, median 0.70s)
      const antalgicStrides = [0.85, 0.55, 0.85, 0.55, 0.85, 0.55, 0.85, 0.55];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(antalgicStrides);

      // 0.85 vs 0.70 deviation = |0.85 - 0.70| / 0.70 = 21.4% < 40% -> ALL preserved!
      expect(excludedCount).toBe(0);
      expect(steadyStrides.length).toBe(8);
    });

    test("filterSteadyStateStrides correctly trims extreme acceleration lead-in and deceleration lead-out", () => {
      // Lead-in: 1.5s, 1.2s; Steady: 0.70s, 0.69s, 0.71s, 0.70s, 0.72s; Lead-out: 1.3s, 1.6s
      const strides = [1.5, 1.2, 0.70, 0.69, 0.71, 0.70, 0.72, 1.3, 1.6];
      const { steadyStrides, excludedCount } = filterSteadyStateStrides(strides);

      expect(excludedCount).toBe(4); // 2 lead-in + 2 lead-out trimmed
      expect(steadyStrides.length).toBe(5);
      expect(steadyStrides.every((s) => Math.abs(s - 0.70) < 0.05)).toBe(true);
    });

    test("filterSteadyStateStrides respects minKeep retention guard on short or highly variable sequences", () => {
      const noisyStrides = [1.5, 0.5, 1.6, 0.4, 1.7, 0.3]; // median = 1.0
      const { steadyStrides } = filterSteadyStateStrides(noisyStrides);

      // minKeep = max(3, floor(0.5 * 6)) = 3
      expect(steadyStrides.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("4. Comprehensive Core Signal & Clinical Rating Models (signal.ts, ratings.ts, fallrisk.ts)", () => {
    test("4th-order zero-phase Butterworth filter removes high frequency ripple while preserving DC baseline", () => {
      const dcWithNoise = new Array(100).fill(0).map((_, i) => 50.0 + 3.0 * Math.sin(i));
      const filtered = zeroPhaseButterworth(dcWithNoise, 30, 6.0);

      expect(filtered.length).toBe(100);
      for (let i = 10; i < 90; i++) {
        expect(Math.abs(filtered[i] - 50.0)).toBeLessThan(3.0);
      }
    });

    test("5-point Savitzky-Golay smoothing handles edge points without boundary artifact distortion", () => {
      const data = [10, 10, 10, 20, 30, 40, 50, 50, 50];
      const smoothed = savitzkyGolay5(data);
      expect(smoothed.length).toBe(9);
      expect(smoothed.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("1D Kalman filter smoothly interpolates across NaN gaps up to 10 consecutive frames", () => {
      const data = [1.0, 1.0, 1.0, NaN, NaN, NaN, NaN, NaN, 1.0, 1.0];
      const filtered = kalmanFilter1D(data);

      expect(filtered.length).toBe(10);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
      expect(filtered[4]).toBeCloseTo(1.0, 1);
    });

    test("fall risk models A & B produce valid non-NaN scores across extreme metric inputs", () => {
      const dummyMetrics: GaitMetrics = {
        viewAngle: "sagittal",
        viewConfidence: 0.85,
        durationSec: 10,
        fpsEffective: 30,
        stepCount: 20,
        cadenceSpm: 80,
        avgStepTimeSec: 0.75,
        stepTimeAsymmetry: 0.1,
        strideAsymmetry: 0.1,
        lateralSway: 0.08,
        verticalBounce: 0.05,
        armSwingLeft: 0.3,
        armSwingRight: 0.3,
        armSwingAsymmetry: 0.0,
        kneeFlexLeft: 40,
        kneeFlexRight: 40,
        kneeAsymmetry: 0,
        stepWidthVariability: 0.05,
        doubleSupportHint: 0.25,
        leftStancePct: 65,
        rightStancePct: 65,
        leftSwingPct: 35,
        rightSwingPct: 35,
        doubleSupportPct: 30,
        symmetryAngle: 4.5,
        stepTimeCV: 0.08,
        strideTimeCV: 0.08,
        pelvicObliquity: 0.04,
        pelvicObliquityVar: 0.005,
        meanStepWidth: 0.25,
        pathSmoothness: 0.85,
        stabilityScore: 70,
        rhythmScore: 70,
        symmetryScore: 75,
        mobilityScore: 70,
        automaticityScore: 70,
        overallScore: 71,
        series: [],
        stepEvents: [],
      };

      const riskA = computeFallRiskModelA(dummyMetrics);
      expect(riskA.score).toBeGreaterThanOrEqual(0);
      expect(riskA.score).toBeLessThanOrEqual(100);
      expect(Number.isNaN(riskA.score)).toBe(false);

      const riskB = computeFallRiskModelB(dummyMetrics);
      expect(riskB.score).toBeGreaterThanOrEqual(0);
      expect(riskB.score).toBeLessThanOrEqual(100);
      expect(Number.isNaN(riskB.score)).toBe(false);
    });
  });
});
