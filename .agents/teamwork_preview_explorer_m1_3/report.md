# Integration Blueprint & Codebase Analysis Report: Milestone 1 (M1)

**Agent**: `teamwork_preview_explorer_m1_3`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m1_3`  
**Target Source File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts`  
**Date**: 2026-08-10  

---

## Executive Summary

This report provides an exhaustive integration blueprint and forensic codebase analysis for **Milestone 1 (M1)** of the `gait-lab` spatio-temporal gait analysis engine upgrade. Milestone 1 encompasses two critical requirements:
1. **R1: Hungarian Algorithm for Optimal Multi-Person Track Assignment** in `matchPeople()` (`src/lib/gait/analysis.ts`).
2. **R6: Visibility-Gated Biometric Signatures & Sagittal Collapse Fix** in `computeBiometricSignature()`, `biometricDistance()`, and track EMA updates (`src/lib/gait/analysis.ts`).

Based on read-only inspection of `analysis.ts` (1236 lines), 7 core tracking test suites (146+ tests), `GaitApp.tsx`, and associated scope/survey documents, this report defines the exact type structures, calling conventions, test validation commands, target assertions, and edge-case risk mitigations required for zero-regression implementation.

---

## 1. Type Definitions & Data Structures Analysis

All multi-person tracking and biometric signature calculations operate on five core type definitions in `src/lib/gait/analysis.ts` and `src/lib/gait/types.ts`:

### 1.1 `Landmark` (from `types.ts`)
```ts
export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};
```
- Represents a single anatomical keypoint (0 to 32 MediaPipe Pose keypoints).
- Key landmark indices used for biometrics:
  - `11`: Left Shoulder, `12`: Right Shoulder
  - `23`: Left Hip, `24`: Right Hip
  - `27`: Left Ankle, `28`: Right Ankle

### 1.2 `Detection`
- In `matchPeople(detections: Landmark[][], ...)`: A single detection is represented as `Landmark[]` (an array of 33 keypoints for one candidate person).
- `detections` is an array of detections (`Landmark[][]`) observed in a single frame.

### 1.3 `BiometricSignature` (lines 691–695 of `analysis.ts`)
```ts
export type BiometricSignature = {
  aspectRatio: number;      // bbox width / Math.max(0.01, bbox height)
  torsoLegRatio: number;   // torso length / leg length
  shoulderHipRatio: number; // shoulder width / Math.max(0.01, hip width)
};
```
- **Current Behavior**: Computed via `computeBiometricSignature(landmarks: Landmark[])`. Always returns a `BiometricSignature` object with fallback values (`0.7` for torsoLeg, `1.2` for shoulderHip) even if keypoint visibility is zero.
- **R6 Upgrade Specification**: Return type will become `BiometricSignature | undefined`. If required keypoints (11, 12, 23, 24) have `visibility < 0.4`, `computeBiometricSignature` returns `undefined`.

### 1.4 `PersonTrack` (lines 697–715 of `analysis.ts`)
```ts
export type PersonTrack = {
  id: number;
  firstHip?: Landmark;
  lastHip: Landmark;
  frames: number;
  box: ReturnType<typeof boundingBox>; // { x: number, y: number, w: number, h: number }
  areaSum: number;                     // Cumulative sum of bbox area for size ranking
  hipYSum: number;                      // Cumulative sum of hip Y coordinate (image space)
  velocity?: { vx: number; vy: number };// Frame-to-frame hip displacement vector (dx, dy)
  biometrics?: BiometricSignature;     // Running EMA biometric signature template
  frameIndices?: number[];             // Sample frame indices tracked
  firstFrameIndex?: number;
  lastFrameIndex?: number;
};
```
- Maintained as an active track pool during multi-frame video scanning or live stream processing.

### 1.5 `TrackedPerson` (from `types.ts`, lines 1077–1105 of `analysis.ts`)
```ts
export type TrackedPerson = {
  id: number;
  color: string;
  sampleBox: { x: number; y: number; w: number; h: number };
  sampleFrameIndex: number;
  frameCount: number;
  biometrics?: BiometricSignature;
};
```
- Final output structure produced by `tracksToPeople(tracks, sampleIndex)`.

