# Milestone 3 Implementation Blueprint: Expand Adversarial Test Coverage

**Author:** explorer_m3_1  
**Date:** 2026-08-10  
**Workspace:** `/Users/damian/GitHub/gait-lab`  
**Target Output File:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_1/blueprint_m3.md`  

---

## 1. Executive Overview & Scope

### 1.1 Objective
This blueprint specifies the exact synthetic data generators, test file additions, mathematical formulations, and assertion logic required to execute **Milestone 3 (M3: Expand Adversarial Test Coverage)** for the `gait-lab` spatio-temporal gait analysis engine.

Building upon the algorithm tuning completed in M1 & M2 (specifically: `minGap` scaling in `events.ts` to support up to 300 SPM, and `filterSteadyStateStrides` threshold relaxation in `analysis.ts` to 0.40), M3 introduces 6 comprehensive adversarial test scenarios across all identified gap categories.

### 1.2 Identified Gap Categories & Scenarios
| Category | Identified Gap | Synthetic Scenario Description | Target File Placement |
|---|---|---|---|
| **Gap 1** | Landmark Jitter / Noise | **Asymmetric Single-Limb Gaussian Noise ($\sigma=0.10$)**: Persistent zero-mean Gaussian noise applied strictly to right leg keypoints (28, 30, 32) while left limb keypoints (27, 29, 31) remain clean. | `src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts` |
| **Gap 2** | Variable Frame Rate | **2.5s Frame Blackout Drop & Recovery**: 10.0s sequence with complete 75-frame blackout ($t=3.0\text{s}$ to $5.5\text{s}$) followed by irregular delta-t recovery sampling (15ms–80ms). | `src/lib/gait/__tests__/cat2_variable_frame_rate.test.ts` |
| **Gap 3** | Landmark Occlusion | **180° U-Turn Self-Occlusion**: Subject turns 180° at mid-clip (2.5s–3.5s), causing limb depth overlap, temporary leg visibility drop ($0.10$), and left/right side inversion. | `src/lib/gait/__tests__/cat3_landmark_occlusion.test.ts` |
| **Gap 4** | Extreme Gait Asymmetry | **Antalgic Limping Gait (70/30 Step Split)**: Asymmetry factor 2.0 (Left step = 0.70s stance, Right step = 0.30s quick stance offloading). | `src/lib/gait/__tests__/cat4_extreme_gait_asymmetry.test.ts` |
| **Gap 5** | Micro-Steps / Parkinsonian | **Ultra-High Cadence Parkinsonian Shuffling (300 SPM)**: Step interval = 100ms (2.5 Hz step frequency at 60 FPS), step amplitude $< 0.008$ norm-units. | `src/lib/gait/__tests__/cat5_micro_steps_parkinsonian.test.ts` |
| **Gap 6** | Camera Shake & Motion | **Combined 3D Camera Motion**: Simultaneous 2D translational jitter ($\Delta x, \Delta y$), 15° rotational roll tilt $\theta(t)$, and dynamic scale zoom $S(t) \in [0.5, 1.5]$. | `src/lib/gait/__tests__/cat6_camera_shake_motion.test.ts` |

In addition to extending `cat1_*.test.ts` through `cat6_*.test.ts`, a consolidated integration suite `src/lib/gait/__tests__/adversarial_gaps.test.ts` will be created to execute all 6 scenarios in a single benchmark run.

---

## 2. Synthetic Generator Helpers Specification (`testHelpers.ts`)

To support robust, reproducible test execution, `src/lib/gait/__tests__/testHelpers.ts` will be augmented with six dedicated synthetic frame generator functions.

### 2.1 Box-Muller Gaussian Noise Generator
Standard `Math.random()` provides uniform distribution $U(0, 1)$. Realistic tracking jitter requires normal distribution $N(\mu, \sigma^2)$.

```typescript
/**
 * Box-Muller transform for zero-mean Gaussian random numbers with standard deviation sigma.
 */
