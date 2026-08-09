import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateSyntheticWalkingFrames } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 1: Severe Landmark Jitter & Salt-and-Pepper Noise Stress Tests', () => {
  it('handles single-frame coordinate spikes (salt-and-pepper noise) without NaNs or exceptions', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // Inject transient single-frame tracking pops (spikes of +0.55 in coordinates)
    const spikedFrames: PoseFrame[] = frames.map((frame, fIdx) => {
      const copy = {
        timeMs: frame.timeMs,
        landmarks: frame.landmarks.map((lm) => ({ ...lm })),
      };
      if (fIdx === 15 || fIdx === 45 || fIdx === 75) {
        // Left ankle and right heel coordinate pops
        copy.landmarks[27].x += 0.55;
        copy.landmarks[27].y -= 0.40;
        copy.landmarks[30].x -= 0.60;
      }
      return copy;
    });

    const metrics = computeGaitMetrics(spikedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.harmonicRatio)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
    expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
    expect(metrics.overallScore).toBeLessThanOrEqual(100);
  });

  it('handles joint-correlated high-frequency noise targeting specific limb joints', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // High-frequency correlated jitter targeting only left knee (25) and left ankle (27)
    const noisyFrames: PoseFrame[] = frames.map((frame, fIdx) => {
      const copy = {
        timeMs: frame.timeMs,
        landmarks: frame.landmarks.map((lm) => ({ ...lm })),
      };
      const jitter = (fIdx % 2 === 0 ? 1 : -1) * 0.12;
      copy.landmarks[25].x += jitter;
      copy.landmarks[25].y += jitter;
      copy.landmarks[27].x += jitter * 1.5;
      copy.landmarks[27].y += jitter * 1.5;
      return copy;
    });

    const metrics = computeGaitMetrics(noisyFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.stepCount)).toBe(true);
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(metrics.cadenceSpm).toBeGreaterThan(0);
    expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
    expect(metrics.symmetryAngle).toBeLessThanOrEqual(100);
  });

  it('handles out-of-bounds coordinates (x < 0, x > 1, y < 0, y > 1) and NaN/Infinity injection', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.5 });

    const clippedFrames: PoseFrame[] = frames.map((frame, fIdx) => {
      const copy = {
        timeMs: frame.timeMs,
        landmarks: frame.landmarks.map((lm) => ({ ...lm })),
      };

      if (fIdx % 10 === 0) {
        // Out of frame bounds coordinate clipping
        copy.landmarks[27].x = -0.35;
        copy.landmarks[28].x = 1.45;
        copy.landmarks[29].y = -0.20;
        copy.landmarks[30].y = 1.65;
      }

      if (fIdx === 25) {
        // Inject NaN and Infinity
        copy.landmarks[11].x = NaN;
        copy.landmarks[12].y = Infinity;
        copy.landmarks[23].z = -Infinity;
      }

      return copy;
    });

    const metrics = computeGaitMetrics(clippedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.harmonicRatio)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);

    // Verify all numeric properties in GaitMetrics are finite and not NaN
    for (const [_key, val] of Object.entries(metrics)) {
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });
});
