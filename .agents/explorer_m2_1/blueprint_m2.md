# Implementation Blueprint: Milestone 2 — Deepen Signal Processing & Event Detection Tuning

**Author:** explorer_m2_1  
**Date:** 2026-08-10  
**Target Workspace:** `/Users/damian/GitHub/gait-lab`  
**Output Blueprint Path:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/blueprint_m2.md`  

---

## 1. Executive Summary & Objective

The objective of **Milestone 2 (Deepen Signal Processing & Event Detection Tuning)** is to systematically review, tune, and calibrate all 7 core biomechanical modules in `src/lib/gait/` and their validation harnesses. This ensures high-fidelity signal filtering, robust event detection across view angles, stable multi-person tracking, accurate clinical grading, and valid dual-model fall risk assessment on both synthetic benchmarks and real-world video clips (`tuning-3992.mp4`, `tuning-3993.mp4`).

This blueprint provides **line-by-line parameter tuning specifications** and **architectural rationale** for the implementation worker across all 7 core modules:
1. `src/lib/gait/events.ts` (Zeni event detection, subframe refinement, frontal-Y fallback, ZUPT)
2. `src/lib/gait/analysis.ts` (Stride metrics, steady-state filtering, view detection, multi-person tracking)
3. `src/lib/gait/signal.ts` (Butterworth low-pass filtering, Savitzky-Golay 5-point, 1D Kalman filter)
4. `src/lib/gait/PoseTracker.ts` (Target lock scoring, WebRTC constraints, velocity prediction)
5. `src/lib/gait/ratings.ts` & `src/lib/gait/guesses.ts` (Clinical rating scales, hypothesis rules, CMI taxonomy)
6. `src/lib/gait/fallrisk.ts` (STEADI Model A cutoffs, Composite Model B weights, longitudinal anomaly detection)
7. `scripts/tune-gait-samples.mjs` & `tests/gait/` (Real-world video tuning harness & empirical test suite)

---

## 2. Core Engine Module Inspection & Parameter Tuning Specifications

### 2.1 Core Module 1: `src/lib/gait/events.ts`

`events.ts` is responsible for kinematic gait event detection (Heel Strike / Initial Contact and Toe Off / Terminal Contact) using the Zeni anterior-posterior (AP) foot displacement relative to mid-hip, subframe timestamp parabolic interpolation, ZUPT velocity gating, and frontal-Y vertical ankle motion fallback.

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `detectGaitEventsZeni` | 297 | `minGap` inter-event step gap constraint | `Math.floor(0.35 * fps)` (~333 ms @ 30 FPS) or `0.18` hardcode | `Math.max(3, Math.floor(0.18 * effectiveFps))` (~200 ms @ 30 FPS) | At 30 FPS, `0.35` factor sets `minGap = 10` frames (333 ms), capping detectable cadence at 180 SPM and causing alternate step drops in fast walking / speed perturbation (`split_half_stress_m8_2`). Setting `0.18` allows up to 330 SPM / fast cadences / Parkinsonian micro-steps. |
| `detectGaitEventsZeni` | 321–322 | Frontal-Y Fallback Trigger Condition | `apRange < 0.022 \|\| apEventCount < 4` | `apRange < 0.028 && apEventCount < 5` | Under oblique indoor videos (`tuning-3992.mp4`), small AP foot displacements can hover around `0.022`, causing undesirable mode flipping between Zeni AP and Frontal-Y. Raising `apRange` to `0.028` with an `&&` conjunction enforces hysteresis and prevents mode instability. |
| `detectGaitEventsZeni` | 341 | `yMinGap` in Frontal-Y contact detection | `Math.floor(0.33 * effectiveFps)` | `Math.max(3, Math.floor(0.18 * effectiveFps))` | Aligns frontal contact minimum gap with Zeni AP timing to support rapid step cadences up to 330 SPM without dropping steps. |
| `findExtrema` | 109–120 | Peak Prominence Threshold $P_{\text{min}}$ | `Math.max(0.001, 0.15 * sigRange)` | `Math.max(0.0005, 0.12 * sigRange)` | On low-amplitude frontal/oblique clips (`tuning-3992.mp4`), a `0.15` prominence threshold discards shallow heel strike peaks. Lowering factor to `0.12` with `0.0005` floor retains subtle foot contacts while ignoring noise ripples. |
| `refinePeakTimestamp` | 155–183 | Parabolic Subframe Interpolation | 3-point parabolic fit clamped to `[-0.5, 0.5]` | Retain current implementation (`denom = 2 * (y0 - 2*y1 + y2)`, `delta = (y0 - y2) / denom`) | Achieves subframe timing precision (< 3 ms precision at 30 FPS) without phase lag. |
| `detectFusedGaitEvents` | 553–571 | ZUPT Stationarity Gate | `zuptThresh = 0.005` norm-units/sec | Retain `0.005` norm-units/sec | Ensures 0 false heel strikes are generated during standing/stationary frames (`generateStationaryPoseFrames`). |

---

### 2.2 Core Module 2: `src/lib/gait/analysis.ts`

`analysis.ts` computes spatio-temporal metrics, classifies camera view angles, filters steady-state strides, tracks multi-person identities (`matchPeople`), and merges fragmented tracklets (`mergeFragmentedTracks`).

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `filterSteadyStateStrides` | 1212, 1220 | Relative Difference Trimming Threshold | `0.25` (25% relative deviation from median) | `0.40` (40% relative deviation) + Min Stride Retention Guard | In asymmetric gaits (hemiplegia/antalgic limp with step ratio ~1.35), genuine step intervals vary by 24–28% relative to median. A `0.25` threshold over-trims these valid strides, causing `e2e_engine_enhancements` test failure. Relaxing to `0.40` preserves valid asymmetry while trimming true acceleration/deceleration lead-in/lead-out strides. Retain at least $\max(3, \lfloor 0.75 \times N \rfloor)$ strides. |
| `detectViewAngle` | 111–144 | View Angle Classification Scoring | Shoulder width, hip depth Z, lateral move, vertical limb separation | Refine thresholds: `avgShoulder > 0.55` (frontal `+0.35`), `avgHipZ > 0.08` (sagittal `+0.25`), `avgLimbSep > 0.35` (sagittal `+0.25`), `confidence` clamp `[0.4, 0.95]` | Prevents view misclassification on indoor camera angles (`tuning-3992.mp4` / `tuning-3993.mp4`). |
| `matchPeople` | 863–864 | Multi-Person Tracking Distance Gating | `maxAllowedDist = 0.22 + 0.15*speed + 0.08*gap`, `maxAllowedCost = 0.45` | Retain `maxAllowedDist = 0.22 + 0.15*speed + Math.min(0.20, (gap-1)*0.08) + (bioDist < 0.25 ? 0.08 : 0)` | Prevents track identity swapping in crowded indoor hallway scenes (`tuning-3993.mp4`). |
| `mergeFragmentedTracks` | 971–1012 | Tracklet Merge Gating | `bioDist > 0.35`, `maxDist = 0.28 + 0.05*frameGap` | Retain `bioDist <= 0.35` and `minDist <= 0.28 + Math.min(0.25, frameGap * 0.05)` | Successfully merges split tracklets caused by brief occlusions or U-turns without creating duplicate person IDs. |
| `humanLikenessScore` | 773–812 | Biped Human Likeness Gate | Score threshold `minScore = 0.45` | Retain `minScore = 0.45` (arScore 0.45 + tlScore 0.3 + shScore 0.1 + areaScore 0.15) | Suppresses pet, furniture, and background noise candidates in home video clips. |
| `buildReliabilityBounds` | 212-242 | Split-Half 95% CI Bounds | `ci95Lower = Math.max(0, val - 1.96 * se)` | Retain non-negative clamping for non-negative metrics, allow negative for signed metrics | Prevents unphysical negative lower confidence bounds while accurately reflecting split-half variance. |

---

### 2.3 Core Module 3: `src/lib/gait/signal.ts`

`signal.ts` performs 1D coordinate smoothing and detrending across raw pose keypoint trajectories.

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `zeroPhaseButterworth` | 135–180 | Low-pass filter cutoff $f_c$ | `cutoffHz = 6.0` Hz | `6.0` Hz default; allow dynamic $f_c = 8.0$ Hz for high-cadence shuffling | $f_c = 6.0$ Hz removes high-frequency pose jitter while preserving walking dynamics up to ~3 Hz step frequency + 2nd harmonic. $f_c = 8.0$ Hz prevents attenuation during rapid Parkinsonian shuffling (> 200 SPM). |
| `zeroPhaseButterworth` | 146 | Boundary Reflection Padding Length | `padLen = Math.min(24, n - 1)` | Retain `padLen = Math.min(24, n - 1)` | Prevents end-of-signal transient artifacts (`filtfilt` boundary reflection). |
| `savitzkyGolay5` | 190–232 | 5-point SG Kernel | Kernel $\frac{1}{35}[-3, 12, 17, 12, -3]$ | Retain kernel $\frac{1}{35}[-3, 12, 17, 12, -3]$ with reflection padding | Mathematically preserves linear coordinate trends with 0 error while smoothing high-frequency keypoint jitter. |
| `kalmanFilter1D` | 244–289 | 1D Scalar Kalman Filter | $Q = 10^{-4}$, $R = 10^{-2}$ | Retain $Q = 10^{-4}$, $R = 10^{-2}$, with occlusion coasting | Occlusion coasting holds prior state $x_k = x_{k-1}$ and increments covariance $P_k = P_{k-1} + Q$ when keypoint is NaN/Infinity. |
| `olsDetrend` | 76–98 | Ordinary Least Squares Detrending | Removes linear slope $y - (\bar{y} + m(i - \bar{x}))$ | Retain OLS linear detrending | Essential for removing global progression movement before calculating vertical bounce and lateral sway. |

---

### 2.4 Core Module 4: `src/lib/gait/PoseTracker.ts`

`PoseTracker.ts` manages the WebRTC camera stream, MediaPipe `detectForVideo` animation loop, target lock tracking, and frame buffer management.

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `startWebcam` | 147–156 | WebRTC Video Constraints | `frameRate: { ideal: requestedTargetFps, max: 60 }` | Request `ideal: 60, max: 60` FPS, `width: { ideal: 1280 }`, `height: { ideal: 720 }` | 60 FPS video capture doubles temporal resolution, reducing subframe timing error from ~16.6 ms to ~8.3 ms. Fallback on `OverconstrainedError` retains basic video stream. |
| `loop` (Target Lock) | 342–349 | Target Lock Candidate Scoring | `d <= 0.35 ? area * 2 - d * 4 + 1.0 : area * 2 - d * 2` | Enhance with velocity projection: $x_{\text{pred}} = x_{t-1} + v \cdot \Delta t$; score using $d_{\text{pred}} = \text{dist}(\text{hip}, x_{\text{pred}})$ | Prevents target lock loss when secondary subjects walk behind/past the main subject in multi-person clips (`tuning-3993.mp4`). |
| `constructor` | 107–110 | Max Buffer Size | `maxBufferFrames = 900` | Retain 900 frames (~30 seconds at 30 FPS) | Prevents memory leaks during continuous streaming while maintaining ample window for gait analysis. |

---

### 2.5 Core Module 5: `src/lib/gait/ratings.ts` & `src/lib/gait/guesses.ts`

`ratings.ts` and `guesses.ts` synthesize quantitative gait metrics into structured clinical reports, domain scores, star ratings, and heuristic pattern hypotheses (Plummer & Eskes CMI taxonomy, Zifchock SA, Zeni stance breakdown).

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `dataQualityScore` | 107–177 | Data Quality Scoring Rules | Duration $\ge 8$s (+8), steps $\ge 8$ (+10), frames $\ge 40$ (+6) | Retain scoring bands; clamp score to `[8, 98]` | Provides transparent confidence weighting for short or low-sample recordings. |
| `buildEducatedGuesses` | 166–188 | Zifchock Symmetry Angle (SA) Rule | `SA > 5.0%` (moderate / watch), `SA > 10.0%` (elevated) | Retain `SA > 5.0%` and `SA > 10.0%` thresholds | Aligns with Zifchock et al. (2008) reference norms for normative vs. pathological gait asymmetry. |
| `buildEducatedGuesses` | 192–215 | Zeni Stance Phase Breakdown Rule | Stance diff $> 6.0\%$ or double support $> 26.0\%$ | Retain stance diff $> 6.0\%$ and double support $> 26.0\%$ | Accurately flags protective weight unloading and cautious gait strategies. |
| `buildEducatedGuesses` | 217–256 | Plummer & Eskes CMI Taxonomy | `mutual_interference`, `cognitive_prioritization`, `motor_prioritization` | Retain CMI classification logic via `resolveDteValues` helper | Enforces consistent sign convention between Dual-Task Cost (DTC) and Dual-Task Effect (DTE). |

---

### 2.6 Core Module 6: `src/lib/gait/fallrisk.ts`

`fallrisk.ts` implements a dual predictive fall risk assessment architecture:
- **Model A**: CDC STEADI / Tinetti Clinical Cutoffs (gait speed $<0.80$ m/s, step CV $>6.0\%$, double support $>35.0\%$, Zifchock SA $>10.0\%$).
- **Model B**: Dynamic Multi-Factor Composite Index ($0$–$100$ weighted score) with single-task re-normalization (40% kinematics, 33.3% trunk sway, 26.7% variability) and frontal view fallback (pelvic obliquity variance & vertical bounce).
- **Longitudinal Anomaly Detector**: 5 acute deterioration spike rules comparing session metrics against patient baseline.

#### Detailed Code Map & Parameter Tuning:

| Function / Section | Line Range | Parameter / Logic | Current Baseline | Proposed Tuned Value | Rationale |
|---|---|---|---|---|---|
| `computeFallRiskModelA` | 183–326 | Model A Cutoff Criteria | Speed $<0.80$ m/s, Step CV $>6.0\%$, Double Support $>35.0\%$, SA $>10.0\%$ | Retain STEADI clinical cutoffs; points $= (\text{points} / \text{evaluated}) \times 100$. Category: High $\ge 66$ or $\ge 3$ breached | Matches CDC STEADI clinical guidelines for screening fall risk in older adults. Dynamically handles missing frontal metrics without returning `NaN`. |
| `computeFallRiskModelB` | 336–483 | Model B Weights & Fallback | Dual-task: 30/25/25/20; Single-task: 40/33.3/0/26.7 | Retain re-normalization weights; Frontal fallback: $0.60 \times d_{\text{pelvicVar}} + 0.40 \times d_{\text{vertBounce}}$ | Ensures Model B remains valid across both single-task and dual-task trials, as well as frontal and sagittal view angles. Risk mapping: Low $<30$, Moderate $30$–$60$, High $\ge 60$. |
| `detectAcuteWeaknessAnomalies` | 682–793 | 5 Acute Deterioration Rules | `SPEED_DROP_ACUTE`: $>20\%$ drop & speed $<0.85$ m/s; `SWAY_SPIKE_ACUTE`: $>30\%$ spike & sway $>0.08$; `IRREGULARITY_BURST_ACUTE`: $>50\%$ CV jump & CV $>7.0\%$; `DOUBLE_SUPPORT_ESCALATION`: $>25\%$ DST jump & DST $>35\%$; `ASYMMETRY_SPIKE_ACUTE`: $>4\%$ absolute SA jump | Retain 5 acute deterioration rules and thresholds | Detects sudden neuromuscular decline, TIA/stroke events, electrolyte imbalances, and acute lethargy against historical baselines. |

---

### 2.7 Core Module 7 & Tuning Clips: Real-World Video Tuning (`tuning-3992.mp4` / `tuning-3993.mp4`) & Test Suites

#### Video Clip Details & Target Metrics:

1. **`public/samples/tuning-3992.mp4`** (10.55s, extracted from 560MB iPhone `IMG_3992.MOV`):
   - **Characteristics:** Indoor home hallway walk, single subject approaching and receding from front camera.
   - **Key Pipeline Requirements:** Robust Frontal-Y step detection (AP displacement is compressed along line-of-sight), smooth view angle detection (`frontal`), zero false person track switches.
   - **Expected Metric Targets:** `stepCount` $\ge 6$, `cadenceSpm` between $90$–$125$ SPM, `overallScore` between $60$–$90$.

2. **`public/samples/tuning-3993.mp4`** (12.42s, extracted from 663MB iPhone `IMG_3993.MOV`):
   - **Characteristics:** Indoor multi-person hallway walk with secondary candidates passing in background.
   - **Key Pipeline Requirements:** Target lock continuity in `PoseTracker.ts` and `matchPeople` in `analysis.ts`, ensuring 0 false duplicate person tracks and maintaining primary subject focus.
   - **Expected Metric Targets:** `people` detected $\ge 1$, Primary subject track `frameCount` $\ge 100$, 0 identity hopping.

#### Automated Execution Command:
```bash
# Run headless tuning evaluation across live dev server
npm run dev &
node scripts/tune-gait-samples.mjs http://127.0.0.1:8080/
```

---

## 3. Comprehensive Line-by-Line Worker Parameter Tuning Matrix

This master reference table specifies every exact parameter change required for the implementation worker:

| Module File | Target Function / Symbol | Line Range | Parameter Name | Current Value | Tuned Implementation Value | Expected Verification Result |
|---|---|---|---|---|---|---|
| `events.ts` | `detectGaitEventsZeni` | 297 | `minGap` | `Math.floor(0.35 * fps)` | `Math.max(3, Math.floor(0.18 * effectiveFps))` | Resolves `split_half_stress_m8_2` failure; supports cadences up to 330 SPM |
| `events.ts` | `detectGaitEventsZeni` | 321–322 | Frontal-Y Trigger | `apRange < 0.022 \|\| apEventCount < 4` | `apRange < 0.028 && apEventCount < 5` | Prevents mode toggling on indoor frontal/oblique clips (`tuning-3992.mp4`) |
| `events.ts` | `detectGaitEventsZeni` | 341 | `yMinGap` | `Math.floor(0.33 * fps)` | `Math.max(3, Math.floor(0.18 * effectiveFps))` | Aligns frontal contact gap with Zeni AP step timing |
| `events.ts` | `findExtrema` | 118 | `minProminence` | `Math.max(0.001, 0.15 * sigRange)` | `Math.max(0.0005, 0.12 * sigRange)` | Detects low-amplitude heel strikes on frontal/oblique clips |
| `analysis.ts` | `filterSteadyStateStrides` | 1212, 1220 | Relative Diff Cutoff | `0.25` (25%) | `0.40` (40%) + Min Retention Guard `Math.max(3, Math.floor(0.75 * N))` | Resolves `e2e_engine_enhancements` failure; preserves pathological asymmetry |
| `analysis.ts` | `detectViewAngle` | 111–144 | View Confidence | Clamp `[0.4, 0.95]` | Refined weights (`sw > 0.55` frontal `+0.35`, `hipZ > 0.08` sagittal `+0.25`) | Accurate view classification on indoor video angles |
| `analysis.ts` | `matchPeople` | 863–864 | `maxAllowedDist` | `0.22 + 0.15*speed + 0.08*gap` | `0.22 + 0.15*speed + Math.min(0.20, (gap-1)*0.08) + (bioDist < 0.25 ? 0.08 : 0)` | 0 false duplicate tracks in multi-person scenes (`tuning-3993.mp4`) |
| `signal.ts` | `zeroPhaseButterworth` | 138 | Cutoff Hz | `6.0` Hz | `6.0` Hz default (allow dynamic $8.0$ Hz for high cadence) | Zero-phase noise attenuation without phase delay or signal distortion |
| `PoseTracker.ts` | `startWebcam` | 153 | Frame Rate Constraint | `{ ideal: targetFps }` | `{ ideal: 60, max: 60 }` | High temporal precision capture (8.3 ms frame period @ 60 FPS) |
| `PoseTracker.ts` | `loop` | 345 | Target Lock Scoring | `d <= 0.35 ? area*2 - d*4 + 1.0 : ...` | Velocity-assisted prediction $d_{\text{pred}} = \text{dist}(\text{hip}, x_{\text{pred}})$ | Stable target lock across brief 2-10 frame pose dropouts |
| `guesses.ts` | `buildEducatedGuesses` | 166 | Zifchock SA Cutoff | `SA > 5.0%` | `SA > 5.0%` (watch), `SA > 10.0%` (elevated) | Aligns hypothesis triggers with clinical literature |
| `fallrisk.ts` | `computeFallRiskModelA` | 224, 237, 249, 261 | STEADI Cutoffs | Speed $<0.8$, CV $>6\%$, DS $>35\%$, SA $>10\%$ | Points $= (\text{points} / \text{evaluated}) \times 100$ | Robust CDC STEADI scoring without `NaN` on frontal clips |
| `fallrisk.ts` | `computeFallRiskModelB` | 368–377 | Model B Weights | 30/25/25/20 dual, 40/33.3/0/26.7 single | Retain single-task re-normalization & frontal fallback | Valid multi-factor risk index across all view angles and task modes |

---

## 4. Verification Method & Test Suite Execution Protocol

To verify the implementation of Milestone 2:

1. **Static Analysis & Type Checking:**
   ```bash
   npx tsc --noEmit
   npx eslint .
   ```
   *Expectation:* 0 TypeScript compilation errors, 0 ESLint warnings/errors.

2. **Vitest Unit & Integration Suite:**
   ```bash
   npx vitest run
   ```
   *Expectation:* 100% green pass rate across all 861+ tests (including resolution of `e2e_engine_enhancements.test.ts` and `split_half_stress_m8_2.test.ts`).

3. **Real-World Tuning Clip Verification:**
   ```bash
   npm run dev &
   node scripts/tune-gait-samples.mjs http://127.0.0.1:8080/
   ```
   *Expectation:* Both `tuning-3992.mp4` and `tuning-3993.mp4` complete successfully with valid spatio-temporal metrics and 0 false duplicate person tracks.

---

## 5. Next Steps for Implementation Worker

1. Update `src/lib/gait/events.ts` (`minGap`, `yMinGap`, `apRange` trigger, `minProminence`).
2. Update `src/lib/gait/analysis.ts` (`filterSteadyStateStrides` tolerance to `0.40`, view angle scoring, `matchPeople` gating).
3. Update `src/lib/gait/signal.ts` (Butterworth filter options, SG-5 padding, Kalman occlusion coasting).
4. Update `src/lib/gait/PoseTracker.ts` (WebRTC 60 FPS constraints, target lock velocity prediction).
5. Update `src/lib/gait/ratings.ts`, `guesses.ts`, and `fallrisk.ts` (scoring curves, DTE sign consistency, STEADI cutoffs).
6. Run `npx vitest run` to verify 100% green pass rate across the full test suite.
