import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateUltraHighCadenceParkinsonianFrames, assertAllMetricsFinite } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 5: Micro-Steps & Parkinsonian Gait Stress Tests', () => {
  it('evaluates Parkinsonian shuffling gait (< 0.015 step length, < 0.005 vertical bounce)', () => {
    const fps = 30;
    const durationSec = 4.0;
    const totalFrames = fps * durationSec;
    const frames: PoseFrame[] = [];
    const stepFreq = 2.0; // High shuffling frequency (~120 SPM)

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const timeMs = t * 1000;
      // Minimal forward progress
      const midHipX = 0.5 + (t / durationSec) * 0.04;
      // Micro vertical bounce (< 0.003)
      const midHipY = 0.5 + 0.002 * Math.sin(2 * Math.PI * stepFreq * 2 * t);

      const leftPhase = 2 * Math.PI * stepFreq * t;
      const rightPhase = 2 * Math.PI * stepFreq * t + Math.PI;

      // Micro step amplitude < 0.012
      const leftAnkleOffset = 0.010 * Math.sin(leftPhase);
      const rightAnkleOffset = 0.010 * Math.sin(rightPhase);

      const leftAnkleX = midHipX + leftAnkleOffset;
      const rightAnkleX = midHipX + rightAnkleOffset;
      const leftAnkleY = 0.85 - 0.004 * Math.max(0, Math.sin(leftPhase));
      const rightAnkleY = 0.85 - 0.004 * Math.max(0, Math.sin(rightPhase));

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
      landmarks[29] = { x: leftAnkleX - 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[30] = { x: rightAnkleX - 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[31] = { x: leftAnkleX + 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[32] = { x: rightAnkleX + 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };

      frames.push({ timeMs, landmarks });
    }

    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.verticalBounce)).toBe(true);
    expect(metrics.verticalBounce).toBeLessThan(0.02);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('evaluates festinating gait (accelerating cadence from 100 SPM to 190 SPM & decaying stride)', () => {
    const fps = 30;
    const durationSec = 5.0;
    const totalFrames = fps * durationSec;
    const frames: PoseFrame[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const timeMs = t * 1000;

      // Accelerating phase frequency from 1.6 Hz (96 SPM) up to 3.2 Hz (192 SPM)
      const freq = 1.6 + 1.6 * (t / durationSec);
      // Decaying step amplitude from 0.14 down to 0.01
      const amp = 0.14 * (1 - 0.9 * (t / durationSec));

      const midHipX = 0.5 + 0.15 * Math.sin(t * 0.5);
      const midHipY = 0.5 + 0.01 * Math.sin(2 * Math.PI * freq * t);

      const leftPhase = 2 * Math.PI * freq * t;
      const rightPhase = leftPhase + Math.PI;

      const leftAnkleOffset = amp * Math.sin(leftPhase);
      const rightAnkleOffset = amp * Math.sin(rightPhase);

      const leftAnkleX = midHipX + leftAnkleOffset;
      const rightAnkleX = midHipX + rightAnkleOffset;
      const leftAnkleY = 0.85 - 0.03 * Math.max(0, Math.sin(leftPhase));
      const rightAnkleY = 0.85 - 0.03 * Math.max(0, Math.sin(rightPhase));

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
      landmarks[29] = { x: leftAnkleX - 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[30] = { x: rightAnkleX - 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[31] = { x: leftAnkleX + 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[32] = { x: rightAnkleX + 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };

      frames.push({ timeMs, landmarks });
    }

    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(metrics.stepTimeCV).toBeGreaterThan(0.05); // High CV due to accelerating cadence
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('evaluates Freezing of Gait (FOG) episodes (transition to 4-6 Hz micro-trembling, zero progress)', () => {
    const fps = 30;
    const durationSec = 6.0;
    const totalFrames = fps * durationSec;
    const frames: PoseFrame[] = [];

    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps;
      const timeMs = t * 1000;

      let midHipX = 0.5 + (t / durationSec) * 0.3;
      let midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * 1.6 * 2 * t);
      let leftPhase = 2 * Math.PI * 1.6 * t;
      let amp = 0.15;

      // FOG episode between t = 2.0s and t = 4.5s (2.5 second freezing episode)
      if (t >= 2.0 && t <= 4.5) {
        // Zero forward progress
        midHipX = 0.5 + (2.0 / durationSec) * 0.3;
        // High frequency 5 Hz micro-tremble
        midHipY = 0.5 + 0.003 * Math.sin(2 * Math.PI * 5.0 * t);
        leftPhase = 2 * Math.PI * 5.0 * t;
        amp = 0.005;
      }

      const rightPhase = leftPhase + Math.PI;
      const leftAnkleOffset = amp * Math.sin(leftPhase);
      const rightAnkleOffset = amp * Math.sin(rightPhase);

      const leftAnkleX = midHipX + leftAnkleOffset;
      const rightAnkleX = midHipX + rightAnkleOffset;
      const leftAnkleY = 0.85 - 0.03 * Math.max(0, Math.sin(leftPhase));
      const rightAnkleY = 0.85 - 0.03 * Math.max(0, Math.sin(rightPhase));

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
      landmarks[29] = { x: leftAnkleX - 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[30] = { x: rightAnkleX - 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };
      landmarks[31] = { x: leftAnkleX + 0.01, y: leftAnkleY, z: 0, visibility: 0.9 };
      landmarks[32] = { x: rightAnkleX + 0.01, y: rightAnkleY, z: 0, visibility: 0.9 };

      frames.push({ timeMs, landmarks });
    }

    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
    assertAllMetricsFinite(metrics);
  });

  it('Gap 5: detects ultra-high cadence Parkinsonian micro-steps (300 SPM, 100ms step time)', () => {
    const frames = generateUltraHighCadenceParkinsonianFrames(60, 4.0);
    const metrics = computeGaitMetrics(frames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(metrics.cadenceSpm).toBeGreaterThan(180); // Captures high-cadence shuffling
    expect(Number.isFinite(metrics.verticalBounce)).toBe(true);
    expect(metrics.verticalBounce).toBeLessThan(0.015); // Confirms minimal vertical bounce
    assertAllMetricsFinite(metrics);
  });
});

