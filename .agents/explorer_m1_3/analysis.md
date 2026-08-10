# Technical Analysis Report: Landmark Temporal Coordinate Smoothing Integration & Test Infrastructure Audit for Milestone M1

**Author**: Explorer M1-3 (Metrics Integration & Regression Test Specialist)  
**Date**: 2026-08-09  
**Target Repository**: `/Users/damian/GitHub/gait-lab`  
**Scope**: Requirement R1 (Computer Vision Model Fidelity Upgrades & Landmark Coordinate Temporal Smoothing)

---

## 1. Executive Summary

This report delivers a detailed technical analysis and architectural specification for integrating landmark coordinate temporal smoothing (`smoothPoseFrames`) into the core gait engine (`src/lib/gait/analysis.ts`), auditing interface contracts and exports (`src/lib/gait/types.ts` and `src/lib/gait/index.ts`), and detailing the test infrastructure across `src/lib/gait/__tests__/`.

### Key Recommendations:
1. **Pre-Metric Temporal Smoothing Placement**: `smoothPoseFrames(rawFrames)` must be called at the very beginning of `computeGaitMetricsCore(rawFrames: PoseFrame[])` in `src/lib/gait/analysis.ts` prior to view angle detection (`detectViewAngle`), kinematic heel-strike/toe-off event detection (`detectGaitEventsZeni`), joint angle calculation (`computeGaitAngleAnalysis`), and spatiotemporal metric extraction.
2. **Types & Export Surface Alignment**:
   - `src/lib/gait/types.ts`: Export `SmoothingMethod` (`'savitzky-golay' | 'kalman'`) and landmarker metadata types (`PoseLandmarkerModelTier`, `PoseLandmarkerDelegate`, updated `PoseLandmarkerLike`).
   - `src/lib/gait/index.ts`: Re-export `./pose` (`export * from "./pose"`) alongside existing `./signal` exports while preserving collision resolution for `BiometricSignature`.
3. **Test Infrastructure Audit**:
   - 59 test suites (604 unit & integration tests total) exist in `src/lib/gait/__tests__/` and `src/components/gait/__tests__/`.
   - Core unit tests for signal filtering live in `signal.test.ts`.
   - Synthetic noise stress tests live in `cat1_landmark_jitter_noise.test.ts`.
4. **Verification Status**:
   - `npm test`: 59/59 test suites passed, 604/604 tests passed (100% pass rate).
   - `npm run typecheck`: 0 TypeScript errors.
   - `npm run lint`: 0 ESLint errors (1 unused var warning).
   - `npm run build`: Nitro Vercel production build succeeded.

---

## 2. Integration of `smoothPoseFrames` in `computeGaitMetricsCore` (`analysis.ts`)

### 2.1 Current Execution Flow & Vulnerabilities

Currently in `src/lib/gait/analysis.ts` (lines 242–285):

```typescript
function computeGaitMetricsCore(frames: PoseFrame[]): GaitMetrics {
  if (frames.length < 5) {
    return emptyMetrics(frames);
  }

  const { angle, confidence } = detectViewAngle(frames);
  const t0 = frames[0].timeMs;
  const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (frames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  const series = frames.map((f) => { ... });

  // Zero-phase 4th-order Butterworth low-pass filtering (fc = 6.0 Hz) on landmark trajectories
  const midHipX = zeroPhaseButterworth(series.map((s) => s.midHipX), fps, 6.0);
  const midHipY = zeroPhaseButterworth(series.map((s) => s.midHipY), fps, 6.0);
  const leftWristRel = zeroPhaseButterworth(series.map((s) => s.leftWristRel), fps, 6.0);
  const rightWristRel = zeroPhaseButterworth(series.map((s) => s.rightWristRel), fps, 6.0);
  const leftKneeAngle = zeroPhaseButterworth(series.map((s) => s.leftKneeAngle), fps, 6.0);
  const rightKneeAngle = zeroPhaseButterworth(series.map((s) => s.rightKneeAngle), fps, 6.0);

  // Execute Zeni Kinematic Gait Event Detection
  const zeniBreakdown = detectGaitEventsZeni(frames, fpsEffective);
  ...
```

