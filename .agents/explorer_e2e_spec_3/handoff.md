# Test Design Specification: Target Lock Suite (`PoseTracker_target_lock.test.ts`)

**Author**: explorer_e2e_spec_3 (Explorer - Target Lock Suite Spec)  
**Target Milestone**: TM2 Part B  
**Target Test File**: `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts`  
**Helper Extensions File**: `src/lib/gait/__tests__/testHelpers.ts`  
**Date**: 2026-08-09  

---

## 1. Observation

### 1.1 Source Code & Test Infrastructure Analysis

1. **`src/lib/gait/PoseTracker.ts` (385 lines)**:
   - **webcam stream lifecycle & options** (lines 116–227): `startWebcam(videoElement, options)` configures MediaPipe `runningMode: "VIDEO"` and requests camera constraints (`width: { ideal: 1280 }`, `height: { ideal: 720 }`, `frameRate: { ideal: 30, max: 60 }`). Handles `OverconstrainedError` with fallback.
   - **Candidate Selection & Target Lock Logic** (lines 332–366):
     ```ts
     if (result && result.landmarks && result.landmarks.length > 0) {
       let bestIdx = 0;
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

       const rawLandmarks = result.landmarks[bestIdx];
       const convertedLms = toLandmarks(rawLandmarks);
       this.lastTargetHip = hipCenter(convertedLms);
       ...
     }
     ```
   - **Key Finding 1**: The candidate selection scoring evaluates bounding box area ($\text{area} = w \cdot h$) and spatial distance $d = \text{hypot}(\text{hip.x} - \text{lastTargetHip.x}, \text{hip.y} - \text{lastTargetHip.y})$. When $d \le 0.35$, a $+1.0$ score bonus is awarded to maintain lock hysteresis on the current target.
   - **Key Finding 2**: `this.lastTargetHip` is updated per frame to `hipCenter(convertedLms)`. On buffer reset (`clearBuffer()`), `this.lastTargetHip` is set to `null`.

2. **Existing Test Suite `src/lib/gait/__tests__/PoseTracker.test.ts` (303 lines)**:
   - Covers stream start/stop, buffer limits, `WebcamError` parsing, constraint fallback, and session restart.
   - Mocked MediaPipe landmarker (`mockLandmarker`) only returns a single candidate array per frame (`landmarks: [ Array(33) ]`).
   - **Critical Gap**: **Zero test cases exist in `PoseTracker.test.ts` for multi-candidate frames (`result.landmarks.length > 1`)**, target lock acquisition, background distractor rejection, post-occlusion re-acquisition, lock transfer prevention, or scale/velocity variation.

3. **Existing Synthetic Helpers `src/lib/gait/__tests__/testHelpers.ts` (180 lines)**:
   - Provides `generateSyntheticWalkingFrames(opts)` for single-subject `PoseFrame[]`.
   - **Critical Gap**: Lacks multi-person detection generators (`Landmark[][]` per frame) required for testing multi-candidate pose selection loops in `PoseTracker.ts`.

4. **Requirements & Architecture Docs**:
   - `ORIGINAL_REQUEST.md`: R1 (Person Tracking Accuracy & Re-ID across U-turns, scale changes, 2-10 frame occlusions), R2 (Transient Background Suppression & Candidate Filtering, target lock in live webcam), R3 (Empirical Benchmarks & Adversarial Stress Tests).
   - `TEST_INFRA.md`: Establishes opaque-box multi-tier test philosophy (Tier 1 unit, Tier 2 boundary/corner, Tier 3 pairwise, Tier 4 real-world workload scenarios).
   - `PROJECT.md`: Defines Milestone TM2 part B (`PoseTracker_target_lock.test.ts`).

---

## 2. Logic Chain

### 2.1 Problem Analysis & Test Strategy Formulation

1. **Target Lock State Machine Model**:
   `PoseTracker` acts as a real-time state machine during live video streaming:
   - **STATE 0: UNLOCKED**: `lastTargetHip === null`. On first frame with candidates, score = $2 \cdot \text{Area}$. Candidate with highest area is selected and locked as initial target.
   - **STATE 1: LOCKED**: `lastTargetHip` stores previous target hip position. For all candidate poses in current frame:
     - Distance $d = \text{hypot}(\text{hip.x} - \text{lastTargetHip.x}, \text{hip.y} - \text{lastTargetHip.y})$.
     - If $d \le 0.35$, candidate score = $2 \cdot \text{Area} - 4d + 1.0$.
     - If $d > 0.35$, candidate score = $2 \cdot \text{Area} - 2d$.
     - Candidate with maximum score is selected. Target hip updated.
   - **STATE 2: OCCLUDED / MISSING**: `result.landmarks` is empty or all candidates fail visibility threshold ($< 0.40$). Buffer omits frame, `lastTargetHip` retains last known target position (or velocity-projected position).
   - **STATE 3: RE-ACQUISITION**: Subject reappears after $N$ frames ($2 \le N \le 10$). Reappearing candidate within $d \le 0.35$ gets hysteresis bonus and restores active locking.

