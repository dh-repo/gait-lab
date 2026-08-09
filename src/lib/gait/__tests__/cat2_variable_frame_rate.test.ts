import { describe, expect, it } from 'vitest';
import { computeGaitMetrics } from '../analysis';
import { generateSyntheticWalkingFrames } from './testHelpers';
import type { PoseFrame } from '../types';

describe('Category 2: Variable Frame Rates & Frame Drop Rates Stress Tests', () => {
  it('handles multi-frame burst drops (thread locks skipping 10-15 consecutive frames)', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });

    // Drop 12 consecutive frames between index 30 and 42 (burst drop)
    const burstDroppedFrames = frames.filter((_, idx) => idx < 30 || idx > 42);

    const metrics = computeGaitMetrics(burstDroppedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.fpsEffective)).toBe(true);
    expect(metrics.fpsEffective).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles MediaPipe UI thread lag / Variable Frame Rate (VFR) non-uniform sampling', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 5.0 });

    // Mutate frame timestamps to simulate highly irregular UI thread lag
    let cumulativeTimeMs = 0;
    const vfrFrames: PoseFrame[] = frames.map((frame, idx) => {
      // Delta times vary randomly between 12ms and 220ms
      const deltaMs = 12 + ((idx * 37) % 208);
      cumulativeTimeMs += deltaMs;
      return {
        timeMs: cumulativeTimeMs,
        landmarks: frame.landmarks,
      };
    });

    const metrics = computeGaitMetrics(vfrFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(metrics.durationSec).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.harmonicRatio)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles duplicate timestamps (timeMs[i] === timeMs[i+1]) without divide-by-zero errors', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    const duplicateTimeFrames: PoseFrame[] = frames.map((frame, idx) => {
      // Force frame 15..18 to share identical timestamp as frame 14
      const timeMs = (idx >= 14 && idx <= 18) ? frames[14].timeMs : frame.timeMs;
      return {
        timeMs,
        landmarks: frame.landmarks,
      };
    });

    const metrics = computeGaitMetrics(duplicateTimeFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.fpsEffective)).toBe(true);
    expect(Number.isFinite(metrics.avgStepTimeSec)).toBe(true);
    expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });

  it('handles unordered / out-of-sequence timestamps safely', () => {
    const frames = generateSyntheticWalkingFrames({ fps: 30, durationSec: 4.0 });

    // Swap timestamps for several frames so sequence is non-monotonic
    const unorderedFrames: PoseFrame[] = frames.map((frame, idx) => {
      let timeMs = frame.timeMs;
      if (idx === 20) timeMs = frames[25].timeMs;
      if (idx === 25) timeMs = frames[20].timeMs;
      if (idx === 35) timeMs = frames[30].timeMs;
      return {
        timeMs,
        landmarks: frame.landmarks,
      };
    });

    const metrics = computeGaitMetrics(unorderedFrames);

    expect(metrics).toBeDefined();
    expect(Number.isFinite(metrics.durationSec)).toBe(true);
    expect(metrics.durationSec).toBeGreaterThan(0);
    expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
    expect(Number.isFinite(metrics.overallScore)).toBe(true);
  });
});
