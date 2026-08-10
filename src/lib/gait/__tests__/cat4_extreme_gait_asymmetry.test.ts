import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateSyntheticWalkingFrames, generateAntalgicLimpingFrames, assertAllMetricsFinite } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 4: Extreme Gait Asymmetry Stress Tests', () => {
  it('evaluates hemiparetic gait with an extreme 80/20 stance/swing phase split', () => {
    const fps = 30;
    const durationSec = 5.0;
    const totalFrames = fps * durationSec;
    const frames: PoseFrame[] = [];
    const stepFreq = 1.4;

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const timeMs = t * 1000;
      const progress = (t / durationSec) * 0.4;
      const midHipX = 0.5 + progress;
      const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * stepFreq * 2 * t);

      // Left leg normal oscillation, Right leg hemiparetic: stance is 80% of cycle, swing is 20%
      const leftPhase = 2 * Math.PI * stepFreq * t;

      // Hemiparetic right leg trajectory: prolonged stance phase, quick asymmetric swing
      const cyclePos = (stepFreq * t) % 1.0;
      let rightAnkleOffset = -0.12;
      let rightAnkleY = 0.85;

      if (cyclePos > 0.80) {
        // Fast swing phase during remaining 20% of cycle
        const swingPhase = (cyclePos - 0.80) / 0.20;
        rightAnkleOffset = -0.12 + 0.24 * Math.sin(swingPhase * Math.PI);
        rightAnkleY = 0.85 - 0.04 * Math.sin(swingPhase * Math.PI);
      }

      const leftAnkleOffset = 0.15 * Math.sin(leftPhase);
      const leftAnkleX = midHipX + leftAnkleOffset;
      const rightAnkleX = midHipX + rightAnkleOffset;
      const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(leftPhase));

      const landmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
      landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
      landmarks[11] = { x: midHipX - 0.05, y: 0.3, z: 0, visibility: 0.9 };
      landmarks[12] = { x: midHipX + 0.05, y: 0.3, z: 0, visibility: 0.9 };
      landmarks[15] = { x: midHipX - 0.1 * Math.sin(leftPhase), y: 0.5, z: 0, visibility: 0.9 };
      landmarks[16] = { x: midHipX + 0.02, y: 0.5, z: 0, visibility: 0.9 };
      landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: -0.06, visibility: 0.9 };
      landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: 0.06, visibility: 0.9 };

      landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: 0.68 + 0.03 * Math.sin(leftPhase), z: 0, visibility: 0.9 };
      landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: 0.68, z: 0, visibility: 0.9 };

      landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[29] = { x: leftAnkleX - 0.02, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[30] = { x: rightAnkleX - 0.02, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[31] = { x: leftAnkleX + 0.04, y: leftAnkleY + 0.01, z: 0, visibility: 0.9 };
      landmarks[32] = { x: rightAnkleX + 0.04, y: rightAnkleY + 0.01, z: 0, visibility: 0.9 };

      frames.push({ timeMs, landmarks });
    }

    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(metrics.symmetryAngle).toBeGreaterThan(5.0); // High symmetry angle for hemiparetic gait
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('evaluates prosthetic stiff-knee gait (knee flexion locked at constant angle)', () => {
    const baseFrames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0, viewAngle: 'sagittal' });

    // Lock right knee angle by setting right knee (26) to a fixed relative position between hip (24) and ankle (28)
    const stiffKneeFrames: PoseFrame[] = baseFrames.map((frame) => {
      const lm = frame.landmarks.map((l) => ({ ...l }));
      const rHip = lm[24];
      const rAnkle = lm[28];

      // Fixed straight-leg knee position (constant ~5 deg flexion)
      lm[26] = {
        x: (rHip.x + rAnkle.x) / 2,
        y: (rHip.y + rAnkle.y) / 2,
        z: 0,
        visibility: 0.9,
      };

      return {
        timeMs: frame.timeMs,
        landmarks: lm,
      };
    });

    const metrics = computeGaitMetrics(stiffKneeFrames);

    expect(metrics).toBeDefined();
    expect(metrics.kneeFlexRight).not.toBeNull();
    if (metrics.kneeFlexRight != null) {
      expect(metrics.kneeFlexRight).toBeLessThan(10.0); // Minimal knee flexion range for stiff-knee gait
    }
    expect(Number.isFinite(metrics.kneeAsymmetry ?? 0)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('evaluates severe step-length disparity (9:1 step length ratio)', () => {
    const fps = 30;
    const durationSec = 4.0;
    const totalFrames = fps * durationSec;
    const frames: PoseFrame[] = [];
    const freq = 1.6;

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const timeMs = t * 1000;
      const midHipX = 0.5 + (t / durationSec) * 0.4;
      const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * freq * 2 * t);

      const leftPhase = 2 * Math.PI * freq * t;
      const rightPhase = 2 * Math.PI * freq * t + Math.PI;

      // 9:1 step length ratio: left step offset = 0.18, right step offset = 0.02
      const leftAnkleOffset = 0.18 * Math.sin(leftPhase);
      const rightAnkleOffset = 0.02 * Math.sin(rightPhase);

      const leftAnkleX = midHipX + leftAnkleOffset;
      const rightAnkleX = midHipX + rightAnkleOffset;
      const leftAnkleY = 0.85 - 0.05 * Math.max(0, Math.sin(leftPhase));
      const rightAnkleY = 0.85 - 0.01 * Math.max(0, Math.sin(rightPhase));

      const landmarks = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
      landmarks[0] = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
      landmarks[11] = { x: midHipX - 0.05, y: 0.3, z: 0, visibility: 0.9 };
      landmarks[12] = { x: midHipX + 0.05, y: 0.3, z: 0, visibility: 0.9 };
      landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: -0.06, visibility: 0.9 };
      landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: 0.06, visibility: 0.9 };
      landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: 0.68, z: 0, visibility: 0.9 };
      landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: 0.68, z: 0, visibility: 0.9 };
      landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[29] = { x: leftAnkleX - 0.02, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[30] = { x: rightAnkleX - 0.02, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[31] = { x: leftAnkleX + 0.04, y: leftAnkleY + 0.01, z: 0, visibility: 0.9 };
      landmarks[32] = { x: rightAnkleX + 0.04, y: rightAnkleY + 0.01, z: 0, visibility: 0.9 };

      frames.push({ timeMs, landmarks });
    }

    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.strideAsymmetry ?? 0)).toBe(true);
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(metrics.symmetryAngle).toBeGreaterThan(1.0);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
    assertAllMetricsFinite(metrics);
  });

  it('Gap 4: quantifies severe antalgic limping asymmetry (70/30 stance ratio, asymmetry factor 2.0) without over-trimming', () => {
    const frames = generateAntalgicLimpingFrames(30, 6.0);
    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(metrics.stepCount).toBeGreaterThanOrEqual(4);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(metrics.stepTimeCV).toBeGreaterThan(0.08); // Preserves step time variability
    expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
    expect(metrics.symmetryAngle).toBeGreaterThan(4.0); // Captures distinct gait asymmetry
    assertAllMetricsFinite(metrics);
  });
});