2. **Categorization into 5 Key Feature Requirements**:
   - **Req 1**: Target lock initialization & lock acquisition on selected person.
   - **Req 2**: Target lock retention in crowded scenarios with background distractors and passerby.
   - **Req 3**: Target lock re-acquisition post-occlusion (2-10 frames) upon re-appearance.
   - **Req 4**: Prevention of unintended lock transfer to secondary/background subjects.
   - **Req 5**: Lock retention across scale shifts, direction reversals (U-turns), and rapid velocity shifts.

3. **Multi-Tier Partitioning (Tiers 1–4)**:
   - **Tier 1 (Unit & Functional)**: Isolated behavior, single parameter changes, verification of individual mathematical terms in candidate scoring ($S = 2A - 4d + 1.0$). $\ge 5$ tests per domain (25 tests).
   - **Tier 2 (Boundary & Corner)**: Exact threshold boundaries ($d = 0.35$, joint visibility $= 0.40$, 2 vs 10 vs 11 frame occlusions, zero candidates, score ties). $\ge 5$ tests per domain (25 tests).
   - **Tier 3 (Pairwise Feature Interactions)**: Synergistic combinations of 2+ domains (e.g. U-turn during occlusion; distractor crossing during scale shift; fast walking + low visibility). $\ge 10$ tests.
   - **Tier 4 (Real-World Application Workloads)**: 5 end-to-end multi-frame realistic stream simulations matching `TEST_INFRA.md` specifications.

---

## 3. Caveats

1. **Environment Sandbox**: Vitest tests execute in Node.js. Timers are controlled via `vi.useFakeTimers()`. MediaPipe's `PoseLandmarkerLike` is mocked to emit deterministic `Landmark[][]` candidate arrays.
2. **Normalized Coordinates**: All landmark $(x, y)$ coordinates are normalized within $[0, 1] \times [0, 1]$.
3. **M2 Forward Compatibility**: Test specifications cover both baseline candidate scoring ($S = 2A - 4d + 1.0$) and M2 enhancements (joint visibility pre-filtering $< 0.40$, linear velocity motion projection, and biometric similarity scoring).

---

## 4. Conclusion & Complete Test Specification

The test specification for `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts` is fully detailed below.

### 4.1 Required Test Helper Extensions (`testHelpers.ts`)

To support multi-candidate stream testing in `PoseTracker_target_lock.test.ts`, the following helper functions must be implemented in `src/lib/gait/__tests__/testHelpers.ts`:

```ts
export interface CandidateConfig {
  x: number;          // Hip center x
  y: number;          // Hip center y
  scale: number;      // Bounding box scale factor (height, e.g. 0.6 => area ~ 0.12)
  visibility?: number;// Joint visibility (default 0.9)
  asymmetry?: number;
}

export interface MultiCandidateFrame {
  timeMs: number;
  candidates: CandidateConfig[];
}

export function createPoseLandmarkCandidate(config: CandidateConfig): Landmark[] {
  const { x, y, scale, visibility = 0.9 } = config;
  const w = scale * 0.33; // aspect ratio ~ 0.33
  const landmarks: Landmark[] = new Array(33).fill(null).map(() => ({ x, y, z: 0, visibility }));

  landmarks[0]  = { x, y: y - scale * 0.4, z: 0, visibility };                 // Nose
  landmarks[11] = { x: x - w / 2, y: y - scale * 0.25, z: 0, visibility };      // L_Shoulder
  landmarks[12] = { x: x + w / 2, y: y - scale * 0.25, z: 0, visibility };      // R_Shoulder
  landmarks[23] = { x: x - w / 4, y, z: 0, visibility };                       // L_Hip
  landmarks[24] = { x: x + w / 4, y, z: 0, visibility };                       // R_Hip
  landmarks[27] = { x: x - w / 4, y: y + scale * 0.4, z: 0, visibility };       // L_Ankle
  landmarks[28] = { x: x + w / 4, y: y + scale * 0.4, z: 0, visibility };       // R_Ankle
  return landmarks;
}

export function generateMultiCandidateStream(
  framesConfig: MultiCandidateFrame[],
): Array<{ landmarks: Landmark[][]; worldLandmarks?: Landmark[][] }> {
  return framesConfig.map((frame) => ({
    landmarks: frame.candidates.map(createPoseLandmarkCandidate),
  }));
}
```

