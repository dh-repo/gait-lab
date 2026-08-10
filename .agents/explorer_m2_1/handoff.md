# Handoff Report: Milestone 2 — Deepen Signal Processing & Event Detection Tuning Blueprint

**Agent:** explorer_m2_1  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m2_1`  
**Date:** 2026-08-10  

---

## 1. Observation

Direct inspection was conducted across the prior survey report, all 7 core engine modules in `src/lib/gait/`, reference video tuning scripts, and the test suite:

- **Prior Survey Report:** `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_2/survey_r2_r3.md` inspected. Identified root causes for the 2 failing tests (`e2e_engine_enhancements.test.ts` and `split_half_stress_m8_2.test.ts`).
- **Core Engine Modules Inspected:**
  1. `src/lib/gait/events.ts` (Lines 1–610): `detectGaitEventsZeni` (line 190), `findExtrema` (line 99), `refinePeakTimestamp` (line 155), `detectFusedGaitEvents` (line 536). Observed `minGap = Math.floor(0.35 * fps)` in `detectGaitEventsZeni` (line 297), Frontal-Y trigger `apRange < 0.022 || apEventCount < 4` (line 321), and prominence threshold `0.15 * sigRange` (line 118).
  2. `src/lib/gait/analysis.ts` (Lines 1–1233): `filterSteadyStateStrides` (line 1186), `detectViewAngle` (line 79), `computeGaitMetrics` (line 583), `matchPeople` (line 815), `mergeFragmentedTracks` (line 936), `tracksToPeople` (line 1077). Observed relative difference threshold `0.40` in `filterSteadyStateStrides` (lines 1212, 1220) and human likeness score threshold `0.45` (line 810).
  3. `src/lib/gait/signal.ts` (Lines 1–426): `zeroPhaseButterworth` (line 135), `savitzkyGolay5` (line 190), `kalmanFilter1D` (line 244), `olsDetrend` (line 76), `smoothPoseFrames` (line 298). Observed Butterworth low-pass cutoff $f_c = 6.0\text{ Hz}$ (line 138), Savitzky-Golay 5-point kernel $\frac{1}{35}[-3, 12, 17, 12, -3]$ (line 218), and Kalman filter parameters $Q = 10^{-4}, R = 10^{-2}$ (line 253).
  4. `src/lib/gait/PoseTracker.ts` (Lines 1–385): `startWebcam` (line 116), `loop` (line 312). Observed target lock candidate scoring `score = d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2` (lines 345–346) and webcam frame rate request `{ ideal: requestedTargetFps, max: 60 }` (line 153).
  5. `src/lib/gait/ratings.ts` & `guesses.ts` (Lines 1–602 & 1–692): `buildStructuredReport` (line 199), `buildEducatedGuesses` (line 32). Observed Zifchock Symmetry Angle (SA) cutoff `>5.0%` (line 166), Zeni stance breakdown rule (line 192), Plummer & Eskes CMI taxonomy (lines 217–256).
  6. `src/lib/gait/fallrisk.ts` (Lines 1–908): `computeFallRiskModelA` (line 183), `computeFallRiskModelB` (line 336), `evaluatePredictiveAgreement` (line 490), `detectAcuteWeaknessAnomalies` (line 682). Observed CDC STEADI cutoffs (speed $<0.8$ m/s, step CV $>6\%$, double support $>35\%$, SA $>10\%$) and Model B re-normalization weights (40/33.3/0/26.7).
- **Tuning Clips & Scripts:** `public/samples/tuning-3992.mp4` (10.55s single-subject frontal walk) and `public/samples/tuning-3993.mp4` (12.42s multi-person hallway walk), `scripts/tune-gait-samples.mjs`.

---

## 2. Logic Chain

1. **Step 1: Test Failure Root Causes & Resolution:**
   - In `split_half_stress_m8_2.test.ts`, Level 2 speed perturbation drops step interval below `minGap = Math.floor(0.35 * fps)` (10 frames @ 30 FPS / 16 frames @ 48 FPS), causing `findExtrema` in `events.ts` to suppress alternate heel strikes. Reducing `minGap` factor to `Math.max(3, Math.floor(0.18 * effectiveFps))` (~200ms minimum inter-event gap) allows cadences up to 330 SPM without peak suppression.
   - In `e2e_engine_enhancements.test.ts`, `filterSteadyStateStrides` in `analysis.ts` trimmed strides when relative deviation from median exceeded `0.25`. Asymmetric gaits naturally exhibit ~24-28% deviation. Adjusting threshold to `0.40` preserves valid pathological step time asymmetry while excluding genuine acceleration/deceleration strides.

2. **Step 2: Core Pipeline Parameter Optimization across 7 Modules:**
   - `events.ts`: Enforce hysteresis on Frontal-Y fallback (`apRange < 0.028 && apEventCount < 5`), lower `minProminence` to `Math.max(0.0005, 0.12 * sigRange)` for low-amplitude frontal steps, and retain parabolic subframe peak refinement.
   - `analysis.ts`: Retain minimum stride retention guard ($\max(3, \lfloor 0.75 \times N \rfloor)$), calibrate view angle confidence scoring, and tune `matchPeople` / `mergeFragmentedTracks` spatial distance gating for U-turns and scale changes.
   - `signal.ts`: Maintain zero-phase 4th-order Butterworth low-pass filter at $f_c = 6.0\text{ Hz}$ (with adaptive $8.0\text{ Hz}$ option for high-cadence shuffling), 5-point Savitzky-Golay smoothing with boundary reflection, and Kalman filter with occlusion coasting.
   - `PoseTracker.ts`: Request ideal 60 FPS WebRTC video constraints and enhance target lock candidate scoring with velocity-assisted prediction ($x_{\text{pred}} = x_{t-1} + v \cdot \Delta t$).
   - `ratings.ts` / `guesses.ts` / `fallrisk.ts`: Enforce consistent sign convention in CMI DTE calculations (`resolveDteValues`), maintain STEADI Model A cutoffs and Model B composite weights (with single-task re-normalization and frontal fallback), and calibrate longitudinal acute weakness anomaly rules.

3. **Step 3: Real-World Video Tuning Verification:**
   - `tuning-3992.mp4` (frontal walk) relies on Frontal-Y step contact detection and low prominence threshold.
   - `tuning-3993.mp4` (multi-person walk) relies on target lock candidate scoring in `PoseTracker.ts` and `matchPeople` in `analysis.ts` to prevent false duplicate person tracks.

---

## 4. Conclusion

The implementation blueprint for Milestone 2 has been fully formulated and written to `/Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/blueprint_m2.md`. It provides exact line-by-line parameter tuning instructions, code locations, engineering rationale, and validation criteria for the implementation worker across all 7 core modules.

---

## 5. Verification Method

To independently verify the implementation based on this blueprint:

1. **Check Blueprint File Existence & Completeness:**
   ```bash
   cat /Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/blueprint_m2.md
   ```
2. **Execute Static Analysis & TypeScript Compilation:**
   ```bash
   npx tsc --noEmit
   npx eslint .
   ```
3. **Run Vitest Test Suite:**
   ```bash
   npx vitest run
   ```
4. **Execute Real-World Sample Tuning Harness:**
   ```bash
   npm run dev &
   node scripts/tune-gait-samples.mjs http://127.0.0.1:8080/
   ```
