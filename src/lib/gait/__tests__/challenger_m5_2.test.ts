import { describe, it, expect } from "vitest";
import { findExtrema, detectGaitEventsZeni } from "../events";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Challenger 2 Empirical Stress Test Suite (M5: R1 & R5)", () => {
  describe("1. Peak Prominence & findExtrema Boundary Conditions", () => {
    it("returns empty array for flat signals (all zeros or constant value)", () => {
      expect(findExtrema([0, 0, 0, 0, 0], "max", 3)).toEqual([]);
      expect(findExtrema([5, 5, 5, 5, 5], "max", 3)).toEqual([]);
      expect(findExtrema([0, 0, 0, 0, 0], "min", 3)).toEqual([]);
      expect(findExtrema([5, 5, 5, 5, 5], "min", 3)).toEqual([]);
    });

    it("returns empty array for strictly monotonic signals", () => {
      expect(findExtrema([1, 2, 3, 4, 5, 6, 7], "max", 3)).toEqual([]);
      expect(findExtrema([7, 6, 5, 4, 3, 2, 1], "max", 3)).toEqual([]);
      expect(findExtrema([1, 2, 3, 4, 5, 6, 7], "min", 3)).toEqual([]);
      expect(findExtrema([7, 6, 5, 4, 3, 2, 1], "min", 3)).toEqual([]);
    });

    it("correctly identifies a single clear peak or trough", () => {
      const peakSignal = [0, 0.1, 0.5, 1.0, 0.5, 0.1, 0];
      expect(findExtrema(peakSignal, "max", 2)).toEqual([3]);

      const troughSignal = [1.0, 0.9, 0.5, 0.0, 0.5, 0.9, 1.0];
      expect(findExtrema(troughSignal, "min", 2)).toEqual([3]);
    });

    it("handles plateau peaks cleanly without duplicating indices", () => {
      const plateauSignal = [0, 1, 2, 2, 2, 1, 0];
      const maxIdx = findExtrema(plateauSignal, "max", 2);
      expect(maxIdx.length).toBe(1);
      expect(maxIdx[0]).toBe(2);
    });

    it("returns empty array for short signals (length < 3)", () => {
      expect(findExtrema([], "max", 3)).toEqual([]);
      expect(findExtrema([1], "max", 3)).toEqual([]);
      expect(findExtrema([1, 2], "max", 3)).toEqual([]);
    });

    it("suppresses low-amplitude micro-oscillations superimposed on true peaks", () => {
      // True peaks at i=5 (amp 1.0) and i=20 (amp 1.0)
      // Micro ripples at i=10 (amp 0.03) and i=15 (amp 0.04)
      const signal = new Array(26).fill(0);
      signal[5] = 1.0;
      signal[10] = 0.03;
      signal[15] = 0.04;
      signal[20] = 1.0;

      // Dynamic sigRange = 1.0 -> minProminence = max(0.01, 0.15 * 1.0) = 0.15
      const extrema = findExtrema(signal, "max", 3);
      expect(extrema).toEqual([5, 20]); // micro ripples suppressed
    });

    it("allows userMinProminence to override dynamic threshold", () => {
      const signal = new Array(26).fill(0);
      signal[5] = 1.0;
      signal[10] = 0.03;
      signal[15] = 0.04;
      signal[20] = 1.0;

      // Passing explicit userMinProminence = 0.001 should detect micro ripples
      const allPeaks = findExtrema(signal, "max", 3, 0.001);
      expect(allPeaks).toEqual([5, 10, 15, 20]);

      // Passing explicit userMinProminence = 0.5 should keep only full peaks
      const largePeaks = findExtrema(signal, "max", 3, 0.5);
      expect(largePeaks).toEqual([5, 20]);
    });

    it("evaluates alternating amplitude steps (pathological gait asymmetry)", () => {
      // Moderate asymmetry: peak 1 = 1.0, peak 2 = 0.25 (ratio 4:1)
      const moderateAsym = new Array(30).fill(0);
      moderateAsym[5] = 1.0;
      moderateAsym[15] = 0.25;
      moderateAsym[25] = 1.0;

      // Range = 1.0, dynamic minProminence = 0.15. 0.25 >= 0.15 -> retained!
      const modPeaks = findExtrema(moderateAsym, "max", 3);
      expect(modPeaks).toEqual([5, 15, 25]);

      // Extreme asymmetry: peak 1 = 1.0, peak 2 = 0.10 (ratio 10:1)
      const extremeAsym = new Array(30).fill(0);
      extremeAsym[5] = 1.0;
      extremeAsym[15] = 0.10;
      extremeAsym[25] = 1.0;

      // Range = 1.0, dynamic minProminence = 0.15. 0.10 < 0.15 -> filtered out!
      const extPeaks = findExtrema(extremeAsym, "max", 3);
      expect(extPeaks).toEqual([5, 25]);

      // Verifies that userMinProminence can recover extreme pathological peaks if needed
      const recoveredPeaks = findExtrema(extremeAsym, "max", 3, 0.05);
      expect(recoveredPeaks).toEqual([5, 15, 25]);
    });

    it("selects the peak with highest prominence within minGap cluster", () => {
      // Clustered peaks at i=10 (prom 0.4), i=12 (prom 0.9), i=14 (prom 0.3) with minGap = 5
      const signal = new Array(25).fill(0);
      signal[10] = 0.4;
      signal[12] = 0.9;
      signal[14] = 0.3;

      const peaks = findExtrema(signal, "max", 5);
      expect(peaks).toEqual([12]); // Peak with highest prominence selected
    });
  });

  describe("2. Follow-Cam Direction Inference & Fallback Stress Testing", () => {
    it("correctly infers L->R direction (+1) in follow-cam with net hip displacement near zero", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        direction: 1,
        followCam: true,
      });

      const result = detectGaitEventsZeni(frames, 30);
      expect(result.inferredDirection).toBe(1);
    });

    it("correctly infers R->L direction (-1) in follow-cam with net hip displacement near zero", () => {
      const frames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        direction: -1,
        followCam: true,
      });

      const result = detectGaitEventsZeni(frames, 30);
      expect(result.inferredDirection).toBe(-1);
    });

    it("falls back to mid-hip displacement when foot landmark sample count is insufficient (< 5)", () => {
      const baseFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        direction: -1,
      });

      // Set visibility < 0.4 on all but 3 foot landmarks (producing 3 valid samples < 5 threshold)
      let validCount = 0;
      const sparseFrames: PoseFrame[] = baseFrames.map((f) => ({
        timeMs: f.timeMs,
        landmarks: f.landmarks.map((lm, idx) => {
          if (idx >= 29 && idx <= 32) {
            validCount++;
            return { ...lm, visibility: validCount <= 3 ? 0.9 : 0.1 };
          }
          return lm;
        }),
      }));

      const result = detectGaitEventsZeni(sparseFrames, 30);
      // Because direction = -1 in synthetic generator, net hip displacement is < -0.05
      // Fallback evaluates totalDisplacement < -0.05 -> -1
      expect(result.inferredDirection).toBe(-1);
    });

    it("falls back to mid-hip displacement when median foot difference is near zero (|medianFootDiff| <= 0.005, e.g. frontal view)", () => {
      const baseFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        direction: -1,
      });

      // Align toe and heel X coordinates to simulate strict frontal camera view
      const frontalFrames: PoseFrame[] = baseFrames.map((f) => ({
        timeMs: f.timeMs,
        landmarks: f.landmarks.map((lm, idx) => {
          if (idx === 31 || idx === 32) {
            // Set toe X equal to heel X
            const heelLm = f.landmarks[idx - 2]; // 29 or 30
            return { ...lm, x: heelLm ? heelLm.x : lm.x };
          }
          return lm;
        }),
      }));

      const result = detectGaitEventsZeni(frontalFrames, 30);
      // medianFootDiff = 0 <= 0.005 -> falls back to net hip displacement
      // net hip displacement for direction -1 is < -0.05 -> inferredDirection = -1
      expect(result.inferredDirection).toBe(-1);
    });

    it("is robust against outlier foot landmark noise (e.g. tracking glitch on single frame)", () => {
      const baseFrames = generateSyntheticWalkingFrames({
        fps: 30,
        durationSec: 3.0,
        direction: 1,
        followCam: true,
      });

      // Inject extreme tracking glitch on frame 10 (toe.x - heel.x = -5.0)
      const glitchedFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        if (idx === 10) {
          return {
            timeMs: f.timeMs,
            landmarks: f.landmarks.map((lm, lmIdx) => {
              if (lmIdx === 31) return { ...lm, x: lm.x - 5.0, visibility: 0.95 };
              return lm;
            }),
          };
        }
        return f;
      });

      const result = detectGaitEventsZeni(glitchedFrames, 30);
      // Median filtering ignores single-frame outlier glitch!
      expect(result.inferredDirection).toBe(1);
    });
  });
});