---

### 4.2 Comprehensive Test Inventory for `PoseTracker_target_lock.test.ts`

---

#### SECTION 1: Target Lock Initialization & Acquisition

##### Tier 1: Unit & Functional Tests
* **`TL_INIT_01`: Single-Subject Initial Acquisition on Frame 1**
  - *Goal*: Verify initial lock selection on a single detected person.
  - *Input*: 1 candidate pose at $(x=0.5, y=0.5, scale=0.6)$.
  - *Steps*: Pass frame to `PoseTracker.loop()`.
  - *Assertions*: `rollingBuffer.length === 1`; `lastTargetHip` center is $(0.5, 0.5) \pm 0.01$.

* **`TL_INIT_02`: Multi-Candidate Initial Lock (Largest Bounding Box Selection)**
  - *Goal*: Verify that when multiple people are detected on Frame 1 without prior lock, the candidate with the largest bounding box area is selected.
  - *Input*: Candidate A $(x=0.3, y=0.5, scale=0.4, Area=0.0528)$; Candidate B $(x=0.7, y=0.5, scale=0.7, Area=0.1617)$.
  - *Steps*: Pass frame with `[Candidate A, Candidate B]` to `PoseTracker.loop()`.
  - *Assertions*: Selected landmark matches Candidate B; `lastTargetHip.x` is close to $0.70$.

* **`TL_INIT_03`: Initial Lock Baseline Hip Coordinates Storage**
  - *Goal*: Confirm `lastTargetHip` accurately stores the mid-hip coordinate of the selected candidate.
  - *Input*: Candidate at $L\_Hip=(0.42, 0.50), R\_Hip=(0.48, 0.50)$.
  - *Assertions*: `lastTargetHip.x === 0.45`, `lastTargetHip.y === 0.50`.

* **`TL_INIT_04`: Low-Confidence Initial Pose Rejection**
  - *Goal*: Reject initial pose candidate if keypoint visibility $< 0.40$.
  - *Input*: 1 candidate with keypoint `visibility = 0.20`.
  - *Assertions*: Candidate filtered out; `rollingBuffer.length === 0`; `lastTargetHip === null`.

* **`TL_INIT_05`: Re-Initialization State Reset on Stream Restart**
  - *Goal*: Ensure `lastTargetHip` is cleared to `null` on `clearBuffer()` or webcam restart.
  - *Steps*: Run 5 frames with Target A at $x=0.20$. Call `clearBuffer()`. Pass new frame with Target B at $x=0.80$ ($scale=0.8$) and Target A ($scale=0.3$).
  - *Assertions*: Target B selected (largest area) because lock was reset to Unlocked state.

##### Tier 2: Boundary & Corner Tests
* **`TL_INIT_B01`: Bounding Box Area Score Tie-Breaking**
  - *Goal*: Test behavior when two initial candidates have identical bounding box area ($scale = 0.5$).
  - *Input*: Candidate A ($x=0.2$), Candidate B ($x=0.8$), both $scale=0.5$.
  - *Assertions*: Deterministic selection (Candidate 0 selected); buffer length === 1.

* **`TL_INIT_B02`: Boundary Visibility Threshold ($vis = 0.39$ vs $vis = 0.40$)**
  - *Goal*: Test exact visibility threshold boundary for candidate rejection.
  - *Input*: Frame 1: Candidate with $vis = 0.39$. Frame 2: Candidate with $vis = 0.40$.
  - *Assertions*: Frame 1 yields 0 buffer frames; Frame 2 acquires initial lock.

* **`TL_INIT_B03`: Zero Candidate Detection Array (`landmarks = []`)**
  - *Goal*: Ensure stability when landmarker returns empty detection array on startup.
  - *Input*: 5 frames of `landmarks = []`.
  - *Assertions*: No exceptions thrown; buffer length === 0; `lastTargetHip === null`.

* **`TL_INIT_B04`: Edge-of-Frame Initialization ($x = 0.02, y = 0.5$)**
  - *Goal*: Acquire initial target lock when subject enters at extreme image boundary.
  - *Input*: Candidate at $x = 0.02, scale = 0.5$.
  - *Assertions*: Lock established; `lastTargetHip.x` close to $0.02$.