export function generateGaussianNoise(sigma: number = 0.10): number {
  let u1 = Math.random();
  let u2 = Math.random();
  while (u1 === 0) u1 = Math.random(); // Avoid log(0)
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z * sigma;
}
```

### 2.2 Generator 1: `generateAsymmetricLimbNoiseFrames`
```typescript
export interface AsymmetricNoiseOptions {
  fps?: number;
  durationSec?: number;
  targetLimb?: 'right' | 'left';
  noiseSigma?: number; // Default: 0.10
}

export function generateAsymmetricLimbNoiseFrames(opts: AsymmetricNoiseOptions = {}): PoseFrame[] {
  const baseFrames = generateSyntheticWalkingFrames({
    fps: opts.fps ?? 30,
    durationSec: opts.durationSec ?? 4.0,
    viewAngle: 'sagittal',
  });
  const sigma = opts.noiseSigma ?? 0.10;
  const targetLimb = opts.targetLimb ?? 'right';

  // Target indices: Right foot (28: ankle, 30: heel, 32: toe, 26: knee)
  // Left foot (27: ankle, 29: heel, 31: toe, 25: knee)
  const targetIndices = targetLimb === 'right' ? [26, 28, 30, 32] : [25, 27, 29, 31];

  return baseFrames.map((frame) => {
    const copyLms = frame.landmarks.map((lm, idx) => {
      if (targetIndices.includes(idx)) {
        return {
          ...lm,
          x: lm.x + generateGaussianNoise(sigma),
          y: lm.y + generateGaussianNoise(sigma),
          z: lm.z + generateGaussianNoise(sigma * 0.5),
        };
      }
      return { ...lm };
    });
    return { timeMs: frame.timeMs, landmarks: copyLms };
  });
}
```

### 2.3 Generator 2: `generateBlackoutDropRecoveryFrames`
```typescript
export interface BlackoutOptions {
  fps?: number;               // Default 30
  durationSec?: number;       // Default 10.0 (300 frames)
  blackoutStartSec?: number;  // Default 3.0
  blackoutEndSec?: number;    // Default 5.5 (2.5s blackout)
}

