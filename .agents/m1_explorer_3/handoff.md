# Handoff Report: `mergeFragmentedTracks` Refactoring & Tracklet Consolidation Plan

## 1. Observation

### Existing Code Analysis (`src/lib/gait/analysis.ts`, lines 822–905)
In `src/lib/gait/analysis.ts`, `mergeFragmentedTracks` consolidates fragmented `PersonTrack` objects generated during multi-person tracking:

```typescript
// lines 843–867 (current implementation)
const set1 = new Set(earlier.frameIndices || []);
let overlap = 0;
for (const idx of later.frameIndices || []) {
  if (set1.has(idx)) overlap++;
}
if (overlap > 1) continue;

const bioDist = biometricDistance(earlier.biometrics, later.biometrics);
if (bioDist > 0.38) continue;

const frameGap = Math.max(1, lFirst - eLast);
const eVx = earlier.velocity?.vx ?? 0;
const eVy = earlier.velocity?.vy ?? 0;
const predHipX = earlier.lastHip.x + eVx * frameGap;
const predHipY = earlier.lastHip.y + eVy * frameGap;

const startHip = later.firstHip ?? later.lastHip;
const gapDist = Math.hypot(startHip.x - predHipX, startHip.y - predHipY);
const directDist = Math.hypot(startHip.x - earlier.lastHip.x, startHip.y - earlier.lastHip.y);
const minDist = Math.min(gapDist, directDist);

const maxDist = 0.28 + Math.min(0.25, frameGap * 0.05);

if (minDist <= maxDist && (bioDist < 0.28 || minDist <= 0.25)) {
  earlier.frames += later.frames;
  ...
  if (earlier.biometrics && later.biometrics) {
    const w1 = earlier.frames;
    const w2 = later.frames;
    earlier.biometrics = {
      aspectRatio: (earlier.biometrics.aspectRatio * w1 + later.biometrics.aspectRatio * w2) / (w1 + w2),
      height: (earlier.biometrics.height * w1 + later.biometrics.height * w2) / (w1 + w2),
      torsoRatio: (earlier.biometrics.torsoRatio * w1 + later.biometrics.torsoRatio * w2) / (w1 + w2),
      shoulderWidthRatio: (earlier.biometrics.shoulderWidthRatio * w1 + later.biometrics.shoulderWidthRatio * w2) / (w1 + w2),
    };
  }
}
```

### Directly Observed Flaws & Defects:
1. **Unidirectional Velocity Projection on U-Turns**:
   - `predHipX = earlier.lastHip.x + eVx * frameGap` projects `earlier.lastHip` forward using `earlier.velocity`. When a subject performs a U-turn during a frame gap (or occlusion), velocity direction inverts ($\vec{v} \to -\vec{v}$).
   - Forward projection computes a position *moving away* from `later.firstHip`, causing `gapDist` to explode.
   - While `directDist = hypot(startHip - earlier.lastHip)` measures `startHip` to `earlier.lastHip`, it only checks `earlier.lastHip` to `later.firstHip`.
2. **Missing Bidirectional Track Endpoint Checks**:
   - If tracklets are fragmented during a turn or loop, endpoints might meet at `later.lastHip` and `earlier.lastHip`, `later.lastHip` and `earlier.firstHip`, or `later.firstHip` and `earlier.firstHip`.
   - The current code only evaluates `startHip` (`later.firstHip ?? later.lastHip`) against `earlier.lastHip`.
3. **Biometric Distance Gating for Scale Changes**:
   - Line 866 checks `(bioDist < 0.28 || minDist <= 0.25)`.
   - Under scale changes (subject walking towards/away from camera), posture and bounding box size change slightly, bringing `bioDist` to $0.28 - 0.33$.
   - Because `bioDist >= 0.28`, the current code strictly requires `minDist <= 0.25`. When a subject moves significantly during scale change (e.g. `minDist` = 0.27), tracklet consolidation fails.
4. **Premature Frame Count Mutation Bug (Line 867 vs 883)**:
   - Line 867 executes `earlier.frames += later.frames` *before* line 883 reads `const w1 = earlier.frames`.
   - `w1` gets the *new total* (`frames1 + frames2`), corrupting the weighted average ratio calculation: `(w1 * b1 + w2 * b2) / (w1 + w2)` double-counts `later.frames` in `w1` and denominator.

---

## 2. Logic Chain