* **`TL_INIT_B05`: Rapid Start-Stop-Start Sequence**
  - *Goal*: Verify lock state isolation across rapid stream restarts.
  - *Steps*: `startWebcam()`, 2 frames, `stopWebcam()`, `startWebcam()`, 2 frames.
  - *Assertions*: Buffer resets; new session begins in Unlocked state.

---

#### SECTION 2: Target Lock Retention in Crowded Scenarios

##### Tier 1: Unit & Functional Tests
* **`TL_CROWD_01`: Distant Moving Passerby Rejection ($d = 0.45$)**
  - *Goal*: Retain lock on stationary primary subject ($x=0.3$) when a moving distractor passes at $x=0.75$ ($d = 0.45$).
  - *Input*: 10 frames. Primary target: $(x=0.3, scale=0.5)$. Distractor: $x$ moves $0.75 \to 0.90$ ($scale=0.6$).
  - *Assertions*: All 10 rolling frames match primary target ($x \approx 0.3$).

* **`TL_CROWD_02`: Opposing Passerby Crossing ($v_x = 0.03$ vs $v_x = -0.05$)**
  - *Goal*: Maintain primary lock when a passerby walks in the opposite direction.
  - *Input*: Primary target moving right ($x: 0.20 \to 0.50$). Distractor moving left ($x: 0.80 \to 0.20$).
  - *Assertions*: Target lock follows primary subject throughout all 10 frames without swapping.

* **`TL_CROWD_03`: Large Distractor vs Small Locked Target (Hysteresis Bonus Verification)**
  - *Goal*: Verify hysteresis bonus ($+1.0$) prevents a larger background person ($Area = 0.40, d = 0.25$) from stealing lock from locked smaller target ($Area = 0.15, d = 0.02$).
  - *Mathematical Check*:
    - Locked Target: $Area = 0.15 \implies S_{target} = 2(0.15) - 4(0.02) + 1.0 = 1.22$.
    - Distractor: $Area = 0.40 \implies S_{distractor} = 2(0.40) - 4(0.25) + 1.0 = 0.80$ (or $0.80$ if $d > 0.35$).
    - $S_{target} > S_{distractor} \implies$ Lock retained on smaller target.
  - *Assertions*: Target lock retained on primary subject.

* **`TL_CROWD_04`: Static Background Observer (Clinician in Background)**
  - *Goal*: Primary subject walks across screen ($x: 0.10 \to 0.90$) while a clinician stands static at $(x=0.50, y=0.50, scale=0.6)$.
  - *Assertions*: Lock stays on moving subject; clinician is never selected.

* **`TL_CROWD_05`: Multi-Person Stream (3 Simultaneous Candidates)**
  - *Goal*: Target locked on Subject 1 ($x=0.3$). Frame contains Subject 1, Subject 2 ($x=0.6$), and Subject 3 ($x=0.85$).
  - *Assertions*: Target lock maintained on Subject 1 across 15 frames.

##### Tier 2: Boundary & Corner Tests
* **`TL_CROWD_B01`: Distractor at Exact Distance Threshold ($d = 0.35$)**
  - *Goal*: Evaluate candidate scoring at exact boundary $d = 0.35$.
  - *Input*: Primary target ($x=0.30, scale=0.4$). Distractor at $x=0.65$ ($d = 0.35, scale=0.5$).
  - *Assertions*: Primary target score higher; lock retained.

* **`TL_CROWD_B02`: Candidate Score Tie Scenario**
  - *Goal*: Test behavior when distractor score equals primary target score within $\pm 0.01$.
  - *Assertions*: Tracker retains current target due to strict inequality check (`score > maxScore`).

* **`TL_CROWD_B03`: Distractor Entrance at Minimum Velocity Point**
  - *Goal*: Distractor appears when subject pauses (hip velocity $\approx 0$).
  - *Assertions*: Lock retained on stationary primary subject.

* **`TL_CROWD_B04`: Continuous Crowd Stream (Passerby Every 5 Frames)**
  - *Goal*: Subject walks for 30 frames while 6 distinct distractors pass sequentially.
  - *Assertions*: 100% lock retention on primary subject; 0 frame swaps.

* **`TL_CROWD_B05`: Distractor Visibility Fluctuation ($0.20 \leftrightarrow 0.90$)**
  - *Goal*: Distractor keypoints flicker in visibility while passing target.
  - *Assertions*: No lock transfer or tracker crash.

---

#### SECTION 3: Target Lock Re-acquisition Post-Occlusion (2–10 Frames)