export function generateBlackoutDropRecoveryFrames(opts: BlackoutOptions = {}): PoseFrame[] {
  const fps = opts.fps ?? 30;
  const totalDuration = opts.durationSec ?? 10.0;
  const bStart = opts.blackoutStartSec ?? 3.0;
  const bEnd = opts.blackoutEndSec ?? 5.5;

  const rawFrames = generateSyntheticWalkingFrames({ fps, durationSec: totalDuration });

  // Filter out frames falling strictly inside the blackout window
  const activeFrames = rawFrames.filter((f) => {
    const tSec = f.timeMs / 1000;
    return tSec < bStart || tSec >= bEnd;
  });

  // Apply irregular VFR delta-t jitter to post-blackout recovery phase (t >= bEnd)
  let accumulatedMs = 0;
  let prevRawMs = 0;

  return activeFrames.map((f, idx) => {
    if (idx === 0) {
      accumulatedMs = f.timeMs;
      prevRawMs = f.timeMs;
      return f;
    }

    const rawDeltaMs = f.timeMs - prevRawMs;
    prevRawMs = f.timeMs;

    const tSec = f.timeMs / 1000;
    let actualDeltaMs = rawDeltaMs;

    if (tSec >= bEnd) {
      // Simulate mobile UI thread unblocking jitter: alternating delta-t between 15ms and 80ms
      const vfrJitter = (idx % 2 === 0 ? 15 : 80);
      actualDeltaMs = vfrJitter;
    }

    accumulatedMs += actualDeltaMs;

    return {
      timeMs: accumulatedMs,
      landmarks: f.landmarks,
    };
  });
}
```

### 2.4 Generator 3: `generateUTurnSelfOcclusionFrames`
```typescript
export function generateUTurnSelfOcclusionFrames(fps = 30, durationSec = 6.0): PoseFrame[] {
  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const turnStartFrame = Math.floor(fps * 2.5); // t = 2.5s
  const turnEndFrame = Math.floor(fps * 3.5);   // t = 3.5s (30 frame U-turn)
  const speed = 0.12;

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    let dir = 1;
    let posX = 0.2 + speed * t;
    let headingAngle = 0; // 0 rad = facing camera / moving right
    let visibility = 0.90;

    if (f >= turnStartFrame && f <= turnEndFrame) {
      // U-turn transition phase
      const u = (f - turnStartFrame) / (turnEndFrame - turnStartFrame);
      headingAngle = Math.PI * u; // Cosine rotation 0 -> PI rad (180 deg)
      posX = 0.2 + speed * (turnStartFrame / fps) + 0.03 * Math.sin(headingAngle);
      visibility = 0.15; // Degraded visibility due to self-occlusion
    } else if (f > turnEndFrame) {
      // Return path (walking left / away)
      dir = -1;
      const turnX = 0.2 + speed * (turnStartFrame / fps);
      posX = turnX - speed * ((f - turnEndFrame) / fps);
      headingAngle = Math.PI;
    }

    const midHipX = posX;
    const midHipY = 0.5 + 0.02 * Math.sin(2 * Math.PI * 1.6 * t);
    const legPhase = 2 * Math.PI * 1.6 * t;

    // During headingAngle ~ PI/2 (90 deg turn), left and right legs cross and overlap in depth (z)
    const legSeparation = 0.08 * Math.cos(headingAngle);
    const leftAnkleX = midHipX + 0.12 * Math.sin(legPhase) * Math.cos(headingAngle) - legSeparation;
    const rightAnkleX = midHipX + 0.12 * Math.sin(legPhase + Math.PI) * Math.cos(headingAngle) + legSeparation;

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility }));
    landmarks[0]  = { x: midHipX, y: 0.2, z: 0, visibility };
    landmarks[11] = { x: midHipX - 0.05 * Math.cos(headingAngle), y: 0.3, z: 0.05 * Math.sin(headingAngle), visibility };
    landmarks[12] = { x: midHipX + 0.05 * Math.cos(headingAngle), y: 0.3, z: -0.05 * Math.sin(headingAngle), visibility };
    landmarks[23] = { x: midHipX - 0.05 * Math.cos(headingAngle), y: midHipY, z: 0.05 * Math.sin(headingAngle), visibility };
    landmarks[24] = { x: midHipX + 0.05 * Math.cos(headingAngle), y: midHipY, z: -0.05 * Math.sin(headingAngle), visibility };
    landmarks[27] = { x: leftAnkleX, y: 0.85 - 0.04 * Math.max(0, Math.sin(legPhase)), z: 0, visibility };
    landmarks[28] = { x: rightAnkleX, y: 0.85 - 0.04 * Math.max(0, Math.sin(legPhase + Math.PI)), z: 0, visibility };
    landmarks[29] = { x: leftAnkleX - 0.02 * dir, y: 0.85, z: 0, visibility };
    landmarks[30] = { x: rightAnkleX - 0.02 * dir, y: 0.85, z: 0, visibility };
    landmarks[31] = { x: leftAnkleX + 0.03 * dir, y: 0.86, z: 0, visibility };
    landmarks[32] = { x: rightAnkleX + 0.03 * dir, y: 0.86, z: 0, visibility };

    frames.push({ timeMs, landmarks });
  }

  return frames;
}
```

### 2.5 Generator 4: `generateAntalgicLimpingFrames`
```typescript
export function generateAntalgicLimpingFrames(fps = 30, durationSec = 6.0): PoseFrame[] {
  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const cycleDurationSec = 1.0; // Total gait cycle = 1.0s (Left = 0.70s, Right = 0.30s)

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;
    const cyclePos = (t % cycleDurationSec) / cycleDurationSec;

    const midHipX = 0.2 + (t / durationSec) * 0.5;
    const midHipY = 0.5 + 0.015 * Math.sin(2 * Math.PI * (t / cycleDurationSec));

    let leftAnkleOffset = 0;
    let rightAnkleOffset = 0;
    let leftAnkleY = 0.85;
    let rightAnkleY = 0.85;

    if (cyclePos < 0.70) {
      // Left stance phase (70% of cycle = 0.70s duration): slow, smooth swing/stance
      const pL = cyclePos / 0.70;
      leftAnkleOffset = -0.15 + 0.30 * pL;
      leftAnkleY = 0.85 - 0.05 * Math.sin(Math.PI * pL);
      rightAnkleOffset = 0.15 - 0.30 * pL;
    } else {
      // Right stance phase (30% of cycle = 0.30s duration): quick offloading step
      const pR = (cyclePos - 0.70) / 0.30;
      rightAnkleOffset = -0.15 + 0.30 * pR;
      rightAnkleY = 0.85 - 0.03 * Math.sin(Math.PI * pR);
      leftAnkleOffset = 0.15 - 0.30 * pR;
    }

    const leftAnkleX = midHipX + leftAnkleOffset;
    const rightAnkleX = midHipX + rightAnkleOffset;

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    landmarks[0]  = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: midHipX - 0.05, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: midHipX + 0.05, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: 0, visibility: 0.9 };
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

  return frames;
}
```

### 2.6 Generator 5: `generateUltraHighCadenceParkinsonianFrames`
```typescript
export function generateUltraHighCadenceParkinsonianFrames(fps = 60, durationSec = 4.0): PoseFrame[] {
  const totalFrames = Math.floor(fps * durationSec);
  const frames: PoseFrame[] = [];
  const stepFreqHz = 2.5; // 2.5 Hz = 5 steps/sec = 300 steps/min (SPM), step time = 100ms
  const stepAmp = 0.007;  // Micro step length (< 0.015 norm units)

  for (let f = 0; f < totalFrames; f++) {
    const t = f / fps;
    const timeMs = t * 1000;

    const midHipX = 0.5 + (t / durationSec) * 0.03; // Minimal forward displacement
    const midHipY = 0.5 + 0.0015 * Math.sin(2 * Math.PI * stepFreqHz * 2 * t); // Micro vertical bounce

    const leftPhase = 2 * Math.PI * stepFreqHz * t;
    const rightPhase = leftPhase + Math.PI;

    const leftAnkleOffset = stepAmp * Math.sin(leftPhase);
    const rightAnkleOffset = stepAmp * Math.sin(rightPhase);

    const leftAnkleX = midHipX + leftAnkleOffset;
    const rightAnkleX = midHipX + rightAnkleOffset;

    const leftAnkleY = 0.85 - 0.003 * Math.max(0, Math.sin(leftPhase));
    const rightAnkleY = 0.85 - 0.003 * Math.max(0, Math.sin(rightPhase));

    const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    landmarks[0]  = { x: midHipX, y: 0.2, z: 0, visibility: 0.9 };
    landmarks[11] = { x: midHipX - 0.05, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[12] = { x: midHipX + 0.05, y: 0.3, z: 0, visibility: 0.9 };
    landmarks[23] = { x: midHipX - 0.05, y: midHipY, z: 0, visibility: 0.9 };
    landmarks[24] = { x: midHipX + 0.05, y: midHipY, z: 0, visibility: 0.9 };
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

  return frames;
}
```

### 2.7 Generator 6: `generateCombined3DCameraMotionFrames`
```typescript
export function generateCombined3DCameraMotionFrames(fps = 30, durationSec = 4.0): PoseFrame[] {
  const baseFrames = generateSyntheticWalkingFrames({ fps, durationSec, viewAngle: 'sagittal' });
  const centerX = 0.5;
  const centerY = 0.5;

  return baseFrames.map((frame, fIdx) => {
    const t = fIdx / fps;

    // 1. High-frequency 2D translational jitter
    const dx = 0.06 * Math.sin(2.3 * t) + 0.04 * Math.cos(7.1 * t);
    const dy = 0.05 * Math.cos(3.1 * t) + 0.03 * Math.sin(5.7 * t);

    // 2. 15-degree rotational roll tilt theta(t)
    const rollAngleRad = (15 * Math.PI / 180) * Math.sin(1.2 * t);
    const cosR = Math.cos(rollAngleRad);
    const sinR = Math.sin(rollAngleRad);

    // 3. Dynamic scale zoom S(t) in [0.5, 1.5]
    const scale = 1.0 + 0.5 * Math.sin(0.8 * t);

    const transformedLms = frame.landmarks.map((lm) => {
      // Shift origin to frame center (0.5, 0.5)
      const rx = lm.x - centerX;
      const ry = lm.y - centerY;

      // Apply scale
      const sx = rx * scale;
      const sy = ry * scale;

      // Apply 2D roll rotation
      const rotX = sx * cosR - sy * sinR;
      const rotY = sx * sinR + sy * cosR;

      // Apply translation jitter and restore center
      return {
        ...lm,
        x: centerX + rotX + dx,
        y: centerY + rotY + dy,
        z: lm.z * scale,
      };
    });

    return {
      timeMs: frame.timeMs,
      landmarks: transformedLms,
    };
  });
}
```

---

## 3. Comprehensive Specifications for the 6 Adversarial Scenarios

### 3.1 Scenario 1: Asymmetric Single-Limb Gaussian Noise ($\sigma = 0.10$)
- **Context & Motivation:** In real-world videos, tracking artifacts or occlusions often affect a single limb (e.g. right leg close to furniture while left leg is clear). The engine must isolate limb noise without letting infinite velocities or corrupted metrics propagate to the clean side.
- **Test Implementation:**
```typescript
it('Gap 1: handles asymmetric single-limb Gaussian noise (sigma=0.10 on right foot) cleanly', () => {
  const frames = generateAsymmetricLimbNoiseFrames({ fps: 30, durationSec: 4.0, noiseSigma: 0.10 });
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
```

### 3.2 Scenario 2: 2.5s Frame Blackout Drop & Recovery
- **Context & Motivation:** Mobile browser UI thread locks can cause prolonged frame dropouts (e.g. 2.5s missing frames). When streaming resumes with non-uniform delta-t, the state estimator must not produce phantom heel-strikes across the 2.5s join or fail with division-by-zero errors.
- **Test Implementation:**
```typescript
it('Gap 2: handles 2.5s frame blackout drop and variable delta-t recovery without false strides', () => {
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
  expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
  expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
  
  // Verify 0 bogus step events were created inside the 2.5s blackout interval (3.0s to 5.5s)
  const blackoutEvents = metrics.stepEvents.filter(
    (e) => e.timestampSec >= 3.0 && e.timestampSec <= 5.5
  );
  expect(blackoutEvents.length).toBe(0);
  assertAllMetricsFinite(metrics);
});
```

### 3.3 Scenario 3: 180° U-Turn Self-Occlusion & Side Inversion
- **Context & Motivation:** When a patient turns 180° in a clinical gait hallway, their left and right legs overlap in depth, causing MediaPipe side-swapping and low visibility ($0.15$). The engine must track the turn smoothly without crashing or generating non-finite values.
- **Test Implementation:**
```typescript
it('Gap 3: handles 180 deg U-turn self-occlusion and leg crossover gracefully', () => {
  const frames = generateUTurnSelfOcclusionFrames(30, 6.0);
  const metrics = computeGaitMetrics(frames);

  expect(metrics).toBeDefined();
  expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
  expect(metrics.cadenceSpm).toBeGreaterThan(0);
  expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
  expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
  expect(metrics.overallScore).toBeLessThanOrEqual(100);
  assertAllMetricsFinite(metrics);
});
```

### 3.4 Scenario 4: Antalgic Limping Gait (Asymmetry Factor 2.0, 70/30 Step Split)
- **Context & Motivation:** Patients with acute joint pain offload the affected limb rapidly (0.30s stance vs 0.70s stance). Prior versions of `filterSteadyStateStrides` over-trimmed these asymmetric steps as outliers. With M1/M2 tuning (threshold 0.40), the engine must retain these steps and quantify elevated `stepTimeCV` ($> 0.08$) and high `symmetryAngle` ($> 4.0$).
- **Test Implementation:**
```typescript
it('Gap 4: quantifies severe antalgic limping asymmetry (70/30 stance ratio) without over-trimming', () => {
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
```

### 3.5 Scenario 5: Ultra-High Cadence Parkinsonian Shuffling (300 SPM, 100ms Step Interval)
- **Context & Motivation:** Parkinsonian festination and micro-shuffling produce step frequencies up to 300 SPM (100ms step duration). Older event detectors suppressed these peaks due to a 333ms `minGap`. With M1/M2 `minGap` tuning ($\max(3, \lfloor 0.18 \times \text{fps} \rfloor)$), the engine must successfully detect high-cadence steps.
- **Test Implementation:**
```typescript
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
```

### 3.6 Scenario 6: Combined 3D Camera Motion (2D Jitter + 15° Roll Tilt + Dynamic Scale Zoom)
- **Context & Motivation:** Handheld smartphone recording introduces camera translation, roll tilt, and zoom simultaneously. The engine must remain robust against global affine frame transformations.
- **Test Implementation:**
```typescript
it('Gap 6: remains robust under combined 3D camera translation, 15 deg roll, and scale zoom', () => {
  const frames = generateCombined3DCameraMotionFrames(30, 4.0);
  const metrics = computeGaitMetrics(frames);

  expect(metrics).toBeDefined();
  expect(Number.isFinite(metrics.cadenceSpm)).toBe(true);
  expect(Number.isFinite(metrics.stepTimeCV)).toBe(true);
  expect(Number.isFinite(metrics.symmetryAngle)).toBe(true);
  expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
  expect(metrics.overallScore).toBeLessThanOrEqual(100);
  assertAllMetricsFinite(metrics);
});
```

---

## 4. Strict Safety & Property-Based Verification Protocols

To satisfy the non-crash/NaN/Infinity requirement across all existing and new test suites, a global recursive checker function `assertAllMetricsFinite` will be included in `testHelpers.ts` and called in every adversarial test assertion.

```typescript
/**
 * Recursively asserts that every numeric property within a GaitMetrics object is a finite number
 * (i.e. not NaN, Infinity, or -Infinity) and that score values fall within [0, 100].
 */
export function assertAllMetricsFinite(metrics: GaitMetrics): void {
  expect(metrics).toBeDefined();
  expect(metrics).not.toBeNull();

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value === 'number') {
      expect(Number.isFinite(value), `Property '${key}' must be a finite number, received ${value}`).toBe(true);
      expect(Number.isNaN(value), `Property '${key}' must not be NaN`).toBe(false);

      if (key.endsWith('Score')) {
        expect(value, `Score property '${key}' must be >= 0`).toBeGreaterThanOrEqual(0);
        expect(value, `Score property '${key}' must be <= 100`).toBeLessThanOrEqual(100);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (typeof item === 'number') {
          expect(Number.isFinite(item), `Array item '${key}[${idx}]' must be finite`).toBe(true);
        } else if (item && typeof item === 'object') {
          for (const [subKey, subVal] of Object.entries(item)) {
            if (typeof subVal === 'number') {
              expect(Number.isFinite(subVal), `Object property '${key}[${idx}].${subKey}' must be finite`).toBe(true);
            }
          }
        }
      });
    }
  }
}
```

---

## 5. File Placement & Directory Layout

### 5.1 Project Layout Compliance
All source code remains in `src/lib/gait/`. All unit/integration/adversarial test files remain co-located under `src/lib/gait/__tests__/`. Agent metadata (plans, progress, handoffs, briefings) remains in `.agents/explorer_m3_1/`.

```
src/lib/gait/
├── __tests__/
│   ├── testHelpers.ts                          <-- Extended with 6 generator helpers + assertAllMetricsFinite
│   ├── cat1_landmark_jitter_noise.test.ts      <-- Add Gap 1 test case
│   ├── cat2_variable_frame_rate.test.ts        <-- Add Gap 2 test case
│   ├── cat3_landmark_occlusion.test.ts         <-- Add Gap 3 test case
│   ├── cat4_extreme_gait_asymmetry.test.ts     <-- Add Gap 4 test case
│   ├── cat5_micro_steps_parkinsonian.test.ts   <-- Add Gap 5 test case
│   ├── cat6_camera_shake_motion.test.ts        <-- Add Gap 6 test case
│   └── adversarial_gaps.test.ts                <-- Consolidated M3 integration test suite
```

---

## 6. Verification Plan & Quality Checks

### 6.1 Step-by-Step Execution Sequence for Milestone 3 Implementation

1. **Helper Function Additions:**
   - Update `src/lib/gait/__tests__/testHelpers.ts` to export:
     - `generateGaussianNoise`
     - `generateAsymmetricLimbNoiseFrames`
     - `generateBlackoutDropRecoveryFrames`
     - `generateUTurnSelfOcclusionFrames`
     - `generateAntalgicLimpingFrames`
     - `generateUltraHighCadenceParkinsonianFrames`
     - `generateCombined3DCameraMotionFrames`
     - `assertAllMetricsFinite`

2. **Test File Additions:**
   - Update `cat1_landmark_jitter_noise.test.ts` with Gap 1 test.
   - Update `cat2_variable_frame_rate.test.ts` with Gap 2 test.
   - Update `cat3_landmark_occlusion.test.ts` with Gap 3 test.
   - Update `cat4_extreme_gait_asymmetry.test.ts` with Gap 4 test.
   - Update `cat5_micro_steps_parkinsonian.test.ts` with Gap 5 test.
   - Update `cat6_camera_shake_motion.test.ts` with Gap 6 test.
   - Create `src/lib/gait/__tests__/adversarial_gaps.test.ts` combining all 6 test scenarios.

3. **Execution Commands & Threshold Targets:**
   - Run Vitest suite:
     `npx vitest run src/lib/gait/__tests__/cat1_landmark_jitter_noise.test.ts`
     `npx vitest run src/lib/gait/__tests__/cat2_variable_frame_rate.test.ts`
     `npx vitest run src/lib/gait/__tests__/cat3_landmark_occlusion.test.ts`
     `npx vitest run src/lib/gait/__tests__/cat4_extreme_gait_asymmetry.test.ts`
     `npx vitest run src/lib/gait/__tests__/cat5_micro_steps_parkinsonian.test.ts`
     `npx vitest run src/lib/gait/__tests__/cat6_camera_shake_motion.test.ts`
     `npx vitest run src/lib/gait/__tests__/adversarial_gaps.test.ts`
     `npx vitest run` (100% green pass rate across all 867+ tests)
   - Type check:
     `npx tsc --noEmit` (0 errors)
   - Lint check:
     `npx eslint .` (0 errors)

---

## 7. Conclusion & Next Steps
This blueprint provides a fully specified, mathematically sound foundation for implementing Milestone 3. The 6 synthetic test scenarios systematically eliminate the coverage gaps identified during peer review, ensuring the `gait-lab` engine achieves complete resilience across noise, blackout drops, U-turns, severe asymmetry, micro-steps, and camera motion.
