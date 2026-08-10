# Requirement R2 Investigation Report: Transient Background Suppression & Target Lock

## 1. Observation

### 1.1 Scope & Codebase Mapping
The investigation focused on multi-person pose candidate filtering, spatial continuity, target locking, and transient background suppression across the following key files in `src/lib/gait/`:
- `src/lib/gait/PoseTracker.ts` (Real-time live webcam pose detection loop and candidate selection)
- `src/lib/gait/analysis.ts` (`matchPeople`, `computeBiometricSignature`, `biometricDistance`, `mergeFragmentedTracks`, `trackPriorityScore`, `tracksToPeople`)
- `src/lib/gait/pose.ts` (MediaPipe `PoseLandmarker` initialization parameters and landmark conversion)
- `src/components/gait/GaitApp.tsx` (Live webcam UI state and frame callback handling)

---

### 1.2 Direct File & Code Observations

#### Observation 1.1: Live Streaming Candidate Selection in `PoseTracker.ts`
In `src/lib/gait/PoseTracker.ts` (lines 333–353), the real-time detection loop handles multi-person frame results:
```ts
332:           if (result && result.landmarks && result.landmarks.length > 0) {
333:             let bestIdx = 0;
334:             if (result.landmarks.length > 1) {
335:               let maxScore = -Infinity;
336:               for (let pIdx = 0; pIdx < result.landmarks.length; pIdx++) {
337:                 const lms = toLandmarks(result.landmarks[pIdx]);
338:                 const hip = hipCenter(lms);
339:                 const box = boundingBox(lms);
340:                 const area = box.w * box.h;
341: 
342:                 let score = area * 2;
343:                 if (this.lastTargetHip) {
344:                   const d = Math.hypot(hip.x - this.lastTargetHip.x, hip.y - this.lastTargetHip.y);
345:                   score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2;
346:                 }
347:                 if (score > maxScore) {
348:                   maxScore = score;
349:                   bestIdx = pIdx;
350:                 }
351:               }
352:             }
```
*Key Finding*: `PoseTracker.ts` uses a 1-frame static heuristic (`score = area * 2` modified by static hip distance `d <= 0.35`). It has **no keypoint visibility threshold**, **no biometric signature matching**, **no velocity extrapolation**, and **no multi-frame track persistence**.

#### Observation 1.2: Multi-Person Track Matching in `analysis.ts` (`matchPeople`)
In `src/lib/gait/analysis.ts` (lines 709–816), `matchPeople` tracks people across video frames:
```ts
725:     for (let ti = 0; ti < tracks.length; ti++) {
...
729:       const predHip = {
730:         x: trk.lastHip.x + vx * gap,
731:         y: trk.lastHip.y + vy * gap,
732:         z: 0,
733:       };
...
738:       const bioDist = trk.biometrics ? biometricDistance(bio, trk.biometrics) : 0;
740:       const cost = minDist + bioDist * 0.25;
741:       pairs.push({ di, ti, cost, spatialDist: minDist, bioDist });
742:     }
...
752:     const maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);
754:     if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;
...
793:   for (let di = 0; di < detections.length; di++) {
794:     if (assigned[di] !== -1) continue;
795:     const id = nextId.value++;
796:     assigned[di] = id;
         // Creates new PersonTrack for every unmatched detection (frames = 1)
```
*Key Finding*: `matchPeople` uses motion prediction (`predHip`) and biometric distance (`bioDist`). However:
1. It does NOT filter out low-confidence/ghost landmark detections before matching.
2. Unmatched detections (including transient noise or 1-frame background passersby) immediately spawn a new `PersonTrack`.
3. Spatial gating `maxAllowedDist` (base `0.22`) is static relative to subject speed, causing fast-walking subjects to exceed spatial gates during larger frame gaps or rapid gait strides.

#### Observation 1.3: Track Consolidation & Priority Scoring in `analysis.ts`
In `src/lib/gait/analysis.ts`:
- `trackPriorityScore` (lines 908–912):
  ```ts
  export function trackPriorityScore(t: PersonTrack): number {
    const meanArea = t.areaSum / Math.max(1, t.frames);
    const meanHipY = t.hipYSum / Math.max(1, t.frames);
    return t.frames * 3 + meanArea * 80 + meanHipY * 8;
  }
  ```
  `meanArea * 80` heavily weights bounding box size. A foreground passerby with `meanArea = 0.5` adds `40` points to priority, which can exceed the score of a distant walking subject with `frames = 10` (`10 * 3 = 30` points).