1. **U-Turn (Direction Flip) Proximity Analysis**:
   - *Observation*: During U-turns or direction flips across temporary occlusions (2–10 frames), `earlier.velocity` points in direction $+v$, while `later` tracklet moves in direction $-v$.
   - *Reasoning*:
     - Forward velocity projection `predHipForward = earlier.lastHip + eV * frameGap` projects away from the turn.
     - Backward velocity projection `predHipBackward = later.firstHip - lV * frameGap` projects backward from `later`.
     - Direct pairwise distances between endpoints evaluate all 4 possible connection topologies:
       1. $d_{last,first} = \text{dist}(earlier.lastHip, later.firstHip)$ (normal progression)
       2. $d_{first,last} = \text{dist}(earlier.firstHip, later.lastHip)$ (reverse progression)
       3. $d_{last,last} = \text{dist}(earlier.lastHip, later.lastHip)$ (apex convergence)
       4. $d_{first,first} = \text{dist}(earlier.firstHip, later.firstHip)$ (start convergence)
     - Taking $d_{endpoint} = \min(d_{last,first}, d_{first,last}, d_{last,last}, d_{first,first})$ and overall spatial distance $\text{minDist} = \min(gapDistForward, gapDistBackward, d_{endpoint})$ ensures robust tracklet merging across all U-turn and direction flip geometries.

2. **Scale Change & Biometric Thresholding**:
   - *Observation*: Scale-invariant biometrics (Task 1) use ratios (`aspectRatio`, `torsoLegRatio`, `shoulderHipRatio`), removing absolute height dependency.
   - *Reasoning*:
     - Same-subject `bioDist` across scale shifts remains low ($\le 0.32$).
     - Updating initial cutoff to `bioDist > 0.35` (line 851) rejects different individuals while accepting scale variations.
     - Updating merge threshold condition to `if (minDist <= maxDist && (bioDist < 0.32 || minDist <= 0.25))` allows tracklets undergoing scale shifts to consolidate cleanly whenever spatial distance satisfies `maxDist`.

3. **Frame Count Mutation Fix**:
   - *Observation*: Line 867 mutates `earlier.frames += later.frames` before lines 883–884 store `w1` and `w2`.
   - *Reasoning*:
     - Store `const w1 = earlier.frames;` and `const w2 = later.frames;` BEFORE mutating `earlier.frames += later.frames`.
     - Then total weight is `totalW = w1 + w2`, yielding correct weighted averages: `(b1 * w1 + b2 * w2) / totalW`.

4. **Multi-Person Side-by-Side Isolation**:
   - *Observation*: Side-by-side walkers share frames simultaneously and have different body proportions.
   - *Reasoning*:
     - `if (overlap > 1) continue;` prevents merging simultaneous tracks.
     - `bioDist > 0.35` cutoff prevents merging distinct individuals even if non-overlapping.
     - `maxDist = 0.28 + Math.min(0.25, frameGap * 0.05)` prevents merging distant tracks.

---

## 3. Caveats

- **Task 1 Interface Dependency**: Task 1 updates `BiometricSignature` properties to `aspectRatio`, `torsoLegRatio`, `shoulderHipRatio`. Refactored `mergeFragmentedTracks` should safely access both new fields (`torsoLegRatio`, `shoulderHipRatio`) and fallback fields (`torsoRatio`, `shoulderWidthRatio`) for backwards compatibility.
- **Offline / Batch Scope**: `mergeFragmentedTracks` is used in offline/batch processing and invoked inside `tracksToPeople`. Real-time `PoseTracker.ts` candidate selection operates frame-by-frame.

---

## 4. Conclusion

Refactor `mergeFragmentedTracks` in `src/lib/gait/analysis.ts` (lines 822–905) with the following concrete implementation plan:

### Exact Proposed Code for `mergeFragmentedTracks` in `src/lib/gait/analysis.ts`:

```typescript
export function mergeFragmentedTracks(tracks: PersonTrack[]): PersonTrack[] {
  if (tracks.length <= 1) return tracks;

  const result: PersonTrack[] = tracks.map((t) => ({
    ...t,
    frameIndices: [...(t.frameIndices || [])],
  }));

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const t1 = result[i];
        const t2 = result[j];

        const first1 = t1.firstFrameIndex ?? 0;
        const first2 = t2.firstFrameIndex ?? 0;

        const [earlier, later] = first1 <= first2 ? [t1, t2] : [t2, t1];
        const eLast = earlier.lastFrameIndex ?? 0;
        const lFirst = later.firstFrameIndex ?? 0;

        // Check frame index overlap (allow max 1 overlapping frame)
        const set1 = new Set(earlier.frameIndices || []);
        let overlap = 0;
        for (const idx of later.frameIndices || []) {
          if (set1.has(idx)) overlap++;
        }
        if (overlap > 1) continue;

        // Scale-invariant biometric distance gating
        const bioDist = biometricDistance(earlier.biometrics, later.biometrics);
        if (bioDist > 0.35) continue;

        const frameGap = Math.max(1, lFirst - eLast);

        // Forward and backward velocity projections
        const eVx = earlier.velocity?.vx ?? 0;
        const eVy = earlier.velocity?.vy ?? 0;
        const predHipForward = {
          x: earlier.lastHip.x + eVx * frameGap,
          y: earlier.lastHip.y + eVy * frameGap,
        };

        const lVx = later.velocity?.vx ?? 0;
        const lVy = later.velocity?.vy ?? 0;
        const predHipBackward = {
          x: later.firstHip ? later.firstHip.x - lVx * frameGap : later.lastHip.x - lVx * frameGap,
          y: later.firstHip ? later.firstHip.y - lVy * frameGap : later.lastHip.y - lVy * frameGap,
        };

        // Bidirectional endpoint spatial distance checks for U-turns / direction flips
        const eLastHip = earlier.lastHip;
        const eFirstHip = earlier.firstHip ?? earlier.lastHip;
        const lFirstHip = later.firstHip ?? later.lastHip;
        const lLastHip = later.lastHip;

        const dLastFirst = Math.hypot(eLastHip.x - lFirstHip.x, eLastHip.y - lFirstHip.y);
        const dFirstLast = Math.hypot(eFirstHip.x - lLastHip.x, eFirstHip.y - lLastHip.y);
        const dLastLast = Math.hypot(eLastHip.x - lLastHip.x, eLastHip.y - lLastHip.y);
        const dFirstFirst = Math.hypot(eFirstHip.x - lFirstHip.x, eFirstHip.y - lFirstHip.y);

        const directEndpointDist = Math.min(dLastFirst, dFirstLast, dLastLast, dFirstFirst);

        const gapDistForward = Math.hypot(lFirstHip.x - predHipForward.x, lFirstHip.y - predHipForward.y);
        const gapDistBackward = Math.hypot(eLastHip.x - predHipBackward.x, eLastHip.y - predHipBackward.y);

        const minDist = Math.min(gapDistForward, gapDistBackward, directEndpointDist);

        // Maximum allowed spatial distance based on gap duration
        const maxDist = 0.28 + Math.min(0.25, frameGap * 0.05);

        if (minDist <= maxDist && (bioDist < 0.32 || minDist <= 0.25)) {
          // Store frame counts before mutation for correct weighted averaging
          const w1 = earlier.frames;
          const w2 = later.frames;

          earlier.frames += later.frames;
          earlier.areaSum += later.areaSum;
          earlier.hipYSum += later.hipYSum;

          if ((later.lastFrameIndex ?? 0) >= (earlier.lastFrameIndex ?? 0)) {
            earlier.lastHip = later.lastHip;
            earlier.box = later.box;
            earlier.velocity = later.velocity;
            earlier.lastFrameIndex = later.lastFrameIndex;
          }
          if ((later.firstFrameIndex ?? 0) < (earlier.firstFrameIndex ?? 0)) {
            earlier.firstHip = later.firstHip ?? later.lastHip;
            earlier.firstFrameIndex = later.firstFrameIndex;
          }

          // Weighted average of scale-invariant biometric ratios
          if (earlier.biometrics && later.biometrics) {
            const totalW = w1 + w2;
            const eb = earlier.biometrics as any;
            const lb = later.biometrics as any;

            earlier.biometrics = {
              aspectRatio: (eb.aspectRatio * w1 + lb.aspectRatio * w2) / totalW,
              torsoLegRatio: ((eb.torsoLegRatio ?? eb.torsoRatio ?? 0.35) * w1 + (lb.torsoLegRatio ?? lb.torsoRatio ?? 0.35) * w2) / totalW,
              shoulderHipRatio: ((eb.shoulderHipRatio ?? eb.shoulderWidthRatio ?? 0.25) * w1 + (lb.shoulderHipRatio ?? lb.shoulderWidthRatio ?? 0.25) * w2) / totalW,
            };
          }

          earlier.frameIndices = Array.from(
            new Set([...(earlier.frameIndices || []), ...(later.frameIndices || [])])
          ).sort((a, b) => a - b);

          result.splice(result.indexOf(later), 1);
          mergedAny = true;
          break;
        }
      }
      if (mergedAny) break;
    }
  }

  return result;
}
```

---

## 5. Verification Method

### Test Suite Execution
Run all gait analysis and tracking unit tests:
```bash
npx vitest run src/lib/gait/__tests__/analysis.test.ts
npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts
```

### TypeScript Validation
```bash
npx tsc --noEmit
```

### Verification Criteria:
1. `person_identification_stress.test.ts` ("consolidates fragmented tracklets of 1 person walking back and forth into 1 subject") succeeds with `people.length === 1`.
2. `person_identification_stress.test.ts` ("handles temporary 5-frame occlusion without spawning persistent extra person") succeeds with `people.length === 1`.
3. `person_identification_stress.test.ts` ("correctly separates 2 distinct people walking side by side across 20 frames") succeeds with `people.length === 2`.
4. Scale-change tracklets consolidate into a single person without spawning duplicate track IDs.