##### Tier 1: Unit & Functional Tests
* **`TL_OCCL_01`: Short 2-Frame Complete Landmark Loss**
  - *Goal*: Primary target drops out for 2 frames (`landmarks = []`), then reappears.
  - *Input*: Frames 0–4: Target visible ($x: 0.20 \to 0.28$). Frames 5–6: `landmarks = []`. Frames 7–10: Target visible ($x: 0.34 \to 0.40$).
  - *Assertions*: Lock re-acquired seamlessly on frame 7; total rolling buffer length === 9.

* **`TL_OCCL_02`: Medium 5-Frame Occlusion with Velocity Projection**
  - *Goal*: Primary target occluded for 5 frames while moving laterally ($v_x = 0.02$).
  - *Input*: Frames 0–5: Target at $x = 0.20 + 0.02f$. Frames 6–10: Occluded. Frames 11–15: Target reappears at $x = 0.42$ (matching projected trajectory $0.30 + 5 \times 0.02 = 0.40 \approx 0.42$).
  - *Assertions*: Lock re-acquired on frame 11; `lastTargetHip.x` resumes tracking.

* **`TL_OCCL_03`: Max 10-Frame Target Lock Occlusion Window**
  - *Goal*: Verify lock re-acquisition at the upper requirement boundary (10 frames missing).
  - *Input*: Frames 0–5: Target visible. Frames 6–15 (10 frames): Missing. Frame 16: Target reappears at predicted position ($d \le 0.35$).
  - *Assertions*: Lock re-acquired on frame 16; no track ID swap or re-initialization error.

* **`TL_OCCL_04`: Asymmetric Occlusion (Target Occluded, Distractor Visible)**
  - *Goal*: Target is occluded for 5 frames while distractor remains visible at $x=0.80$.
  - *Input*: Frames 0–4: Target ($x=0.3$) + Distractor ($x=0.8$). Frames 5–9: Target missing, Distractor visible. Frames 10–14: Target reappears at $x=0.3$.
  - *Assertions*: Distractor does NOT steal lock during target absence (if distance $d > 0.35$ or velocity mismatch); target lock re-acquired on frame 10.

* **`TL_OCCL_05`: Post-Occlusion Re-appearance Position Delta ($d = 0.15$)**
  - *Goal*: Target reappears after 4 frames with a spatial shift of $\Delta x = 0.15$.
  - *Assertions*: Target re-acquired via hysteresis bonus ($d \le 0.35$).

##### Tier 2: Boundary & Corner Tests
* **`TL_OCCL_B01`: Exceeding Max Occlusion Window (11-Frame Occlusion)**
  - *Goal*: Target missing for 11 frames (exceeding 10-frame lock memory window).
  - *Input*: Frames 0–4: Target visible. Frames 5–15 (11 frames): Missing. Frame 16: Target reappears.
  - *Assertions*: Lock safely resets without crash; on Frame 16 target acquired as new initial lock.

* **`TL_OCCL_B02`: Occlusion Triggered Mid-Step (Peak Velocity Point)**
  - *Goal*: Target occluded during maximum forward step acceleration.
  - *Assertions*: Velocity projection extrapolates position correctly; re-acquired on reappearance.

* **`TL_OCCL_B03`: Reappearance with Scale Shift ($scale: 0.30 \to 0.50$)**
  - *Goal*: Target occluded for 4 frames while stepping closer to camera.
  - *Assertions*: Lock re-acquired despite bounding box area expansion.

* **`TL_OCCL_B04`: Distractor Stepping into Target's Last Known Position During Occlusion**
  - *Goal*: Distractor steps to $x=0.30$ while primary target is occluded.
  - *Assertions*: If distractor biometrics/velocity mismatch, lock is not erroneously transferred; target re-acquired when target returns.

* **`TL_OCCL_B05`: Rapid Micro-Occlusions (Back-to-Back 2-Frame Drops)**
  - *Goal*: Frames 0–3 visible, 4–5 missing, 6–8 visible, 9–10 missing, 11–15 visible.
  - *Assertions*: Continuous tracking maintained; buffer contains 11 valid frames.

---

#### SECTION 4: Prevention of Unintended Lock Transfer

##### Tier 1: Unit & Functional Tests
* **`TL_XFER_01`: Crossing Path Overlap ($d < 0.10$ for 2 Frames)**
  - *Goal*: Primary target ($v_x = 0.03$) and secondary distractor ($v_x = -0.03$) cross paths, overlapping at $x=0.50$ for frames 5–6.
  - *Assertions*: Target lock remains on primary subject through and after the intersection.

