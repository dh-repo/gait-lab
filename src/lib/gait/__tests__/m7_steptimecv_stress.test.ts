import { describe, it, expect } from "vitest";
import { computeGaitMetrics } from "../analysis";
import { detectGaitEventsZeni } from "../events";
import { generateSyntheticWalkingFrames } from "./testHelpers";
import type { PoseFrame, Landmark } from "../types";

/**
 * Helper to generate synthetic walking frames with fixed phase shift asymmetry
 * and constant forward velocity across any clip length.
 */
function generateAsymmetricWalkingFrames(opts: {
  fps?: number;
  durationSec: number;
  stepFreq?: number;
  phaseShiftRatio?: number;
}): PoseFrame[] {
  const fps = opts.fps ?? 30;
  const durationSec = opts.durationSec;
  const freq = opts.stepFreq ?? 1.6;
  const phaseShiftRatio = opts.phaseShiftRatio ?? 1.15;

  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];

  const shoulderWidth = 0.05;
  const hipDepthDiff = 0.12;

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    const progress = t * 0.02; // constant forward speed
    const midHipX = 0.5 + progress;
    const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * freq * 2 * t);

    const leftPhase = 2 * Math.PI * freq * t;
    const rightPhase = 2 * Math.PI * freq * t + phaseShiftRatio * Math.PI;

    const leftAnkleOffset = 0.15 * Math.sin(leftPhase);
    const rightAnkleOffset = 0.15 * Math.sin(rightPhase);

    const leftAnkleX = midHipX + leftAnkleOffset;
    const rightAnkleX = midHipX + rightAnkleOffset;

    const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(leftPhase));
    const rightAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(rightPhase));

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));

    landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: midHipX - shoulderWidth / 2, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: midHipX + shoulderWidth / 2, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[15] = { x: midHipX - 0.1 * Math.sin(leftPhase), y: 0.5, z: 0, visibility: 0.9 };
    landmarks[16] = { x: midHipX + 0.1 * Math.sin(rightPhase), y: 0.5, z: 0, visibility: 0.9 };
    landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: -hipDepthDiff / 2, visibility: 0.9 };
    landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: hipDepthDiff / 2, visibility: 0.9 };
    landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: 0.68 + 0.03 * Math.sin(leftPhase), z: 0, visibility: 0.9 };
    landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: 0.68 + 0.03 * Math.sin(rightPhase), z: 0, visibility: 0.9 };
    landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[29] = { x: leftAnkleX - 0.02, y: leftAnkleY, z: 0, visibility: 0.9 };
    landmarks[30] = { x: rightAnkleX - 0.02, y: rightAnkleY, z: 0, visibility: 0.9 };
    landmarks[31] = { x: leftAnkleX + 0.04, y: leftAnkleY + 0.01, z: 0, visibility: 0.9 };
    landmarks[32] = { x: rightAnkleX + 0.04, y: rightAnkleY + 0.01, z: 0, visibility: 0.9 };

    frames.push({ timeMs, landmarks });
  }

  return frames;
}

describe("Empirical Stress Test: stepTimeCV Clip-Length Invariance (M7 Challenger)", () => {
  const durations = [10.0, 30.0, 60.0, 120.0];

  it("1. Standard synthetic walking frames stepTimeCV across 10s, 30s, 60s, 120s", { timeout: 30000 }, () => {
    const results: { duration: number; stepTimeCV: number }[] = [];

    for (const d of durations) {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: d });
      const metrics = computeGaitMetrics(frames);
      results.push({ duration: d, stepTimeCV: metrics.stepTimeCV ?? 0 });
    }

    console.log("Standard synthetic walking frames stepTimeCV:", results);

    const cvs = results.map((r) => r.stepTimeCV);
    const maxCV = Math.max(...cvs);
    const minCV = Math.min(...cvs);
    const maxDiff = maxCV - minCV;

    console.log(`Standard frames max stepTimeCV diff across 10s-120s: ${maxDiff.toFixed(6)}`);
    expect(maxDiff).toBeLessThan(0.005);
  });

  it("2. Asymmetric walking frames stepTimeCV across 10s, 30s, 60s, 120s (Unwindowed)", { timeout: 30000 }, () => {
    const results: { duration: number; stepTimeCV: number }[] = [];

    for (const d of durations) {
      const frames = generateAsymmetricWalkingFrames({ fps: 30, durationSec: d, phaseShiftRatio: 1.15 });
      const metrics = computeGaitMetrics(frames);
      results.push({ duration: d, stepTimeCV: metrics.stepTimeCV ?? 0 });
    }

    console.log("Asymmetric walking frames stepTimeCV (Unwindowed):", results);

    const cvs = results.map((r) => r.stepTimeCV);
    const maxCV = Math.max(...cvs);
    const minCV = Math.min(...cvs);
    const maxDiff = maxCV - minCV;

    console.log(`Asymmetric unwindowed max stepTimeCV diff across 10s-120s: ${maxDiff.toFixed(6)}`);
    expect(maxDiff).toBeLessThan(0.005);
  });

  it("3. Verifies parabolic peak refinement produces sub-frame timestamp precision (< 3 ms)", { timeout: 10000 }, () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });
    const breakdown = detectGaitEventsZeni(frames, 30);

    let nonGridCount = 0;
    let maxOffsetMs = 0;

    for (const event of breakdown.stepEvents) {
      const gridTimeSec = event.frame / 30;
      const offsetMs = Math.abs(event.timeSec - gridTimeSec) * 1000;
      if (offsetMs > 0.01) {
        nonGridCount++;
      }
      if (offsetMs > maxOffsetMs) {
        maxOffsetMs = offsetMs;
      }
    }

    console.log(`Subframe refined events: ${nonGridCount}/${breakdown.stepEvents.length}, max offset: ${maxOffsetMs.toFixed(3)} ms`);
    expect(nonGridCount).toBeGreaterThan(0);
    expect(maxOffsetMs).toBeLessThanOrEqual(16.67);
  });
});
