import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni, refinePeakTimestamp } from "../events";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame } from "../types";

describe("Kinematic Gait Event Detection (events.ts)", () => {
  it("detects heel strike and toe off events from left-to-right walking frames", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: 1,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
    expect(result.rightSwingPct + result.rightStancePct).toBeCloseTo(100, 1);
    expect(result.doubleSupportPct).toBeGreaterThan(0);
  });

  it("detects events correctly for right-to-left walking frames (direction = -1)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: -1,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
    expect(result.rightSwingPct + result.rightStancePct).toBeCloseTo(100, 1);
  });

  it("falls back to ANKLE landmarks when HEEL/FOOT visibility is low (< 0.3)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      lowVisibilityLandmarks: true,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThan(0);
    expect(result.rightStancePct).toBeGreaterThan(0);
  });

  it("captures asymmetric stance and swing phase percentages", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 4.0,
      asymmetryFactor: 1.3,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
  });

  it("calculates double support percentage within valid physiological bounds [5%, 45%]", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 60,
      durationSec: 3.0,
    });

    const result = detectGaitEventsZeni(frames, 60);

    expect(result.doubleSupportPct).toBeGreaterThanOrEqual(5.0);
    expect(result.doubleSupportPct).toBeLessThanOrEqual(45.0);
  });

  it("returns default phase breakdown when frame count n < 10", () => {
    const shortFrames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 0.25, // ~7 frames
    });

    const result = detectGaitEventsZeni(shortFrames, 30);

    expect(result.leftStancePct).toBe(60.0);
    expect(result.rightStancePct).toBe(60.0);
    expect(result.leftSwingPct).toBe(40.0);
    expect(result.rightSwingPct).toBe(40.0);
    expect(result.doubleSupportPct).toBe(20.0);
    expect(result.stepEvents).toEqual([]);
  });

  it("falls back to frame index / effectiveFps when timeMs is missing", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
    });

    // Strip timeMs from frames
    const noTimeMsFrames: PoseFrame[] = frames.map((f) => ({
      timeMs: 0,
      landmarks: f.landmarks,
    }));

    const result = detectGaitEventsZeni(noTimeMsFrames, 30);
    expect(result.leftStancePct).toBeGreaterThan(0);
  });

  it("correctly infers L->R direction and calculates stance phase in follow-cam shots (followCam = true, direction = 1)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: 1,
      followCam: true,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.inferredDirection).toBe(1);
    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
    expect(result.rightStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
  });

  it("correctly infers R->L direction and calculates stance phase in follow-cam shots (followCam = true, direction = -1)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: -1,
      followCam: true,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.inferredDirection).toBe(-1);
    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
    expect(result.rightStancePct).toBeGreaterThanOrEqual(40);
    expect(result.rightStancePct).toBeLessThanOrEqual(80);
    expect(result.leftSwingPct + result.leftStancePct).toBeCloseTo(100, 1);
  });

  it("falls back to mid-hip displacement when foot landmark visibility is low (< 0.4)", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      direction: -1,
      lowVisibilityLandmarks: true, // sets foot/heel visibility to 0.1
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.inferredDirection).toBe(-1);
    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
  });

  it("suppresses low-amplitude noise ripples using dynamic peak prominence filtering", () => {
    const frames = generateSyntheticWalkingFrames({
      fps: 30,
      durationSec: 3.0,
      noiseLevel: 0.04,
    });

    const result = detectGaitEventsZeni(frames, 30);

    expect(result.stepEvents.length).toBeGreaterThan(0);
    expect(result.leftStancePct).toBeGreaterThanOrEqual(40);
    expect(result.leftStancePct).toBeLessThanOrEqual(80);
  });

  describe("Parabolic Subframe Timestamp Refinement (refinePeakTimestamp)", () => {
    it("achieves < 3 ms timing precision for subframe parabolic peaks at 30 Hz", () => {
      const fps = 30;
      const dt = 1 / fps; // ~0.03333 s

      // True peak at t* = 1.0025s (offset +2.5 ms relative to frame 30 at t = 1.000s)
      const truePeakSec = 1.0025;
      const frameTimes = [1.0 - dt, 1.0, 1.0 + dt];
      const peakIdx = 1;
      const frameTimeSec = frameTimes[peakIdx];

      // Quadratic signal y(t) = 100 - 500 * (t - truePeakSec)^2
      const signal = frameTimes.map((t) => 100 - 500 * Math.pow(t - truePeakSec, 2));

      const refinedSec = refinePeakTimestamp(signal, peakIdx, frameTimeSec, fps);

      expect(Math.abs(refinedSec - truePeakSec)).toBeLessThan(0.003); // < 3 ms precision
    });

    it("accurately refines negative subframe peak offsets (-5 ms offset at 30 Hz)", () => {
      const fps = 30;
      const dt = 1 / fps;
      const truePeakSec = 0.995; // -5 ms offset from t = 1.000s
      const frameTimes = [1.0 - dt, 1.0, 1.0 + dt];
      const peakIdx = 1;

      const signal = frameTimes.map((t) => 50 - 200 * Math.pow(t - truePeakSec, 2));
      const refinedSec = refinePeakTimestamp(signal, peakIdx, 1.0, fps);

      expect(Math.abs(refinedSec - truePeakSec)).toBeLessThan(0.003);
    });

    it("handles signal boundaries and flat signals safely without crashing", () => {
      const fps = 30;
      const signal = [5, 5, 5];

      // Index 0 boundary
      expect(refinePeakTimestamp(signal, 0, 0.0, fps)).toBe(0.0);
      // Index N-1 boundary
      expect(refinePeakTimestamp(signal, 2, 2.0, fps)).toBe(2.0);
      // Flat signal (zero curvature / denominator < 1e-9)
      expect(refinePeakTimestamp(signal, 1, 1.0, fps)).toBe(1.0);
      // Invalid FPS
      expect(refinePeakTimestamp([1, 10, 1], 1, 1.0, 0)).toBe(1.0);
    });

    it("refines gait event timestamps in detectGaitEventsZeni beyond coarse 33 ms grid", () => {
      const fps = 30;
      const dt = 1 / fps;
      const frames = generateSyntheticWalkingFrames({
        fps,
        durationSec: 3.0,
      });

      const result = detectGaitEventsZeni(frames, fps);
      expect(result.stepEvents.length).toBeGreaterThan(0);

      // Check that at least some event timestamps have subframe offsets (differing from exact frame index / 30)
      let subframeCorrectionCount = 0;
      for (const event of result.stepEvents) {
        const gridTime = event.frame / fps;
        const diff = Math.abs(event.timeSec - gridTime);
        if (diff > 1e-5 && diff < dt / 2) {
          subframeCorrectionCount++;
        }
      }
      expect(subframeCorrectionCount).toBeGreaterThan(0);
    });
  });
});
