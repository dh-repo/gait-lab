# Exhaustive Audit: Test Suite Coverage, Adversarial Edge-Case Resilience, and Reference Video Dataset Assets

**Author:** teamwork_preview_explorer  
**Date:** 2026-08-09  
**Repository:** `gait-lab` (`/Users/damian/GitHub/gait-lab`)  
**Scope:** Automated Test Suite, Adversarial Edge-Case Synthesis, Reference Video Dataset Assets (`public/samples/`), UI Sample Picker Integration  

---

## Executive Summary

This report provides a comprehensive, read-only audit of the test suite coverage, synthetic gait generation capabilities, adversarial edge-case resilience, and reference video assets for the `gait-lab` platform. 

### Key Audit Findings:
1. **Test Suite Architecture & Coverage:**  
   - Built on **Vitest 4.1.10** (`vitest.config.ts`) for unit/integration tests (`src/**/*.test.ts`) and **Node.js Test Runner** for script tests (`scripts/**/*.test.mjs`). Playwright end-to-end smoke scripts exist under `scripts/test-gait.mjs` and `scripts/test-gait-quick.mjs`.
   - The test suite comprises **23 test files** in `src/lib/gait/__tests__/` containing over **200 individual tests**. Coverage is strong across core signal processing (`signal.ts`), Zeni gait event detection (`events.ts`), harmonic ratio and smoothness calculations (`smoothness.ts`), symmetry metrics (`symmetry.ts`), dual-task effects (`dte.ts`), domain scoring (`ratings.ts`), educated guess heuristics (`guesses.ts`), and database persistence (`persistence.ts`).
   - Milestone M1–M9 regression specs validate critical scientific fixes, including follow-cam direction inference, Hann-window FFT harmonic ratio, clip-length invariance of stepTimeCV, view suppression for off-plane metrics, and 95% confidence intervals via split-half standard error.

2. **Adversarial Edge-Case Testing Gaps:**  
   - While existing tests cover basic uniform noise up to `noiseLevel = 0.25`, low visibility landmarks (`visibility = 0.1`), and basic limb frequency scaling (`asymmetryFactor`), there are **6 major testing gaps** in synthetic gait scenarios:
     1. *Severe Landmark Jitter & Corrupted Noise:* Lack of transient single-frame coordinate spikes (salt-and-pepper noise), joint-specific correlated jitter, and boundary coordinate clipping.
     2. *Variable Frame Drop Rates & Non-Uniform Sampling:* Zero test coverage for Variable Frame Rate (VFR), multi-frame drop bursts (MediaPipe/UI thread lag), duplicate timestamps, or out-of-order frame arrival.
     3. *Severe Landmark Occlusion & Disappearance:* Absence of multi-frame total pose loss, unilateral leg occlusion (in-plane leg masking during swing), and torso landmark missingness.
     4. *Extreme Gait Asymmetry & Pathological Gait:* Lack of hemiparetic gait modeling (80%/20% stance/swing split), prosthetic/stiff-knee gait (fixed knee angle), and severe step-length asymmetry.
     5. *Micro-Steps & Parkinsonian Gait:* Lack of shuffling gait modeling (< 0.015 normalized step length), festinating gait (accelerating cadence + decaying stride length), and freezing of gait (FOG) episodes.
     6. *High-Frequency Camera Shake & Global Frame Motion:* Lack of frame-wide 2D translational jitter, rotational camera tilt (+/- 15 deg), and rapid scale/zoom shifts.

3. **Reference Video Dataset Assets & UI Sample Picker Survey:**  
   - Currently, `public/sample-walk.mp4` (3.5 MB, 720x958, 30 FPS, 23.53s) is the **only video file** present in the workspace.
   - The required `public/samples/` directory **does not exist**.
   - Reference video datasets for specific camera viewpoints (sagittal view, frontal view, follow-cam view) are currently **missing**.
   - In the UI (`src/components/gait/GaitApp.tsx`), sample video loading is limited to a single button ("Try sample store walk") hardcoded to fetch `/sample-walk.mp4`. There is **no UI sample picker component** or multi-video selector.

---