* **`TL_XFER_02`: Secondary Subject Spawning Near Target ($d = 0.15$)**
  - *Goal*: Subject 2 suddenly enters frame at $x=0.45$ while primary target is locked at $x=0.30$.
  - *Assertions*: Hysteresis bonus keeps lock on primary target ($x=0.30$).

* **`TL_XFER_03`: Single-Frame High-Area Noise Pop**
  - *Goal*: Frame 5 inserts an artificial high-area candidate ($Area = 0.80, d = 0.40$).
  - *Assertions*: Noise pop rejected ($S_{target} > S_{noise}$); lock retained on target.

* **`TL_XFER_04`: Secondary Subject Overtaking Primary Target in Visual Area**
  - *Goal*: Primary target moves away ($scale: 0.60 \to 0.20$), while secondary subject approaches ($scale: 0.20 \to 0.60$).
  - *Assertions*: Hysteresis bonus prevents lock transfer to the approaching secondary subject.

* **`TL_XFER_05`: Distractor Frame Exit**
  - *Goal*: Distractor walks alongside primary target for 15 frames, then exits frame.
  - *Assertions*: Target lock on primary subject remains unaffected by distractor exit.

##### Tier 2: Boundary & Corner Tests
* **`TL_XFER_B01`: Parallel Walking Subjects ($d = 0.25$ Constant Distance for 30 Frames)**
  - *Goal*: Two subjects walk side-by-side across the screen for 30 frames.
  - *Assertions*: 0 lock swaps across all 30 frames.

* **`TL_XFER_B02`: Secondary Subject Identical Bounding Box Area**
  - *Goal*: Primary and secondary candidates have exact same scale ($scale = 0.50$), $d_{primary} = 0.02, d_{secondary} = 0.20$.
  - *Assertions*: Primary target selected due to lower spatial distance penalty.

* **`TL_XFER_B03`: Primary Target Temporary Leg Visibility Drop ($vis_{leg} < 0.20$)**
  - *Goal*: Primary target lower body momentarily obscured by furniture, while secondary subject is fully visible.
  - *Assertions*: Torso/hip landmarks retain target lock on primary subject.

* **`TL_XFER_B04`: Distractor Mirroring Primary Target Motion ($v_{x,dist} = v_{x,target}$)**
  - *Goal*: Distractor moves parallel at identical velocity.
  - *Assertions*: Distance delta $d$ preserves primary target lock.

* **`TL_XFER_B05`: Directional Acceleration Lock Swap Attempt**
  - *Goal*: Primary subject accelerates right ($v_x: 0.02 \to 0.06$) while secondary subject passes left.
  - *Assertions*: Lock retained on primary subject.

---

#### SECTION 5: Scale Shifts, Direction Reversals (U-Turns) & Rapid Velocity Shifts

##### Tier 1: Unit & Functional Tests
* **`TL_DYN_01`: Progressive Camera Approach Scale Shift ($scale: 0.20 \to 0.80$ over 30 Frames)**
  - *Goal*: Subject walks directly toward camera; bounding box height expands from $0.20$ to $0.80$.
  - *Assertions*: Lock continuously maintained; buffer length === 30; `lastTargetHip` updates smoothly.

* **`TL_DYN_02`: Continuous 180-Degree U-Turn Direction Reversal**
  - *Goal*: Subject walks right ($x: 0.20 \to 0.60$), turns around over 5 frames ($v_x: +0.04 \to 0.00 \to -0.04$), and walks left ($x: 0.60 \to 0.20$).
  - *Assertions*: Lock retained without track split across turnaround frames.

* **`TL_DYN_03`: Rapid Velocity Shift / Fast Walking ($\Delta x: 0.02 \to 0.08$ per frame)**
  - *Goal*: Subject transitions from slow walk to fast walk.
  - *Assertions*: Velocity-projected spatial gating tracks fast movement without losing lock.

* **`TL_DYN_04`: Sudden Zoom / Camera Scale Jump ($scale: 0.30 \to 0.75$ in 5 Frames)**
  - *Goal*: Camera zooms in rapidly.
  - *Assertions*: Bounding box area expansion handled without losing target lock.

* **`TL_DYN_05`: Sudden Stop and Go ($v_x: 0.04 \to 0.00 \to 0.04$)**
  - *Goal*: Subject halts for 5 frames, then resumes walking.
  - *Assertions*: Lock retained on stationary subject and during re-acceleration.

