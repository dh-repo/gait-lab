# Survey Report: Signal Processing, Event Detection Tuning (R2) & Adversarial Test Coverage Gaps (R3)

**Author:** explorer_survey_2  
**Date:** 2026-08-10  
**Workspace:** `/Users/damian/GitHub/gait-lab`  
**Report File:** `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_2/survey_r2_r3.md`

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Objective
This survey investigates **R2 (Signal Processing & Event Detection Tuning)** and **R3 (Adversarial Test Coverage Gaps)** for the `gait-lab` markerless spatio-temporal gait analysis engine. The analysis focuses on inspecting core engine modules, diagnosing the root causes of current test failures, evaluating real-world video tuning clips (`tuning-3992.mp4`, `tuning-3993.mp4`), cataloging existing test coverage, identifying missing adversarial scenarios across 6 key gap categories, and proposing parameter tuning guidelines and test generator strategies.

### 1.2 Current Baseline State
- **Test Suite Status:** 859 / 861 tests passing (2 failing tests).
- **Compilation / Linting:** 0 `tsc --noEmit` errors, 0 ESLint errors.
- **Core Engine Modules Inspected:**
  - `src/lib/gait/events.ts` (Zeni kinematic event detection, subframe peak refinement, frontal-Y fallback, ZUPT)
  - `src/lib/gait/analysis.ts` (View detection, stride calculation, `filterSteadyStateStrides`, `buildReliabilityBounds`, multi-person tracking)
  - `src/lib/gait/signal.ts` (Zero-phase Butterworth low-pass filter, 5-point Savitzky-Golay, 1D Kalman filter)
  - `src/lib/gait/PoseTracker.ts` (Target lock scoring, MediaPipe video loop, webcam constraints)
  - `src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`, `src/lib/gait/fallrisk.ts` (Domain ratings, clinical hypothesis rules, dual-model fall risk assessment)

---

### 1.3 Root Cause Analysis of the 2 Failing Tests

#### Failing Test 1: `e2e_engine_enhancements.test.ts`
- **Failure:** `Scenario 2: Pathological Asymmetric Gait Trial detects elevated stepTimeCV (> 10%) and step asymmetry` expected `stepTimeCV > 0.03` but evaluated to `0.02406`.
- **Root Cause:**
  1. `filterSteadyStateStrides` in `src/lib/gait/analysis.ts` (lines 1209–1223) trims stride intervals sequentially from both ends whenever the relative difference `Math.abs(duration - median) / median` exceeds a hardcoded threshold of `0.25` (25%).
  2. In asymmetric gait (such as hemiparetic or limping gait with `asymmetryFactor = 1.35`), step intervals naturally alternate between longer and shorter durations (e.g., Left step = 0.62s, Right step = 0.38s against a median of 0.50s; relative deviation = 24–28%).
  3. The filter treats these genuine asymmetric step variations as transient lead-in/lead-out noise and trims them away, leaving only the near-median strides. This over-trimming artificially reduces the calculated standard deviation (`std(cvIntervals)`), smoothing away valid step time variability (`stepTimeCV`).
- **Fix Rationale:**
  - Increase the trimming tolerance threshold in `filterSteadyStateStrides` from `0.25` to `0.40` (40%) or adopt an Interquartile Range (IQR) / modified Z-score approach so that genuine gait asymmetry is preserved while true acceleration/deceleration outliers are excluded.

