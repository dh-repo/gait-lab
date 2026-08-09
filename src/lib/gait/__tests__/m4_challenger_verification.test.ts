import { describe, test, expect } from "vitest";
import {
  butterworthLowPass,
  zeroPhaseButterworth,
} from "../signal";
import {
  findExtrema,
  refinePeakTimestamp,
  detectGaitEventsZeni,
} from "../events";
import { symmetryAngle, gaitSymmetryIndex } from "../symmetry";
import { calculateDTE } from "../dte";
import {
  mid,
  dist,
  angleDeg,
  torsoHeight,
  mean,
  std,
  range,
  clamp,
} from "../landmarks";
import {
  detectViewAngle,
  computeGaitMetrics,
  matchPeople,
} from "../analysis";
import { buildStructuredReport } from "../ratings";
import { buildEducatedGuesses } from "../guesses";
import type { PoseFrame, GaitMetrics, Landmark } from "../types";

describe("Milestone M4 Verification 1 - Empirical DSP & Math Stress Harness", () => {
  describe("1. Signal Processing Boundary & Noise Harness", () => {
    test("Zero-length, single-element, and small signals", () => {
      expect(butterworthLowPass([], 30)).toEqual([]);
      expect(zeroPhaseButterworth([], 30)).toEqual([]);
      expect(butterworthLowPass([5], 30)).toEqual([5]);
      expect(zeroPhaseButterworth([5], 30)).toEqual([5]);
      expect(butterworthLowPass([1, 2, 3, 4], 30)).toEqual([1, 2, 3, 4]);
      expect(zeroPhaseButterworth([1, 2, 3, 4], 30)).toEqual([1, 2, 3, 4]);
    });

    test("NaN, Infinity, and non-finite signal inputs", () => {
      const nanSignal = [NaN, 1, 2, NaN, 4, 5, 6, 7, 8, NaN];
      const res1 = butterworthLowPass(nanSignal, 30);
      expect(res1.every((v) => Number.isFinite(v))).toBe(true);

      const res2 = zeroPhaseButterworth(nanSignal, 30);
      expect(res2.every((v) => Number.isFinite(v))).toBe(true);

      const infSignal = [1, Infinity, -Infinity, 4, 5, 6, 7, 8];
      const res3 = zeroPhaseButterworth(infSignal, 30);
      expect(res3.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Extreme sampling rates and cutoff frequencies", () => {
      const sig = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(zeroPhaseButterworth(sig, 0)).toEqual(sig);
      expect(zeroPhaseButterworth(sig, -30)).toEqual(sig);

      // Low fps > 0 runs biquad filter with Nyquist clamping
      const resLowFps = zeroPhaseButterworth(sig, 1e-6);
      expect(resLowFps.length).toBe(10);
      expect(resLowFps.every((v) => Number.isFinite(v))).toBe(true);

      // cutoffHz > Nyquist
      const resNyquist = zeroPhaseButterworth(sig, 30, 100);
      expect(resNyquist.length).toBe(10);
      expect(resNyquist.every((v) => Number.isFinite(v))).toBe(true);
    });

    test("Extreme noise amplitude and high-frequency square wave", () => {
      const noiseSig = new Array(100).fill(0).map((_, i) => (i % 2 === 0 ? 1e12 : -1e12));
      const filtered = zeroPhaseButterworth(noiseSig, 30, 6.0);
      expect(filtered.length).toBe(100);
      expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
      // High frequency square wave should be heavily attenuated
      expect(Math.abs(filtered[50])).toBeLessThan(1e12);
    });

  });

  describe("2. Gait Events & Peak Refinement Boundary Harness", () => {
    test("findExtrema on empty, flat, monotonic, and noisy signals", () => {
      expect(findExtrema([], "max", 3)).toEqual([]);
      expect(findExtrema([1, 2], "max", 3)).toEqual([]);

      // Monotonic increasing
      expect(findExtrema([1, 2, 3, 4, 5], "max", 1)).toEqual([]);

      // Single peak
      const singlePeak = [1, 2, 5, 2, 1];
      expect(findExtrema(singlePeak, "max", 1, 0.1)).toEqual([2]);

      // Flat signal
      const flat = [3, 3, 3, 3, 3];
      expect(findExtrema(flat, "max", 1)).toEqual([]);
    });

    test("refinePeakTimestamp edge cases", () => {
      const sig = [1, 5, 2];
      expect(refinePeakTimestamp(sig, 0, 0, 30)).toBe(0); // boundary idx 0
      expect(refinePeakTimestamp(sig, 2, 0.066, 30)).toBe(0.066); // boundary idx len-1
      expect(refinePeakTimestamp(sig, 1, 0.033, 0)).toBe(0.033); // fps <= 0

      // Symmetric peak -> delta = 0
      const symSig = [2, 5, 2];
      expect(refinePeakTimestamp(symSig, 1, 1.0, 30)).toBeCloseTo(1.0, 5);

      // Asymmetric peak
      const asymSig = [1, 5, 4];
      const tRefined = refinePeakTimestamp(asymSig, 1, 1.0, 30);
      expect(tRefined).toBeGreaterThan(1.0);
      expect(tRefined).toBeLessThanOrEqual(1.0 + 0.5 / 30);
    });

    test("detectGaitEventsZeni boundary conditions", () => {
      expect(detectGaitEventsZeni([], 30).leftStancePct).toBe(60.0);
      expect(detectGaitEventsZeni([], 30).stepEvents).toEqual([]);

      // 5 frames (< 10 threshold)
      const shortFrames: PoseFrame[] = new Array(5).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: [],
      }));
      expect(detectGaitEventsZeni(shortFrames, 30).leftStancePct).toBe(60.0);

      // 15 frames with empty landmarks
      const emptyLmFrames: PoseFrame[] = new Array(15).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: [],
      }));
      const resEmpty = detectGaitEventsZeni(emptyLmFrames, 30);
      expect(resEmpty.leftStancePct).toBe(60.0);
      expect(resEmpty.inferredDirection).toBe(1);

      // 15 frames with NaN landmarks
      const nanLmFrames: PoseFrame[] = new Array(15).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill({ x: NaN, y: NaN, z: NaN }),
      }));
      const resNaN = detectGaitEventsZeni(nanLmFrames, 30);
      expect(resNaN.leftStancePct).toBe(60.0);
    });
  });

  describe("3. Symmetry & Mathematical Formulations Harness", () => {
    test("Zifchock Symmetry Angle (SA) edge cases", () => {
      expect(symmetryAngle(0, 0)).toBe(0.0);
      expect(symmetryAngle(10, 10)).toBe(0.0);
      expect(symmetryAngle(100, 0)).toBe(50.0);
      expect(symmetryAngle(0, 100)).toBe(50.0);
      expect(symmetryAngle(-20, 20)).toBe(0.0);
      expect(symmetryAngle(-50, -50)).toBe(0.0);
      expect(symmetryAngle(1e-15, 1e-15)).toBe(0.0);

      // Verify mathematical ceiling is exactly 50%
      for (let i = 0; i < 1000; i++) {
        const valL = Math.random() * 1e6;
        const valR = Math.random() * 1e6;
        const sa = symmetryAngle(valL, valR);
        expect(sa).toBeGreaterThanOrEqual(0.0);
        expect(sa).toBeLessThanOrEqual(50.0);
        expect(Number.isFinite(sa)).toBe(true);
      }
    });

    test("Gait Symmetry Index (GSI) edge cases", () => {
      expect(gaitSymmetryIndex(0, 0)).toBe(100.0);
      expect(gaitSymmetryIndex(10, 10)).toBe(100.0);
      expect(gaitSymmetryIndex(10, 0)).toBe(0.0);
      expect(gaitSymmetryIndex(0, 10)).toBe(0.0);
      expect(gaitSymmetryIndex(-10, 10)).toBe(100.0);
      expect(gaitSymmetryIndex(-5, 10)).toBe(50.0);
    });
  });

  describe("5. Dual-Task Effect (DTE) Harness", () => {
    const createMetrics = (cadence: number, cv: number, symmetry: number): GaitMetrics => ({
      viewAngle: "sagittal",
      viewConfidence: 0.9,
      durationSec: 10,
      fpsEffective: 30,
      stepCount: 20,
      cadenceSpm: cadence,
      avgStepTimeSec: 0.6,
      stepTimeAsymmetry: 0,
      strideAsymmetry: 0,
      lateralSway: 0.05,
      verticalBounce: 0.05,
      armSwingLeft: 0.2,
      armSwingRight: 0.2,
      armSwingAsymmetry: 0,
      kneeFlexLeft: 60,
      kneeFlexRight: 60,
      kneeAsymmetry: 0,
      stepWidthVariability: 0.02,
      doubleSupportHint: 20,
      leftStancePct: 60,
      rightStancePct: 60,
      leftSwingPct: 40,
      rightSwingPct: 40,
      doubleSupportPct: 20,
      symmetryAngle: 0,
      stepTimeCV: cv,
      strideTimeCV: cv,
      pelvicObliquity: 0.02,
      pelvicObliquityVar: 0.001,
      meanStepWidth: 0.15,
      pathSmoothness: 0.9,
      stabilityScore: 80,
      rhythmScore: 80,
      symmetryScore: symmetry,
      mobilityScore: 80,
      automaticityScore: 80,
      overallScore: 80,
      series: [],
      stepEvents: [],
    });

    test("calculateDTE boundary & zero baseline handling", () => {
      const b = createMetrics(100, 0.05, 80);
      const d = createMetrics(90, 0.07, 72);

      const dte = calculateDTE(b, d);
      expect(dte.cadenceDTE).toBe(-10.0);
      expect(dte.stepTimeCvDTE).toBe(-40.0);
      expect(dte.symmetryDTE).toBe(-10.0);
      expect(dte.cmiClassification).toBe("mutual_interference");

      // Zero baseline
      const zeroB = createMetrics(0, 0, 0);
      const zeroDte = calculateDTE(zeroB, d);
      expect(Number.isFinite(zeroDte.cadenceDTE)).toBe(true);
      expect(Number.isFinite(zeroDte.stepTimeCvDTE)).toBe(true);
      expect(Number.isFinite(zeroDte.symmetryDTE)).toBe(true);
    });
  });

  describe("6. Landmark & Geometry Utilities Harness", () => {
    test("mid, dist, angleDeg, torsoHeight, boundingBox, mean, std, range, clamp", () => {
      expect(mid(null, null)).toEqual({ x: 0.5, y: 0.5, z: 0, visibility: 1 });
      expect(dist(null, null)).toBe(0);

      // angleDeg with collinear points (180 deg)
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 1, y: 0, z: 0 };
      const c = { x: 2, y: 0, z: 0 };
      expect(angleDeg(a, b, c)).toBeCloseTo(180, 5);

      // angleDeg with 90 deg angle
      const d = { x: 1, y: 1, z: 0 };
      expect(angleDeg(a, b, d)).toBeCloseTo(90, 5);

      // angleDeg with null/undefined
      expect(angleDeg(null, b, c)).toBe(180);

      // torsoHeight
      expect(torsoHeight([])).toBe(0.2);

      // mean & std & range
      expect(mean([])).toBe(0);
      expect(std([])).toBe(0);
      expect(std([5])).toBe(0);
      expect(range([])).toBe(0);
      expect(mean([1, NaN, 3])).toBe(2);
      expect(std([1, NaN, 3])).toBeCloseTo(1.0, 5);

      // clamp
      expect(clamp(NaN, 0, 100)).toBe(0);
      expect(clamp(-5, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(50, 0, 100)).toBe(50);
    });
  });

  describe("7. Full Analysis Pipeline & View Angle Detection Harness", () => {
    test("detectViewAngle and computeGaitMetrics with invalid/empty frames", () => {
      expect(detectViewAngle([])).toEqual({ angle: "unknown", confidence: 0.2 });

      const metricsEmpty = computeGaitMetrics([]);
      expect(metricsEmpty.stepCount).toBe(0);
      expect(metricsEmpty.overallScore).toBe(0);

      // Synthetic frames with minimal valid data
      const syntheticFrames: PoseFrame[] = new Array(30).fill(0).map((_, i) => ({
        timeMs: i * 33.3,
        landmarks: new Array(33).fill(0).map(() => ({
          x: 0.5 + 0.05 * Math.sin(i * 0.2),
          y: 0.5 + 0.02 * Math.cos(i * 0.4),
          z: 0,
          visibility: 0.9,
        })),
      }));

      const metricsSynth = computeGaitMetrics(syntheticFrames);
      expect(metricsSynth).toBeDefined();
      expect(Number.isFinite(metricsSynth.overallScore)).toBe(true);
      expect(metricsSynth.series.length).toBe(30);

      // Structured report build
      const report = buildStructuredReport(metricsSynth, buildEducatedGuesses(metricsSynth), {
        taskMode: "single",
        analyzedFrames: 30,
      });
      expect(report.headline).toBeDefined();
      expect(report.domains.length).toBeGreaterThan(0);
    });

    test("matchPeople multi-person tracking robustness", () => {
      const det1: Landmark[][] = [
        new Array(33).fill({ x: 0.2, y: 0.5, z: 0 }),
        new Array(33).fill({ x: 0.8, y: 0.5, z: 0 }),
      ];
      const tracks: any[] = [];
      const nextId = { value: 1 };

      const assigned1 = matchPeople(det1, tracks, nextId);
      expect(assigned1).toEqual([1, 2]);
      expect(tracks.length).toBe(2);

      // Second frame matching
      const det2: Landmark[][] = [
        new Array(33).fill({ x: 0.21, y: 0.51, z: 0 }),
        new Array(33).fill({ x: 0.79, y: 0.49, z: 0 }),
      ];
      const assigned2 = matchPeople(det2, tracks, nextId);
      expect(assigned2).toEqual([1, 2]);
    });
  });
});