- `tracksToPeople` (lines 914–931):
  ```ts
  export function tracksToPeople(tracks: PersonTrack[], sampleIndex: number): TrackedPerson[] {
    const consolidated = mergeFragmentedTracks(tracks);
    const maxFrames = Math.max(1, ...consolidated.map((t) => t.frames));
    return consolidated
      .filter((t) => t.frames >= 2 || (maxFrames <= 2 && t.frames >= 1))
      .sort((a, b) => trackPriorityScore(b) - trackPriorityScore(a))
  ```
  Filter `t.frames >= 2` allows transient background passersby or noise that persist for just 2–3 frames to survive into the tracked person list.

#### Observation 1.4: Disconnect Between Live Webcam (`PoseTracker.ts`) and Offline Video (`matchPeople`)
In `GaitApp.tsx` (lines 476–520), live webcam capture instantiates `PoseTracker` and sets a callback. `PoseTracker.ts` handles candidate selection internally on each frame tick without invoking `matchPeople` or maintaining persistent `PersonTrack` objects. Consequently, live streaming lacks the biometric and velocity tracking built into `analysis.ts`.

---

## 2. Logic Chain

1. **Premise 1 (Architectural Disconnect)**: `PoseTracker.ts` operates independently of `matchPeople`. In live webcam streaming, `PoseTracker.ts` selects candidates on a frame-by-frame basis using `area * 2` and proximity to `this.lastTargetHip`.
2. **Premise 2 (Target Lock Hijacking in `PoseTracker.ts`)**: In `score = area * 2 - d * 4 + 1.0` (for `d <= 0.35`), the proximity bonus is capped at `+1.0`. If a background person walks closer to the camera (e.g. `box.w * box.h = 0.6`, giving `area * 2 = 1.2`), their score outweighs a target subject farther away (`area = 0.15`, `area * 2 = 0.3`, total score `1.3`). If distance `d` drops slightly or passerby area increases, `bestIdx` switches to the passerby.
3. **Premise 3 (Permanent Lock Shift)**: Once `bestIdx` switches to the passerby for even a single frame, `this.lastTargetHip` is updated to the passerby's hip coordinates. Subsequent frames now calculate `d` relative to the passerby, permanently locking onto the background passerby.
4. **Premise 4 (Lack of Confidence / Visibility Gating)**: Neither `PoseTracker.ts` nor `matchPeople` checks keypoint visibility (e.g., `visibility < 0.40`). Ghost landmark detections from dark corners, reflections, or background objects pass directly into tracking.
5. **Premise 5 (Fast-Walker Track Fragmentation)**: In `matchPeople`, `maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08)`. For fast-walking subjects moving across large screen distances (e.g., > 0.22 normalized units per frame step), spatial distance exceeds `maxAllowedDist`, causing `matchPeople` to reject the match and spawn a duplicate track.
6. **Premise 6 (Transient Noise & Passersby Survival)**: `matchPeople` creates a `PersonTrack` for every unmatched detection. In `tracksToPeople`, the cutoff `t.frames >= 2` fails to suppress 2–3 frame transient passersby, and `trackPriorityScore` (`meanArea * 80`) ranks large foreground passersby above the actual walking subject.

---

## 3. Caveats

- **Read-Only Scope**: This report presents analytical findings and recommendations only; no code changes were executed.
- **Environment Context**: Real-time webcam behavior was evaluated via code flow inspection and automated unit tests (`PoseTracker.test.ts`, `person_identification_stress.test.ts`). Hardware webcam video feeds vary by lighting, camera FOV, and MediaPipe GPU/CPU execution speeds.
- **MediaPipe Initialization**: `pose.ts` sets `minPoseDetectionConfidence: 0.25` on model instantiation. Per-candidate per-landmark visibility filtering must be applied in application code (`PoseTracker.ts` and `matchPeople`), as model-level thresholds do not filter out weak keypoints within a returned pose array.

---

## 4. Conclusion