#### Failing Test 2: `split_half_stress_m8_2.test.ts`
- **Failure:** `3. Monotonicity: CI bounds expand monotonically with increasing intra-clip variance between Half 1 and Half 2` expected `ciWidths[1] <= ciWidths[2]` but received `199.526 > 106.399`.
- **Root Cause:**
  1. In `src/lib/gait/events.ts` (line 297), the minimum inter-event gap constraint for Zeni peak detection is calculated as:
     $$\text{minGap} = \max(3, \lfloor 0.35 \times \text{fpsEffective} \rfloor)$$
  2. At 30 FPS, $0.35 \times 30 = 10.5 \rightarrow \text{minGap} = 10$ frames (333 ms), which corresponds to a maximum detectable step rate of ~180 steps/min (SPM).
  3. In `split_half_stress_m8_2.test.ts`, Level 2 speed perturbation applies a `1.6x` factor to Half 2 frame timestamps, causing the effective step interval to drop to ~15 frames at an effective sample rate of 48 FPS ($\text{minGap} = 16$ frames).
  4. Because the step interval (15 frames) fell below `minGap` (16 frames), `findExtrema` in `events.ts` suppressed every alternate heel strike peak during Half 2.
  5. The detected step count in Half 2 dropped by 50%, causing the calculated `m2.cadenceSpm` to artificially collapse to ~96 SPM (which coincidentally matched Half 1's baseline of 120 SPM closely). Consequently, $|m1 - m2|$ for Level 2 became smaller than for Level 1, violating the expected monotonic expansion of the 95% Confidence Interval (CI) width.
- **Fix Rationale:**
  - Reduce the minimum inter-event gap factor in `detectGaitEventsZeni` from `0.35` to `0.20` – `0.22` (e.g., $\text{minGap} = \max(3, \lfloor 0.20 \times \text{fps} \rfloor)$ = 200 ms minimum step duration, supporting cadences up to 300 SPM / fast walking / Parkinsonian micro-steps). This prevents artificial peak suppression under high-speed or high-cadence conditions.

---

## 2. R2: Core Signal Processing & Event Detection Module Deep Dive

### 2.1 `src/lib/gait/events.ts`
- **Current Logic:**
  - `detectGaitEventsZeni`: Computes relative anterior-posterior (AP) foot displacement relative to mid-hip:
    $$x_{\text{rel}}(t) = x_{\text{heel}}(t) - x_{\text{mid-hip}}(t)$$
  - Walking direction is determined by median foot vector ($x_{\text{toe}} - x_{\text{heel}}$) across valid frames, falling back to mid-hip net displacement if foot visibility $< 0.4$.
  - Extrema detection (`findExtrema`): Discards peaks below dynamic prominence threshold:
    $$P_{\text{min}} = \max(0.001, 0.15 \times \text{signalRange})$$
  - Frontal-Y Fallback: Triggered when $\text{apRange} < 0.022$ or $\text{apEventCount} < 4$. Uses vertical ankle coordinate maxima ($y$-axis points down) to detect floor contacts.
  - Subframe Timestamp Refinement (`refinePeakTimestamp`): 3-point parabolic interpolation around peak index $i$:
    $$\delta = \frac{y_{i-1} - y_{i+1}}{2(y_{i-1} - 2y_i + y_{i+1})}, \quad \text{clamped to } [-0.5, 0.5]$$
  - ZUPT Fusion (`detectFusedGaitEvents`): Checks root-mean-square ankle velocity against zero-velocity threshold ($\text{zuptThresh} = 0.005$ norm-units/sec) to suppress false contacts during standing.
- **Tuning Recommendations:**
  1. **`minGap` Scaling:** Change `0.35` factor to `0.20` in `detectGaitEventsZeni` and `0.20` in frontal-Y mode (`yMinGap`).
  2. **Frontal-Y Fallback Hysteresis:** Increase `apRange` threshold slightly from `0.022` to `0.028` with event count check to avoid mode toggling on oblique clips.
  3. **Prominence Scaling:** Make prominence adaptive to noise estimate (e.g. $P_{\text{min}} = \max(0.001, 0.12 \times \text{signalRange} + 2 \times \sigma_{\text{noise}})$).

### 2.2 `src/lib/gait/analysis.ts`
- **Current Logic:**
  - View Angle Detection (`detectViewAngle`): Evaluates hip width ratio, AP displacement range, and lateral sway to classify view as `sagittal`, `frontal`, or `oblique`.
  - `filterSteadyStateStrides`: Trims initial acceleration and terminal deceleration strides.
  - `computeGaitMetrics`: Computes spatio-temporal metrics (cadence, step time CV, symmetry angle, pelvic obliquity, step width, path smoothness) and split-half 95% CIs.
  - Multi-Person Tracking (`matchPeople`, `mergeFragmentedTracks`): Morphological biometric distance gating and velocity projection.
- **Tuning Recommendations:**
  1. **`filterSteadyStateStrides` Threshold:** Relax tolerance from `0.25` to `0.40` or use $1.5 \times \text{IQR}$ to avoid stripping pathological asymmetry.
  2. **View Angle Confidence Threshold:** Maintain smooth fallback for suppressed metrics (e.g., return `null` with explicit quality note when view confidence $< 0.40$).

### 2.3 `src/lib/gait/signal.ts`
- **Current Logic:**
  - `zeroPhaseButterworth`: 4th-order zero-phase low-pass Butterworth filter ($f_c = 6.0\text{ Hz}$ default) with boundary reflection padding.
  - `savitzkyGolay5`: 5-point 1D temporal smoothing with kernel $\frac{1}{35}[-3, 12, 17, 12, -3]$.
  - `kalmanFilter1D`: 1D scalar Kalman filter with process noise $Q = 10^{-4}$, measurement noise $R = 10^{-2}$, and occlusion coasting on non-finite input.
- **Tuning Recommendations:**
  1. **Cutoff Frequency Adaptability:** Maintain $f_c = 6.0\text{ Hz}$ for standard walking (captures up to ~3 Hz step frequency + 2nd harmonic). For high-cadence micro-steps (> 200 SPM), allow dynamic adjustment to $f_c = 8.0\text{ Hz}$.
  2. **Boundary Padding:** Reflection length $\text{padLen} = \min(24, N - 1)$ works effectively to prevent end-artifact transients.

### 2.4 `src/lib/gait/PoseTracker.ts`
- **Current Logic:**
  - MediaPipe `detectForVideo` loop with target lock tracking (`score = area * 2 - d * 4 + 1.0` when distance to previous hip $d \le 0.35$).
  - Webcam constraints: Requests `ideal: 60` FPS with fallback on `OverconstrainedError`.
- **Tuning Recommendations:**
  1. **Target Lock Continuity:** Velocity-assisted target position predictor $x_{\text{pred}} = x_{t-1} + v \cdot \Delta t$ during brief (2–10 frame) pose dropouts.

---

## 3. Reference Data & Real-World Video Tuning (`tuning-3992.mp4` / `tuning-3993.mp4`)

- **Dataset Inspection:**
  - `tuning-3992.mp4` (10.55s): Real-world indoor frontal walk extracted from 560MB iPhone MOV (`IMG_3992.MOV`). Features single subject walking towards/away from camera in home hallway lighting, partial footwear/barefoot.
  - `tuning-3993.mp4` (12.42s): Multi-person indoor hallway walk from 663MB iPhone MOV (`IMG_3993.MOV`).
- **Tuning Observations from Scripts (`scripts/tune-gait-samples.mjs`):**
  - Frontal perspective in `tuning-3992.mp4` requires robust frontal-Y step event detection because AP foot displacement is compressed along camera line-of-sight.
  - Multi-person tracking in `tuning-3993.mp4` tests target lock scoring in `PoseTracker.ts` and `matchPeople` in `analysis.ts` to ensure 0 false person track switches occur when secondary candidates pass.

---

## 4. R3: Adversarial Test Coverage Gap Analysis

### 4.1 Catalog of Current vs. Missing Adversarial Test Scenarios

| Category | Existing Test Files | Existing Scenarios | Missing Adversarial Scenarios |
|---|---|---|---|
| **1. Landmark Jitter/Noise** | `cat1_landmark_jitter_noise.test.ts` | • Single-frame coordinate spikes (+0.55 pop)<br>• Joint-correlated high-frequency noise (knee/ankle)<br>• Out-of-bounds (-0.35/1.45) & NaN/Infinity injection | • **Asymmetric Single-Limb Noise**: High jitter ($\sigma=0.10$) applied strictly to right foot keypoints while left leg is clean.<br>• **Continuous Heavy Gaussian Noise (SNR < 10 dB)**: Persistent zero-mean noise ($\sigma=0.08$) across all 33 keypoints on 100% of frames.<br>• **Rapid Visibility Flicker**: Visibility oscillating 0.95 $\leftrightarrow$ 0.05 on alternate frames without coordinate movement. |
| **2. Variable Frame Rate** | `cat2_variable_frame_rate.test.ts` | • 12-frame burst drop<br>• Irregular VFR (12ms–220ms deltas)<br>• Duplicate timestamps ($t_i = t_{i+1}$)<br>• Unordered/non-monotonic timestamps | • **Jittered VRR (29–61 FPS frame-by-frame toggle)**: Simulates mobile browser frame drop.<br>• **2.5s Blackout Drop & Recovery**: Total gap from $t=3.0s$ to $t=5.5s$ in a 10s clip; tests state reset and 0 false strides across join.<br>• **Slow-Mo High-FPS (120/240 FPS)**: Tests filter biquad stability and event detector scaling at high sample rates. |
| **3. Landmark Occlusion** | `cat3_landmark_occlusion.test.ts` | • 35-frame total pose loss<br>• Unilateral leg occlusion (left leg vis=0)<br>• Total torso loss (shoulders/hips vis=0) | • **180° U-Turn Self-Occlusion**: Subject turns around, causing left/right leg depth overlap and side swapping.<br>• **Ankle Crossing Path (X-Inversion)**: Scissoring step where left and right ankle X coordinates cross.<br>• **Intermittent Lower-Body Table Mask**: Ankles/feet completely occluded (vis=0) for full bottom half of video frame. |
| **4. Extreme Gait Asymmetry** | `cat4_extreme_gait_asymmetry.test.ts` | • 80/20 stance/swing phase split<br>• Stiff-knee prosthetic gait<br>• 9:1 step length ratio | • **Antalgic Limping Gait (Step Time L=0.7s, R=0.3s)**: Verifies `filterSteadyStateStrides` preserves step time CV (>10%) without over-trimming.<br>• **Dynamic Asymmetry Trend**: Asymmetry ratio increasing from 1.0 to 2.2 across trial.<br>• **Accelerating Asymmetric Gait**: Speed ramp while maintaining 2:1 step time asymmetry. |
| **5. Micro-Steps & Parkinsonian** | `cat5_micro_steps_parkinsonian.test.ts` | • Shuffling gait (<0.015 step length)<br>• Festinating gait (100 $\rightarrow$ 190 SPM)<br>• Freezing of Gait (FOG 4–6 Hz micro-tremble) | • **Ultra-High Cadence Parkinsonian Shuffling (> 220 SPM, 150ms step time)**: Verifies step detection when step interval is below 200ms.<br>• **Start-Hesitation Micro-Steps**: Initial 5 steps are 0.005 length micro-steps before standard stride transition.<br>• **Upper-Limb Rest Tremor Overlay (4 Hz)**: 4 Hz arm/wrist tremor superimposed on normal leg gait; tests separation of upper vs lower frequency. |
| **6. Camera Shake & Motion** | `cat6_camera_shake_motion.test.ts` | • High-frequency 2D translational shake<br>• 15° rotational roll tilt<br>• Dynamic zoom shift (1.0 $\rightarrow$ 1.6 $\rightarrow$ 0.9) | • **Combined 3D Camera Motion**: Simultaneous 2D translation + 15° roll + dynamic zoom (follow-cam tracking mode).<br>• **Single-Frame Impact Jolt**: 45° tilt and 0.35 coordinate offset on frame 30.<br>• **Horizontal Panning Tracking**: Camera panning continuously horizontally as subject walks across field of view. |

---

## 5. Proposed Parameter Tuning Guidelines & Test Generator Strategies

### 5.1 Parameter Tuning Guidelines Summary Table

| Module | Parameter / Function | Current Value | Proposed Tuned Value | Engineering Rationale |
|---|---|---|---|---|
| `events.ts` | `minGap` in `detectGaitEventsZeni` | `Math.floor(0.35 * fps)` (~333ms) | `Math.max(3, Math.floor(0.20 * fps))` (~200ms) | Prevents peak suppression under fast walking, high cadence (>180 SPM), and Parkinsonian micro-steps. Resolves `split_half_stress_m8_2` test failure. |
| `events.ts` | `yMinGap` in Frontal-Y Fallback | `Math.floor(0.33 * fps)` (~330ms) | `Math.max(3, Math.floor(0.20 * fps))` (~200ms) | Aligns frontal contact detection with Zeni AP timing for rapid step cadences. |
| `events.ts` | Frontal-Y Activation Threshold | `apRange < 0.022 \|\| apEventCount < 4` | `apRange < 0.028 && apEventCount < 5` | Provides hysteresis to prevent mode toggling on oblique indoor video clips (`tuning-3992.mp4`). |
| `analysis.ts` | `filterSteadyStateStrides` Threshold | `0.25` (25% relative diff) | `0.40` (40% relative diff) or $1.5 \times \text{IQR}$ | Prevents over-trimming genuine pathological step time asymmetry. Resolves `e2e_engine_enhancements` test failure. |
| `analysis.ts` | Minimum Stride Retention | None | Keep at least $\max(3, \lfloor 0.75 \times N \rfloor)$ strides | Ensures short trials (<10 steps) retain sufficient data for CV and asymmetry calculations. |
| `signal.ts` | Butterworth Cutoff $f_c$ | `6.0` Hz | `6.0` Hz (default), `8.0` Hz for high-cadence | Preserves walking dynamics while removing tracking jitter. |
| `PoseTracker.ts` | Target Lock Distance Gate | `d <= 0.35` | `d <= 0.35` with velocity prediction | Prevents target hopping in multi-person scenes (`tuning-3993.mp4`). |

---

### 5.2 Test Generator Strategies for the 6 New Adversarial Tests

#### 1. Category 1 Generator: `asymmetricLimbNoiseGenerator`
- Generates synthetic walking frames with zero-mean Gaussian noise ($\sigma = 0.10$) applied exclusively to right ankle (28) and toe (30, 32) keypoints.
- **Assertion:** Engine produces finite metrics (`cadenceSpm`, `stepTimeCV`, `symmetryAngle`), zero `NaN` values, and `overallScore` within [0, 100].

#### 2. Category 2 Generator: `blackoutDropRecoveryGenerator`
- Generates 10.0s walking clip (300 frames at 30 FPS). Removes 75 consecutive frames between $t=3.0s$ and $t=5.5s$ (2.5s total blackout).
- **Assertion:** `fpsEffective` remains positive, no crash occurs, and event detector creates 0 bogus steps across the join.

#### 3. Category 3 Generator: `uTurnSelfOcclusionGenerator`
- Generates 6.0s walking sequence where subject walks forward, performs a 180° turn at $t=2.5s$ to $t=3.5s$ (causing leg depth overlap and side inversion), and returns.
- **Assertion:** `detectGaitEventsZeni` correctly infers walking direction change and outputs valid phase breakdown without throwing.

#### 4. Category 4 Generator: `antalgicLimpingAsymmetryGenerator`
- Generates walking frames with asymmetric step times: Left step = 0.70s, Right step = 0.30s (70/30 step time ratio).
- **Assertion:** `filterSteadyStateStrides` preserves the asymmetric step intervals; `stepTimeCV > 0.08` and `symmetryAngle > 4.0`.

#### 5. Category 5 Generator: `ultraHighCadenceParkinsonianGenerator`
- Generates Parkinsonian micro-shuffling gait at 240 SPM (step interval = 125ms = 0.125s, step amplitude = 0.008).
- **Assertion:** With tuned `minGap`, engine detects micro-steps, `cadenceSpm > 180`, and `verticalBounce < 0.015`.

#### 6. Category 6 Generator: `combined3DCameraMotionGenerator`
- Applies simultaneous 2D translational jitter ($\Delta x, \Delta y$), 15° rotational roll tilt, and continuous scale zoom (1.0 $\rightarrow$ 1.5 $\rightarrow$ 0.8) to all keypoints.
- **Assertion:** Engine completes analysis without runtime exceptions, producing valid finite metrics.

---

## 6. Verification & Test Suite Hardening Plan

1. **Verify Baseline State:** Run `npx vitest run` to document initial failure state (2 failing tests: `e2e_engine_enhancements` and `split_half_stress_m8_2`).
2. **Apply Algorithm Tuning:**
   - Tune `minGap` in `src/lib/gait/events.ts` to `Math.max(3, Math.floor(0.20 * effectiveFps))`.
   - Relax `filterSteadyStateStrides` threshold in `src/lib/gait/analysis.ts` to `0.40`.
3. **Execute Vitest Suite:** Re-run `npx vitest run` to verify 100% green pass rate (861/861 passing).
4. **Implement 6 New Adversarial Tests:** Add new test cases to `cat1` through `cat6` test modules.
5. **Verify Full Test Suite & Static Analysis:**
   - `npx vitest run` (100% passing across 867+ tests).
   - `npx tsc --noEmit` (0 errors).
   - `npx eslint .` (0 errors).
