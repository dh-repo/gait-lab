# Original User Request

## Initial Request — 2026-08-09T21:04:14Z

Enhance the accuracy, precision, and reliability of the `gait-lab` spatio-temporal gait analysis engine across 4 key technical tiers:

Working directory: `/Users/damian/GitHub/gait-lab`
Your orchestrator directory: `/Users/damian/GitHub/gait-lab/.agents/orchestrator`

### Requirements:
1. R1. Computer Vision & Model Fidelity Upgrades:
   - Upgrade MediaPipe Pose landmarker loading in `src/lib/gait/pose.ts` to support `pose_landmarker_heavy.task` with fallback to `pose_landmarker_full.task` and `pose_landmarker_lite.task`.
   - Implement 1D landmark coordinate temporal smoothing (Kalman or 5-point Savitzky-Golay filtering) on raw keypoints prior to kinematic metric computation.

2. R2. Video Capture Constraints & Real-World Floor Calibration:
   - Update `src/lib/gait/PoseTracker.ts` WebRTC options to request ideal 60 FPS video capture constraints (`ideal: 60`).
   - Implement real-world floor-plane marker calibration (QR / AprilTag / reference card) to map image pixels to absolute millimeters (mm/px) for distance and speed calculations.

3. R3. Multi-Signal Heel-Strike Fusion & Planar Homography:
   - Enhance event detection in `src/lib/gait/events.ts` by fusing relative AP foot displacement with vertical ankle acceleration minima and zero-velocity updates (ZUPT).
   - Implement 2D floor planar homography transformation to project 2D image coordinates into top-down floor coordinates for accurate step width estimation across oblique camera angles.

4. R4. Steady-State Stride Filtering & Quality Control:
   - Automatically detect and exclude initial acceleration and terminal deceleration strides so spatio-temporal variability (`stepTimeCV`) is computed strictly across steady-state strides.

5. Acceptance Criteria:
   - `npm test` passes 100% of all unit, integration, and synthetic ground-truth regression tests without regressions.
   - `npm run typecheck` passes with 0 TypeScript compilation errors.
   - `npm run lint` passes with 0 ESLint errors.
   - `npm run build` succeeds and produces a valid production build.

## Follow-up — 2026-08-10T01:13:18Z

Maximize person identification accuracy and minimize false positives/negatives in gait video analysis and live webcam streaming within `gait-lab`.

Working directory: /Users/damian/GitHub/gait-lab
Integrity mode: development

## Requirements

### R1. Person Tracking Accuracy & Re-Identification
Enhance MediaPipe pose landmark person tracking, re-identification, and velocity motion projection in `src/lib/gait/analysis.ts` and `src/lib/gait/PoseTracker.ts`. Optimize morphological biometric distance gating and velocity extrapolation to maintain a single unified identity across U-turns, scale changes, and temporary occlusions without creating false duplicate person tracks.

### R2. Transient Background Suppression & Candidate Filtering
Refine pose candidate confidence thresholds and spatial continuity checks in `PoseTracker.ts` and `matchPeople` to suppress transient background people, passersby, and low-confidence noise in multi-person scenes.

### R3. Empirical Benchmarks & Adversarial Stress Test Expansion
Expand synthetic and adversarial test suites (`src/lib/gait/__tests__/person_identification_stress.test.ts` and new test modules) with realistic multi-person noise models, scale variations, and camera movement to objectively quantify detection accuracy and verify zero false duplicate tracks.

## Acceptance Criteria

### Detection & Tracking Accuracy
- [ ] 0 false duplicate person tracks generated on single-subject gait walk clips (including U-turns, scale shifts, and 2-10 frame occlusions).
- [ ] Primary target lock reliably maintained during live webcam streaming when candidate background poses enter the frame.
- [ ] Fast-walking subjects correctly tracked across sample steps without exceeding velocity motion gates.

