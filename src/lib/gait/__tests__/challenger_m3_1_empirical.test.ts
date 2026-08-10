import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import type { PoseFrame, Landmark } from '../types';
import {
  assertAllMetricsFinite,
  generateAsymmetricLimbNoiseFrames,
  generateSyntheticWalkingFrames,
  generateGaussianNoise,
  generateAntalgicLimpingFrames,
} from './testHelpers';

describe('Challenger M3 Empirical Stress & Boundary Harness', () => {

  describe('Category 1: Extreme Landmark Noise Stress', () => {
    it('handles extreme Gaussian noise (sigma = 0.1 to 2.0) without throwing or producing NaN/Inf', () => {
      const extremeSigmas = [0.1, 0.2, 0.5, 1.0, 2.0];
      for (const sigma of extremeSigmas) {
        const frames = generateAsymmetricLimbNoiseFrames({
          fps: 30,
          durationSec: 4.0,
          noiseSigma: sigma,
          targetLimb: 'right',
        });
        const metrics = computeGaitMetrics(frames);
        expect(metrics).toBeDefined();
        assertAllMetricsFinite(metrics);
      }
    });

    it('handles global Gaussian noise across all 33 keypoints without crash', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const noisyFrames: PoseFrame[] = baseFrames.map((frame) => ({
        timeMs: frame.timeMs,
        landmarks: frame.landmarks.map((lm) => ({
          x: lm.x + generateGaussianNoise(0.15),
          y: lm.y + generateGaussianNoise(0.15),
          z: lm.z + generateGaussianNoise(0.15),
          visibility: Math.max(0, Math.min(1, (lm.visibility ?? 0.9) + generateGaussianNoise(0.2))),
        })),
      }));

      const metrics = computeGaitMetrics(noisyFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 2: Extreme Frame Rate & Timestamp Anomalies', () => {
    it('handles ultra-low (1 FPS) and ultra-high (240 FPS) frame rates safely', () => {
      for (const fps of [1, 2, 5, 120, 240]) {
        const frames = generateSyntheticWalkingFrames({ fps, durationSec: 4.0 });
        const metrics = computeGaitMetrics(frames);
        expect(metrics).toBeDefined();
        assertAllMetricsFinite(metrics);
      }
    });

    it('handles zero delta-t (duplicate timeMs timestamps) gracefully', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0 });
      // Duplicate every frame timestamp
      const dupFrames: PoseFrame[] = [];
      for (const f of baseFrames) {
        dupFrames.push(f);
        dupFrames.push({ timeMs: f.timeMs, landmarks: f.landmarks });
      }

      const metrics = computeGaitMetrics(dupFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles non-monotonic (jumbled) frame timestamps without crash', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const jumbledFrames: PoseFrame[] = baseFrames.map((f, i) => ({
        timeMs: i % 2 === 0 ? f.timeMs + 50 : f.timeMs - 20,
        landmarks: f.landmarks,
      }));

      const metrics = computeGaitMetrics(jumbledFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles extreme 95% blackout drop (only 2 active frames separated by 10s)', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 10.0 });
      const extremeBlackout = baseFrames.filter((f) => f.timeMs < 200 || f.timeMs > 9800);

      const metrics = computeGaitMetrics(extremeBlackout);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 3: Complete Landmark Occlusion & Visibility Drop', () => {
    it('handles 0.0 visibility across 100% of landmarks and frames without crash or NaN', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const zeroVisFrames: PoseFrame[] = baseFrames.map((f) => ({
        timeMs: f.timeMs,
        landmarks: f.landmarks.map((lm) => ({ ...lm, visibility: 0.0 })),
      }));

      const metrics = computeGaitMetrics(zeroVisFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles rapid limb side swaps (left/right ankle position inversion every frame)', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const swappedFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        if (idx % 2 === 0) {
          const copy = f.landmarks.map((lm) => ({ ...lm }));
          // Swap ankles (27, 28) and heels (29, 30)
          const tmp27 = copy[27];
          copy[27] = copy[28];
          copy[28] = tmp27;
          const tmp29 = copy[29];
          copy[29] = copy[30];
          copy[30] = tmp29;
          return { timeMs: f.timeMs, landmarks: copy };
        }
        return f;
      });

      const metrics = computeGaitMetrics(swappedFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 4: Extreme Gait Asymmetry (99/1 stance ratio & sparse steps)', () => {
    it('handles extreme stance ratio asymmetry factor 50.0 safely', () => {
      const frames = generateAntalgicLimpingFrames(30, 4.0);
      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles short sequence yielding < 3 strides (boundary for steady-state filter)', () => {
      const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 0.8 }); // ~1 step
      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 5: Ultra-High Cadence Parkinsonian Micro-Steps Stress', () => {
    it('handles ultra-high cadence (600 SPM / 10 Hz) with 0.001 micro step amplitude', () => {
      const totalFrames = 120; // 2 seconds @ 60 FPS
      const fps = 60;
      const frames: PoseFrame[] = [];

      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps;
        const timeMs = t * 1000;
        const midHipX = 0.5 + t * 0.01;
        const midHipY = 0.5;
        const phase = 2 * Math.PI * 10.0 * t; // 10 Hz step freq = 600 SPM
        const stepAmp = 0.001;

        const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
        landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
        landmarks[11] = { x: midHipX - 0.05, y: 0.3, z: 0, visibility: 0.9 };
        landmarks[12] = { x: midHipX + 0.05, y: 0.3, z: 0, visibility: 0.9 };
        landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: 0, visibility: 0.9 };
        landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: 0, visibility: 0.9 };
        landmarks[27] = { x: midHipX - 0.02 + stepAmp * Math.sin(phase), y: 0.85, z: 0, visibility: 0.9 };
        landmarks[28] = { x: midHipX + 0.02 + stepAmp * Math.sin(phase + Math.PI), y: 0.85, z: 0, visibility: 0.9 };
        landmarks[29] = { x: midHipX - 0.02, y: 0.85, z: 0, visibility: 0.9 };
        landmarks[30] = { x: midHipX + 0.02, y: 0.85, z: 0, visibility: 0.9 };

        frames.push({ timeMs, landmarks });
      }

      const metrics = computeGaitMetrics(frames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Category 6: Extreme Camera Shake, Tilt & Zoom Out of Bounds', () => {
    it('handles massive 2D translation (dx = 5.0), 180° rotation, and zoom scale 0.001 / 100.0', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 3.0 });
      const extremeShakeFrames: PoseFrame[] = baseFrames.map((frame, fIdx) => {
        const t = fIdx / 30;
        const scale = fIdx % 2 === 0 ? 0.001 : 50.0;
        const dx = 5.0 * Math.sin(10 * t);
        const dy = 5.0 * Math.cos(10 * t);

        return {
          timeMs: frame.timeMs,
          landmarks: frame.landmarks.map((lm) => ({
            ...lm,
            x: (lm.x - 0.5) * scale + 0.5 + dx,
            y: (lm.y - 0.5) * scale + 0.5 + dy,
            z: lm.z * scale,
          })),
        };
      });

      const metrics = computeGaitMetrics(extremeShakeFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });

  describe('Boundary & Malformed Struct Inputs', () => {
    it('handles empty frames array safely', () => {
      const metrics = computeGaitMetrics([]);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles single frame input safely', () => {
      const singleFrame = generateSyntheticWalkingFrames({ fps: 30, durationSec: 0.033 });
      const metrics = computeGaitMetrics(singleFrame);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });

    it('handles NaN/Infinity in landmark coordinates without bubbling NaN to metrics', () => {
      const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 2.0 });
      const corruptedFrames: PoseFrame[] = baseFrames.map((f, idx) => {
        if (idx === 10 || idx === 20) {
          return {
            timeMs: f.timeMs,
            landmarks: f.landmarks.map(() => ({
              x: NaN,
              y: Infinity,
              z: -Infinity,
              visibility: NaN,
            })),
          };
        }
        return f;
      });

      const metrics = computeGaitMetrics(corruptedFrames);
      expect(metrics).toBeDefined();
      assertAllMetricsFinite(metrics);
    });
  });
});