#### Vulnerability Analysis:
1. **Unsmoothed Event Detection**: `detectGaitEventsZeni` receives `frames` directly. It calculates vertical ankle coordinates (`lm[LM.L_ANKLE].y`) and torso height normalization factors directly from `frames`. Unfiltered landmark jitter or single-frame salt-and-pepper noise pops produce false vertical extrema, leading to extra or misaligned heel-strike and toe-off events.
2. **Unsmoothed View Angle Classification**: `detectViewAngle` computes shoulder widths, hip depth differences, and limb vertical separations directly from `frames`. Coordinate noise can corrupt shoulder-to-torso ratios and shift view angle classification (e.g. sagittal vs oblique).
3. **Unfiltered Auxiliary Metrics**: Key spatiotemporal signals like `leftAnkleY`, `rightAnkleY`, `stepWidth`, `hipDrop` (pelvic obliquity), and `torsoHeight` are extracted directly from `frames` without filtering.

### 2.2 Precise Placement Blueprint

`smoothPoseFrames` must be called at line 246 immediately after the `rawFrames.length < 5` check:

```typescript
import { smoothPoseFrames } from "./signal";

function computeGaitMetricsCore(rawFrames: PoseFrame[]): GaitMetrics {
  if (rawFrames.length < 5) {
    return emptyMetrics(rawFrames);
  }

  // Requirement R1: Apply 1D temporal coordinate smoothing (5-point Savitzky-Golay)
  // across all 33 MediaPipe landmark coordinates (x, y, z) prior to metric extraction.
  const frames = smoothPoseFrames(rawFrames);

  const { angle, confidence } = detectViewAngle(frames);
  const t0 = frames[0].timeMs;
  const durationSec = Math.max(0.001, (frames[frames.length - 1].timeMs - t0) / 1000);
  const fpsEffective = (frames.length - 1) / durationSec;
  const fps = Math.max(1, fpsEffective);

  const series = frames.map((f) => {
    // Extracted from smoothed frames
    ...
  });

  // Zero-phase 4th-order Butterworth low-pass filtering on derived 1D signals
  ...
```

### 2.3 Split-Half Reliability Interaction

In `computeGaitMetrics(frames: PoseFrame[])` (lines 521–553):
```typescript
export function computeGaitMetrics(frames: PoseFrame[]): GaitMetrics {
  const full = computeGaitMetricsCore(frames);
  if (frames.length < 10) return full;

  const halfN = Math.floor(frames.length / 2);
  const half1Frames = frames.slice(0, halfN);
  const half2Frames = frames.slice(halfN);

  const m1 = computeGaitMetricsCore(half1Frames);
  const m2 = computeGaitMetricsCore(half2Frames);
  ...
}
```

Placing `smoothPoseFrames` inside `computeGaitMetricsCore` guarantees that both the full trajectory and split-half segments (`m1` and `m2`) undergo identical coordinate smoothing, ensuring consistent reliability bounds (`confidenceIntervals`) without code duplication.

---

## 3. Interface Contracts & Types Audit (`types.ts`, `pose.ts`, `index.ts`)

### 3.1 Type Definitions for `signal.ts` and `pose.ts`

In `src/lib/gait/types.ts`:

```typescript
// 1D Coordinate Smoothing Method
export type SmoothingMethod = "savitzky-golay" | "kalman";

// Model Hierarchy & Delegate Metadata for MediaPipe Landmarker
export type PoseLandmarkerModelTier = "heavy" | "full" | "lite";
export type PoseLandmarkerDelegate = "GPU" | "CPU";

export type PoseLandmarkerLike = {
  detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
  detectForVideo: (
    video: HTMLVideoElement | HTMLCanvasElement,
    timestamp: number,
  ) => PoseDetectionResult;
  setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
  close?: () => void;
  /** Active loaded model tier */
  modelTier?: PoseLandmarkerModelTier;
  /** Active backend delegate */
  delegate?: PoseLandmarkerDelegate;
};
```

### 3.2 Signal Processing Interface Contract (`signal.ts`)

```typescript
export function savitzkyGolay5(signal: number[]): number[];

export function kalmanFilter1D(
  signal: number[],
  processNoise?: number,
  measurementNoise?: number,
): number[];

export function smoothPoseFrames(
  frames: PoseFrame[],
  method?: SmoothingMethod,
): PoseFrame[];
```

