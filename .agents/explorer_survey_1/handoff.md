# Handoff Report: Requirement R1 - Person Tracking Accuracy & Re-Identification Investigation

## 1. Observation

### Analyzed Target Files & Code Locations
- **`src/lib/gait/analysis.ts`**:
  - `BiometricSignature` type definition (lines 641-646):
    ```ts
    export type BiometricSignature = {
      aspectRatio: number;
      height: number;
      torsoRatio: number;
      shoulderWidthRatio: number;
    };
    ```
  - `PersonTrack` interface (lines 648-666):
    ```ts
    export type PersonTrack = {
      id: number;
      firstHip?: Landmark;
      lastHip: Landmark;
      frames: number;
      box: ReturnType<typeof boundingBox>;
      areaSum: number;
      hipYSum: number;
      velocity?: { vx: number; vy: number };
      biometrics?: BiometricSignature;
      frameIndices?: number[];
      firstFrameIndex?: number;
      lastFrameIndex?: number;
    };
    ```
  - `computeBiometricSignature` function (lines 668-696):
    ```ts
    export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature {
      const box = boundingBox(landmarks);
      const h = Math.max(0.01, box.h);
      const w = Math.max(0.01, box.w);
      const aspectRatio = w / h;
      ...
      const torsoLen = Math.hypot(sMidX - hMidX, sMidY - hMidY);
      torsoRatio = torsoLen / h;
      const shoulderW = Math.hypot(leftShoulder.x - rightShoulder.x, leftShoulder.y - rightShoulder.y);
      shoulderWidthRatio = shoulderW / h;
      return { aspectRatio, height: h, torsoRatio, shoulderWidthRatio };
    }
    ```
  - `biometricDistance` function (lines 698-706):
    ```ts
    export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number {
      if (!a || !b) return 0;
      const dAspect = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(0.1, a.aspectRatio, b.aspectRatio);
      const dHeight = Math.abs(a.height - b.height) / Math.max(0.1, a.height, b.height);
      const dTorso = Math.abs(a.torsoRatio - b.torsoRatio) / Math.max(0.1, a.torsoRatio, b.torsoRatio);
      const dShoulder = Math.abs(a.shoulderWidthRatio - b.shoulderWidthRatio) / Math.max(0.1, a.shoulderWidthRatio, b.shoulderWidthRatio);

      return dAspect * 0.35 + dHeight * 0.35 + dTorso * 0.15 + dShoulder * 0.15;
    }
    ```
  - `matchPeople` frame matching logic (lines 709-816):
    - Linear constant-velocity extrapolation:
      `predHip = { x: trk.lastHip.x + vx * gap, y: trk.lastHip.y + vy * gap, z: 0 }`
    - Combined distance cost calculation:
      `cost = minDist + bioDist * 0.25`
    - Greedy pair sorting: `pairs.sort((a, b) => a.cost - b.cost)`
    - Gating condition (line 754):
      `if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;`
      where `maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0)`.
    - Spawning new track IDs (lines 793-814):
      Unassigned detections generate new track IDs (`id = nextId.value++`).
  - `mergeFragmentedTracks` post-processing (lines 822-905):
    - Checks tracklet overlap (`overlap > 1 continue`).
    - Biometric distance threshold (`bioDist > 0.38 continue`).
    - Spatial gap distance calculation: `minDist = Math.min(gapDist, directDist)`.
    - Gating threshold: `maxDist = 0.28 + Math.min(0.25, frameGap * 0.05)`.
    - Merge condition: `if (minDist <= maxDist && (bioDist < 0.28 || minDist <= 0.25))`.

- **`src/lib/gait/PoseTracker.ts`**:
  - Live webcam candidate target selection loop (lines 333-356):
    ```ts
    if (result.landmarks.length > 1) {
      let maxScore = -Infinity;
      for (let pIdx = 0; pIdx < result.landmarks.length; pIdx++) {
        const lms = toLandmarks(result.landmarks[pIdx]);
        const hip = hipCenter(lms);
        const box = boundingBox(lms);
        const area = box.w * box.h;

        let score = area * 2;
        if (this.lastTargetHip) {
          const d = Math.hypot(hip.x - this.lastTargetHip.x, hip.y - this.lastTargetHip.y);
          score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2;
        }
        if (score > maxScore) {
          maxScore = score;
          bestIdx = pIdx;
        }
      }
    }
    ```

- **Stress Test Suite (`src/lib/gait/__tests__/person_identification_stress.test.ts`)**:
  - Unit test suite testing invariant biometric signatures, track consolidation across U-turns (frames 0..22), temporary 5-frame occlusions, separating side-by-side subjects, and filtering 1-frame background noise.

---

## 2. Logic Chain

1. **Scale Changes Cause False Duplicate Tracks**:
   - *Observation*: `biometricDistance` computes `dHeight` based on absolute image height `h` (lines 700, 705 of `analysis.ts`) with a weight of 0.35 ($0.35 \cdot dHeight$).
   - *Reasoning*: Absolute height `h` in normalized image coordinates $[0, 1]$ depends directly on subject distance from camera. As a subject walks towards the camera, `h` increases (e.g. 0.25 $\rightarrow$ 0.50), resulting in $dHeight = |0.25 - 0.50| / 0.50 = 0.50$.
   - *Deduction*: Perspective scale changes artificially inject a $+0.175$ penalty into `bioDist`. When combined with frame-to-frame pixel speed changes, `cost` exceeds $0.40$, causing `matchPeople` to reject the detection and spawn a duplicate track.