## 1. Survey of Existing Automated Test Files & Frameworks

### 1.1 Test Configuration & Tooling
- **Primary Test Runner:** `vitest` v4.1.10 (`vitest.config.ts`).
  - Environment: `node`
  - Pattern: `src/**/*.test.ts`
  - Exclusions: `scripts/**`, `node_modules/**`
  - Alias: `@` -> `./src`
- **Secondary Test Runner:** `node --test` for ESM script validation (`scripts/**/*.test.mjs`).
- **E2E / Browser Automation:** Playwright Chromium headless runner (`scripts/test-gait.mjs`, `scripts/test-gait-quick.mjs`, `scripts/browser-smoke.mjs`).
- **NPM Script Entry:** `"test": "node --test 'scripts/**/*.test.mjs' && vitest run"`. Executing `npm test` runs cleanly with 0 errors across all test files.

### 1.2 Inventory of Test Files in `src/lib/gait/__tests__/`

| Test File | Lines | Primary Scope & Functionality Tested |
|---|---|---|
| `analysis.test.ts` | ~300 | `computeGaitMetrics` pipeline, stepTimeCV clip-length invariance (10s, 30s, 60s), educated guess integration, view angle classification |
| `signal.test.ts` | ~280 | Butterworth low-pass filter, zero-phase dual-pass filter, linear detrending, FFT harmonics, frequency domain analysis |
| `events.test.ts` | ~250 | Zeni kinematic event detection (`detectGaitEventsZeni`), heel-strike/toe-off peak detection, stance/swing phase percentages |
| `smoothness.test.ts` | ~160 | Harmonic Ratio (vertical HR, lateral HR, overall HR), log-dimensionless jerk, spectral purity |
| `symmetry.test.ts` | ~120 | Bilateral symmetry metrics (`symmetryAngle`, `gaitSymmetryIndex`), mathematical bounding checks |
| `dte.test.ts` | ~130 | Dual-Task Effect (`calculateDTE`), Cognitive-Motor Interference (CMI) classification (`no_interference`, `cognitive_prioritization`, `motor_prioritization`, `mutual_interference`) |
| `ratings.test.ts` | ~170 | Normative domain scores (Stability, Rhythm, Symmetry, Mobility, Automaticity, Overall Score), linear scaling, score clamping [0, 100] |
| `guesses.test.ts` | ~200 | Clinical educated guesses engine (`buildEducatedGuesses`), rule-based heuristic triggers, dual-task cost warnings |
| `persistence.test.ts` | ~120 | Gait session persistence (`saveGaitSession`), database schema mapping, SQL query builders |
| `nan_property.test.ts` | ~80 | Numerical safety checks, NaN / Infinity propagation prevention across signal processing & symmetry functions |
| `stress_adversarial.test.ts` | ~250 | M1 stress tests (large signals 100k samples, extreme cutoff frequencies, stationary walking, zero baselines) |
| `m9_adversarial_stress.test.ts` | ~220 | M9 challenger stress tests (follow-cam direction inference under 0.05–0.25 noise, zero landmark visibility fallback, invalid stride times, parabolic timestamp refinement) |
| `synthetic_audit_regression_m9.test.ts` | ~317 | M9 audit regression tests (ground-truth direction inference, Hann-window FFT harmonic ratio, 10s–120s stepTimeCV invariance < 0.1%, view-angle metric suppression, split-half 95% CIs) |
| `challenge_m2_r1_2.test.ts` | ~230 | M2 R1/R2 challenger verification (FFT Hann windowing, f0 fundamental frequency estimation) |
| `challenger_m5_2.test.ts` | ~210 | M5 challenger stress tests (view angle angle-aware metric filtering) |
| `events.challenger_m7_2.test.ts` | ~260 | M7 Zeni algorithm challenger tests (prominence thresholding, peak distance constraints) |
| `m2_challenger_verification.test.ts` | ~300 | M2 algorithm verification tests |
| `m5_challenger_stress.test.ts` | ~290 | M5 view angle suppression stress tests |
| `m6_challenger_stress.test.ts` | ~270 | M6 dual-task effect stress tests |
| `m7_steptimecv_stress.test.ts` | ~150 | M7 stepTimeCV calculation and clip-length invariance tests |
| `split_half_stress_m8_2.test.ts` | ~220 | M8 split-half reliability and standard error calculation tests |
| `view_suppression_stress_m8_1.test.ts` | ~190 | M8 camera view metric suppression tests |
| `testHelpers.ts` | 183 | Synthetic pose frame generators (`generateSyntheticWalkingFrames`, `generateStationaryPoseFrames`, `generateNoisyPoseFrames`, `createMockMetrics`) |

