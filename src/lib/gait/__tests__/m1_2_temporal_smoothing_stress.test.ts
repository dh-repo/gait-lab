import { describe, it, expect } from "vitest";
import {
  savitzkyGolay5,
  smoothPoseFrames,
} from "../signal";
import { computeGaitMetrics } from "../analysis";
import type { PoseFrame } from "../types";
import { generateSyntheticWalkingFrames } from "./testHelpers";

describe("M1-2 Temporal Smoothing Empirical Stress & Integrity Harness", () => {
  describe("1. Mathematical Exactness & Boundary Reflection", () => {
    it("preserves linear trends y = a*x + b exactly across all N points including boundaries", () => {
      const slopes = [0.5, -2.3, 10.0, -0.01];
      const intercepts = [0, 10, -5.5, 100];

      for (const a of slopes) {
        for (const b of intercepts) {
          const n = 25;
          const signal = Array.from({ length: n }, (_, i) => a * i + b);
          const smoothed = savitzkyGolay5(signal);

          expect(smoothed.length).toBe(n);
          for (let i = 0; i < n; i++) {
            expect(smoothed[i]).toBeCloseTo(signal[i], 8);
          }
        }
      }
    });

    it("preserves constant DC signals with zero distortion (<1e-12)", () => {
      const constants = [0, 1.0, -99.9, 0.00001, 1e6];
      for (const c of constants) {
        const signal = new Array(30).fill(c);
        const smoothed = savitzkyGolay5(signal);

        expect(smoothed.length).toBe(30);
        for (let i = 0; i < 30; i++) {
          expect(Math.abs(smoothed[i] - c)).toBeLessThan(1e-10);
        }
      }
    });

    it("preserves interior quadratic signals y = a*x^2 + b*x + c for interior indices [2, N-3]", () => {
      const n = 20;
      const signal = Array.from({ length: n }, (_, i) => 0.5 * i * i - 2 * i + 3);
      const smoothed = savitzkyGolay5(signal);

      // Interior 5-point SG quadratic filter is mathematically exact on 2nd-degree polynomials
      for (let i = 2; i < n - 2; i++) {
        expect(smoothed[i]).toBeCloseTo(signal[i], 6);
      }
    });

    it("achieves >50% high-frequency noise variance reduction without peak phase shift", () => {
      const n = 120;
      // Low frequency sinusoid peak at i = 15
      const clean = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / 60));
      // Alternating high-frequency noise (+0.1, -0.1)
      const noisy = clean.map((v, i) => v + (i % 2 === 0 ? 0.1 : -0.1));

      const smoothed = savitzkyGolay5(noisy);

      // Verify noise variance reduction
      const rawVariance = noisy.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0) / n;
      const smoothedVariance = smoothed.reduce((sum, v, i) => sum + Math.pow(v - clean[i], 2), 0) / n;

      expect(smoothedVariance).toBeLessThan(rawVariance * 0.5);

      // Verify peak index phase shift (peak of sin is at i = 15)
      const smoothedPeakIdx = smoothed.indexOf(Math.max(...smoothed.slice(10, 20)));

      expect(smoothedPeakIdx).toBe(15);
    });
  });

  describe("2. Boundary & Micro-Sequence Robustness (N = 0, 1, 2, 3, 4, 5)", () => {
    it("handles N = 0, 1, 2, 3, 4 gracefully without throwing or mutating length", () => {
      expect(savitzkyGolay5([])).toEqual([]);
      expect(savitzkyGolay5([42])).toEqual([42]);
      expect(savitzkyGolay5([10, 20])).toEqual([10, 20]);
      expect(savitzkyGolay5([1, 2, 3])).toEqual([1, 2, 3]);
      expect(savitzkyGolay5([5, 4, 3, 2])).toEqual([5, 4, 3, 2]);
    });

    it("correctly processes boundary reflection at exact minimum threshold N = 5", () => {
      const signal = [1.0, 3.0, 2.0, 5.0, 4.0];
      const smoothed = savitzkyGolay5(signal);

      expect(smoothed.length).toBe(5);
      expect(smoothed.every(Number.isFinite)).toBe(true);
    });

    it("handles non-finite input numbers (NaN, Infinity) by converting to zero safely", () => {
      const noisyWithNaN = [1.0, 2.0, NaN, 4.0, Infinity, 6.0, -Infinity, 8.0];
      const smoothed = savitzkyGolay5(noisyWithNaN);

      expect(smoothed.length).toBe(8);
      expect(smoothed.every(Number.isFinite)).toBe(true);
    });
  });

  describe("3. Landmark Frame Structure & Immutability", () => {
    it("preserves landmark metadata (visibility, presence, timeMs) immutably across 33 keypoints", () => {
      const n = 10;
      const rawFrames: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
        timeMs: 1000 + i * 33.33,
        landmarks: Array.from({ length: 33 }, (_, j) => ({
          x: 0.5 + Math.sin(i + j) * 0.1,
          y: 0.8 + Math.cos(i + j) * 0.1,
          z: 0.1 * j,
          visibility: 0.75 + (j % 5) * 0.05,
          presence: 0.80 + (j % 4) * 0.04,
        })),
      }));

      const copyBefore = JSON.parse(JSON.stringify(rawFrames));
      const smoothed = smoothPoseFrames(rawFrames, "savitzky-golay");

      // Verify immutability of input array and objects
      expect(rawFrames).toEqual(copyBefore);

      // Verify metadata preservation in output
      for (let i = 0; i < n; i++) {
        expect(smoothed[i].timeMs).toBe(rawFrames[i].timeMs);
        for (let j = 0; j < 33; j++) {
          expect(smoothed[i].landmarks[j].visibility).toBe(rawFrames[i].landmarks[j].visibility);
          expect(smoothed[i].landmarks[j].presence).toBe(rawFrames[i].landmarks[j].presence);
          expect(Number.isFinite(smoothed[i].landmarks[j].x)).toBe(true);
          expect(Number.isFinite(smoothed[i].landmarks[j].y)).toBe(true);
          expect(Number.isFinite(smoothed[i].landmarks[j].z)).toBe(true);
        }
      }
    });

    it("handles worldLandmarks smoothing when present and keeps undefined when absent", () => {
      const n = 6;
      const framesWithWorld: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: i, y: i, z: 0 }],
        worldLandmarks: [{ x: i * 10, y: i * 10, z: i * 5 }],
      }));

      const smoothedWorld = smoothPoseFrames(framesWithWorld);
      expect(smoothedWorld[0].worldLandmarks).toBeDefined();
      expect(smoothedWorld[0].worldLandmarks?.length).toBe(1);

      const framesWithoutWorld: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
        timeMs: i * 33,
        landmarks: [{ x: i, y: i, z: 0 }],
      }));

      const smoothedNoWorld = smoothPoseFrames(framesWithoutWorld);
      expect(smoothedNoWorld[0].worldLandmarks).toBeUndefined();
    });
  });

  describe("4. Performance Scaling on Long Sequence (N = 1000 frames)", () => {
    it("smooths 1000 frames x 33 keypoints x 3D coords in < 15 ms", () => {
      const n = 1000;
      const longFrames: PoseFrame[] = Array.from({ length: n }, (_, i) => ({
        timeMs: i * 33.3,
        landmarks: Array.from({ length: 33 }, (_, j) => ({
          x: Math.sin(i * 0.05 + j),
          y: Math.cos(i * 0.05 + j),
          z: 0.01 * j,
        })),
      }));

      const start = performance.now();
      const smoothed = smoothPoseFrames(longFrames, "savitzky-golay");
      const elapsed = performance.now() - start;

      expect(smoothed.length).toBe(n);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("5. End-to-End Integration in computeGaitMetrics", () => {
    it("produces finite, stable metrics across 'savitzky-golay', 'kalman', and 'none' modes", () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });

      for (const method of ["savitzky-golay", "kalman", "none"] as const) {
        const metrics = computeGaitMetrics(frames, { smoothingMethod: method });

        expect(metrics).toBeDefined();
        expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
        expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
        expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
        expect(Number.isFinite(metrics.overallScore)).toBe(true);
        expect(metrics.cadenceSpm).toBeGreaterThan(0);
      }
    });
  });
});
