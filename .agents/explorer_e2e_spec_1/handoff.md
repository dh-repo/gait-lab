# Technical Specification & Design Report: Multi-Person Scenario Generator (`generateMultiPersonScenario`)

**Author**: `explorer_e2e_spec_1` (Explorer - Test Helper Generator Spec)  
**Target Milestone**: TM1 (Test Helper Extension)  
**Target File**: `src/lib/gait/__tests__/testHelpers.ts`  
**Date**: 2026-08-09  

---

## 1. Observation

### Current Test Helper & Multi-Person Tracking Architecture

1. **Existing Test Helper Functions (`src/lib/gait/__tests__/testHelpers.ts`)**:
   - `generateSyntheticWalkingFrames(opts: SyntheticFrameOptions)` (lines 59–150): Generates single-subject 33-landmark `PoseFrame[]` sequences at 30 FPS.
   - `generateStationaryPoseFrames(fps, durationSec)` (lines 152–175): Generates single-subject static standing pose frames.
   - `generateNoisyPoseFrames(fps, durationSec, noiseLevel)` (lines 177–179): Wrapper around `generateSyntheticWalkingFrames` with noise.
   - **Limitation**: `testHelpers.ts` ONLY supports **single-person pose frame streams**. There is **zero support** for multi-person frames, crossing passerby trajectories, static observers, scale transitions, continuous U-turns, fast walking, or variable occlusion sweeps.

2. **Existing Test Multi-Person Mocking (`src/lib/gait/__tests__/person_identification_stress.test.ts`)**:
   - File relies on a local helper `mockPersonLandmarks(x, y, height, width)` (lines 12–33) which creates a crude 7-joint skeleton box (shoulders, hips, head, ankles) with constant visibility.
   - Multi-person frame arrays are assembled manually in loops, e.g.:
     ```ts
     // Line 103-105: manual side-by-side assembly
     const p1 = mockPersonLandmarks(x1, 0.5, 0.6, 0.2);
     const p2 = mockPersonLandmarks(x2, 0.5, 0.5, 0.18);
     matchPeople([p1, p2], tracks, nextId, f);
     ```
   - **Limitation**: Manually constructed boxes lack realistic walking gait dynamics (knee flexion, ankle oscillation, heel strikes, arm swing, visibility noise) and do not simulate realistic video trajectories (crossing paths, scale dynamics, continuous turnaround curves).

