import { describe, it, expect } from "vitest";
import { computeHarmonicRatio } from "../smoothness";
import { generateSyntheticWalkingFrames } from "./testHelpers";

describe("Trunk Smoothness Module (smoothness.ts)", () => {
  it("computes Harmonic Ratio (HR) for vertical and lateral hip trajectories", () => {
    const fps = 30;
    const frames = generateSyntheticWalkingFrames({ fps, durationSec: 4.0 });
    const hipY = frames.map((f) => f.landmarks[23].y);
    const hipX = frames.map((f) => f.landmarks[23].x);

    const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps);

    expect(hrVertical).toBeGreaterThan(0);
    expect(hrLateral).toBeGreaterThan(0);
    expect(overallHR).toBeGreaterThan(0);
    expect(overallHR).toBeCloseTo(Number(Math.sqrt(hrVertical * hrLateral).toFixed(2)), 2);
  });

  it("handles short or empty signals gracefully with default 1.0 fallback", () => {
    const resShort = computeHarmonicRatio([0.5, 0.6], [0.5, 0.6], 30);
    expect(resShort.hrVertical).toBe(1.0);
    expect(resShort.hrLateral).toBe(1.0);
    expect(resShort.overallHR).toBe(1.0);

    const resEmpty = computeHarmonicRatio([], [], 30);
    expect(resEmpty.hrVertical).toBe(1.0);
    expect(resEmpty.hrLateral).toBe(1.0);
    expect(resEmpty.overallHR).toBe(1.0);

    const res7 = computeHarmonicRatio(new Array(7).fill(0.5), new Array(7).fill(0.5), 30);
    expect(res7.hrVertical).toBe(1.0);
  });

  it("handles invalid fps (<= 0) with default fallback", () => {
    const res = computeHarmonicRatio(new Array(20).fill(0.5), new Array(20).fill(0.5), 0);
    expect(res.hrVertical).toBe(1.0);
    expect(res.hrLateral).toBe(1.0);
    expect(res.overallHR).toBe(1.0);
  });

  it("clamps floor at minimum 0.1 for zero/constant displacement signals", () => {
    const constantY = new Array(32).fill(0.5);
    const constantX = new Array(32).fill(0.5);

    const res = computeHarmonicRatio(constantY, constantX, 30);

    expect(res.hrVertical).toBeGreaterThanOrEqual(0.1);
    expect(res.hrLateral).toBeGreaterThanOrEqual(0.1);
    expect(res.overallHR).toBeGreaterThanOrEqual(0.1);
  });

  it("verifies geometric mean formula relationship", () => {
    const fps = 30;
    const n = 64;
    const hipY = Array.from({ length: n }, (_, i) => 0.5 + 0.05 * Math.sin(i * 0.3));
    const hipX = Array.from({ length: n }, (_, i) => 0.5 + 0.05 * Math.cos(i * 0.15));

    const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps);

    const expectedGeometricMean = Number(Math.sqrt(hrVertical * hrLateral).toFixed(2));
    expect(overallHR).toBe(expectedGeometricMean);
  });
});
