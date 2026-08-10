# Handoff Report: Milestone M1 Explorer 2 — `matchPeople` Refactoring & Velocity-Adaptive Spatial Gating

## 1. Observation

Direct code observations from `src/lib/gait/analysis.ts` (lines 709–816):

### 1.1 Existing Gating Logic Flaw
In `src/lib/gait/analysis.ts`, line 754:
```typescript
const maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);

if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;
```
- **Observation**: The gating check uses `&&` (logical AND).
- **Vulnerability**: If `p.spatialDist` is `0.35` (exceeding `maxAllowedDist = 0.22`), but `p.bioDist` is `0.0` or low such that `p.cost = 0.35 <= 0.40`, the condition `(TRUE && FALSE)` evaluates to `FALSE`. The `continue` statement is skipped, allowing a detection 0.35 normalized units away to be erroneously matched to the track.

### 1.2 Static Spatial Gating for Fast-Walking Subjects
In `src/lib/gait/analysis.ts`, line 752:
```typescript
const maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);
```
- **Observation**: `maxAllowedDist` is statically anchored at base `0.22`.
- **Vulnerability**: For fast-walking subjects (speed > 0.15 normalized screen units/frame step), frame-to-frame displacement frequently exceeds `0.22` normalized units. Even with linear prediction, non-linearities or frame rate fluctuations cause `spatialDist > 0.22`, causing false track rejection, track termination, and duplicate track generation.

### 1.3 Velocity Extrapolation & U-Turn Reversal Lag
In `src/lib/gait/analysis.ts`, lines 727–737 & 763–770:
```typescript
const vx = trk.velocity?.vx ?? 0;
const vy = trk.velocity?.vy ?? 0;
const predHip = {
  x: trk.lastHip.x + vx * gap,
  y: trk.lastHip.y + vy * gap,
  z: 0,
};

const spatialDist = dist(hip, predHip);
const rawDist = dist(hip, trk.lastHip);
const minDist = Math.min(spatialDist, rawDist);
...
const stepVx = (hip.x - trk.lastHip.x) / gap;
const stepVy = (hip.y - trk.lastHip.y) / gap;
const oldVx = trk.velocity?.vx ?? 0;
const oldVy = trk.velocity?.vy ?? 0;
trk.velocity = {
  vx: 0.5 * oldVx + 0.5 * stepVx,
  vy: 0.5 * oldVy + 0.5 * stepVy,
};
```
- **Observation**: `minDist = Math.min(spatialDist, rawDist)` is computed, but when a subject reverses direction (U-turn), `distLast < distPred`. The velocity update uses a fixed 50/50 EMA (`0.5 * oldVx + 0.5 * stepVx`), which retains heavy momentum in the old direction, causing `predHip` to overshoot for 2–3 frames following a directional turn.

### 1.4 Test Suite Status
Executed tool command: `npx vitest run`
Result: 14 test files passed (100% green pass rate across existing unit and integration test suites).

---

## 2. Logic Chain

### 2.1 Gating Condition Fix (`&&` -> Strict `||` / Adaptive Gating)
- **Premise**: Spatial gating is intended to enforce hard physical constraints on frame-to-frame candidate matching.
- **Reasoning**: If spatial distance exceeds the maximum allowable threshold OR total matching cost exceeds the cost gate, candidate assignment MUST be rejected.
- **Deduction**: Changing line 754 from `if (p.spatialDist > maxAllowedDist && p.cost > 0.40)` to strict logical `||`:
  ```typescript
  const maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10);
  if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost) continue;
  ```
  guarantees that ANY candidate with `p.spatialDist > maxAllowedDist` is immediately rejected regardless of biometric similarity, while also rejecting high-cost biometric mismatches.

