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

  it("returns literature-aligned vertical HR values (~2.5–4.0) for pure symmetric gait", () => {
    const fps = 30;
    const duration = 4.0;
    const n = Math.round(fps * duration);
    const meanStrideSec = 1.25; // f0 = 0.8 Hz

    // Symmetric vertical trajectory driven by 2nd (1.6 Hz) & 4th (3.2 Hz) stride harmonics
    const hipY = Array.from({ length: n }, (_, i) => {
      const t = i / fps;
      return 0.5 + 0.04 * Math.sin(2 * Math.PI * 1.6 * t) + 0.015 * Math.sin(2 * Math.PI * 3.2 * t);
    });

    // Symmetric lateral trajectory driven by 1st (0.8 Hz) & 3rd (2.4 Hz) stride harmonics
    const hipX = Array.from({ length: n }, (_, i) => {
      const t = i / fps;
      return 0.5 + 0.05 * Math.cos(2 * Math.PI * 0.8 * t) + 0.01 * Math.cos(2 * Math.PI * 2.4 * t);
    });

    const { hrVertical, hrLateral, overallHR } = computeHarmonicRatio(hipY, hipX, fps, meanStrideSec);

    // Literature alignment: Vertical HR for symmetric gait is typically between 2.5 and 4.0 (or higher for pure synthetic)
    expect(hrVertical).toBeGreaterThanOrEqual(2.5);
    expect(hrLateral).toBeGreaterThanOrEqual(2.0);
    expect(overallHR).toBeGreaterThanOrEqual(2.2);
  });

  it("demonstrates sensitivity to step asymmetry when odd stride harmonics are present in vertical displacement", () => {
    const fps = 30;
    const duration = 4.0;
    const n = Math.round(fps * duration);
    const meanStrideSec = 1.25; // f0 = 0.8 Hz

    // Symmetric vertical signal
    const symHipY = Array.from({ length: n }, (_, i) => {
      const t = i / fps;
      return 0.5 + 0.04 * Math.sin(2 * Math.PI * 1.6 * t);
    });

    // Asymmetric vertical signal with injected odd stride harmonic (0.8 Hz)
    const asymHipY = Array.from({ length: n }, (_, i) => {
      const t = i / fps;
      return 0.5 + 0.04 * Math.sin(2 * Math.PI * 1.6 * t) + 0.04 * Math.sin(2 * Math.PI * 0.8 * t);
    });

    const hipX = Array.from({ length: n }, (_, i) => {
      const t = i / fps;
      return 0.5 + 0.05 * Math.cos(2 * Math.PI * 0.8 * t);
    });

    const symResult = computeHarmonicRatio(symHipY, hipX, fps, meanStrideSec);
    const asymResult = computeHarmonicRatio(asymHipY, hipX, fps, meanStrideSec);

    expect(asymResult.hrVertical).toBeLessThan(symResult.hrVertical * 0.6);
  });
});