### Summary of Flaws & Root Causes
1. **Live Webcam Target Lock Fragility**: `PoseTracker.ts` relies on a static 1-frame score (`area * 2` + proximity bonus) without biometric signatures, velocity projection, or lock hysteresis. Background passersby with larger bounding boxes easily hijack target lock.
2. **Missing Low-Confidence Pre-Filtering**: Pose landmark candidates are processed without checking lower-body keypoint visibility scores. Low-confidence noise and ghost poses corrupt tracking.
3. **Velocity Gate Limitations for Fast Walkers**: `matchPeople` uses a fixed base distance gate (`0.22`) that fails to adapt to subject velocity, risking track breakage and duplicate track generation for fast walkers.
4. **Insufficient Transient Background Suppression**: `matchPeople` creates tracks for all unmatched detections, and `tracksToPeople` (`t.frames >= 2`) permits short 2–3 frame passerby detections to persist.

### Actionable Fix Recommendations

#### Fix Recommendation 1: State-Based Target Locking in `PoseTracker.ts`
- Upgrade `PoseTracker` to maintain a target state across live stream frames:
  - `targetHip: Landmark`, `targetVelocity: { vx: number; vy: number }`, `targetBiometrics: BiometricSignature`, `lockConfidence: number`.
- Predict expected target position: `predHip = targetHip + targetVelocity * gapMs`.
- Score live candidates using a multi-factor formula:
  $$\text{Score} = 0.50 \cdot (1 - \frac{\text{dist}(\text{hip}, \text{predHip})}{d_{\text{max}}}) + 0.35 \cdot (1 - \text{bioDist}) + 0.15 \cdot \min(1.0, \frac{\text{area}}{\text{targetArea}})$$
- Require candidate score to meet a hysteresis threshold before updating target lock, preventing single-frame lock switches to background passersby.

#### Fix Recommendation 2: Pre-Filter Low-Confidence Candidates
- In both `PoseTracker.ts` and `matchPeople`, filter out pose candidates where mean keypoint visibility across major joints (shoulders, hips, knees, ankles: landmarks 11, 12, 23, 24, 25, 26, 27, 28) is below `0.40`.

#### Fix Recommendation 3: Velocity-Adaptive Spatial Gating in `matchPeople`
- Update `maxAllowedDist` in `matchPeople` to scale with track velocity magnitude ($\|v\|$):
  $$\text{maxAllowedDist} = 0.25 + 0.15 \cdot \min(1.0, \|v\|) + \min(0.25, (\text{gap} - 1) \cdot 0.08) + (\text{bioDist} < 0.25 ? 0.10 : 0)$$
- Ensures fast-walking subjects maintain track continuity without exceeding velocity gates.

#### Fix Recommendation 4: Robust Transient Suppression & Re-Balanced Ranking
- Increase the frame threshold in `tracksToPeople` from `t.frames >= 2` to `t.frames >= 4` (or `frames >= Math.max(3, maxFrames * 0.10)`).
- Re-balance `trackPriorityScore`:
  $$\text{trackPriorityScore}(t) = t.\text{frames} \cdot 5.0 + \text{meanArea} \cdot 25.0 + \text{meanHipY} \cdot 5.0$$
  This prioritizes persistent walking subjects over short foreground passersby.

---

## 5. Verification Method

To independently verify these findings and test future implementations:

### 1. Test Suite Execution Commands
Run the Vitest test suites for person tracking, PoseTracker, and analysis:
```bash
npx vitest run src/lib/gait/__tests__/person_identification_stress.test.ts src/lib/gait/__tests__/PoseTracker.test.ts src/lib/gait/__tests__/analysis.test.ts
```

### 2. Typecheck Verification Command
Verify zero TypeScript compilation errors:
```bash
npx tsc --noEmit
```

### 3. Key Files & Line Ranges to Inspect
- `src/lib/gait/PoseTracker.ts`: lines 332–365 (`loop()` candidate selection).
- `src/lib/gait/analysis.ts`: lines 709–816 (`matchPeople`), lines 908–931 (`trackPriorityScore` & `tracksToPeople`).

### 4. Invalidation Conditions
The conclusions of this report would be invalidated if:
- MediaPipe PoseLandmarker internal tracking in VIDEO mode handles multi-person tracking natively without candidate selection in `PoseTracker.ts`.
- `PoseTracker.ts` is refactored to delegate candidate matching directly to `matchPeople`.