##### Tier 2: Boundary & Corner Tests
* **`TL_DYN_B01`: U-Turn Executed at Frame Boundary ($x = 0.05$)**
  - *Goal*: Turnaround occurs at extreme left edge of image.
  - *Assertions*: Lock retained near boundary.

* **`TL_DYN_B02`: Extreme Fast-Walking Velocity ($\Delta x = 0.12$ per frame at 30 FPS)**
  - *Goal*: Test upper boundary of human walking velocity in image space.
  - *Assertions*: Velocity projection maintains spatial gate.

* **`TL_DYN_B03`: Scale Shrinkage ($scale: 0.80 \to 0.15$, Walking Away)**
  - *Goal*: Subject walks away from camera into background.
  - *Assertions*: Lock maintained as bounding box shrinks.

* **`TL_DYN_B04`: Rapid S-Curve Trajectory (Zigzag Motion)**
  - *Goal*: Subject weaves back and forth ($y: 0.50 \to 0.35 \to 0.65 \to 0.50$).
  - *Assertions*: 2D displacement tracking maintains target lock.

* **`TL_DYN_B05`: U-Turn with Simultaneous Scale Expansion**
  - *Goal*: Subject turns around while stepping closer to camera.
  - *Assertions*: Combined velocity reversal and scale expansion tracked seamlessly.

---

#### SECTION 6: Tier 3 Pairwise Feature Interaction Tests ($\ge 10$ Tests)

* **`TL_PAIR_01`: U-Turn Direction Reversal + 5-Frame Occlusion**
  - *Combines*: Requirement 5 (U-turn) + Requirement 3 (Occlusion).
  - *Scenario*: Subject initiates U-turn at $x=0.60$, becomes occluded for 5 frames during turnaround, reappears walking left at $x=0.52$.
  - *Assertions*: Lock re-acquired; direction reversal handled correctly.

* **`TL_PAIR_02`: Scale Shift ($0.20 \to 0.60$) + Background Distractor Crossing**
  - *Combines*: Requirement 5 (Scale shift) + Requirement 2 (Distractor).
  - *Scenario*: Primary subject approaches camera while secondary passerby crosses behind.
  - *Assertions*: Lock retained on primary subject throughout scale shift.

* **`TL_PAIR_03`: Fast Walking ($\Delta x = 0.08$) + 4-Frame Occlusion Sweep**
  - *Combines*: Requirement 5 (Fast walking) + Requirement 3 (Occlusion).
  - *Scenario*: Fast-walking subject is occluded for 4 frames. Velocity projection predicts location $x_{pred} = x + 4 \times 0.08 = x + 0.32$. Target reappears at $x_{pred}$.
  - *Assertions*: Lock re-acquired at high-velocity projected location.

* **`TL_PAIR_04`: Low Landmark Visibility ($vis = 0.45$) + U-Turn**
  - *Combines*: Requirement 1 (Low visibility boundary) + Requirement 5 (U-turn).
  - *Scenario*: Subject executes U-turn under poor lighting (keypoint visibilities near threshold).
  - *Assertions*: Lock maintained across turnaround.

* **`TL_PAIR_05`: Background Distractor Crossing During Primary Target U-Turn**
  - *Combines*: Requirement 2 (Distractor) + Requirement 5 (U-turn).
  - *Scenario*: Distractor crosses path at exact moment primary target slows down to turn around.
  - *Assertions*: Lock stays on primary target turning around.

* **`TL_PAIR_06`: Occlusion During Rapid Scale Expansion**
  - *Combines*: Requirement 3 (Occlusion) + Requirement 5 (Scale jump).
  - *Scenario*: Subject steps forward rapidly and becomes occluded for 3 frames by a pillar.
  - *Assertions*: Lock re-acquired with updated scale.

* **`TL_PAIR_07`: Distractor Crossing + Rapid Acceleration**
  - *Combines*: Requirement 2 (Distractor) + Requirement 5 (Acceleration).
  - *Scenario*: Primary target bursts into fast walk while distractor crosses behind.
  - *Assertions*: Acceleration does not break spatial gate; distractor rejected.

* **`TL_PAIR_08`: U-Turn in Crowded Room (2 Static Observers + 1 Moving Distractor)**
  - *Combines*: Requirement 2 (Crowded scenario) + Requirement 5 (U-turn).
  - *Scenario*: Subject walks back and forth in front of two seated clinicians and one walking assistant.
  - *Assertions*: 100% lock retention on moving gait subject.