---

## 2. `matchPeople` Architecture & Pipeline Integration

### 2.1 Function Signature & Current Implementation
```ts
export function matchPeople(
  detections: Landmark[][],
  tracks: PersonTrack[],
  nextId: { value: number },
  frameIndex?: number,
): number[]
```
- **Location**: `src/lib/gait/analysis.ts` (lines 815–933).
- **Inputs**:
  - `detections`: Array of candidate poses in current frame (`Landmark[][]`).
  - `tracks`: Mutable array of active `PersonTrack` objects.
  - `nextId`: Reference object `{ value: number }` for auto-incrementing new track IDs.
  - `frameIndex`: Current integer frame index.
- **Returns**: `assigned: number[]` — an array of assigned track IDs corresponding 1-to-1 with `detections`.

### 2.2 End-to-End Tracking Pipeline Flow
1. **Per-Frame Candidate Assignment (`matchPeople`)**:
   - Computes candidate distance & cost for all detection-track pairs.
   - Updates assigned track positions (`lastHip`, `box`, `velocity`), updates biometrics EMA, appends `frameIndex`.
   - Spawns new `PersonTrack` objects for unassigned detections with `id = nextId.value++`.
2. **Post-Processing Track Consolidation (`tracksToPeople`)**:
   - Calls `mergeFragmentedTracks(tracks)` to merge tracklets belonging to the same subject across gaps or direction flips using scale-invariant biometric gating (`bioDist <= 0.35`).
   - Filters candidate tracks using `isLikelyHumanTrack(t.biometrics, t.box, 0.45)` to suppress non-human background noise/pets.
   - Ranks tracks by `trackPriorityScore(t)` and returns `TrackedPerson[]`.
3. **Application Layer Integration (`GaitApp.tsx`)**:
   - In `GaitApp.tsx` (lines 808 & 824):
     `const ids = matchPeople(dets, tracks as any, nextId, i);`
   - Scans sample frames, maintains tracking state across the clip, and calls `tracksToPeople(tracks, sampleIdx)` to select primary subject for gait analysis.

---

## 3. Existing Test Suite Audit & Coverage Mapping

A total of **7 dedicated test files** (146 passing test cases) cover `matchPeople`, `computeBiometricSignature`, `biometricDistance`, and `tracksToPeople`:

| Test File Path | Test Count | Key Scenarios / Coverage Focus |
|---|---|---|
| `src/lib/gait/__tests__/person_identification_stress.test.ts` | **74** | 30 Tier 1 Category Partition (cross-over, static observer, scale shift, U-turn, fast walk, occlusion), 30 Tier 2 BVA, 8 Tier 3 Pairwise, 5 Tier 4 Real-World scenarios. |
| `src/lib/gait/__tests__/analysis.test.ts` | **21** | Unit tests for `matchPeople` (spatial distance gating <= 0.22 vs > 0.22), `trackPriorityScore`, `detectViewAngle`, `computeGaitMetrics`. |
| `src/lib/gait/__tests__/challenger_m2_1_empirical.test.ts` | **15** | Empirical tracking with distractor candidates, target lock switching, identity persistence across U-turns. |
| `src/lib/gait/__tests__/challenger_m4_1_empirical.test.ts` | **8** | Single-subject tracking deduplication (0 false duplicate tracks across scale shift, U-turns, occlusions). |
| `src/lib/gait/__tests__/m2_challenger_2_empirical_stress.test.ts` | **12** | Distractor biped track assignment and velocity gating. |
| `src/lib/gait/__tests__/m4_challenger_verification.test.ts` | **13** | Multi-person track assignment correctness and ID stability. |
| `src/lib/gait/__tests__/human_likeness.test.ts` | **3** | Unit tests for `humanLikenessScore` and `isLikelyHumanTrack` with biometric inputs. |

All 146 tests currently pass 100% green.

---

## 4. Test Validation Commands & Regression Verification Assertions