---

## 2. Analysis of Test Helpers & Synthetic Data Generation

### 2.1 Synthetic Generator Capabilities (`src/lib/gait/__tests__/testHelpers.ts`)
The project contains a synthetic 33-landmark pose generator (`generateSyntheticWalkingFrames`) with the following configurable options (`SyntheticFrameOptions`):
- `fps`: Target frame rate (default 30).
- `durationSec`: Duration of synthetic clip in seconds (default 3.0).
- `direction`: Walking direction (1 for left-to-right, -1 for right-to-left).
- `followCam`: Simulates handheld follow-cam where net hip X progress is 0.
- `asymmetryFactor`: Scales right leg phase frequency relative to left leg.
- `lowVisibilityLandmarks`: Sets landmark visibility to 0.1.
- `noiseLevel`: Adds uniform random noise `(Math.random() - 0.5) * noiseLevel` to hip and ankle coordinates.
- `viewAngle`: Adjusts shoulder width and hip depth offset to simulate `'sagittal'`, `'frontal'`, or `'oblique'` camera angles.

### 2.2 Strengths of Existing Helpers
1. **Biomechanical Baseline:** Generates continuous sinusoidal trajectories for hips, knees, ankles, heels, and foot indices at a step frequency of 1.6 Hz (~96 SPM).
2. **View Angle Awareness:** Correctly adjusts 3D landmark depth (`z`) and 2D horizontal span (`x`) to simulate sagittal vs frontal vs oblique camera viewpoints.
3. **Follow-Cam Simulation:** Supports zero net hip drift (`followCam: true`), enabling verification of foot orientation vector direction inference.

---

## 3. Gaps in Adversarial & Synthetic Gait Testing

Despite extensive milestone regression tests, six critical categories of real-world adversarial gait video artifacts and extreme clinical pathologies are currently unaddressed in the test suite:

```
+-----------------------------------------------------------------------------------+
|                           ADVERSARIAL TESTING GAPS                                |
+------------------------------------+----------------------------------------------+
| Category                           | Description of Testing Gap                   |
+------------------------------------+----------------------------------------------+
| 1. Severe Landmark Jitter & Noise  | Lack of single-frame coordinate spikes,      |
|                                    | joint-correlated noise, coordinate clipping  |
| 2. Variable Frame Drop Rates       | No tests for VFR, multi-frame burst drops,   |
|                                    | out-of-order or duplicate timestamps         |
| 3. Severe Landmark Occlusion       | Absence of multi-frame pose loss, unilateral |
|                                    | leg masking, torso landmark missingness      |
| 4. Extreme Gait Asymmetry          | No hemiparetic (80/20 stance/swing),         |
|                                    | stiff-knee prosthetic, or step-length gap    |
| 5. Micro-Steps & Parkinsonian Gait | Lack of shuffling gait (<0.015 step length), |
|                                    | festinating gait, or freezing of gait (FOG)  |
| 6. High-Frequency Camera Shake     | No 2D translational jitter, camera rotation, |
|                                    | scale/zoom shifts, or tilted ground plane    |
+------------------------------------+----------------------------------------------+
```