3. **Detection Input Signatures in Tracking Pipeline**:
   - **Batch Tracking (`src/lib/gait/analysis.ts`)**:
     - `matchPeople(detections: Landmark[][], tracks: PersonTrack[], nextId: { value: number }, frameIndex?: number)`
     - Accepts `detections: Landmark[][]` per frame, where each element is a 33-landmark array.
   - **Live Streaming (`src/lib/gait/PoseTracker.ts`)**:
     - `PoseLandmarkerLike.detectForVideo(...)` returns `PoseDetectionResult` where `landmarks: Array<Array<{ x, y, z, visibility }>>`.
   - **Conclusion on Data Format**: Synthetic multi-person frame sequences MUST format detections as `Landmark[][]` per frame (matching MediaPipe's `PoseDetectionResult.landmarks`).

4. **Required Features Checklist (Requirement R3 & TM1)**:
   - Must support 7 core scenario requirements:
     1. Primary target person trajectory
     2. Crossing background passerby (trajectory intersecting or near target)
     3. Static background observer (stationary pose over time)
     4. Dynamic scale changes (bounding box height changing from 0.15 to 0.85 normalized frame height)
     5. Continuous U-turns (heading direction reversals)
     6. Fast walking trajectories ($\Delta x \ge 0.08$ / frame)
     7. Occlusions lasting 2 to 10 frames (missing or severely degraded keypoints/boxes)

---

## 2. Logic Chain

### Step-by-Step Design Derivation

1. **Why Extend `testHelpers.ts` instead of writing inline test mocks?**:
   - Observations 1 & 2 show inline test mocks lead to brittle, low-fidelity tests that miss real-world kinematic edge cases.
   - A centralized, parameterizable `generateMultiPersonScenario(config)` provides high-fidelity synthetic ground truth across all E2E test suites (`person_identification_stress.test.ts` and `PoseTracker_target_lock.test.ts`).

2. **Data Structure Specification**:
   - Each frame needs both the raw MediaPipe-compatible detection payload (`landmarks: Landmark[][]`) and ground-truth metadata (`groundTruthPersonIds: string[]`) so tests can easily verify whether tracked IDs match expected roles (`'target'`, `'passerby'`, `'observer'`).
   - Return type `MultiPersonScenarioResult` contains:
     - `frames: MultiPersonFrame[]`
     - `groundTruthTracks: Map<string, GroundTruthTrackInfo>`
     - `config: MultiPersonScenarioConfig`

3. **Mathematical Mechanics for Required 7 Scenario Conditions**:

   - **Requirement 1: Primary Target Trajectory**:
     - 33 MediaPipe landmarks per pose frame.
     - Walking dynamics: Step frequency $f_{\text{step}} = 1.6\text{ Hz}$.
     - Sinusoidal ankle oscillation: $x_{\text{ankle}} = x_{\text{hip}} \pm \text{stride} \cdot \sin(2\pi f_{\text{step}} t)$.
     - Knee flexion: $y_{\text{knee}} = y_{\text{hip}} + \Delta y + 0.03 \sin(2\pi f_{\text{step}} t)$.

   - **Requirement 2: Crossing Background Passerby**:
     - Passerby starts at $(x_{p,0}, y_{p,0})$ (e.g. $x=0.9$) and moves with direction vector $(-1, 0)$ towards $(x_{p,\text{end}}, y_{p,\text{end}})$.
     - At frame $f_{\text{cross}} = \text{totalFrames} / 2$, target position $(x_t, y_t)$ and passerby position $(x_p, y_p)$ intersect within $|x_t - x_p| < 0.04$, testing spatial gating and ID preservation under path overlap.

   - **Requirement 3: Static Background Observer**:
     - Observer stays at fixed spatial coordinates $(x_{\text{obs}}, y_{\text{obs}}) = (0.85, 0.50)$ with fixed scale $h = 0.60$.
     - Subtle landmark shimmer noise ($\sigma < 0.001$) simulated to prevent artificial static zero-variance artifacts.

   - **Requirement 4: Dynamic Scale Changes ($0.15 \to 0.85$)**:
     - Bounding box height $h(f)$ scales linearly (or non-linearly) over frame range $[f_{\text{start}}, f_{\text{end}}]$:
       $$h(f) = h_{\text{start}} + \frac{f - f_{\text{start}}}{f_{\text{end}} - f_{\text{start}}} (h_{\text{end}} - h_{\text{start}})$$
     - Landmark relative positions (head offset, torso height, leg length, shoulder width) scale directly with $h(f)$:
       $$y_{\text{head}}(f) = y_{\text{hip}}(f) - 0.5 \cdot h(f)$$
       $$w_{\text{shoulder}}(f) = h(f) \cdot \text{shoulderWidthRatio}$$
     - Validates scale-invariant biometric signature calculation ($\text{aspectRatio}$, $\text{torsoRatio}$, $\text{shoulderWidthRatio}$).

   - **Requirement 5: Continuous U-Turns**:
     - Reverses direction over $N_{\text{turn}}$ frames (e.g. 5–8 frames) centered at $f_{\text{turn}}$.
     - Heading angle $\theta(f)$ transitions smoothly using a raised cosine curve:
       $$\theta(f) = \pi \cdot \left( \frac{1 - \cos(\pi \cdot u)}{2} \right) \quad \text{for } u = \frac{f - (f_{\text{turn}} - N_{\text{turn}}/2)}{N_{\text{turn}}} \in [0, 1]$$
     - Velocity $v_x(f) = v_{\text{max}} \cdot \cos(\theta(f))$.
     - Heading rotation smoothly transitions facing angle from sagittal to frontal to reverse sagittal, adjusting apparent shoulder width and depth $z$.

   - **Requirement 6: Fast Walking Trajectories**:
     - Fast walking parameter sets $v_{\text{walk}} \ge 0.08$ normalized units per frame (at 30 FPS, $v_{\text{walk}} = 0.08$ is fast lateral motion).
     - Step frequency $f_{\text{step}}$ increases to $2.2\text{ Hz}$, wrist and ankle swing amplitudes double.
     - Validates that spatial matching gates ($\text{maxAllowedDist}$) and velocity motion projection ($\mathbf{v} \cdot \Delta t$) catch fast-moving targets without spawning duplicate tracklets.

   - **Requirement 7: Occlusion Sweeps (2 to 10 frames)**:
     - Supports configurable occlusion gaps from 2 to 10 frames.
     - Occlusion modes:
       - `'missing'`: Person landmark array is excluded from frame `landmarks` array (simulates total detection loss).
       - `'degraded'`: Person landmarks are present but key joint visibilities are set to $< 0.10$ and coordinates corrupted (simulates severe motion blur / clutter).
     - Tests linear velocity motion prediction ($\text{predHip} = \text{lastHip} + \mathbf{v} \cdot \text{gap}$) and tracklet merging (`mergeFragmentedTracks`).

---

## 3. Caveats

1. **Read-Only Scope**: This report defines the complete technical design specification. The implementation will be committed by the implementer agent in milestone TM1.
2. **Deterministic Randomness**: Synthetic noise generators should accept an optional `seed` parameter or use a deterministic PRNG so test runs remain 100% reproducible across CI environments.
3. **Detection Order Randomization**: Real MediaPipe detection outputs may return candidate poses in arbitrary spatial order. `generateMultiPersonScenario` must include an optional `randomizeDetectionOrder: boolean` option to ensure tracking logic (`matchPeople`) does not depend on candidate ordering.

---

## 4. Conclusion

### Complete Technical Specification & Proposed Code Implementation

The proposed design extends `src/lib/gait/__tests__/testHelpers.ts` with TypeScript interfaces and the function `generateMultiPersonScenario(config)`.

#### Type Definitions to Add to `testHelpers.ts`:

```ts
export type TrajectoryType = 'linear' | 'uturn' | 'static' | 'crossing' | 'fast_walking';

export interface PersonOcclusionConfig {
  startFrame: number;
  durationFrames: number; // 2 to 10 frames
  type?: 'missing' | 'degraded';
}

export interface PersonScaleConfig {
  startHeight: number; // e.g. 0.15
  endHeight: number;   // e.g. 0.85
  startFrame?: number;
  endFrame?: number;
}

export interface PersonUTurnConfig {
  turnFrame: number;
  turnDurationFrames?: number; // default: 6 frames
}

export interface PersonTrajectoryConfig {
  id: string; // e.g. "target", "passerby", "observer"
  role?: 'target' | 'passerby' | 'observer' | 'custom';
  
  // Starting spatial state
  initialX?: number; // 0..1 frame coordinates
  initialY?: number; // 0..1 frame coordinates
  initialHeight?: number; // e.g. 0.60
  
  // Trajectory behavior
  trajectoryType?: TrajectoryType;
  speed?: number; // norm units/sec (e.g. 0.15 for normal, 0.35 for fast walking)
  direction?: 1 | -1; // 1: left-to-right, -1: right-to-left
  
  // Frame active bounds
  startFrame?: number;
  endFrame?: number;

  // Feature specific configs
  scaleChange?: PersonScaleConfig;
  uTurn?: PersonUTurnConfig;
  occlusions?: PersonOcclusionConfig[];

  // Biometrics & noise
  stepFrequencyHz?: number;
  asymmetryFactor?: number;
  noiseLevel?: number;
  shoulderWidthRatio?: number;
  torsoRatio?: number;
}

export interface MultiPersonScenarioConfig {
  fps?: number; // default 30
  durationSec?: number; // default 3.0
  totalFrames?: number; // default derived from fps * durationSec
  
  // Detailed per-person configs
  people?: PersonTrajectoryConfig[];

  // Shorthand scenario flags (for rapid test construction)
  includeCrossingPasserby?: boolean;
  includeStaticObserver?: boolean;
  enableTargetUTurn?: boolean;
  enableTargetScaleChange?: boolean;
  enableFastWalking?: boolean;
  targetOcclusion?: PersonOcclusionConfig;

  // Evaluation flags
  randomizeDetectionOrder?: boolean;
}

export interface MultiPersonFrame {
  frameIndex: number;
  timeMs: number;
  landmarks: Landmark[][];
  groundTruthPersonIds: string[];
}

export interface GroundTruthTrackInfo {
  id: string;
  role: string;
  startFrame: number;
  endFrame: number;
  totalFrames: number;
}

export interface MultiPersonScenarioResult {
  frames: MultiPersonFrame[];
  groundTruthTracks: Map<string, GroundTruthTrackInfo>;
  config: MultiPersonScenarioConfig;
}
```

#### Complete Implementation Blueprint (`generateMultiPersonScenario`):

```ts
/**
 * Generates synthetic multi-person frame sequences for gait tracking, re-identification,
 * target lock, and background suppression stress testing.
 */
export function generateMultiPersonScenario(
  config: MultiPersonScenarioConfig = {}
): MultiPersonScenarioResult {
  const fps = config.fps ?? 30;
  const durationSec = config.durationSec ?? 3.0;
  const totalFrames = config.totalFrames ?? Math.floor(fps * durationSec);

  // Assemble people configurations (supporting both explicit `people` array and convenience flags)
  const peopleConfigs: PersonTrajectoryConfig[] = config.people ? [...config.people] : [];

  // If no explicit target provided in `people`, create default target
  let targetConfig = peopleConfigs.find(p => p.id === 'target' || p.role === 'target');
  if (!targetConfig) {
    targetConfig = {
      id: 'target',
      role: 'target',
      initialX: 0.15,
      initialY: 0.5,
      initialHeight: config.enableTargetScaleChange ? 0.15 : 0.60,
      speed: config.enableFastWalking ? 0.35 : 0.15,
      direction: 1,
      trajectoryType: config.enableFastWalking ? 'fast_walking' : 'linear',
      scaleChange: config.enableTargetScaleChange
        ? { startHeight: 0.15, endHeight: 0.85, startFrame: 0, endFrame: totalFrames - 1 }
        : undefined,
      uTurn: config.enableTargetUTurn
        ? { turnFrame: Math.floor(totalFrames / 2), turnDurationFrames: 6 }
        : undefined,
      occlusions: config.targetOcclusion ? [config.targetOcclusion] : undefined,
    };
    peopleConfigs.push(targetConfig);
  }

  // Shorthand flag: crossing passerby
  if (config.includeCrossingPasserby && !peopleConfigs.some(p => p.id === 'passerby')) {
    peopleConfigs.push({
      id: 'passerby',
      role: 'passerby',
      initialX: 0.85,
      initialY: 0.5,
      initialHeight: 0.55,
      speed: 0.18,
      direction: -1,
      trajectoryType: 'crossing',
      startFrame: Math.max(0, Math.floor(totalFrames * 0.2)),
      endFrame: Math.min(totalFrames - 1, Math.floor(totalFrames * 0.8)),
    });
  }

  // Shorthand flag: static observer
  if (config.includeStaticObserver && !peopleConfigs.some(p => p.id === 'observer')) {
    peopleConfigs.push({
      id: 'observer',
      role: 'observer',
      initialX: 0.85,
      initialY: 0.45,
      initialHeight: 0.60,
      speed: 0,
      trajectoryType: 'static',
    });
  }

  const frames: MultiPersonFrame[] = [];
  const groundTruthTracks = new Map<string, GroundTruthTrackInfo>();

  // Track frame activity for ground truth summary
  for (const p of peopleConfigs) {
    const start = p.startFrame ?? 0;
    const end = p.endFrame ?? totalFrames - 1;
    groundTruthTracks.set(p.id, {
      id: p.id,
      role: p.role ?? 'custom',
      startFrame: start,
      endFrame: end,
      totalFrames: Math.max(0, end - start + 1),
    });
  }

  // Generate per-frame pose landmarks for each person
  for (let f = 0; f < totalFrames; f++) {
    const timeMs = (f / fps) * 1000;
    const frameLandmarks: Landmark[][] = [];
    const framePersonIds: string[] = [];

    for (const p of peopleConfigs) {
      const start = p.startFrame ?? 0;
      const end = p.endFrame ?? totalFrames - 1;
      if (f < start || f > end) continue;

      // Check occlusions
      let isOccluded = false;
      let isDegraded = false;
      if (p.occlusions) {
        for (const occ of p.occlusions) {
          if (f >= occ.startFrame && f < occ.startFrame + occ.durationFrames) {
            if (occ.type === 'degraded') {
              isDegraded = true;
            } else {
              isOccluded = true;
            }
            break;
          }
        }
      }

      if (isOccluded) continue; // Skip missing detection frames

      const lms = generateSinglePersonLandmarks(p, f, totalFrames, fps, isDegraded);
      frameLandmarks.push(lms);
      framePersonIds.push(p.id);
    }

    // Optional detection order randomization
    if (config.randomizeDetectionOrder && frameLandmarks.length > 1) {
      for (let i = frameLandmarks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [frameLandmarks[i], frameLandmarks[j]] = [frameLandmarks[j], frameLandmarks[i]];
        [framePersonIds[i], framePersonIds[j]] = [framePersonIds[j], framePersonIds[i]];
      }
    }

    frames.push({
      frameIndex: f,
      timeMs,
      landmarks: frameLandmarks,
      groundTruthPersonIds: framePersonIds,
    });
  }

  return {
    frames,
    groundTruthTracks,
    config,
  };
}

/**
 * Computes 33 MediaPipe pose landmarks for a specific person trajectory state at frame f.
 */
function generateSinglePersonLandmarks(
  p: PersonTrajectoryConfig,
  f: number,
  totalFrames: number,
  fps: number,
  isDegraded = false
): Landmark[] {
  const t = f / fps;
  const initialX = p.initialX ?? 0.15;
  const initialY = p.initialY ?? 0.50;
  const speed = p.speed ?? 0.15;
  const initialDir = p.direction ?? 1;

  // 1. Calculate current scale height h(f)
  let currentHeight = p.initialHeight ?? 0.60;
  if (p.scaleChange) {
    const scStart = p.scaleChange.startFrame ?? 0;
    const scEnd = p.scaleChange.endFrame ?? totalFrames - 1;
    const progress = Math.min(1, Math.max(0, (f - scStart) / Math.max(1, scEnd - scStart)));
    currentHeight = p.scaleChange.startHeight + progress * (p.scaleChange.endHeight - p.scaleChange.startHeight);
  }

  // 2. Calculate spatial position (x, y) and heading angle theta
  let currentDir = initialDir;
  let posX = initialX;
  let posY = initialY;

  if (p.trajectoryType === 'static') {
    posX = initialX;
    posY = initialY;
  } else if (p.uTurn && p.uTurn.turnFrame !== undefined) {
    const turnCenter = p.uTurn.turnFrame;
    const turnDuration = p.uTurn.turnDurationFrames ?? 6;
    const turnStart = turnCenter - Math.floor(turnDuration / 2);
    const turnEnd = turnStart + turnDuration;

    if (f < turnStart) {
      posX = initialX + initialDir * speed * (f / fps);
    } else if (f >= turnEnd) {
      const distBeforeTurn = speed * (turnStart / fps);
      const turnProgressDist = speed * (turnDuration / fps) * 0.5;
      const distAfterTurn = speed * ((f - turnEnd) / fps);
      posX = initialX + initialDir * (distBeforeTurn + turnProgressDist) - initialDir * distAfterTurn;
      currentDir = -initialDir as (1 | -1);
    } else {
      // Transition phase during U-turn
      const u = (f - turnStart) / turnDuration;
      const angle = Math.PI * (1 - Math.cos(Math.PI * u)) / 2; // Smooth cosine curve 0 -> PI
      const distBeforeTurn = speed * (turnStart / fps);
      const turnDx = speed * (u * turnDuration / fps) * Math.cos(angle);
      posX = initialX + initialDir * (distBeforeTurn + turnDx);
      posY = initialY + 0.02 * Math.sin(angle); // slight y-drift during turn
    }
  } else {
    // Linear / Fast Walking / Crossing
    posX = initialX + initialDir * speed * (f / fps);
  }

  // 3. Compute gait kinematics
  const freq = p.stepFrequencyHz ?? (p.trajectoryType === 'fast_walking' ? 2.2 : 1.6);
  const noiseLevel = p.noiseLevel ?? 0;
  const noise = () => (noiseLevel > 0 ? (Math.random() - 0.5) * noiseLevel : 0);

  const shoulderWidthRatio = p.shoulderWidthRatio ?? 0.25;
  const shoulderWidth = currentHeight * shoulderWidthRatio;
  const torsoHeight = currentHeight * (p.torsoRatio ?? 0.33);

  const midHipX = posX + noise();
  const midHipY = posY + noise();

  const leftPhase = 2 * Math.PI * freq * t;
  const rightPhase = leftPhase + Math.PI;

  const strideLength = 0.25 * currentHeight;
  const leftAnkleOffset = strideLength * Math.sin(leftPhase);
  const rightAnkleOffset = strideLength * Math.sin(rightPhase);

  const leftAnkleX = midHipX + currentDir * leftAnkleOffset + noise();
  const rightAnkleX = midHipX + currentDir * rightAnkleOffset + noise();

  const groundY = midHipY + currentHeight * 0.5;
  const leftAnkleY = groundY - 0.05 * currentHeight * Math.max(0, Math.sin(leftPhase)) + noise();
  const rightAnkleY = groundY - 0.05 * currentHeight * Math.max(0, Math.sin(rightPhase)) + noise();

  const vis = isDegraded ? 0.05 : 0.90;

  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: vis }));

  // Head (Nose 0)
  landmarks[0] = { x: midHipX, y: midHipY - torsoHeight - 0.15 * currentHeight, z: 0, visibility: vis };

  // Shoulders (11, 12)
  landmarks[11] = { x: midHipX - shoulderWidth / 2, y: midHipY - torsoHeight, z: 0, visibility: vis };
  landmarks[12] = { x: midHipX + shoulderWidth / 2, y: midHipY - torsoHeight, z: 0, visibility: vis };

  // Wrists (15, 16)
  landmarks[15] = { x: midHipX - 0.15 * currentHeight * Math.sin(leftPhase), y: midHipY - torsoHeight * 0.5, z: 0, visibility: vis };
  landmarks[16] = { x: midHipX + 0.15 * currentHeight * Math.sin(rightPhase), y: midHipY - torsoHeight * 0.5, z: 0, visibility: vis };

  // Hips (23, 24)
  landmarks[23] = { x: midHipX - 0.08 * currentHeight, y: midHipY, z: 0, visibility: vis };
  landmarks[24] = { x: midHipX + 0.08 * currentHeight, y: midHipY, z: 0, visibility: vis };

  // Knees (25, 26)
  landmarks[25] = { x: (midHipX + leftAnkleX) / 2, y: midHipY + currentHeight * 0.25 + 0.02 * currentHeight * Math.sin(leftPhase), z: 0, visibility: vis };
  landmarks[26] = { x: (midHipX + rightAnkleX) / 2, y: midHipY + currentHeight * 0.25 + 0.02 * currentHeight * Math.sin(rightPhase), z: 0, visibility: vis };

  // Ankles (27, 28)
  landmarks[27] = { x: leftAnkleX, y: leftAnkleY, z: 0, visibility: vis };
  landmarks[28] = { x: rightAnkleX, y: rightAnkleY, z: 0, visibility: vis };

  // Heels (29, 30)
  landmarks[29] = { x: leftAnkleX - 0.03 * currentDir * currentHeight, y: leftAnkleY, z: 0, visibility: vis };
  landmarks[30] = { x: rightAnkleX - 0.03 * currentDir * currentHeight, y: rightAnkleY, z: 0, visibility: vis };

  // Foot Index (31, 32)
  landmarks[31] = { x: leftAnkleX + 0.05 * currentDir * currentHeight, y: leftAnkleY + 0.01 * currentHeight, z: 0, visibility: vis };
  landmarks[32] = { x: rightAnkleX + 0.05 * currentDir * currentHeight, y: rightAnkleY + 0.01 * currentHeight, z: 0, visibility: vis };

  return landmarks;
}
```

---

## 5. Verification Method

### How to Independently Verify Implementation

1. **Type Check Verification**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Result*: 0 compilation errors across `src/lib/gait/__tests__/testHelpers.ts` and consumers.

2. **Unit Test Execution**:
   ```bash
   npx vitest run src/lib/gait/__tests__/
   ```
   *Expected Result*: All existing tests continue to pass (100% green).

3. **Generator Output Sanity Verification**:
   - Write a unit test `testHelpers.test.ts` verifying:
     - `generateMultiPersonScenario({ includeCrossingPasserby: true })` produces frames with 2 detections per frame around mid-clip.
     - `generateMultiPersonScenario({ targetOcclusion: { startFrame: 10, durationFrames: 5 } })` omits target landmarks from frames 10..14.
     - `generateMultiPersonScenario({ enableTargetScaleChange: true })` produces increasing landmark distances for target from frame 0 to frame end.