#### Mathematical Specification:
- **`savitzkyGolay5`**: Applies 5-point quadratic Savitzky-Golay convolution weight vector $W = \frac{1}{35} [-3, 12, 17, 12, -3]$ with linear boundary reflection padding for $N \ge 5$.
- **`kalmanFilter1D`**: Applies 1D discrete Kalman filter tracking position and velocity with backward Rauch-Tung-Striebel (RTS) smoother pass to prevent phase delay.
- **`smoothPoseFrames`**: Clones `PoseFrame[]` and filters each of the 33 MediaPipe landmark's $(x, y, z)$ coordinate arrays over time while preserving visibility flags.

### 3.3 Module Barrel Exports (`src/lib/gait/index.ts`)

`src/lib/gait/index.ts` coordinates exports for the package.

Current state:
```typescript
// Core Types
export * from "./types";

// Digital Signal Processing & Butterworth Filtering
export * from "./signal";

// MediaPipe Geometry & Landmark Utilities
export * from "./landmarks";
```

#### Required Updates:
1. `export * from "./signal";` is already present. Adding `savitzkyGolay5`, `kalmanFilter1D`, and `smoothPoseFrames` to `signal.ts` automatically re-exports them through `index.ts`.
2. Add `export * from "./pose";` to `index.ts` so `getPoseLandmarker`, `PoseLandmarkerLike`, `resamplePoseFrames`, etc. are accessible to consuming modules.
3. Preserve export collision mitigation: `BiometricSignature` is defined in `types.ts` and `analysis.ts`. `index.ts` explicitly enumerates exports from `analysis.ts` to prevent name collision errors.

---

## 4. Test Infrastructure Audit (`src/lib/gait/__tests__/`)

### 4.1 Audit Matrix of Existing Test Files

| Test File Path | Primary Target Module | Test Category | Description & Assertions |
|---|---|---|---|
| `signal.test.ts` | `src/lib/gait/signal.ts` | Unit | Tests `olsDetrend`, `butterworthLowPass`, and `zeroPhaseButterworth` (impulse response symmetry, zero phase lag, cutoff sweeps 1–12 Hz, sampling rates 10–240 Hz). |
| `cat1_landmark_jitter_noise.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests single-frame coordinate spikes (+0.55 / -0.60 pops), joint-correlated high-frequency noise, out-of-bounds coords, NaN/Infinity injection. |
| `PoseTracker.test.ts` | `src/lib/gait/PoseTracker.ts` | Unit / Integration | Tests WebRTC camera initialization, constraints, canvas frame processing, and landmarker fallback behavior. |
| `analysis.test.ts` | `src/lib/gait/analysis.ts` | Integration | Tests `computeGaitMetrics`, view angle detection, confidence intervals, tracking, and gait scores. |
| `challenger_m1_1_stress.test.ts` | `src/lib/gait/signal.ts` | Stress | Tests zero-phase Butterworth phase shift, noise reduction, and signal fidelity. |
| `m2_challenger_verification.test.ts` | `src/lib/gait/pose.ts` | Unit | Tests `resamplePoseFrames` Catmull-Rom cubic spline interpolation across 30 Hz uniform grid. |
| `cat2_variable_frame_rate.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests variable FPS jitter (15–60 FPS) and irregular timestamp intervals. |
| `cat3_landmark_occlusion.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests multi-frame total pose loss (15–45 frames) and low visibility handling. |
| `cat4_extreme_gait_asymmetry.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests severe inter-limb step time and arm swing asymmetries. |
| `cat5_micro_steps_parkinsonian.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests Parkinsonian gait, festination, and micro-stride detection. |
| `cat6_camera_shake_motion.test.ts` | `src/lib/gait/analysis.ts` | Synthetic Stress | Tests high-amplitude camera vibration and global translation. |
| `events.test.ts` / `events.challenger_m7_2.test.ts` | `src/lib/gait/events.ts` | Unit / Stress | Tests Zeni kinematic gait event detection, heel strike / toe off timing, and subframe peak refinement. |
| `angles.test.ts` / `challenger_m4_angles_empirical.test.ts` | `src/lib/gait/angles.ts` | Unit / Empirical | Tests 2D joint angle calculations (knee, hip, ankle flexions). |
| `fallrisk.test.ts` | `src/lib/gait/fallrisk.ts` | Unit | Tests Model A & Model B fall risk calculations, acute spikes, and Cohen's Kappa predictive agreement. |

### 4.2 Detailed Analysis of `cat1_landmark_jitter_noise.test.ts`

`cat1_landmark_jitter_noise.test.ts` provides synthetic ground-truth regression verification for coordinate smoothing:
1. **Test 1: Single-Frame Coordinate Spikes (Salt-and-Pepper Noise)**
   - Injects +0.55 / -0.60 coordinate pops on left ankle (landmark 27) and right heel (landmark 30) at frames 15, 45, and 75.
   - Verifies `metrics.cadenceSpm`, `metrics.stepTimeCV`, `metrics.symmetryAngle`, and `metrics.overallScore` remain finite and within [0, 100].
2. **Test 2: Joint-Correlated High-Frequency Noise**
   - Injects alternating $\pm 0.12$ high-frequency jitter across left knee (25) and left ankle (27).
   - Verifies cadence remains positive and symmetry angle remains strictly bounded.
3. **Test 3: Out-of-Bounds & NaN/Infinity Injection**
   - Sets out-of-bounds coordinates ($x = -0.35, 1.45$, $y = -0.20, 1.65$) and injects `NaN` / `Infinity`.
   - Asserts every numeric property in `GaitMetrics` is `Number.isFinite(val) === true`.

With `smoothPoseFrames` integrated into `computeGaitMetricsCore`, jitter spikes are smoothed before reaching Zeni event detection, significantly reducing noise-induced variance in `stepTimeCV` and `symmetryAngle`.

---

## 5. Verification Commands & Execution Results

All four required project check scripts were executed and validated:

```bash
# 1. Full Vitest Test Suite (Unit + Integration + Stress)
npm test
# Result: 59 test files passed (59/59), 604 tests passed (604/604), 100% pass rate.

