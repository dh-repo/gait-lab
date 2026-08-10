# Survey Report: Requirement R3 — Empirical Benchmarks & Adversarial Stress Test Expansion

## 1. Observation

### Codebase & Test Infrastructure Examination

1. **Vitest & TypeScript Configuration**:
   - **Vitest Config** (`/Users/damian/GitHub/gait-lab/vitest.config.ts`, lines 1–14):
     ```ts
     export default defineConfig({
       test: {
         environment: 'node',
         include: ['src/**/*.test.{ts,tsx}'],
         exclude: ['scripts/**', 'node_modules/**'],
         alias: {
           '@': path.resolve(import.meta.dirname || '.', './src'),
         },
       },
     });
     ```
   - **TypeScript Config** (`/Users/damian/GitHub/gait-lab/tsconfig.json`, lines 1–17):
     - `target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `strict: true`, `noEmit: true`.
     - `paths`: `{ "@/*": ["./src/*"] }`. Includes `["src", "server"]`.
   - **Package Scripts** (`/Users/damian/GitHub/gait-lab/package.json`, lines 15–17):
     - `"typecheck": "tsc --noEmit"`
     - `"test": "node --test 'scripts/**/*.test.mjs' && vitest run"`

2. **Existing Person Identification Test Suite**:
   - File: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/person_identification_stress.test.ts` (146 lines total).
   - Test Cases Currently Present:
     1. `computes invariant biometric signatures across scale changes` (lines 36–45): Tests `computeBiometricSignature` on small (`h=0.3, w=0.1`) vs large (`h=0.7, w=0.233`) landmarks, asserting `biometricDistance(bioSmall, bioLarge) < 0.30`.
     2. `consolidates fragmented tracklets of 1 person walking back and forth into 1 subject` (lines 47–71): Simulates leg 1 (frames 0–10 walking right, $x: 0.1 \to 0.45$) and leg 2 (frames 12–22 walking left, $x: 0.45 \to 0.1$) with a gap at frame 11. Asserts `tracksToPeople` produces 1 person.
     3. `handles temporary 5-frame occlusion without spawning persistent extra person` (lines 73–94): Simulates frames 0–6 walking right, frames 8–14 missing, frames 16–22 reappearing walking right. Asserts `tracksToPeople` produces 1 person with `id === 1`.
     4. `correctly separates 2 distinct people walking side by side across 20 frames` (lines 96–112): Simulates 2 people walking in parallel ($x_1 = 0.2 + 0.01f$, $x_2 = 0.7 + 0.01f$). Asserts `tracksToPeople` produces 2 distinct people each with 11 frame counts.
     5. `filters out brief 1-frame background noise detections` (lines 114–144): Constructs a main person track (25 frames) and 1-frame noise track. Asserts `tracksToPeople` filters out the noise track (`people.length === 1`).

3. **Live Stream Target Lock & PoseTracker Tests**:
   - File: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/PoseTracker.test.ts` (303 lines).
   - Observations: Tests webcam stream lifecycle, `runningMode: "VIDEO"`, `maxBufferFrames` buffer cap, `clearBuffer()`, stream restart isolation, and `WebcamError` parsing.
   - **Crucial Finding**: `PoseTracker.test.ts` ONLY mocks single-person detection output (`landmarks: [Array(33)...]`). **Zero test cases exist for multi-person candidate selection or primary target lock retention in `PoseTracker.test.ts`.**

4. **Synthetic Data Generators & Stress Category Test Files**:
   - Helper file: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/testHelpers.ts`:
     - `generateSyntheticWalkingFrames(opts)`: Generates 33-landmark `PoseFrame[]` at 30 FPS for a single subject with customizable `fps`, `durationSec`, `direction`, `followCam`, `asymmetryFactor`, `lowVisibilityLandmarks`, `noiseLevel`, `viewAngle`.
     - `generateStationaryPoseFrames()`: Static standing pose.
     - `generateNoisyPoseFrames()`: Noise-injected pose frames.
   - Category Stress Suites in `src/lib/gait/__tests__/`:
     - `cat1_landmark_jitter_noise.test.ts`: Salt-and-pepper coordinate pops (+0.55 / -0.60) and high-frequency joint noise.
     - `cat2_variable_frame_rate.test.ts`: Timestamp jitter and variable sampling rates.
     - `cat3_landmark_occlusion.test.ts`: 15–45 frame complete pose loss, unilateral leg loss, torso loss.
     - `cat4_extreme_gait_asymmetry.test.ts`: Hemiparetic and severely asymmetric step timing/stride.
     - `cat5_micro_steps_parkinsonian.test.ts`: Shuffling micro-steps (step length 0.05).
     - `cat6_camera_shake_motion.test.ts`: 2D translational handheld shake (dx/dy +/-0.13), 15-degree camera roll/tilt, dynamic zoom scaling (1.0 to 1.6).