### 2.2 Velocity-Adaptive Spatial Gating
- **Premise**: Fast-walking subjects cover greater normalized distance per frame step ($v = \sqrt{v_x^2 + v_y^2}$).
- **Reasoning**: The spatial search radius must scale dynamically with track speed magnitude `speed = Math.hypot(vx, vy)`.
- **Deduction**: Adaptively scaling `maxAllowedDist` via:
  ```typescript
  const vx = trk.velocity?.vx ?? 0;
  const vy = trk.velocity?.vy ?? 0;
  const speed = Math.hypot(vx, vy);

  const maxAllowedDist = 
    0.22 + 
    0.15 * Math.min(1.0, speed) + 
    Math.min(0.20, (gap - 1) * 0.08) + 
    (p.bioDist < 0.25 ? 0.08 : 0);
  ```
  - Base threshold: `0.22` for stationary/slow movement.
  - Speed scaling: `+0.15 * Math.min(1.0, speed)` expands tolerance up to `0.37` for fast walkers.
  - Multi-frame gap allowance: `+Math.min(0.20, (gap - 1) * 0.08)` handles frame skips.
  - Biometric bonus: `+0.08` for strong morphological matches.

### 2.3 Dual Spatial Distance & Direction Reversal Velocity Adaptation
- **Premise**: Linear velocity prediction (`predHip = lastHip + velocity * gap`) projects motion forward. During a U-turn or direction flip, `predHip` overshoots, while `lastHip` remains close to the detection.
- **Reasoning**:
  1. `spatialDist` should evaluate `distPred = dist(hip, predHip)` AND `distLast = dist(hip, trk.lastHip)`, setting `spatialDist = Math.min(distPred, distLast)`.
  2. Flag direction flips when `distLast < distPred * 0.8` or when velocity dot product `oldVx * stepVx + oldVy * stepVy < 0`.
- **Deduction**: On direction reversal, adapt velocity EMA weights (`0.2 * oldVx + 0.8 * stepVx`) to rapidly damp old inertia and align the velocity vector with the new movement direction without multi-frame lag.

---

## 3. Caveats

- **Biometric Signature Coordination**: Explorer 1 is updating `BiometricSignature` to scale-invariant ratios (`aspectRatio`, `torsoLegRatio`, `shoulderHipRatio`). The biometric update inside `matchPeople` must update these ratio fields accordingly.
- **Real-Time WebCam Scope**: `matchPeople` in `analysis.ts` handles offline batch frame tracking and multi-person track creation. Real-time webcam target locking is handled in `PoseTracker.ts` (Milestone M2 scope).
- **No Source Code Modifications Made**: Explorer 2 operates under read-only investigation rules. All proposed changes are documented herein for implementation.

---

## 4. Conclusion

### 4.1 Detailed Concrete Refactoring Plan for `matchPeople` in `src/lib/gait/analysis.ts`

Replace lines 709–816 in `src/lib/gait/analysis.ts` with the following implementation:

```typescript
/** Multi-person tracking via velocity motion extrapolation, biometric signature matching, and spatial gating. */
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
  frameIndex?: number,
): number[] {
  const assigned = new Array(detections.length).fill(-1);
  const usedTracks = new Set<number>();
  const currentFrame = frameIndex ?? (tracks.length > 0 ? Math.max(...tracks.map(t => t.lastFrameIndex ?? 0)) + 1 : 0);

  const pairs: { di: number; ti: number; cost: number; spatialDist: number; bioDist: number; isDirectionFlip: boolean }[] = [];
  for (let di = 0; di < detections.length; di++) {
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);

    for (let ti = 0; ti < tracks.length; ti++) {
      const trk = tracks[ti];
      const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));
      const vx = trk.velocity?.vx ?? 0;
      const vy = trk.velocity?.vy ?? 0;
      const predHip = {
        x: trk.lastHip.x + vx * gap,
        y: trk.lastHip.y + vy * gap,
        z: 0,
      };

      const distPred = dist(hip, predHip);
      const distLast = dist(hip, trk.lastHip);
      const minDist = Math.min(distPred, distLast);
      const isDirectionFlip = distLast < distPred * 0.8;
      const bioDist = trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0;

      const cost = minDist + bioDist * 0.25;
      pairs.push({ di, ti, cost, spatialDist: minDist, bioDist, isDirectionFlip });
    }
  }

  pairs.sort((a, b) => a.cost - b.cost);

  for (const p of pairs) {
    if (assigned[p.di] !== -1 || usedTracks.has(p.ti)) continue;
    const trk = tracks[p.ti];
    const gap = Math.max(1, currentFrame - (trk.lastFrameIndex ?? (currentFrame - 1)));

    const vx = trk.velocity?.vx ?? 0;
    const vy = trk.velocity?.vy ?? 0;
    const speed = Math.hypot(vx, vy);

    const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);
    const maxAllowedCost = Math.max(0.45, maxAllowedDist + 0.10);

    if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost) continue;

    assigned[p.di] = trk.id;
    usedTracks.add(p.ti);

    const box = boundingBox(detections[p.di]);
    const hip = hipCenter(detections[p.di]);
    const bio = computeBiometricSignature(detections[p.di]);

    const stepVx = (hip.x - trk.lastHip.x) / gap;
    const stepVy = (hip.y - trk.lastHip.y) / gap;
    const oldVx = trk.velocity?.vx ?? 0;
    const oldVy = trk.velocity?.vy ?? 0;

    const dotProduct = oldVx * stepVx + oldVy * stepVy;
    const isReversal = dotProduct < 0 || p.isDirectionFlip;
    const oldWeight = isReversal ? 0.2 : 0.5;
    const stepWeight = 1.0 - oldWeight;

    trk.velocity = {
      vx: oldWeight * oldVx + stepWeight * stepVx,
      vy: oldWeight * oldVy + stepWeight * stepVy,
    };

    if (trk.biometrics) {
      trk.biometrics = {
        aspectRatio: 0.7 * trk.biometrics.aspectRatio + 0.3 * bio.aspectRatio,
        torsoLegRatio: 0.7 * trk.biometrics.torsoLegRatio + 0.3 * bio.torsoLegRatio,
        shoulderHipRatio: 0.7 * trk.biometrics.shoulderHipRatio + 0.3 * bio.shoulderHipRatio,
      };
    } else {
      trk.biometrics = bio;
    }

    trk.lastHip = hip;
    trk.frames += 1;
    trk.box = box;
    trk.areaSum += box.w * box.h;
    trk.hipYSum += hip.y;
    trk.lastFrameIndex = currentFrame;
    if (!trk.frameIndices) trk.frameIndices = [];
    trk.frameIndices.push(currentFrame);
  }

  for (let di = 0; di < detections.length; di++) {
    if (assigned[di] !== -1) continue;
    const id = nextId.value++;
    assigned[di] = id;
    const box = boundingBox(detections[di]);
    const hip = hipCenter(detections[di]);
    const bio = computeBiometricSignature(detections[di]);
    tracks.push({
      id,
      firstHip: hip,
      lastHip: hip,
      frames: 1,
      box,
      areaSum: box.w * box.h,
      hipYSum: hip.y,
      biometrics: bio,
      firstFrameIndex: currentFrame,
      lastFrameIndex: currentFrame,
      frameIndices: [currentFrame],
      velocity: { vx: 0, vy: 0 },
    });
  }
  return assigned;
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. Run full test suite:
   ```bash
   npx vitest run
   ```
2. Verify TypeScript types:
   ```bash
   npx tsc --noEmit
   ```

### 5.2 Specific Test Cases to Inspect
- `src/lib/gait/__tests__/analysis.test.ts`:
  - `assigns detections to existing tracks within distance threshold <= 0.22`
  - `creates new track when detection distance exceeds threshold > 0.22`
- `src/lib/gait/__tests__/person_identification_stress.test.ts`:
  - `consolidates fragmented tracklets of 1 person walking back and forth into 1 subject`
  - `handles temporary 5-frame occlusion without spawning persistent extra person`
  - `correctly separates 2 distinct people walking side by side across 20 frames`

### 5.3 Invalidation Conditions
- Any Vitest test failure.
- Creation of false duplicate person tracks on single-subject U-turn walk clips.
- Fast-walking subjects failing spatial gate checks.