### Gap 1: Severe Landmark Jitter & Corrupted Noise
- **Current Coverage:** Tests uniform random noise up to `noiseLevel = 0.25` applied uniformly to X/Y coordinates in every frame.
- **Uncovered Edge Cases:**
  - *Transient Spike Noise (Salt-and-Pepper):* Occasional single-frame landmark tracking pops where an ankle or heel teleports across the screen (e.g. `x` jumps by +0.5 for 1 frame due to background clutter) before returning to the true trajectory.
  - *Joint-Specific Correlated Jitter:* High-frequency noise affecting only one joint (e.g. knee landmark oscillating violently while ankle and hip remain smooth), creating false zero-crossings in derivative calculations.
  - *Out-of-Bounds Coordinate Clipping:* Landmark coordinates falling outside `[0, 1]` (e.g. `x = -0.15` or `y = 1.25` when a foot leaves the camera frame), which may cause domain errors in trigonometric functions.

### Gap 2: Variable Frame Drop Rates & Non-Uniform Time Sampling
- **Current Coverage:** Generators strictly output constant frame intervals `timeMs = (f / fps) * 1000`.
- **Uncovered Edge Cases:**
  - *Variable Frame Rate (VFR):* Mobile browsers recording video under fluctuating system load generate non-uniform timestamp intervals (e.g., delta times varying randomly between 16ms and 75ms).
  - *Multi-Frame Drop Bursts:* UI thread locks or MediaPipe processing hiccups dropping 3 to 10 consecutive frames (e.g. skipping from 1.0s to 1.35s instantly), creating artificial step time spikes.
  - *Duplicate or Out-of-Order Timestamps:* Input frames containing identical timestamps (`timeMs[i] == timeMs[i+1]`) or unordered timestamps (`timeMs[i] > timeMs[i+1]`), which can cause divide-by-zero errors in velocity/acceleration calculations.

### Gap 3: Severe Landmark Occlusion & Disappearance
- **Current Coverage:** Tests static `lowVisibilityLandmarks` (`visibility = 0.1`) and forcing foot/heel visibilities to `0.0`.
- **Uncovered Edge Cases:**
  - *Transient Multi-Frame Pose Loss:* Total landmark disappearance for 15–45 frames (0.5s–1.5s) when a subject walks behind an obstruction (e.g., pillar, medical equipment, desk) and re-emerges.
  - *Unilateral Leg Occlusion:* In strict sagittal views, the distant leg is completely masked by the near leg during mid-stance/mid-swing phases for 5–10 consecutive frames.
  - *Torso Landmark Missingness:* Missing shoulder (`landmarks[11], landmarks[12]`) or hip (`landmarks[23], landmarks[24]`) landmarks (`visibility = 0`), which corrupts torso height normalization and view-angle determination.

### Gap 4: Extreme Gait Asymmetry & Pathological Gait Patterns
- **Current Coverage:** Tests frequency multiplier (`asymmetryFactor`) and harmonic odd-component injection for limping.
- **Uncovered Edge Cases:**
  - *Hemiparetic Gait:* Severe post-stroke gait where affected limb stance phase is reduced to 25% while healthy limb stance phase is 75%, accompanied by circumduction (lateral leg swinging).
  - *Prosthetic / Stiff-Knee Gait:* Knee flexion locked at a constant angle (< 10 degrees) throughout the entire gait cycle.
  - *Severe Step-Length Asymmetry:* Left step length = 0.45m, right step length = 0.05m (9:1 step length ratio).

### Gap 5: Micro-Steps, Shuffling & Parkinsonian Gait
- **Current Coverage:** Generator uses fixed step amplitude (`leftAnkleOffset = 0.15 * sin(...)`).
- **Uncovered Edge Cases:**
  - *Shuffling Gait:* Extremely small ankle displacement (< 0.015 normalized coordinate units) and minimal vertical bounce (< 0.005), which can cause peak detection algorithms to miss step events entirely or misidentify signal noise as steps.
  - *Festinating Gait:* Parkinsonian gait pattern where step cadence progressively accelerates from 100 SPM to 190 SPM while step length decays toward zero.
  - *Freezing of Gait (FOG):* Sudden transition from normal walking to high-frequency trembling/oscillations at 3–8 Hz with zero forward progression.