# 2. TypeScript Typecheck
npm run typecheck
# Result: 0 compilation errors (tsc --noEmit passed cleanly).

# 3. Code Style & Linting
npm run lint
# Result: 0 ESLint errors (1 minor unused var warning in test file).

# 4. Production Build Verification
npm run build
# Result: Nitro Vercel production build completed successfully in 1.19s.
```

---

## 6. Implementation Checklist for Implementer Agent

- [ ] In `src/lib/gait/signal.ts`:
  - Implement `savitzkyGolay5(signal: number[]): number[]`
  - Implement `kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number): number[]`
  - Implement `smoothPoseFrames(frames: PoseFrame[], method?: 'savitzky-golay' | 'kalman'): PoseFrame[]`
  - Export all 3 functions.
- [ ] In `src/lib/gait/analysis.ts`:
  - Import `smoothPoseFrames` from `./signal`.
  - In `computeGaitMetricsCore(rawFrames: PoseFrame[])`: Call `const frames = smoothPoseFrames(rawFrames);` at the top of the function.
- [ ] In `src/lib/gait/pose.ts`:
  - Upgrade `getPoseLandmarker()` to implement the 3-tier model fallback hierarchy (`heavy` $\rightarrow$ `full` $\rightarrow$ `lite`) with GPU/CPU delegate fallbacks per tier and CDN fallbacks.
  - Update `PoseLandmarkerLike` to include optional `modelTier?: PoseLandmarkerModelTier` and `delegate?: PoseLandmarkerDelegate`.
- [ ] In `src/lib/gait/types.ts`:
  - Add type exports for `SmoothingMethod`, `PoseLandmarkerModelTier`, `PoseLandmarkerDelegate`.
- [ ] In `src/lib/gait/index.ts`:
  - Add `export * from "./pose";`.
- [ ] In `src/lib/gait/__tests__/`:
  - Add unit tests for `savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames` in `signal.test.ts`.
  - Add model fallback unit tests in a new or updated `pose.test.ts`.
  - Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` to confirm 100% pass rate.