### Code Quality & Test Suite Integrity
- [ ] 100% green pass rate across all Vitest test suites (`npx vitest run`).
- [ ] 0 TypeScript compilation errors (`npx tsc --noEmit`).

## Follow-up — 2026-08-10T03:29:45Z

Continue analyzing, tuning, and hardening the `gait-lab` markerless spatio-temporal gait analysis engine — fixing the 2 remaining failing tests, deepening algorithm accuracy across all camera views, and acquiring/integrating additional reference video data for empirical validation.

Working directory: `/Users/damian/GitHub/gait-lab`
Integrity mode: development

## Current State (Baseline)

| Metric | Value |
|--------|-------|
| Test suite | **859/861 passing** (2 failures) |
| TypeScript | 0 `tsc --noEmit` errors |
| ESLint | 0 errors |
| Test files | 46 test files, 66 test suites |
| Core modules | `analysis.ts` (1233 lines), `events.ts` (610 lines), `PoseTracker.ts` (385 lines), `signal.ts` (426 lines), plus `angles.ts`, `symmetry.ts`, `dte.ts`, `smoothness.ts`, `fallrisk.ts`, `ratings.ts`, `guesses.ts` |
| Sample videos | 7 clips in `public/samples/` (sagittal, frontal, follow-cam, store-aisle, tuning-3992/3993, general) |
| Reference MOVs | 2 large iPhone MOVs in repo root: `IMG_3992.MOV` (560MB), `IMG_3993.MOV` (663MB) |

### 2 Failing Tests