### Gap 6: High-Frequency Camera Shake & Global Body Motion
- **Current Coverage:** Supports stationary camera and linear progress follow-cam (`followCam: true`).
- **Uncovered Edge Cases:**
  - *High-Frequency Handheld Camera Shake:* High-frequency 2D translational jitter (`[dx, dy]` sampled from Gaussian noise applied to ALL 33 landmarks simultaneously on every frame), simulating handheld smartphone recording without optical stabilization.
  - *Rotational Camera Tilt:* Camera frame rotation of 10°–30° relative to the ground plane, corrupting vertical bounce and pelvic obliquity metrics.
  - *Dynamic Scale / Zoom Shifts:* Camera zooming in or out while tracking the subject, causing torso height and stride length in normalized coordinates to change non-linearly over time.

---

## 4. Survey of Reference Video Dataset Assets & UI Integration

### 4.1 Local Asset Inventory (`public/`)
- **Existing Asset:** `public/sample-walk.mp4`
  - File Size: 3,695,442 bytes (~3.5 MB)
  - Resolution: 720 x 958 pixels
  - Frame Rate: 30.0 FPS
  - Duration: 23.53 seconds
  - Description: Store/indoor walkway gait clip used for basic single-person demonstration.
- **Missing Directory:** `public/samples/` does **not exist** in the workspace.
- **Missing Video Samples:**
  - `sagittal-walk.mp4`: Dedicated side-view video clip for sagittal kinematic evaluation (knee flexion, stance/swing ratio, arm swing).
  - `frontal-walk.mp4`: Dedicated front-view video clip for frontal kinematic evaluation (lateral sway, step width, pelvic obliquity).
  - `follow-cam-walk.mp4`: Dedicated follow-cam video clip (handheld tracking shot with zero net horizontal hip displacement).

### 4.2 UI Sample Picker Integration (`src/components/gait/GaitApp.tsx`)
- **Current Implementation:**
  - Lines 531–534: A single button in the upload card:
    ```tsx
    <Button size="lg" variant="secondary" onClick={() => void loadSample()}>
      <Play className="size-4" />
      Try sample store walk
    </Button>
    ```
  - Lines 436–448: The `loadSample` function fetches `/sample-walk.mp4` directly:
    ```tsx
    const loadSample = useCallback(async () => {
      try {
        setMessage("Loading sample video…");
        const res = await fetch("/sample-walk.mp4");
        if (!res.ok) throw new Error("Sample video missing");
        const blob = await res.blob();
        const file = new File([blob], "sample-store-walk.mp4", { type: "video/mp4" });
        await processFile(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load sample");
        setPhase("error");
      }
    }, [processFile]);
    ```
- **Deficiencies:**
  - Single hardcoded sample URL (`/sample-walk.mp4`).
  - No UI component for browsing or selecting among multiple sample reference videos.
  - No tags or visual indicators for camera view angles (Sagittal, Frontal, Follow-Cam) or clinical gait types.

### 4.3 Target UI Sample Picker Architecture (for Implementation Phase)
To satisfy Requirement R5 and Acceptance Criteria, the platform requires:
1. Directory structure: `public/samples/` containing open-access/synthesized reference clips:
   - `public/samples/sagittal-walk.mp4`
   - `public/samples/frontal-walk.mp4`
   - `public/samples/follow-cam-walk.mp4`
2. Sample Picker UI Component (`SamplePicker.tsx` or integrated into `GaitApp.tsx`):
   - Grid or card list presenting available reference gait samples.
   - Metadata badges indicating View Angle (Sagittal, Frontal, Follow-Cam), Duration, and Primary Clinical Features.
   - One-click trigger passing the selected video file to `processFile()`.

---

## 5. Summary & Recommendations

1. **Test Suite Expansion:**  
   Extend `testHelpers.ts` to support enhanced synthetic options (`spikeNoise`, `variableFps`, `frameDropBurst`, `hemipareticAsymmetry`, `shufflingGait`, `cameraShake`). Add dedicated adversarial test suites covering the 6 identified gap categories to guarantee zero uncaught exceptions and robust fallback behavior.

2. **Reference Video Acquisition & Directory Setup:**  
   Create `public/samples/` and populate it with sagittal, frontal, and follow-cam reference videos.

3. **UI Sample Picker Component:**  
   Replace the single "Try sample store walk" button with a multi-sample picker component offering instant selection across all reference video assets.