* **`TL_PAIR_09`: Fast Walking + Scale Shift + Crossing Passerby (Triple Interaction)**
  - *Combines*: Requirement 2 + Requirement 5.
  - *Scenario*: Subject walks fast toward camera ($scale: 0.3 \to 0.7, \Delta x = 0.07$) as passerby walks left.
  - *Assertions*: Lock retained on primary subject.

* **`TL_PAIR_10`: Asymmetric Occlusion + U-Turn + Distractor (Triple Interaction)**
  - *Combines*: Requirement 2 + Requirement 3 + Requirement 5.
  - *Scenario*: Target turns around, becomes occluded for 4 frames while distractor passes, reappears walking in opposite direction.
  - *Assertions*: Lock re-acquired on primary target post-occlusion.

---

#### SECTION 7: Tier 4 Real-World Application Workload Scenarios (5 Scenarios)

##### `TL_WORKLOAD_01`: Clinical Hallway Walk (U-Turn + Scale Shift + 5-Frame Occlusion)
- **Description**: Simulates a patient walking down a 10-meter clinical hallway away from camera ($scale: 0.70 \to 0.20$), performing a 180-degree turnaround at the far end (frames 25–30), suffering a 5-frame doorway occlusion (frames 32–36), and returning toward camera ($scale: 0.20 \to 0.70$). Total 60 frames at 30 FPS.
- **Features Exercised**: Target Lock Acquisition, U-Turn Inversion, Scale Shift, 5-Frame Occlusion Re-Acquisition.
- **Expected Results**:
  - Total output frames in buffer === 55 (60 total minus 5 occluded).
  - 0 false lock transfers.
  - `lastTargetHip` forms continuous trajectory matching patient motion.

##### `TL_WORKLOAD_02`: Live Stream Crowded Clinic (Primary Subject + 2 Crossing Distractors + Static Clinician)
- **Description**: Simulates a live webcam stream in a busy clinic. Primary subject walks back and forth. Static clinician stands at $x=0.85$. Two distinct distractors cross behind subject at frames 12–18 and 35–42. Total 60 frames.
- **Features Exercised**: Candidate Filtering, Transient Background Suppression, Hysteresis Retention.
- **Expected Results**:
  - Buffer contains 60 frames, all belonging to primary subject.
  - Target lock score $S_{primary}$ remains highest on every single frame.

##### `TL_WORKLOAD_03`: Fast-Walking Assessment Clip ($\Delta x = 0.08$ per frame, Variable Cadence)
- **Description**: Fast-walking gait speed trial. Subject moves from $x=0.10$ to $x=0.90$ in 10 frames ($\Delta x = 0.08$), turns around, and walks back fast. Total 30 frames.
- **Features Exercised**: Fast-Walking Spatial Gating, Linear Velocity Projection.
- **Expected Results**:
  - 0 false track splits or lost frames.
  - Smooth velocity vector tracking.

##### `TL_WORKLOAD_04`: Low-Visibility Noise Sweep + 10-Frame Max Occlusion
- **Description**: Subject walks under poor lighting conditions ($vis \approx 0.45$, random landmark noise $\pm 0.03$). Subject is fully occluded for 10 consecutive frames (frames 20–29) before reappearing. Total 50 frames.
- **Features Exercised**: Low-Confidence Candidate Filtering, Max 10-Frame Occlusion Re-Acquisition.
- **Expected Results**:
  - Buffer contains 40 frames.
  - Lock re-acquired on frame 30 without track ID change.

##### `TL_WORKLOAD_05`: Parallel Subject Gait Trial (Clinician Walking Alongside Patient)
- **Description**: Patient (primary target) walks at $x_1(t) = 0.30 + 0.01t$. Clinician walks parallel at $x_2(t) = 0.55 + 0.01t$ for 40 frames. At frame 20, clinician steps closer ($x_2 = 0.40$), narrowing distance to $d = 0.10$.
- **Features Exercised**: Target Lock Transfer Prevention, Parallel Multi-Subject Tracking.
- **Expected Results**:
  - Target lock remains 100% on Patient ($x_1$).
  - Zero lock transfer to Clinician ($x_2$).

---

## 5. Verification Method

To execute and verify this test design specification once `PoseTracker_target_lock.test.ts` is implemented in TM2 part B:

1. **Run Vitest on Target Lock Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/PoseTracker_target_lock.test.ts
   ```
   *Expected Result*: 100% green pass rate across all test cases (0 failures, 0 errors).

2. **Run Full Test Suite Regression**:
   ```bash
   npx vitest run
   ```
   *Expected Result*: 100% green pass rate across all 66+ test files.

3. **Verify TypeScript Compilation**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Result*: 0 compilation errors across `src/` and `server/`.
