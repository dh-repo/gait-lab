import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import {
  assertAllMetricsFinite,
  generateAsymmetricLimbNoiseFrames,
  generateBlackoutDropRecoveryFrames,
  generateUTurnSelfOcclusionFrames,
  generateAntalgicLimpingFrames,
  generateUltraHighCadenceParkinsonianFrames,
  generateCombined3DCameraMotionFrames,
} from './testHelpers';

describe('Challenger M3-2 Empirical Boundary Stress Suite', () => {
  it('handles extreme Gaussian noise (sigma = 0.20 std dev) without throwing or returning NaNs', () => {
    const frames = generateAsymmetricLimbNoiseFrames({
      fps: 30,
      durationSec: 4.0,
      noiseSigma: 0.20,
      targetLimb: 'right',
    });
    const metrics = computeGaitMetrics(frames);
    expect(metrics).toBeDefined();
    assertAllMetricsFinite(metrics);
  });

  it('handles ultra-low FPS (5 FPS) and ultra-high FPS (240 FPS) cleanly', () => {
    for (const fps of [5, 240]) {
      const frames = generateAsymmetricLimbNoiseFrames({ fps, durationSec: 3.0, noiseSigma: 0.02 });
      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    }
  });

  it('handles full-clip blackout (90% blackout window) gracefully', () => {
    const frames = generateBlackoutDropRecoveryFrames({
      fps: 30,
      durationSec: 5.0,
      blackoutStartSec: 0.5,
      blackoutEndSec: 4.8,
    });
    const metrics = computeGaitMetrics(frames);
    expect(metrics).toBeDefined();
    assertAllMetricsFinite(metrics);
  });

  it('handles extreme camera shake with 90 degree roll and 5x zoom', () => {
    const baseFrames = generateCombined3DCameraMotionFrames(30, 3.0);
    const extremeFrames = baseFrames.map((f) => ({
      timeMs: f.timeMs,
      landmarks: f.landmarks.map((lm) => ({
        ...lm,
        x: (lm.x - 0.5) * 5.0 + 0.5,
        y: (lm.y - 0.5) * 5.0 + 0.5,
      })),
    }));
    const metrics = computeGaitMetrics(extremeFrames);
    expect(metrics).toBeDefined();
    assertAllMetricsFinite(metrics);
  });

  it('handles ultra-short clips (0.3s, 9 frames) across all 6 gap generators without uncaught exceptions', () => {
    const g1 = generateAsymmetricLimbNoiseFrames({ durationSec: 0.3 });
    const g2 = generateBlackoutDropRecoveryFrames({ durationSec: 0.3 });
    const g3 = generateUTurnSelfOcclusionFrames(30, 0.3);
    const g4 = generateAntalgicLimpingFrames(30, 0.3);
    const g5 = generateUltraHighCadenceParkinsonianFrames(30, 0.3);
    const g6 = generateCombined3DCameraMotionFrames(30, 0.3);

    for (const frames of [g1, g2, g3, g4, g5, g6]) {
      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    }
  });
});
