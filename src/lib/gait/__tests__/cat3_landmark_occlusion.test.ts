import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateSyntheticWalkingFrames } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 3: Severe Landmark Occlusion Stress Tests', () => {
  it('handles multi-frame total pose loss (15-45 consecutive frames with zero landmark visibility)', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });

    // Frames 30 through 65 (over 1 second) completely occluded / zero visibility
    const occludedFrames: PoseFrame[] = frames.map((frame, idx) => {
      if (idx >= 30 && idx <= 65) {
        return {
          timeMs: frame.timeMs,
          landmarks: frame.landmarks.map((lm) => ({ ...lm, visibility: 0.0 })),
        };
      }
      return frame;
    });

    const metrics = computeGaitMetrics(occludedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.harmonicRatio)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
    expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
    expect(metrics.overallScore).toBeLessThanOrEqual(100);
  });

  it('handles unilateral leg landmark missingness (e.g. left leg hidden behind near leg or masked)', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // Left knee (25), left ankle (27), left heel (29), left toe (31) visibility set to 0.0
    const unilateralLegOccludedFrames: PoseFrame[] = frames.map((frame) => {
      const copyLandmarks = frame.landmarks.map((lm, idx) => {
        if (idx === 25 || idx === 27 || idx === 29 || idx === 31) {
          return { ...lm, visibility: 0.0 };
        }
        return { ...lm };
      });
      return {
        timeMs: frame.timeMs,
        landmarks: copyLandmarks,
      };
    });

    const metrics = computeGaitMetrics(unilateralLegOccludedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles total torso landmark loss (shoulders 11, 12 and hips 23, 24 visibility = 0)', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // Mask all torso landmarks
    const torsoOccludedFrames: PoseFrame[] = frames.map((frame) => {
      const copyLandmarks = frame.landmarks.map((lm, idx) => {
        if (idx === 11 || idx === 12 || idx === 23 || idx === 24) {
          return { ...lm, visibility: 0.0 };
        }
        return { ...lm };
      });
      return {
        timeMs: frame.timeMs,
        landmarks: copyLandmarks,
      };
    });

    const metrics = computeGaitMetrics(torsoOccludedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });
});