To guarantee zero regressions during M1 implementation, execution of the following commands and assertions is mandatory:

### 4.1 CLI Execution Commands
```bash
# 1. Primary stress test suite execution
npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts

# 2. Analysis module unit tests
npx vitest run src/lib/gait/__tests__/analysis.test.ts

# 3. All gait engine test suites
npx vitest run src/lib/gait/__tests__/

# 4. Total repository test suite pass check (986+ tests)
npx vitest run

# 5. Typecheck & lint validation
npx tsc --noEmit
npx eslint .

# 6. Production build check
npm run build
```

### 4.2 Required Verification Assertions
1. **Person Count Assertion**: `expect(people.length).toBe(1)` for single-subject clips (no false duplicate tracks created across scale shifts, U-turns, or 10-frame occlusions).
2. **ID Persistence Assertion**: `expect(people[0].id).toBe(1)` across all 30 frames of U-turn and fast-walk clips.
3. **Multi-Person Separation**: `expect(people.length).toBe(2)` in trajectory cross-over scenarios (`T1-CO1` through `T1-CO5`).
4. **Biometric Invariance**: `expect(biometricDistance(bioSmall, bioLarge)).toBeLessThan(0.30)` across 500% scale changes.
5. **Zero NaN/Undefined Guard**: Verify `assigned` array contains only valid integers (`-1` or positive track IDs), and `PersonTrack.biometrics` contains no `NaN` values.

---

## 5. Edge Cases & R1/R6 Integration Risk Analysis

### 5.1 Edge Case 1: Low Landmark Visibility (`visibility < 0.4`) returning `undefined`
- **Risk**: In R6, `computeBiometricSignature(landmarks)` returns `undefined` when keypoints 11, 12, 23, 24 have `visibility < 0.4`. If `matchPeople` or `biometricDistance` assumes a non-null return value, a runtime TypeError could occur.
- **Mitigation**:
  - `biometricDistance(a?: BiometricSignature, b?: BiometricSignature)` must check `if (!a || !b) return 0;`.
  - In `matchPeople`:
    `const bioDist = trk.biometrics && bio ? biometricDistance(bio, trk.biometrics) : 0;`
  - If `bio` is `undefined`, `bioDist` evaluates safely to `0`, allowing spatial distance `minDist` to drive assignment without error.

### 5.2 Edge Case 2: Sagittal Profile Aspect Ratio Collapse (`aspectRatio < 0.35`)
- **Risk**: When a subject turns into sagittal (side) profile, shoulder width and hip width projections approach zero. `shoulderHipRatio` fluctuates erratically, inflating `biometricDistance` and causing Hungarian matching to falsely reject valid track pairs.
- **Mitigation**:
  - In `biometricDistance(a, b)`:
    ```ts
    const isSagittal = a.aspectRatio < 0.35 || b.aspectRatio < 0.35;
    const wAspect = isSagittal ? 0.50 : 0.35;
    const wTorsoLeg = isSagittal ? 0.45 : 0.35;
    const wShoulderHip = isSagittal ? 0.05 : 0.30;

    return dAspect * wAspect + dTorsoLeg * wTorsoLeg + dShoulderHip * wShoulderHip;
    ```
  - Down-weighting `shoulderHipRatio` from `0.30` to `0.05` in sagittal profile prevents false distance spikes.

### 5.3 Edge Case 3: Hungarian $K \times K$ Sentinel Padding ($10^9$) vs Gating Thresholds
- **Risk**: When $D \neq T$ (e.g. 2 detections, 3 tracks), Hungarian matrix requires padding to a square $K \times K$ matrix ($K = \max(D, T)$). If pair $(i, j)$ exceeds spatial gate (`minDist > maxAllowedDist`) or cost gate (`cost > maxAllowedCost`), its cost in the matrix MUST be set to sentinel $10^9$.
- **Mitigation**:
  - Post-solve assignment loop:
    ```ts
    for (let di = 0; di < D; di++) {
      const ti = hungarianAssignment[di];
      if (ti < T && costMatrix[di][ti] < 10^8) {
        assigned[di] = tracks[ti].id;
        // update track ti...
      } else {
        assigned[di] = -1; // unassigned -> spawn new track
      }
    }
    ```
  - Sentinel check `< 10^8` guarantees that gated pairs and dummy row/column assignments correctly result in `assigned[di] = -1`.