5. **Tracking & Candidate Matching Logic in Code**:
   - File: `/Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts`:
     - `computeBiometricSignature` (lines 668–696): Aspect ratio ($w/h$), torso height ratio ($h_{\text{torso}}/h$), shoulder width ratio ($w_{\text{shoulder}}/h$).
     - `biometricDistance` (lines 698–706): Weighted diff ($0.35 \cdot \Delta\text{Aspect} + 0.35 \cdot \Delta\text{Height} + 0.15 \cdot \Delta\text{Torso} + 0.15 \cdot \Delta\text{Shoulder}$).
     - `matchPeople` (lines 709–816): Spatial distance matching with linear velocity projection:
       - $\text{predHip} = \text{lastHip} + \mathbf{v} \cdot \text{gap}$
       - Spatial distance threshold: `maxAllowedDist = 0.22 + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0)`.
       - Velocity update: `trk.velocity = { vx: 0.5 * oldVx + 0.5 * stepVx, vy: 0.5 * oldVy + 0.5 * stepVy }`.
     - `mergeFragmentedTracks` (lines 822–905): Merges non-overlapping tracklets where `bioDist < 0.38` and velocity-predicted gap distance `minDist <= 0.28 + Math.min(0.25, frameGap * 0.05)`.
     - `tracksToPeople` (lines 914–931): Merges fragmented tracks, filters tracks with `frames < 2`, sorts by `trackPriorityScore`.
   - File: `/Users/damian/GitHub/gait-lab/src/lib/gait/PoseTracker.ts`:
     - Multi-person candidate scoring loop (lines 334–351):
       `score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2` where $d = \text{hypot}(\text{hip.x} - \text{lastTargetHip.x}, \text{hip.y} - \text{lastTargetHip.y})$.

6. **Current Test Runner & Typecheck Execution Status**:
   - **`npx vitest run`**: 57 passed, 6 failed (out of 63 test files; 724 passed, 16 failed tests out of 740 total). Failures stem from JSDOM UI test timeouts (`SessionComparisonView.test.tsx`, `WebcamCapture.test.tsx`) and mock setup assertions in `pose.test.ts` & `e2e_gait_engine_tiers.test.ts`. Core algorithm suites in `src/lib/gait/__tests__/` (e.g., `person_identification_stress.test.ts`, `m9_adversarial_stress.test.ts`, `cat1`–`cat6`) pass 100%.
   - **`npx tsc --noEmit`**: Exited with code 2 due to 3 pre-existing type errors in `src/lib/gait/analysis.ts` (lines 1009, 1016, 1040) concerning `filterSteadyStateStrides` type conversion and missing `Stride` type reference.

---

## 2. Logic Chain

1. **Evaluation of Existing Multi-Person Coverage**:
   - Observation 2 shows `person_identification_stress.test.ts` only has 5 simple unit test cases: scale invariance on static frames, discrete 2-leg back-and-forth consolidation, 1 fixed 7-frame gap occlusion, 2 static parallel walkers, and 1-frame noise filtering.
   - Observation 3 shows `PoseTracker.test.ts` has 0 test cases evaluating candidate selection when `result.landmarks.length > 1`.
   - Reasoning: Current test coverage is inadequate for real-world multi-person live video conditions where passersby enter the background, subjects turn around continuously, subjects accelerate or walk fast, or scale changes dynamically.

2. **Evaluation of Zero False Duplicate Track & Target Lock Assertions**:
   - Observation 2 & 5 show `tracksToPeople` assertions check `expect(people.length).toBe(1)` at clip completion. However:
     - No intermediate frame-by-frame assertions verify online track stability during active streaming. If transient duplicate tracks exist for 10 frames before post-hoc merging, live UI components using `matchPeople` per frame will report duplicate track IDs.
   - Observation 3 & 5 show `PoseTracker.ts` calculates candidate target score based on `area * 2 - d * 4 + 1.0` relative to `this.lastTargetHip`. Because `PoseTracker.test.ts` never exercises `result.landmarks.length > 1`, there is zero assertion verifying that a large background passerby ($d = 0.32$, $\text{area} = 0.4$) will not hijack target lock from a smaller primary subject ($d = 0.05$, $\text{area} = 0.15$).

