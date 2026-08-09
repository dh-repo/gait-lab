import { describe, it, expect } from "vitest";
import { detectGaitEventsZeni } from "../events";
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
});