2. **U-Turns Break Tracking Identity**:
   - *Observation*: `matchPeople` uses constant velocity prediction `predHip = lastHip + velocity * gap` (lines 729-733) and `computeBiometricSignature` measures 2D projected `shoulderWidthRatio` (line 693).
   - *Reasoning*: During a U-turn:
     1. Velocity changes direction ($v_x$ flips sign), making linear velocity extrapolation predict movement in the opposite direction. The spatial error $spatialDist$ between predicted and actual hip location spikes.
     2. 2D body orientation rotates from frontal to lateral profile, collapsing 2D projected shoulder width ($shoulderW$). `shoulderWidthRatio` drops from ~0.25 to ~0.10, causing a spike in $dShoulder$ and `bioDist`.
   - *Deduction*: Both $spatialDist$ and $bioDist$ spike simultaneously during U-turns. The gating condition `(spatialDist > maxAllowedDist && cost > 0.40)` evaluates to `true`, dropping identity lock and creating a new track ID.

3. **Temporary Occlusions (2-10 Frames) Lead to Track Fragmentation**:
   - *Observation*: `matchPeople` caps spatial gate expansion at `0.22 + min(0.20, (gap - 1) * 0.08)` ($0.42$ cap) for frame gaps $gap \ge 2$.
   - *Reasoning*: When a subject is occluded for 5 to 10 frames ($gap = 6$ to $11$), non-linear motion or scale changes during occlusion cause actual re-appearance position to deviate from constant-velocity extrapolation by $> 0.42$ normalized units.
   - *Deduction*: Re-appearing detections are rejected during live `matchPeople` calls. While `mergeFragmentedTracks` attempts post-hoc consolidation, its strict threshold (`bioDist < 0.28 || minDist <= 0.25`) fails if scale or orientation changed during occlusion.

4. **Greedy Matching & Flawed Gate Condition**:
   - *Observation*: `matchPeople` sorts pairs greedily (`pairs.sort((a, b) => a.cost - b.cost)`) and uses `if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;`.
   - *Reasoning*:
     1. Greedy sorting allows noise detections to claim tracks out of order.
     2. The `&&` operator in the gating condition allows matches when `spatialDist` is excessively large if `cost <= 0.40`, or conversely rejects valid tracking when `spatialDist` is small but `cost > 0.40`.

5. **Live Webcam Lock Hijacking in `PoseTracker.ts`**:
   - *Observation*: `PoseTracker.ts` candidate selection formula `score = area * 2 - d * 4 + 1.0` heavily weights bounding box area (`area * 2`).
   - *Reasoning*: A background passerby walking closer to the camera has a larger bounding box area (`area`). The area term $2 \cdot area$ outweighs the spatial distance penalty $-4 \cdot d$, hijacking the target lock. `PoseTracker.ts` lacks multi-track history, biometric gating, and velocity prediction.

---

## 3. Caveats

- **Scope Boundary**: This investigation is read-only. No source files under `src/lib/gait/` or tests were modified during this analysis.
- **Hardware Variability**: Camera frame rate fluctuations (e.g. dropping from 30 FPS to 15 FPS under CPU load) increase effective frame gap $gap$, exacerbating linear velocity extrapolation error.
- **2D Landmark Depth Limitation**: MediaPipe 2D landmarks lack absolute 3D depth measurements; spatial distances are evaluated in normalized 2D image plane coordinates $[0, 1]$.

---

## 4. Conclusion

Existing person tracking in `gait-lab` relies on `matchPeople` and `mergeFragmentedTracks` in `src/lib/gait/analysis.ts`, and single-target heuristic selection in `src/lib/gait/PoseTracker.ts`.

### Root Causes of False Duplicate Person Tracks:
1. **Non-Scale-Invariant Biometrics**: Absolute image height $h$ in `BiometricSignature` ($0.35 \cdot dHeight$) penalizes natural scale changes as a subject approaches/recedes from the camera.
2. **U-Turn Projection Distortion & Velocity Inversion**: Fixed linear velocity extrapolation + 2D shoulder width collapse cause $spatialDist$ and $bioDist$ to spike during turns.
3. **Flawed `&&` Gating Logic**: `if (p.spatialDist > maxAllowedDist && p.cost > 0.40)` allows spatial leaps while inappropriately dropping tracks during turns/fast walking.
4. **Live Target Lock Hijacking**: `PoseTracker.ts` relies on bounding box area without biometric signature or velocity motion extrapolation, allowing background passersby to steal lock.

### Actionable Fix Recommendations:
1. **Scale-Invariant Biometric Signature**: Replace absolute `height` with scale-invariant morphological ratios ($w/h$, torso-to-leg ratio, shoulder-to-hip width ratio). Re-weight `biometricDistance`.
2. **Correct Gating Operator**: Replace `&&` with strict logical OR/adaptive thresholds (`spatialDist > maxAllowedDist || cost > maxAllowedCost`).
3. **Adaptive U-Turn & Fast-Walking Motion Model**: Incorporate dual spatial distance checking (last position vs predicted position) and zero-velocity damping on direction reversals.
4. **Kalman Filter / Adaptive Occlusion Uncertainty**: Replace 1st-order EMA velocity with a position-velocity state filter, expanding search radius dynamically over 2-10 frame occlusions.
5. **Biometric Target Locking in `PoseTracker.ts`**: Incorporate biometric signature gating and multi-frame track memory into live webcam target selection.

---

## 5. Verification Method

To verify these findings and test future implementations:
1. **Run Vitest Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts
   ```
2. **Run Full Unit & Regression Suite**:
   ```bash
   npx vitest run
   ```
3. **Run TypeScript Verification**:
   ```bash
   npx tsc --noEmit
   ```
4. **Inspection Points**:
   - Inspect `src/lib/gait/analysis.ts` lines 641-816 for biometric distance calculation, velocity prediction, and matching gating.
   - Inspect `src/lib/gait/PoseTracker.ts` lines 333-356 for live candidate score calculation.
