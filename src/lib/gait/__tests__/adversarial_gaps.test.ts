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
  generateSyntheticWalkingFrames,
} from './testHelpers';

describe('Milestone 3: Adversarial Test Coverage for 6 Identified Gap Categories', () => {
  describe('Category 1: Single-Limb Gaussian Landmark Noise (0.01 - 0.05 std dev)', () => {
    it('handles persistent single-limb Gaussian noise across 0.01 to 0.05 std dev without metric corruption', () => {
      const sigmas = [0.01, 0.02, 0.03, 0.04, 0.05];
      for (const sigma of sigmas) {
        const frames = generateAsymmetricLimbNoiseFrames({
          fps: 30,
          durationSec: 4.0,
          noiseSigma: sigma,
          targetLimb: 'right',
        });
        const metrics = computeGaitMetrics(frames);

        expect(metrics).toBeDefined();
        expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
        expect(metrics.cadenceSpm).toBeGreaterThan(0);
        expect(metrics.cadenceSpm).toBeLessThanOrEqual(350);
        expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
        expect(metrics.stepTimeCV).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
        expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
        expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
        expect(metrics.overallScore).toBeLessThanOrEqual(100);
        assertAllMetricsFinite(metrics);
      }
    });
  });

  describe('Category 2: Variable Frame Rate (15 to 120 FPS, 2.5s Blackout & Recovery)', () => {
    it('handles variable frame rate sweeps across 15 to 120 FPS with valid metric bounds', () => {
      const fpsRates = [15, 24, 30, 60, 120];
      for (const fps of fpsRates) {
        const frames = generateSyntheticWalkingFrames({ fps, durationSec: 4.0 });
        const metrics = computeGaitMetrics(frames);

        expect(metrics).toBeDefined();
        expect(metrics.fpsEffective).toBeGreaterThan(0);
        expect(Number.isFinite(metrics.durationSec)).toBe(true);
        expect(metrics.durationSec).toBeGreaterThan(0);
        expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
        expect(metrics.cadenceSpm).toBeGreaterThan(0);
        expect(metrics.cadenceSpm).toBeLessThanOrEqual(350);
        assertAllMetricsFinite(metrics);
      }
    });

    it('handles 2.5s frame blackout drop and non-uniform delta-t recovery sampling cleanly', () => {
      const frames = generateBlackoutDropRecoveryFrames({
        fps: 30,
        durationSec: 10.0,
        blackoutStartSec: 3.0,
        blackoutEndSec: 5.5,
      });
      const metrics = computeGaitMetrics(frames);

      expect(metrics).toBeDefined();
      expect(metrics.fpsEffective).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.durationSec)).toBe(true);
      expect(metrics.durationSec).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);

      // Verify no phantom step events inside the 2.5s blackout window (3.0s to 5.5s)
      const blackoutEvents = metrics.stepEvents.filter(
        (e) => e.timeSec >= 3.0 && e.timeSec <= 5.5
      );
      expect(blackoutEvents.length).toBe(0);
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 3: Landmark Occlusion (180° U-Turn Self-Occlusion & Visibility Drops)', () => {
    it('handles 180 deg U-turn self-occlusion and leg depth crossover smoothly', () => {
      const frames = generateUTurnSelfOcclusionFrames(30, 6.0);
      const metrics = computeGaitMetrics(frames);

      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(metrics.cadenceSpm).toBeGreaterThan(0);
      expect(metrics.cadenceSpm).toBeLessThanOrEqual(350);
      expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
      expect(metrics.symmetryAngle).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 4: Extreme Gait Asymmetry (Antalgic Limping Asymmetry Factor 2.0)', () => {
    it('quantifies antalgic limping gait with 70/30 stance ratio and asymmetry factor 2.0', () => {
      const frames = generateAntalgicLimpingFrames(30, 6.0);
      const metrics = computeGaitMetrics(frames);

      expect(metrics).toBeDefined();
      expect(metrics.stepCount).toBeGreaterThanOrEqual(4);
      expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
      expect(metrics.stepTimeCV).toBeGreaterThan(0.08); // Captures step time variability
      expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
      expect(metrics.symmetryAngle).toBeGreaterThan(4.0); // Quantifies distinct gait asymmetry
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 5: Micro-Steps & Parkinsonian Gait (300 SPM, Ultra-Short Stride)', () => {
    it('detects ultra-high cadence Parkinsonian micro-steps (300 SPM, 100ms step interval)', () => {
      const frames = generateUltraHighCadenceParkinsonianFrames(60, 4.0);
      const metrics = computeGaitMetrics(frames);

      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(metrics.cadenceSpm).toBeGreaterThan(180); // Captures high-cadence shuffling
      expect(metrics.cadenceSpm).toBeLessThanOrEqual(350);
      expect(Number.isFinite(metrics.verticalBounce)).toBe(true);
      expect(metrics.verticalBounce).toBeLessThan(0.015); // Confirms minimal vertical bounce
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 6: Camera Shake (Combined 3D Translation, 15° Roll Tilt & Dynamic Scale Zoom)', () => {
    it('remains resilient under simultaneous 2D translation jitter, 15 deg roll tilt, and zoom scale shifts', () => {
      const frames = generateCombined3DCameraMotionFrames(30, 4.0);
      const metrics = computeGaitMetrics(frames);

      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
      expect(metrics.cadenceSpm).toBeGreaterThan(0);
      expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
      expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      assertAllMetricsFinite(metrics);
    });
  });
});
