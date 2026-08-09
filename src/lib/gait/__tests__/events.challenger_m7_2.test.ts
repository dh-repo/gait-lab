import { describe, it, expect } from "vitest";
import { refinePeakTimestamp, detectGaitEventsZeni } from "../events";
import { computeGaitMetrics } from "../analysis";
import { generateSyntheticWalkingFrames } from "./testHelpers";

describe("Challenger 2 M7 Empirical Stress Testing (refinePeakTimestamp)", () => {

  describe("1. Edge Cases — Boundary Conditions", () => {
    it("handles peakIdx = 0 (left boundary) safely", () => {
      const signal = [10, 8, 6, 4];
      const fps = 30;
      const frameTimeSec = 0.0;
      const res = refinePeakTimestamp(signal, 0, frameTimeSec, fps);
      expect(res).toBe(frameTimeSec);
      expect(Number.isNaN(res)).toBe(false);
    });

    it("handles peakIdx = N - 1 (right boundary) safely", () => {
      const signal = [1, 3, 5, 12];
      const fps = 30;
      const frameTimeSec = 0.1;
      const res = refinePeakTimestamp(signal, signal.length - 1, frameTimeSec, fps);
      expect(res).toBe(frameTimeSec);
      expect(Number.isNaN(res)).toBe(false);
    });

    it("handles invalid inputs (empty array, null, negative FPS, fps = 0)", () => {
      expect(refinePeakTimestamp([], 0, 1.0, 30)).toBe(1.0);
      expect(refinePeakTimestamp(null as any, 1, 1.0, 30)).toBe(1.0);
      expect(refinePeakTimestamp([1, 2, 1], 1, 1.0, 0)).toBe(1.0);
      expect(refinePeakTimestamp([1, 2, 1], 1, 1.0, -30)).toBe(1.0);
    });

    it("handles out-of-bounds peakIdx (negative or >= signal.length)", () => {
      const signal = [1, 5, 2];
      expect(refinePeakTimestamp(signal, -1, 0.5, 30)).toBe(0.5);
      expect(refinePeakTimestamp(signal, 10, 0.5, 30)).toBe(0.5);
    });

    it("handles short signals (N = 1, N = 2) safely", () => {
      expect(refinePeakTimestamp([5], 0, 0.1, 30)).toBe(0.1);
      expect(refinePeakTimestamp([5, 10], 1, 0.2, 30)).toBe(0.2);
    });
  });

  describe("2. Edge Cases — Symmetric Peaks", () => {
    it("returns exact frame time (delta = 0) for perfectly symmetric peaks", () => {
      const fps = 30;
      const frameTimeSec = 1.5;
      
      // Maximum symmetric peak
      const signalMax = [2.5, 10.0, 2.5];
      expect(refinePeakTimestamp(signalMax, 1, frameTimeSec, fps)).toBe(frameTimeSec);

      // Minimum symmetric peak
      const signalMin = [-1.0, -8.5, -1.0];
      expect(refinePeakTimestamp(signalMin, 1, frameTimeSec, fps)).toBe(frameTimeSec);

      // High FPS symmetric peak
      expect(refinePeakTimestamp([0.1, 0.9, 0.1], 1, 0.5, 120)).toBe(0.5);
    });
  });

  describe("3. Edge Cases — Flat Plateaus and Degenerate Curvature", () => {
    it("handles flat plateaus (y_{i-1} = y_i = y_{i+1}) without NaN/Infinity", () => {
      const fps = 30;
      const signal = [5.0, 5.0, 5.0];
      const frameTimeSec = 1.0;

      const res = refinePeakTimestamp(signal, 1, frameTimeSec, fps);
      expect(res).toBe(frameTimeSec);
      expect(Number.isFinite(res)).toBe(true);
    });

    it("handles nearly flat signals near floating-point epsilon (denom < 1e-9)", () => {
      const fps = 30;
      const signal = [1.0000000000001, 1.0000000000000, 1.0000000000001];
      const frameTimeSec = 2.0;

      const res = refinePeakTimestamp(signal, 1, frameTimeSec, fps);
      expect(res).toBe(frameTimeSec);
      expect(Number.isFinite(res)).toBe(true);
    });
  });

  describe("4. Edge Cases — Off-center offset clamping [-0.5, 0.5]", () => {
    it("clamps subframe offset to +0.5 frame when delta > 0.5", () => {
      const fps = 30;
      const dt = 1 / fps;
      const signal = [0, 10, 9.999];
      const frameTimeSec = 1.0;

      const res = refinePeakTimestamp(signal, 1, frameTimeSec, fps);
      expect(res).toBeLessThanOrEqual(frameTimeSec + 0.5 * dt + 1e-9);
      expect(res).toBeGreaterThanOrEqual(frameTimeSec - 0.5 * dt - 1e-9);
    });

    it("clamps subframe offset to -0.5 frame when delta < -0.5", () => {
      const fps = 30;
      const dt = 1 / fps;
      const signal = [9.999, 10, 0];
      const frameTimeSec = 1.0;

      const res = refinePeakTimestamp(signal, 1, frameTimeSec, fps);
      expect(res).toBeGreaterThanOrEqual(frameTimeSec - 0.5 * dt - 1e-9);
      expect(res).toBeLessThanOrEqual(frameTimeSec + 0.5 * dt + 1e-9);
    });
  });

  describe("5. Subframe Timing Precision (< 3 ms timing error)", () => {
    function evaluatePeakRefinementError(opts: {
      fps: number;
      signalType: "parabola" | "sine";
      freqHz?: number;
      offsetsMs: number[];
    }) {
      const fps = opts.fps;
      const dt = 1 / fps;
      const maxErrorsMs: number[] = [];

      for (const offsetMs of opts.offsetsMs) {
        const offsetSec = offsetMs / 1000;
        const truePeakSec = 1.0 + offsetSec;

        const frameTimes = [1.0 - dt, 1.0, 1.0 + dt];
        const peakIdx = 1;
        const frameTimeSec = 1.0;

        let signal: number[];
        if (opts.signalType === "parabola") {
          signal = frameTimes.map((t) => 100 - 500 * Math.pow(t - truePeakSec, 2));
        } else {
          const f = opts.freqHz || 1.5;
          const omega = 2 * Math.PI * f;
          signal = frameTimes.map((t) => Math.cos(omega * (t - truePeakSec)));
        }

        const refinedSec = refinePeakTimestamp(signal, peakIdx, frameTimeSec, fps);
        const errorMs = Math.abs(refinedSec - truePeakSec) * 1000;
        maxErrorsMs.push(errorMs);
      }

      return Math.max(...maxErrorsMs);
    }

    it("confirms EXACT (< 0.001 ms) recovery for continuous pure parabolic peaks at 30 Hz", () => {
      const offsetsMs = [-15, -10, -5, -2, 0, 2, 5, 10, 15];
      const maxErr = evaluatePeakRefinementError({
        fps: 30,
        signalType: "parabola",
        offsetsMs,
      });
      expect(maxErr).toBeLessThan(0.001);
    });

    it("confirms < 3 ms timing error for 1.5 Hz gait sine wave at 30 Hz", () => {
      const offsetsMs = [-15, -12, -8, -4, -1, 0, 1, 4, 8, 12, 15];
      const maxErr = evaluatePeakRefinementError({
        fps: 30,
        signalType: "sine",
        freqHz: 1.5,
        offsetsMs,
      });
      expect(maxErr).toBeLessThan(3.0);
    });

    it("confirms < 3 ms timing error for high-frequency 3.0 Hz gait component at 30 Hz", () => {
      const offsetsMs = [-14, -10, -5, 0, 5, 10, 14];
      const maxErr = evaluatePeakRefinementError({
        fps: 30,
        signalType: "sine",
        freqHz: 3.0,
        offsetsMs,
      });
      expect(maxErr).toBeLessThan(3.0);
    });

    it("confirms < 3 ms timing error across extreme frame rates: 60 Hz and 120 Hz", () => {
      const maxErr60 = evaluatePeakRefinementError({
        fps: 60,
        signalType: "sine",
        freqHz: 2.0,
        offsetsMs: [-7, -4, 0, 4, 7],
      });
      expect(maxErr60).toBeLessThan(3.0);

      const maxErr120 = evaluatePeakRefinementError({
        fps: 120,
        signalType: "sine",
        freqHz: 2.0,
        offsetsMs: [-3.5, -2, 0, 2, 3.5],
      });
      expect(maxErr120).toBeLessThan(3.0);
    });

    it("evaluates performance at low 10 Hz frame rate (dt = 100 ms)", () => {
      const maxErr10Parabola = evaluatePeakRefinementError({
        fps: 10,
        signalType: "parabola",
        offsetsMs: [-40, -20, 0, 20, 40],
      });
      expect(maxErr10Parabola).toBeLessThan(0.001);

      const maxErr10Sine = evaluatePeakRefinementError({
        fps: 10,
        signalType: "sine",
        freqHz: 1.5,
        offsetsMs: [-40, -20, 0, 20, 40],
      });
      expect(maxErr10Sine).toBeLessThan(3.0);
    });
  });

  describe("6. Empirical Stress Testing — Noisy Signals", () => {
    it("evaluates random noise Monte Carlo simulation (1000 iterations)", () => {
      const fps = 30;
      const dt = 1 / fps;
      const N_TRIALS = 1000;
      const errorsMs: number[] = [];

      let seed = 12345;
      function rand() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }
      function randGaussian() {
        const u1 = Math.max(1e-9, rand());
        const u2 = rand();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      }

      const noiseStdDev = 0.002;

      for (let trial = 0; trial < N_TRIALS; trial++) {
        const shiftMs = (rand() - 0.5) * 30;
        const shiftSec = shiftMs / 1000;
        const truePeakSec = 1.0 + shiftSec;

        const t0 = 1.0 - dt;
        const t1 = 1.0;
        const t2 = 1.0 + dt;

        const y0Clean = 1.0 - 50 * Math.pow(t0 - truePeakSec, 2);
        const y1Clean = 1.0 - 50 * Math.pow(t1 - truePeakSec, 2);
        const y2Clean = 1.0 - 50 * Math.pow(t2 - truePeakSec, 2);

        const y0 = y0Clean + randGaussian() * noiseStdDev;
        const y1 = y1Clean + randGaussian() * noiseStdDev;
        const y2 = y2Clean + randGaussian() * noiseStdDev;

        const refinedSec = refinePeakTimestamp([y0, y1, y2], 1, t1, fps);
        const errMs = Math.abs(refinedSec - truePeakSec) * 1000;
        errorsMs.push(errMs);
      }

      errorsMs.sort((a, b) => a - b);
      const medianErr = errorsMs[Math.floor(N_TRIALS * 0.5)];
      const p95Err = errorsMs[Math.floor(N_TRIALS * 0.95)];

      expect(medianErr).toBeLessThan(1.0);
      expect(p95Err).toBeLessThan(3.0);
    });
  });

  describe("7. End-to-End Integration Test across Extreme Frame Rates", () => {
    it("runs detectGaitEventsZeni accurately at 10 Hz, 60 Hz, and 120 Hz", () => {
      for (const fps of [10, 60, 120]) {
        const frames = generateSyntheticWalkingFrames({
          fps,
          durationSec: 4.0,
          direction: 1,
        });

        const result = detectGaitEventsZeni(frames, fps);

        expect(result.stepEvents.length).toBeGreaterThan(0);
        expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
        expect(result.leftStancePct).toBeLessThanOrEqual(80);
        expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);

        for (const event of result.stepEvents) {
          expect(Number.isFinite(event.timeSec)).toBe(true);
        }
      }
    });

    it("attaches true achieved fpsEffective to GaitMetrics", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });
      const metrics = computeGaitMetrics(frames);
      expect(metrics.fpsEffective).toBeCloseTo(30, 0);
    });
  });
});