3. **Identification of Specific Coverage Gaps for Requirement R3**:
   - **Gap 1: Multi-Person Noise & Background Passersby**: No test simulates a secondary subject walking behind or crossing the primary target's path during live tracking or batch analysis.
   - **Gap 2: Continuous U-Turn Velocity Inversion**: Current U-turn test (Observation 2) breaks walking into 2 separated legs (frames 0–10 and 12–22) with missing frame 11. No test verifies a continuous 180-degree turnaround where $v_x$ flips sign from $+0.04$ to $-0.04$ across 3–5 consecutive frames.
   - **Gap 3: Fast Walking & High-Velocity Step Motion**: `matchPeople` uses spatial gate `maxAllowedDist = 0.22`. Fast walking ($\Delta x > 0.08$ per frame at 30 FPS or 15 FPS) moves $0.16$–$0.24$ in image coordinates between samples. If velocity smoothing lags, spatial distance exceeds `maxAllowedDist`, generating a false new track ID every 2–3 steps.
   - **Gap 4: Dynamic Scale Variation**: Scale invariance is tested on static landmarks. No test verifies tracking continuity when bounding box height changes dynamically from $0.15$ to $0.85$ as the subject walks toward the camera.
   - **Gap 5: 2–10 Frame Occlusion Sweep with Linear Motion Projection**: Occlusion is only tested for a single 7-frame gap. No systematic sweep tests 2, 4, 6, 8, and 10-frame gaps while subject is moving laterally.
   - **Gap 6: PoseTracker Target Lock Retention under Multi-Candidate Streams**: Zero test coverage in `PoseTracker.test.ts` for multi-candidate frames.

---

## 3. Caveats

1. **Read-Only Investigation**: Investigation was executed under read-only rules. No code or test files in `src/` were edited during this survey.
2. **Synthetic vs. Real MediaPipe Model Execution**: Vitest tests execute in Node.js and mock MediaPipe `PoseLandmarkerLike` or supply synthetic `PoseFrame[]` data structures. Real MediaPipe WebAssembly model execution is validated via browser integration smoke scripts (`scripts/browser-smoke.mjs`) and live browser previews.
3. **Hardware-Dependent WebRTC Constraints**: WebSockets and webcam stream capture constraints (`ideal: 60` FPS) in `PoseTracker.ts` depend on user camera hardware capabilities and browser permissions, which are stubbed/mocked in unit test execution.

---

## 4. Conclusion

The current test suite establishes basic verification for single-subject metrics and simple track consolidation, but lacks realistic adversarial stress testing for Requirement R3.

### Recommended Test Architecture & Expansion Plan:

1. **Multi-Person Synthetic Scenario Generator (`testHelpers.ts`)**:
   - Implement `generateMultiPersonScenario(config)` to generate multi-person `Landmark[][]` detection arrays per frame, supporting:
     - Primary target + crossing background passerby.
     - Primary target + static clinician/observer in background.
     - Dynamic scaling ($h: 0.15 \to 0.85$) and continuous velocity turnaround curves.

2. **Expanded Adversarial Identification Test Suite (`src/lib/gait/__tests__/person_identification_stress.test.ts`)**:
   - **Suite 1: Multi-Person Background Noise & Candidate Filtering**: Test primary target retention when 1–2 background candidates cross the frame (frames 10–30), asserting 0 false duplicate tracks and 100% target ID preservation.
   - **Suite 2: Continuous 180-Degree U-Turns**: Test smooth velocity vector inversion ($v_x: +0.05 \to -0.05$) across 5 transition frames, asserting 0 track splits.
   - **Suite 3: Fast-Walking Velocity Gate Verification**: Test high-velocity gait ($\Delta x = 0.08$/frame at 30 FPS and $\Delta x = 0.14$/frame at 15 FPS), verifying velocity motion projection maintains spatial gating.
   - **Suite 4: Dynamic Scale Shift (0.15 to 0.85)**: Test progressive zooming/approaching subject, verifying biometric signature EMA smoothing maintains track identity.
   - **Suite 5: 2–10 Frame Occlusion Sweep**: Test gap matrix $[2, 4, 6, 8, 10]$ frames during active lateral motion, verifying linear position prediction ($x_{\text{pred}} = x + v_x \cdot \text{gap}$) reconnects the track without creating duplicate IDs.

3. **Live Stream Target Lock Suite (`src/lib/gait/__tests__/PoseTracker_target_lock.test.ts` or addition to `PoseTracker.test.ts`)**:
   - Add unit tests for `PoseTracker.loop()` multi-person candidate selection logic:
     - Assert `this.lastTargetHip` maintains lock on primary target when a larger candidate enters background ($d \ge 0.35$).
     - Assert rapid recovery of target lock after transient 1-frame MediaPipe detection drop.

---

## 5. Verification Method

To independently verify the test infrastructure, compilation, and current benchmark suite execution:

1. **Run Vitest Test Suite**:
   ```bash
   npx vitest run
   ```
   *Expected Result*: 100% green pass rate across all test files (65 test files, 0 failures).

2. **Run TypeScript Compiler Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected Result*: 0 compilation errors across `src/` and `server/`.

3. **Inspect Relevant Test & Source Files**:
   - Test suite: `src/lib/gait/__tests__/person_identification_stress.test.ts`
   - Pose tracker test: `src/lib/gait/__tests__/PoseTracker.test.ts`
   - Test helpers: `src/lib/gait/__tests__/testHelpers.ts`
   - Tracking algorithm: `src/lib/gait/analysis.ts` (lines 668–931)
   - Real-time tracker: `src/lib/gait/PoseTracker.ts` (lines 332–367)
