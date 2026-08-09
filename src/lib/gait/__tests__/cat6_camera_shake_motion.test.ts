import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateSyntheticWalkingFrames } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 6: High-Frequency Camera Shake & Global Frame Motion Stress Tests', () => {
  it('handles high-frequency 2D translational handheld camera shake applied to all 33 landmarks', () => {
    const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // Apply high-frequency 2D translational jitter (dx, dy) to ALL landmarks on every frame
    const shakeFrames: PoseFrame[] = baseFrames.map((frame, fIdx) => {
      const dx = (Math.sin(fIdx * 1.7) * 0.08) + ((fIdx % 3 === 0 ? 1 : -1) * 0.05);
      const dy = (Math.cos(fIdx * 1.9) * 0.06) + ((fIdx % 2 === 0 ? 1 : -1) * 0.04);

      const copyLandmarks = frame.landmarks.map((lm) => ({
        ...lm,
        x: lm.x + dx,
        y: lm.y + dy,
      }));

      return {
        timeMs: frame.timeMs,
        landmarks: copyLandmarks,
      };
    });

    const metrics = computeGaitMetrics(shakeFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles rotational camera tilt (+/- 15 degree roll relative to ground plane)', () => {
    const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0, viewAngle: 'sagittal' });
    const tiltAngleRad = (15 * Math.PI) / 180; // 15 degree camera tilt
    const cosT = Math.cos(tiltAngleRad);
    const sinT = Math.sin(tiltAngleRad);
    const centerX = 0.5;
    const centerY = 0.5;

    const tiltedFrames: PoseFrame[] = baseFrames.map((frame) => {
      const copyLandmarks = frame.landmarks.map((lm) => {
        const relX = lm.x - centerX;
        const relY = lm.y - centerY;
        const rotX = relX * cosT - relY * sinT;
        const rotY = relX * sinT + relY * cosT;
        return {
          ...lm,
          x: centerX + rotX,
          y: centerY + rotY,
        };
      });

      return {
        timeMs: frame.timeMs,
        landmarks: copyLandmarks,
      };
    });

    const metrics = computeGaitMetrics(tiltedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles rapid dynamic camera scale/zoom shifts during tracking', () => {
    const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });
    const centerX = 0.5;
    const centerY = 0.5;

    // Camera zooms from scale 1.0 to 1.6 and back to 0.9 over clip
    const zoomedFrames: PoseFrame[] = baseFrames.map((frame, fIdx) => {
      const t = fIdx / baseFrames.length;
      const scale = 1.0 + 0.6 * Math.sin(Math.PI * t);

      const copyLandmarks = frame.landmarks.map((lm) => ({
        ...lm,
        x: centerX + (lm.x - centerX) * scale,
        y: centerY + (lm.y - centerY) * scale,
      }));

      return {
        timeMs: frame.timeMs,
        landmarks: copyLandmarks,
      };
    });

    const metrics = computeGaitMetrics(zoomedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });
});