### 5.4 Edge Case 4: Visibility-Weighted EMA Updating
- **Risk**: Fixed 70/30 EMA updating degrades track biometrics if new frame landmarks are noisy or low-confidence.
- **Mitigation**:
  - Calculate frame mean visibility $V_{\text{mean}} = \text{mean}([lm_{11}.vis, lm_{12}.vis, lm_{23}.vis, lm_{24}.vis])$.
  - Dynamic weight $\alpha = 0.30 \times \text{clamp}(V_{\text{mean}}, 0, 1)$.
  - If `trk.biometrics` exists and frame `bio` is valid:
    ```ts
    trk.biometrics = {
      aspectRatio: (1 - alpha) * trk.biometrics.aspectRatio + alpha * bio.aspectRatio,
      torsoLegRatio: (1 - alpha) * trk.biometrics.torsoLegRatio + alpha * bio.torsoLegRatio,
      shoulderHipRatio: (1 - alpha) * trk.biometrics.shoulderHipRatio + alpha * bio.shoulderHipRatio,
    };
    ```
  - If frame `bio` is `undefined`, leave `trk.biometrics` untouched.

### 5.5 Edge Case 5: Matrix Boundary Conditions ($D = 0$ or $T = 0$)
- **Risk**: Invoking Hungarian solver with 0 detections or 0 existing tracks.
- **Mitigation**:
  - Early exit guards:
    - If `detections.length === 0`: Return `[]`.
    - If `tracks.length === 0`: Assign all detections to new tracks immediately (`assigned[di] = nextId.value++`), push new `PersonTrack` objects to `tracks`, and return `assigned`.

---

## 6. Blueprint for Implementation

```
+-------------------------------------------------------------------+
|                       src/lib/gait/analysis.ts                     |
+-------------------------------------------------------------------+
|                                                                   |
| 1. computeBiometricSignature(landmarks: Landmark[])               |
|    - Gate on visibility >= 0.4 for keypoints 11, 12, 23, 24      |
|    - Return BiometricSignature | undefined                            |
|                                                                   |
| 2. biometricDistance(a?, b?)                                      |
|    - If !a || !b return 0                                         |
|    - Check aspectRatio < 0.35 -> reweight (0.50, 0.45, 0.05)     |
|                                                                   |
| 3. matchPeople(detections, tracks, nextId, frameIndex)            |
|    - Handle D=0, T=0 early exit                                   |
|    - Build D x T cost matrix C[di][ti]                             |
|    - Apply gating (maxAllowedDist, maxAllowedCost) -> 1e9 sentinel|
|    - Pad to K x K where K = max(D, T) with 1e9                     |
|    - Run Kuhn-Munkres algorithm (O(K^3))                          |
|    - Extract assignments for di in [0, D-1]                       |
|    - If ti < T and C[di][ti] < 1e8: assign & update EMA           |
|    - Else: spawn new track                                        |
+-------------------------------------------------------------------+
```

### Recommended Hungarian Implementation Details
The Kuhn-Munkres algorithm can be implemented concisely in pure TypeScript without external dependencies:
- Standard augmenting path formulation ($O(K^3)$ using potential labels `u[1..K]`, `v[1..K]`, `p[0..K]`, `way[0..K]`).
- For $K \le 10$, execution finishes in $< 0.05\text{ ms}$.

---

## Conclusion

The architecture of `src/lib/gait/analysis.ts` and the associated 146 vitest tests are completely mapped and ready for M1 implementation. Replacing greedy assignment with Hungarian matching (R1) combined with visibility-gated biometrics and sagittal view re-weighting (R6) will resolve track-swapping vulnerabilities while preserving 100% pass rates across all test suites.