1. **`e2e_engine_enhancements.test.ts`** — Tier 4 Scenario 2: Pathological Asymmetric Gait expects `stepTimeCV > 0.03` but got `0.024` (steady-state stride filter is overly aggressive, smoothing away valid asymmetry variability)
2. **`split_half_stress_m8_2.test.ts`** — Monotonicity: CI bounds expect monotonic expansion with increasing variance but got `199.526 > 106.399` (split-half CI width doesn't scale monotonically when variance injection is extreme)

## Requirements

### R1. Fix the 2 Failing Tests & Harden Algorithm Accuracy
Fix the root causes of the 2 failing tests by tuning the underlying algorithms (not weakening test assertions). Specifically: the steady-state stride filter in `filterSteadyStateStrides` may be over-trimming genuine pathological variability, and the split-half CI computation in `buildReliabilityBounds` may not scale correctly under extreme synthetic variance injection. After fixes, all 861+ tests must pass green.

### R2. Deepen Signal Processing & Event Detection Tuning
Systematically review and tune thresholds, gate parameters, and algorithm branches across the core pipeline in a balanced manner across all modules — `events.ts` (Zeni event detection, frontal-Y fallback, prominence thresholds), `analysis.ts` (view detection scoring, velocity gating in `matchPeople`, merge thresholds in `mergeFragmentedTracks`, steady-state stride filtering), `signal.ts` (Butterworth filter params), `PoseTracker.ts` (target lock scoring), `ratings.ts`, `guesses.ts`, and `fallrisk.ts`. Identify and fix any parameter values that are suboptimal for real-world video (the tuning clips `tuning-3992.mp4` and `tuning-3993.mp4` in `public/samples/` are extracted from the user's real iPhone MOVs).

### R3. Expand Adversarial Test Coverage for Identified Gaps
Add new synthetic test scenarios covering the 6 gap categories from the peer review (landmark jitter/noise, variable frame rate, landmark occlusion, extreme gait asymmetry, micro-steps/Parkinsonian, camera shake) — ensure the engine handles all without uncaught exceptions or producing `NaN`/`Infinity` metrics.

### R4. Download & Integrate Additional Reference Gait Video Data
Search broadly and download up to 10 publicly available reference gait analysis videos from various sources — clinical gait lab recordings, open gait datasets (e.g., CASIA-B, CMU MoBo), YouTube Creative Commons gait walk clips, and any other open-access video repositories suitable for empirical validation across sagittal, frontal, and follow-cam perspectives. Add them to `public/samples/` with appropriate naming and metadata. Use these for empirical regression testing and algorithm tuning beyond the current sample set.

### R5. Documentation & Scientific Justification Alignment
After all code changes, update `scientific_justifications.md` and `peer_review_report.md` to accurately reflect any modified algorithms, thresholds, or new test coverage. Ensure line-range mappings remain correct.

## Acceptance Criteria

### Test Suite Integrity
- [ ] 100% green pass rate across ALL Vitest test suites (`npx vitest run`) — zero failures.
- [ ] 0 TypeScript compilation errors (`npx tsc --noEmit`).
- [ ] 0 ESLint errors (`npx eslint .`).

### Algorithm Accuracy
- [ ] The 2 previously-failing tests now pass due to genuine algorithm improvements (not weakened assertions).
- [ ] No new test regressions introduced.
- [ ] Person tracking (`matchPeople`, `mergeFragmentedTracks`, `tracksToPeople`) produces 0 false duplicate tracks on all single-subject sample videos.

### Test Coverage Expansion
- [ ] At least 6 new adversarial test scenarios added (one per gap category from the peer review).
- [ ] All new tests pass without uncaught runtime exceptions.

### Reference Video Data
- [ ] At least 2 new reference video clips downloaded and added to `public/samples/`.
- [ ] Each new clip has a clear camera perspective label (sagittal/frontal/follow-cam).

### Documentation
- [ ] `scientific_justifications.md` Section 4 line-range mappings verified correct after changes.
- [ ] All modified algorithm thresholds documented with rationale.

## Follow-up — 2026-08-10T11:33:30Z

Go deeper into the gait-lab engine — upgrade core algorithms to SOTA techniques, fix structural weaknesses identified by forensic codebase analysis, and integrate clinical normative references. This is a precision engineering pass, not a surface-level tuning.

Working directory: `/Users/damian/GitHub/gait-lab`
Integrity mode: development

## Current State (Post-Phase 1)

| Metric | Value |
|--------|-------|
| Test suite | **986/986 passing** (0 failures) |
| TypeScript | 0 errors |
| Test files | 76 |
| Sample videos | 10 clips in `public/samples/` |

## Requirements

### R1. Hungarian Algorithm for Optimal Multi-Person Track Assignment

**Problem:** `matchPeople()` in `analysis.ts` (lines 815-933) uses greedy cost-sorted pair assignment. When two people cross paths or walk close together, greedy assignment is vulnerable to track swapping — the globally optimal assignment may require assigning a slightly higher-cost pair to avoid breaking another track.

**Fix:** Replace the greedy loop with the Hungarian (Kuhn-Munkres) algorithm for optimal bipartite matching. The cost matrix already exists (spatial distance + biometric distance). The Hungarian algorithm guarantees globally minimal total assignment cost, eliminating track-swap artifacts during close encounters.

**Constraints:** Keep the existing cost function (`minDist + bioDist * 0.25`) and `maxAllowedDist` gating. Only change the assignment strategy from greedy to optimal. Must not regress any existing person identification tests.

### R2. 2-State Kalman Filter with Velocity for Landmark Smoothing

**Problem:** `kalmanFilter1D()` in `signal.ts` (lines 244-289) implements a random-walk position-only model `x_k = x_{k-1} + w_k`. This causes:
- Lag during high-velocity swing phase (filter can't predict ahead)
- Frozen position during occlusion coasting (no velocity momentum)
- Over-smoothing of heel-strike deceleration transients

**Fix:** Upgrade to a 2-state `[position, velocity]^T` constant-velocity Kalman filter:
```
State: [x, v]^T
Transition: x_k = x_{k-1} + v_{k-1}·dt, v_k = v_{k-1}
```
Tune process noise Q and measurement noise R against the existing synthetic test suite. During occlusion (`visibility < 0.4`), coast with velocity prediction and inflate uncertainty.

### R3. One Euro Adaptive Filter for Real-Time PoseTracker

**Problem:** `PoseTracker.ts` feeds raw MediaPipe landmarks to `lastTargetHip` with no temporal filtering. Single-frame jitter causes erratic target position predictions and velocity spikes.

**Fix:** Implement the One Euro Filter (Casiez et al., CHI 2012) for real-time landmark smoothing in `PoseTracker`. The One Euro filter uses an adaptive cutoff frequency based on signal derivative (speed) — low cutoff during stillness (maximum smoothing) and high cutoff during fast movement (minimal lag). This is the SOTA approach for interactive pose pipelines.

Apply it to the hip center coordinates and optionally to the velocity estimate used for target lock scoring. The filter has 3 tunable parameters: `minCutoff`, `beta`, `dCutoff`.

### R4. Biometric-Aware Target Lock with Occlusion Recovery in PoseTracker

**Problem (4 weaknesses identified):**
1. **Bbox area bias** (lines 342-346): `score = area * 2 - d * 4 + 1.0`. A bystander closer to camera has larger bbox, stealing target lock.
2. **No biometric matching**: Unlike `analysis.ts`, `PoseTracker` doesn't check torso/leg proportions or aspect ratio for candidate selection.
3. **No velocity clamping**: Single-frame jitter produces large `vxStep` values, causing prediction overshoot.
4. **No occlusion recovery timeout**: When target is lost for multiple frames, `lastTargetHip` remains static while prediction diverges off-screen.

**Fix:**
- Integrate `computeBiometricSignature()` and `biometricDistance()` into `PoseTracker` candidate scoring. Maintain a running biometric template for the locked target.
- Replace raw `area * 2` scoring with a normalized score that weights: (a) spatial proximity to predicted position (40%), (b) biometric similarity (30%), (c) bbox area (15%), (d) position continuity (15%).
- Clamp per-frame velocity updates to ±2σ of the rolling velocity distribution.
- Add occlusion coasting: if no candidate matches within `maxDist` for N frames, coast with velocity decay (0.9^N). After 30 frames (~1s), reset lock.

### R5. Dynamic Per-Stride Walking Direction for U-Turn Handling

**Problem:** `detectGaitEventsZeni()` in `events.ts` (lines 237-290) computes a single global walking direction (`+1` or `-1`) for the entire video using median foot orientation. In walk-and-turn protocols (common in clinical 10m walk tests), event detection fails during the return segment because heel-strike/toe-off peak modes are inverted.

**Fix:** Compute a time-varying walking direction using a sliding window (e.g., 1.5s / ~45 frames). For each window:
1. Calculate local foot orientation median
2. Detect direction changes (sign flips with hysteresis threshold > 0.01)
3. Apply the correct `heelStrikeMode`/`toeOffMode` per segment

This also improves the frontal-Y fallback path which currently assigns contacts by strict `k % 2` alternation — a single missed contact inverts all subsequent left/right labels. Add a left/right disambiguation check using lateral ankle position (`lAnkleX vs rAnkleX`) at each contact.

### R6. Visibility-Gated Biometric Signatures & Sagittal Collapse Fix

**Problem:** `computeBiometricSignature()` in `analysis.ts` (lines 717-756) reads keypoints 11, 12, 23, 24, 27, 28 without checking `.visibility`. Occluded joints corrupt `torsoLegRatio`. Additionally, `shoulderHipRatio` collapses when subject walks in sagittal profile (shoulder/hip width projections → ~0).

**Fix:**
- Gate all biometric keypoints on `visibility >= 0.4`. If insufficient visible joints, return `undefined` (skip biometric update for that frame).
- Down-weight or suppress `shoulderHipRatio` when detected aspect ratio indicates sagittal alignment (`aspectRatio < 0.35`).
- Weight biometric EMA updates (currently fixed 70/30) by mean landmark visibility of the frame.

### R7. Adaptive Savitzky-Golay Window & Uniform Resampling Guard

**Problem:** `savitzkyGolay5()` in `signal.ts` uses a fixed 5-point stencil regardless of frame rate. At 60 FPS, 5 points spans only 83ms (too narrow to filter MediaPipe jitter); at 15 FPS, it spans 333ms (over-smooths heel-strike peaks). Additionally, `zeroPhaseButterworth()` assumes uniform sampling intervals, but WebRTC delivers variable frame rate timestamps.

**Fix:**
- Scale SG window size proportional to sampling rate: `windowSize = Math.max(5, Math.min(15, Math.round(fps * 0.17)))` (~5 points at 30fps, ~10 at 60fps).
- Add a uniform resampling guard at the entry of `zeroPhaseButterworth()`: if timestamp variance exceeds 10% of mean dt, resample to uniform grid via linear interpolation before filtering.

### R8. Expand Unit Test Coverage for Untested Modules

**Problem:** 5 modules lack dedicated unit/stress tests: `calibration.ts`, `homography.ts`, `liveCapture.ts`, `landmarks.ts`, `persistence.server.ts`.

**Fix:** Add dedicated test files for each:
- `landmarks.test.ts`: `hipCenter`, `torsoHeight`, `boundingBox`, `dist`, `angleDeg` with edge cases (missing landmarks, NaN coords, zero-height torso)
- `calibration.test.ts`: Marker detection, px-to-mm conversion, degenerate inputs
- `homography.test.ts`: 2D planar transform, singular matrices, identity transform, oblique angles
- `liveCapture.test.ts`: Stream lifecycle, frame rate constraint validation, error handling

### R9. Clinical Normative Reference Integration

**Problem:** The engine computes raw metrics but doesn't compare them against published normative reference ranges. This limits clinical interpretability.

**Fix:** Add a normative reference module (`src/lib/gait/normatives.ts`) that:
- Stores age/sex-stratified normative ranges for key parameters (cadence, step time CV, stance %, double support %, knee flexion ROM) from Winter (2009) and Bovi et al. (2011)
- Computes Z-scores and percentile ranks for each metric relative to normatives
- Computes the Gait Deviation Index (GDI) — a single composite score quantifying overall kinematic deviation from normative controls (GDI >= 100 = normal; each 10-point decrease = 1 SD from normal)
- Integrates into `ratings.ts` and `guesses.ts` to generate clinically grounded observations

## Acceptance Criteria

### Test Suite Integrity
- [ ] 100% green pass rate across ALL Vitest test suites (`npx vitest run`) — zero failures.
- [ ] 0 TypeScript compilation errors (`npx tsc --noEmit`).
- [ ] 0 ESLint errors.
- [ ] Total test count >= 1050 (currently 986 + new unit tests for R8 + new integration tests for R1-R7).

### Algorithm Correctness
- [ ] Hungarian assignment in `matchPeople` produces identical or better results than greedy on all existing person identification stress tests.
- [ ] 2-state Kalman filter passes all existing smoothing tests with equal or lower RMSE.
- [ ] One Euro filter in PoseTracker reduces target hip jitter by >= 30% on synthetic oscillation inputs.
- [ ] U-turn walk sequences correctly detect events in both walking directions.
- [ ] PoseTracker target lock holds through >= 10-frame occlusion gaps.
- [ ] Visibility-gated biometrics produce no NaN/undefined in any existing test.

### Clinical Integration
- [ ] `normatives.ts` provides Z-scores for at least 5 key gait parameters.
- [ ] GDI computation produces scores in [0, 130] range for normative and pathological synthetic inputs.
- [ ] `guesses.ts` references normative percentiles in at least 3 hypothesis rules.

### Documentation
- [ ] `scientific_justifications.md` updated with citations for: Hungarian algorithm, One Euro filter (Casiez 2012), 2-state Kalman, GDI (Schwartz & Rozumalski 2008), normative references (Winter 2009, Bovi 2011).
- [ ] All new algorithm implementations mapped in §4 with correct line ranges.

