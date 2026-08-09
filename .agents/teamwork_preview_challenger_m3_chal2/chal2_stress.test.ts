import { describe, it, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
  linearDetrend,
  computeFFTHarmonics,
} from "../../src/lib/gait/signal";
import { detectGaitEventsZeni } from "../../src/lib/gait/events";
import { symmetryAngle, gaitSymmetryIndex } from "../../src/lib/gait/symmetry";
import { computeHarmonicRatio } from "../../src/lib/gait/smoothness";
import { calculateDTE } from "../../src/lib/gait/dte";
import {
  detectViewAngle,
  computeGaitMetrics,
  matchPeople,
  trackPriorityScore,
  tracksToPeople,
  type PersonTrack,
} from "../../src/lib/gait/analysis";
import { buildStructuredReport, bandTone } from "../../src/lib/gait/ratings";
import { buildEducatedGuesses, DETERMINATION_LADDER } from "../../src/lib/gait/guesses";
import { createMockMetrics, generateSyntheticWalkingFrames } from "../../src/lib/gait/__tests__/testHelpers";
import type { PoseFrame, Landmark } from "../../src/lib/gait/types";

describe("Challenger 2 Empirical Stress & Adversarial Test Suite", () => {
  describe("Signal Processing Extremes", () => {
    it("handles fps = 0, negative fps, NaN fps gracefully", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(butterworthLowPass(data, 0, 6.0)).toEqual(data);
      expect(butterworthLowPass(data, -30, 6.0)).toEqual(data);
      expect(butterworthLowPass(data, NaN, 6.0)).toEqual(data);
      expect(zeroPhaseButterworth(data, 0, 6.0)).toEqual(data);
      expect(zeroPhaseButterworth(data, -30, 6.0)).toEqual(data);
      expect(zeroPhaseButterworth(data, NaN, 6.0)).toEqual(data);
    });

    it("handles zero and negative cutoff frequencies", () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const res0 = zeroPhaseButterworth(data, 30, 0);
      expect(res0.length).toBe(10);
      expect(res0.every((v) => Number.isFinite(v))).toBe(true);

      const resNeg = zeroPhaseButterworth(data, 30, -5);
      expect(resNeg.length).toBe(10);
      expect(resNeg.every((v) => Number.isFinite(v))).toBe(true);
    });

    it("handles arrays with NaN and Infinity without throwing", () => {
      const dataWithNaN = [1, 2, NaN, 4, 5, 6, 7, 8];
      expect(() => butterworthLowPass(dataWithNaN, 30, 6)).not.toThrow();
      expect(() => zeroPhaseButterworth(dataWithNaN, 30, 6)).not.toThrow();
      expect(() => linearDetrend(dataWithNaN)).not.toThrow();
      expect(() => computeFFTHarmonics(dataWithNaN)).not.toThrow();

      const dataWithInf = [1, 2, Infinity, -Infinity, 5, 6, 7, 8];
      expect(() => butterworthLowPass(dataWithInf, 30, 6)).not.toThrow();
      expect(() => zeroPhaseButterworth(dataWithInf, 30, 6)).not.toThrow();
      expect(() => linearDetrend(dataWithInf)).not.toThrow();
    });

    it("linearDetrend handles extreme numbers (1e300, -1e300)", () => {
      const extremeData = [1e300, 2e300, 3e300];
      const { detrended, trend } = linearDetrend(extremeData);
      expect(detrended.length).toBe(3);
      expect(typeof trend(0)).toBe("number");
    });
  });

  describe("Event Detection Extremes", () => {
    it("handles missing landmarks and corrupt frame structures", () => {
      const emptyLandmarkFrames: PoseFrame[] = [
        { timeMs: 0, landmarks: [] },
        { timeMs: 33, landmarks: [] },
        { timeMs: 66, landmarks: [] },
      ];
      const res = detectGaitEventsZeni(emptyLandmarkFrames, 30);
      expect(res.leftStancePct).toBe(60.0);
      expect(res.rightStancePct).toBe(60.0);
      expect(res.stepEvents).toEqual([]);
    });

    it("handles NaN coordinates in landmarks without crashing", () => {
      const nanLandmarkFrames: PoseFrame[] = Array.from({ length: 20 }, (_, i) => ({
        timeMs: i * 33.3,
        landmarks: Array.from({ length: 33 }, () => ({ x: NaN, y: NaN, z: NaN, visibility: NaN })),
      }));
      expect(() => detectGaitEventsZeni(nanLandmarkFrames, 30)).not.toThrow();
      const res = detectGaitEventsZeni(nanLandmarkFrames, 30);
      expect(res.leftStancePct).toBe(60.0);
    });

    it("handles unordered / negative timestamps", () => {
      const chaoticFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0 });
      chaoticFrames.forEach((f, idx) => {
        f.timeMs = (100 - idx) * 33.3; // Reversed timeMs
      });
      expect(() => detectGaitEventsZeni(chaoticFrames, 30)).not.toThrow();
    });
  });

  describe("Symmetry Extremes", () => {
    it("symmetryAngle returns finite values within [0, 50] for invalid/extreme inputs", () => {
      expect(symmetryAngle(0, 0)).toBe(0.0);
      expect(symmetryAngle(NaN, 10)).toBe(0.0);
      expect(symmetryAngle(10, NaN)).toBe(0.0);
      expect(symmetryAngle(Infinity, 10)).toBe(50.0);
      expect(symmetryAngle(10, Infinity)).toBe(50.0);
      expect(symmetryAngle(1e-12, 1e-12)).toBe(0.0);
      expect(symmetryAngle(1e300, 1e300)).toBe(0.0);
      expect(symmetryAngle(-1e300, 1e300)).toBe(0.0);
    });

    it("gaitSymmetryIndex handles invalid/extreme inputs safely", () => {
      expect(gaitSymmetryIndex(0, 0)).toBe(100.0);
      expect(gaitSymmetryIndex(NaN, 10)).toBe(100.0);
      expect(gaitSymmetryIndex(Infinity, 10)).toBe(0.0);
      expect(gaitSymmetryIndex(10, Infinity)).toBe(0.0);
      expect(gaitSymmetryIndex(-5, -10)).toBe(50.0);
    });
  });

  describe("Smoothness & Harmonic Ratio Mismatch & Extremes", () => {
    it("handles length mismatch between hipY and hipX", () => {
      const hipY = new Array(50).fill(0.5);
      const hipX = new Array(10).fill(0.5);
      expect(() => computeHarmonicRatio(hipY, hipX, 30)).not.toThrow();
      const res = computeHarmonicRatio(hipY, hipX, 30);
      expect(res.overallHR).toBeGreaterThanOrEqual(0.1);
    });

    it("handles NaN/Infinity elements in hip trajectories", () => {
      const hipY = [0.5, NaN, Infinity, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      const hipX = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      expect(() => computeHarmonicRatio(hipY, hipX, 30)).not.toThrow();
    });
  });

  describe("Dual-Task Effect Extremes", () => {
    it("handles NaN or infinite metrics in DTE calculation", () => {
      const baseline = createMockMetrics({ cadenceSpm: NaN, stepTimeCV: Infinity });
      const dualTask = createMockMetrics({ cadenceSpm: 100, stepTimeCV: 0.05 });
      expect(() => calculateDTE(baseline, dualTask)).not.toThrow();
      const res = calculateDTE(baseline, dualTask);
      expect(typeof res.cmiClassification).toBe("string");
    });
  });

  describe("Analysis Engine Pipeline Robustness", () => {
    it("computeGaitMetrics handles frames with 0 duration or single frame", () => {
      const singleFrame: PoseFrame[] = [
        {
          timeMs: 0,
          landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })),
        },
      ];
      const metrics = computeGaitMetrics(singleFrame);
      expect(metrics.stepCount).toBe(0);
      expect(metrics.overallScore).toBe(0);
    });

    it("matchPeople handles 50 simultaneous detections cleanly", () => {
      const detections: Landmark[][] = Array.from({ length: 50 }, (_, d) =>
        Array.from({ length: 33 }, () => ({ x: 0.1 * (d % 10), y: 0.1 * Math.floor(d / 10), z: 0, visibility: 0.9 }))
      );
      const tracks: PersonTrack[] = [];
      const nextId = { value: 1 };
      const assigned = matchPeople(detections, tracks, nextId);
      expect(assigned.length).toBe(50);
      expect(tracks.length).toBe(50);
      expect(nextId.value).toBe(51);
    });
  });

  describe("Clinical Ratings & String Safety Edge Cases", () => {
    it("clamps domain scores within [0, 100] even with extreme metric inputs", () => {
      const extremeMetrics = createMockMetrics({
        overallScore: 9999,
        stabilityScore: -500,
        symmetryScore: NaN,
        rhythmScore: Infinity,
      });

      const report = buildStructuredReport(extremeMetrics, [], { taskMode: "single", analyzedFrames: 100 });
      for (const d of report.domains) {
        expect(d.score).toBeGreaterThanOrEqual(0);
        expect(d.score).toBeLessThanOrEqual(100);
        expect(d.stars).toBeGreaterThanOrEqual(1);
        expect(d.stars).toBeLessThanOrEqual(5);
        expect(Number.isNaN(d.score)).toBe(false);
      }
    });

    it("buildEducatedGuesses guarantees string safety against undefined, NaN, null", () => {
      const corruptMetrics = createMockMetrics({
        symmetryAngle: NaN,
        harmonicRatio: NaN,
        leftStancePct: NaN,
        rightStancePct: NaN,
        cadenceSpm: NaN,
        stepTimeCV: NaN,
      });

      const guesses = buildEducatedGuesses(corruptMetrics);
      for (const g of guesses) {
        expect(g.title).not.toContain("NaN");
        expect(g.title).not.toContain("undefined");
        expect(g.title).not.toContain("null");
        expect(g.summary).not.toContain("NaN");
        expect(g.summary).not.toContain("undefined");
        expect(g.summary).not.toContain("null");
      }
    });
  });
});
