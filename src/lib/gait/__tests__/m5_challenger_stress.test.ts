import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni } from "../events";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame, Landmark } from "../types";

/**
 * Challenger Stress Test Suite for Milestone 5 (M5: R1 & R5)
 * Empirical stress testing of detectGaitEventsZeni and findExtrema.
 */
describe("M5 Empirical Stress Harness (Challenger)", () => {
  describe("1. Extreme Handheld Follow-Cam Jitter", () => {
    it("correctly infers L->R direction under zero net hip displacement and heavy random camera jitter", () => {
      const fps = 30;
      const durationSec = 4.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
        followCam: true, // net hip progress = 0
      });

      // Inject severe handheld camera shake/jitter to all landmarks
      let cumulativeJitter = 0;
      const jitteryFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        // High frequency random walk camera movement
        cumulativeJitter += (Math.sin(idx * 0.7) * 0.03 + (Math.random() - 0.5) * 0.02);
        const jitteredLM: Landmark[] = f.landmarks.map((lm) => ({
          ...lm,
          x: lm.x + cumulativeJitter,
          y: lm.y + (Math.cos(idx * 0.5) * 0.02),
        }));
        return {
          timeMs: f.timeMs,
          landmarks: jitteredLM,
        };
      });

      const result = detectGaitEventsZeni(jitteryFrames, fps);

      expect(result.inferredDirection).toBe(1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(result.rightStancePct).toBeLessThanOrEqual(80);
      expect(result.leftStancePct + result.leftSwingPct).toBeCloseTo(100, 1);
    });

    it("correctly infers R->L direction when hip drift moves in opposite direction (+X) with follow-cam jitter", () => {
      const fps = 30;
      const durationSec = 4.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: -1,
        followCam: true,
      });

      // Inject false positive camera drift in +X direction (opposite of R->L walking)
      const misleadingDriftFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        const falseDrift = (idx / baseFrames.length) * 0.15; // Hip drifts +0.15 to the right
        const cameraJitter = Math.sin(idx * 1.2) * 0.04;
        const offset = falseDrift + cameraJitter;
        return {
          timeMs: f.timeMs,
          landmarks: f.landmarks.map((lm) => ({
            ...lm,
            x: lm.x + offset,
          })),
        };
      });

      const result = detectGaitEventsZeni(misleadingDriftFrames, fps);

      // Foot orientation difference (toe.x - heel.x < 0) must override false hip drift (+0.15)
      expect(result.inferredDirection).toBe(-1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(result.rightStancePct).toBeLessThanOrEqual(80);
    });

    it("handles heavy sinusoidal camera panning (0.5 Hz, 0.15 amplitude)", () => {
      const fps = 30;
      const durationSec = 5.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
        followCam: true,
      });

      const panFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        const panOffset = 0.15 * Math.sin(2 * Math.PI * 0.5 * (idx / fps));
        return {
          timeMs: f.timeMs,
          landmarks: f.landmarks.map((lm) => ({
            ...lm,
            x: lm.x + panOffset,
          })),
        };
      });

      const result = detectGaitEventsZeni(panFrames, fps);

      expect(result.inferredDirection).toBe(1);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
      expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(result.rightStancePct).toBeLessThanOrEqual(80);
    });
  });

  describe("2. Low Landmark Visibility Conditions", () => {
    it("handles fluctuating visibility where 70% of frames have low visibility (< 0.4)", () => {
      const fps = 30;
      const durationSec = 4.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
        followCam: true,
      });

      // 70% of frames have low visibility on feet, 30% are visible (enough for > 5 valid samples)
      const noisyVisFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        const isVisible = idx % 3 === 0; // every 3rd frame visible
        const vis = isVisible ? 0.85 : 0.15;
        return {
          timeMs: f.timeMs,
          landmarks: f.landmarks.map((lm, lmIdx) => {
            if (lmIdx >= 29 && lmIdx <= 32) {
              return { ...lm, visibility: vis };
            }
            return lm;
          }),
        };
      });

      const result = detectGaitEventsZeni(noisyVisFrames, fps);

      expect(result.inferredDirection).toBe(1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
    });

    it("falls back gracefully when all foot landmarks have low visibility (< 0.4)", () => {
      const fps = 30;
      const durationSec = 3.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: -1, // R->L walking with net displacement < -0.05
        lowVisibilityLandmarks: true, // vis = 0.1
      });

      const result = detectGaitEventsZeni(baseFrames, fps);

      // Falls back to mid-hip displacement
      expect(result.inferredDirection).toBe(-1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    });

    it("survives undefined or zero visibility values without crashing", () => {
      const fps = 30;
      const durationSec = 3.0;
      const baseFrames = generateSyntheticWalkingFrames({ fps, durationSec });

      const corruptVisFrames: PoseFrame[] = baseFrames.map((f, idx) => ({
        timeMs: f.timeMs,
        landmarks: f.landmarks.map((lm, lmIdx) => {
          if (idx % 4 === 0) {
            return { ...lm, visibility: undefined };
          }
          if (idx % 4 === 1) {
            return { ...lm, visibility: 0 };
          }
          return lm;
        }),
      }));

      expect(() => detectGaitEventsZeni(corruptVisFrames, fps)).not.toThrow();
      const result = detectGaitEventsZeni(corruptVisFrames, fps);
      expect(result.leftStancePct).toBeGreaterThan(0);
    });
  });

  describe("3. High Frequency Noise Ripples & Prominence Filtering", () => {
    it("suppresses 15 Hz high-frequency noise ripples (amplitude 0.05) via Butterworth + Prominence", () => {
      const fps = 30;
      const durationSec = 4.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
        followCam: true,
      });

      // Add 15 Hz noise ripple (fc = 6 Hz filter should attenuate, prominence should reject residual)
      const rippleFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        const ripple = 0.05 * Math.sin(2 * Math.PI * 15.0 * (idx / fps));
        return {
          timeMs: f.timeMs,
          landmarks: f.landmarks.map((lm) => ({
            ...lm,
            x: lm.x + ripple,
          })),
        };
      });

      const result = detectGaitEventsZeni(rippleFrames, fps);

      // Verify gait event count remains reasonable (not blown up by 15 Hz noise)
      // For 4 sec walking at 1.6 Hz step rate, expect ~6-10 total step events (IC + TO)
      expect(result.stepEvents.length).toBeGreaterThan(3);
      expect(result.stepEvents.length).toBeLessThan(25);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(45);
      expect(result.leftStancePct).toBeLessThanOrEqual(75);
    });

    it("handles salt-and-pepper outlier spikes (0.10 amplitude on 5% of frames)", () => {
      const fps = 30;
      const durationSec = 4.0;
      const baseFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
      });

      const spikedFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        const isSpike = idx % 20 === 7;
        const spike = isSpike ? 0.10 : 0;
        return {
          timeMs: f.timeMs,
          landmarks: f.landmarks.map((lm) => ({
            ...lm,
            x: lm.x + spike,
          })),
        };
      });

      const result = detectGaitEventsZeni(spikedFrames, fps);

      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
    });
  });

  describe("4. Direction Invariance & Stance Phase Symmetry (~60%)", () => {
    it("yields consistent stance phase (~60%) for both L->R and R->L follow-cam shots", () => {
      const fps = 30;
      const durationSec = 4.0;

      const lrFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: 1,
        followCam: true,
      });

      const rlFrames = generateSyntheticWalkingFrames({
        fps,
        durationSec,
        direction: -1,
        followCam: true,
      });

      const lrResult = detectGaitEventsZeni(lrFrames, fps);
      const rlResult = detectGaitEventsZeni(rlFrames, fps);

      expect(lrResult.inferredDirection).toBe(1);
      expect(rlResult.inferredDirection).toBe(-1);

      // Both should yield left and right stance phase within physiological bounds [40%, 80%]
      expect(lrResult.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(lrResult.leftStancePct).toBeLessThanOrEqual(80);
      expect(lrResult.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(lrResult.rightStancePct).toBeLessThanOrEqual(80);

      expect(rlResult.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(rlResult.leftStancePct).toBeLessThanOrEqual(80);
      expect(rlResult.rightStancePct).toBeGreaterThanOrEqual(40);
      expect(rlResult.rightStancePct).toBeLessThanOrEqual(80);

      // Symmetry comparison between L->R and R->L stance phase percentages (must be virtually identical)
      const stanceDiffLeft = Math.abs(lrResult.leftStancePct - rlResult.leftStancePct);
      const stanceDiffRight = Math.abs(lrResult.rightStancePct - rlResult.rightStancePct);

      expect(stanceDiffLeft).toBeLessThan(1.0); // Less than 1% difference between directions
      expect(stanceDiffRight).toBeLessThan(1.0);
    });
  });

  describe("5. Extreme FPS & Structural Edge Cases", () => {
    it("operates reliably at high frame rate (120 FPS)", () => {
      const fps = 120;
      const durationSec = 3.0;
      const frames = generateSyntheticWalkingFrames({ fps, durationSec, direction: 1, followCam: true });

      const result = detectGaitEventsZeni(frames, fps);
      expect(result.inferredDirection).toBe(1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
    });

    it("operates reliably at low frame rate (10 FPS)", () => {
      const fps = 10;
      const durationSec = 4.0;
      const frames = generateSyntheticWalkingFrames({ fps, durationSec, direction: -1, followCam: true });

      const result = detectGaitEventsZeni(frames, fps);
      expect(result.inferredDirection).toBe(-1);
      expect(result.stepEvents.length).toBeGreaterThan(0);
      expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
      expect(result.leftStancePct).toBeLessThanOrEqual(80);
    });
  });
});
