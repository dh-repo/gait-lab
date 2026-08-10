# Technical Survey: R4 Steady-State Stride Filtering & Ground-Truth Test Infrastructure

**Repository**: `gait-lab` (`/Users/damian/GitHub/gait-lab`)  
**Author**: Explorer Survey 3  
**Date**: 2026-08-09  

---

## 1. Executive Summary

This survey provides a comprehensive technical analysis of **Requirement R4** (Steady-State Stride Filtering & Quality Control) and the **Test Infrastructure / Synthetic Ground-Truth Verification Framework** for `gait-lab`.

### Key Findings:
1. **R4 Gap in Current Engine**: `src/lib/gait/analysis.ts` computes `stepTimeCV` and `strideTimeCV` across *all* detected heel-strike events without distinguishing gait initiation (acceleration phase) or gait termination (deceleration phase). In clinical protocol, initial acceleration strides (first 1–2 strides) and terminal deceleration strides (last 1–2 strides) contain transient kinematics with extended step durations and velocity changes. Including them causes severe artificial inflation of spatio-temporal variability (`stepTimeCV`, `stepLengthCV`), distorting clinical fall-risk assessment and dual-task cost (DTE) evaluations.
2. **Filtering Algorithm Specification**: We propose a robust multi-stage steady-state filter combining:
   - **Fixed-Margin Trimming**: Excluding the first $k_{acc} = 1\text{--}2$ steps/strides and last $k_{dec} = 1\text{--}2$ steps/strides when total step count $N \ge 6$.
   - **Adaptive Outlier & Velocity Trimming**: Detecting transient acceleration/deceleration steps via IQR or $Z$-score bounds on step intervals ($dt_i$) and step velocities ($v_i$).
   - **Quality Control (QC) Metadata**: Adding `steadyStateStepCount`, `excludedAccelSteps`, `excludedDecelSteps`, `isSteadyStateReliable` to `GaitMetrics` so clinicians have transparent proof of steady-state isolation.
3. **Test Suite Baseline & Verification Status**:
   - `npm test`: **PASS** (55 test files, 529 unit/integration/stress tests).
   - `npm run typecheck`: **PASS** (0 TypeScript errors).
   - `npm run lint`: **PASS** (0 ESLint errors).
   - `npm run build`: **PASS** (Vercel static assets + Nitro server build generated cleanly).
4. **Synthetic Ground-Truth Verification Infrastructure**:
   - `src/lib/gait/__tests__/testHelpers.ts` currently provides `generateSyntheticWalkingFrames()`, `generateStationaryPoseFrames()`, and `generateNoisyPoseFrames()`.
   - We outline modular synthetic data generators for **R1** (1D landmark temporal smoothing), **R2** (60 FPS & mm/px floor calibration), **R3** (multi-signal heel-strike fusion & planar homography), and **R4** (steady-state stride filtering with explicit acceleration/deceleration ramps).

---

## 2. Requirement R4 Technical Survey: Steady-State Stride Filtering & Quality Control

### 2.1 Current Implementation Audit (`src/lib/gait/analysis.ts`)

In `src/lib/gait/analysis.ts` (lines 301–398):

```typescript
// Lines 301-320 in analysis.ts:
let stepEvents: GaitEvent[] = zeniBreakdown.stepEvents;
const heelStrikes = stepEvents.filter((e) => e.type === "heel_strike");
const stepCount = heelStrikes.length;

const stepIntervals: number[] = [];
for (let i = 1; i < heelStrikes.length; i++) {
  stepIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
}
const avgStepTimeSec = mean(stepIntervals) || 0;
const stepTimeCV = avgStepTimeSec > 1e-6 ? std(stepIntervals) / avgStepTimeSec : 0;
```

#### Deficiencies Identified:
1. **Unfiltered Step Array**: `stepIntervals` incorporates the interval between event 0 and 1 (first step / acceleration step) and event $N-1$ and $N$ (last step / deceleration step).
2. **Unfiltered Stride & Length Arrays**:
   - `strideIntervals` (lines 389–398) collects all same-side intervals without trimming start/end strides.
   - `leftStride` and `rightStride` (lines 352–366) track hip travel across consecutive opposite-foot strikes without steady-state windowing.
3. **Implications for Clinical Metrics**:
   - `stepTimeCV` ($\text{std}/\text{mean}$) increases dramatically when 1–2 acceleration steps (e.g. $dt = 0.85\text{s}$) or deceleration steps (e.g. $dt = 0.90\text{s}$) are included alongside steady-state steps ($dt = 0.55\text{s}$).
   - `automaticityScore` (lines 451–454) subtracts `stepTimeCV * 180` and `strideTimeCV * 80`. Unfiltered transient strides unfairly degrade the patient's automaticity score.
   - Dual-Task Cost (`computeDualTaskCost` lines 913–947) relies on `stepTimeCvDTE`. Spurious baseline CV inflation reduces sensitivity to dual-task cognitive interference.

---

### 2.2 Algorithm Design for Steady-State Stride Detection

To isolate steady-state walking, the engine must distinguish transient acceleration/deceleration phases from the rhythmic gait domain. We specify a hybrid filtering pipeline:

```
Raw Gait Events (Heel Strikes: HS_0, HS_1, ..., HS_N)
              │
              ▼
   Step & Stride Velocity/Interval Extraction
  [ dt_i = t_{i} - t_{i-1},  dx_i = x_{i} - x_{i-1} ]
              │
              ▼
    Step Count Threshold Check (N >= 6 ?)
       ├── NO  ──► Retain all steps, set isSteadyStateReliable = false, flag warning
       └── YES ──► Perform Steady-State Partitioning
                     │
                     ├─ 1. Fixed-Margin Boundary Trimming (Drop first 1-2 & last 1-2 steps)
                     ├─ 2. Adaptive Outlier Trimming (|dt_i - median(dt)| > 1.5 * IQR)
                     └─ 3. Rolling Acceleration/Braking Ramp Detection
              │
              ▼
   Steady-State Step Events (HS_{steady})
              │
              ▼
   Recompute Spatio-Temporal Variability (stepTimeCV, strideTimeCV, stepLengthCV, SA)
```

#### Algorithm Options & Mathematical Formulations:

1. **Strategy A: Fixed Margin Trimming (Standard Clinical Protocol)**
   - **Condition**: Applicable when $N_{\text{total\_steps}} \ge 6$ (i.e. at least 5 step intervals / 4 strides).
   - **Rule**:
     $$\text{steadySteps} = \text{heelStrikes}[k_{\text{accel}} \,\,..\,\, (N - k_{\text{decel}})]$$
     where $k_{\text{accel}} = 1 \text{ or } 2$ and $k_{\text{decel}} = 1 \text{ or } 2$.
   - **Default Values**: For recordings with $N \ge 8$ steps, $k_{\text{accel}} = 2$ and $k_{\text{decel}} = 2$. For $6 \le N < 8$, $k_{\text{accel}} = 1$ and $k_{\text{decel}} = 1$.

2. **Strategy B: Adaptive Velocity & Interval Outlier Trimming (Data-Driven)**
   - Compute step interval series $D = [dt_1, dt_2, \dots, dt_{N-1}]$.
   - Compute median step interval $M = \text{median}(D)$ and Interquartile Range $IQR = Q_3(D) - Q_1(D)$.
   - Identify initiation acceleration steps at index $i \in \{1, 2\}$ if:
     $$dt_i > M + 1.5 \times IQR \quad \text{or} \quad \left| \frac{dt_i - dt_{i+1}}{dt_{i+1}} \right| > 0.20$$
   - Identify termination deceleration steps at index $i \in \{N-2, N-1\}$ if:
     $$dt_i > M + 1.5 \times IQR \quad \text{or} \quad \left| \frac{dt_i - dt_{i-1}}{dt_{i-1}} \right| > 0.20$$

3. **Strategy C: Combined Hybrid Filter (Recommended)**
   - Apply Adaptive Outlier Trimming first to detect explicit acceleration/braking boundaries.
   - If no explicit ramp is detected but $N \ge 6$, enforce a default 1-step margin trim ($k_{\text{accel}}=1, k_{\text{decel}}=1$).
   - If $N < 6$, compute metrics on raw steps and return quality warning `QC_SHORT_CLIP_UNTRIMMED`.

---

### 2.3 Required `GaitMetrics` Schema Updates (`src/lib/gait/types.ts`)

To support R4, `GaitMetrics` must be augmented with steady-state quality control metadata:

```typescript
export type GaitMetrics = {
  // ... existing fields ...
  stepTimeCV: number;             // Strictly computed across steady-state strides
  strideTimeCV: number;           // Strictly computed across steady-state strides
  stepLengthCV?: number | null;   // Coefficient of variation of step/stride length (mm or norm units)
  
  // R4 Quality Control & Steady-State Metadata
  totalStepCount: number;         // Total detected heel strikes
  steadyStateStepCount: number;   // Number of heel strikes in steady-state window
  excludedAccelSteps: number;     // Number of initial acceleration steps excluded
  excludedDecelSteps: number;     // Number of terminal deceleration steps excluded
  isSteadyStateReliable: boolean; // True if steadyStateStepCount >= 4
  steadyStateQualityWarning?: string | null;
};
```

---

## 3. Audit of Test Infrastructure & Ground-Truth Verification

### 3.1 Current Test Suite Execution & Code Quality Verification

We performed complete verification of the test suite and build tools in the repository:

| Verification Command | Execution Result | Details |
|---|---|---|
| `npm run typecheck` | **PASS** (0 errors) | `tsc --noEmit` clean across all files |
| `npm run lint` | **PASS** (0 errors, 1 warning) | ESLint clean (1 minor unused var warning in test file) |
| `npm test` | **PASS** (55 pass, 0 fail) | Vitest executed 55 test files / 529 tests cleanly |
| `npm run build` | **PASS** (Success) | Vite client build + Vercel Nitro server build completed |

---

### 3.2 Inventory of Existing Gait Test Files (`src/lib/gait/__tests__/`)

The repository possesses an extensive test suite divided into unit tests, challenge/stress suites, and empirical category tests:

```
src/lib/gait/__tests__/
├── PoseTracker.test.ts                     # WebRTC video frame tracking & sampling rate tests
├── analysis.test.ts                        # Core gait metrics & split-half confidence interval tests
├── angles.test.ts                          # Kinematic joint angle trajectories (hip, knee, ankle)
├── cat1_landmark_jitter_noise.test.ts      # Robustness under Gaussian landmark noise (0-5%)
├── cat2_variable_frame_rate.test.ts        # Robustness under frame rate fluctuations (15-60 FPS)
├── cat3_landmark_occlusion.test.ts         # Occlusion handling with ankle/hip landmark fallback
├── cat4_extreme_gait_asymmetry.test.ts     # Asymmetric hemiparetic gait pattern verification
├── cat5_micro_steps_parkinsonian.test.ts   # Parkinsonian festinating/micro-stepping gait tests
├── cat6_camera_shake_motion.test.ts        # Handheld camera motion jitter resilience
├── challenge_m2_r1_2.test.ts               # Stress tests for pose landmarker loading & WebRTC FPS
├── challenger_m1_1_stress.test.ts          # Adversarial stress testing for score boundaries
├── challenger_m4_angles_empirical.test.ts  # Empirical validation of joint angle calculation
├── challenger_m5_2.test.ts                 # Multi-person tracking & biometric matching stress
├── curveResample.test.ts                   # 101-point gait cycle curve normalization tests
├── dte.test.ts                             # Dual-Task Effect (DTE) & CMI classification tests
├── events.challenger_m7_2.test.ts          # Zeni gait event detection stress test
├── events.test.ts                          # Heel strike & toe off event detection precision tests
├── fallrisk.test.ts                        # Dual-model fall risk assessment (Model A & B)
├── guesses.test.ts                         # Clinical educated guess rule engine tests
├── m1_challenger_2_stress.test.tsx         # Stress test for clinical report rendering
├── m2_challenger_verification.test.ts      # Multi-view direction verification
├── m3_challenger_1_stress.test.ts          # Signal detrending & Butterworth filter verification
├── m3_challenger_2_stress.test.tsx         # UI event handling stress test
├── m4_challenger_verification.test.ts      # Planar homography coordinate transformation test
├── m5_challenger_stress.test.ts            # Person identification & tracklet merging stress
├── m7_steptimecv_stress.test.ts            # Step time CV clip-length invariance test
├── m9_adversarial_stress.test.ts           # Adversarial NaN/null/edge-case input stress tests
├── nan_property.test.ts                    # Immunity to NaN propagation in metrics
├── persistence.test.ts                     # IndexedDB & Server storage persistence tests
├── person_identification_stress.test.ts    # Biometric tracklet priority & matching tests
├── ratings.test.ts                         # Rating calculation unit tests
├── sample_picker.test.ts                   # Video sample picker state unit tests
├── signal.test.ts                          # Zero-phase Butterworth & OLS detrending tests
├── split_half_stress_m8_2.test.ts          # Split-half reliability CI bounds stress tests
├── stress_adversarial.test.ts              # System-wide adversarial inputs test
├── symmetry.test.ts                        # Zifchock Symmetry Angle (SA) unit tests
├── synthetic_audit_regression_m9.test.ts   # Synthetic audit regression test suite
├── testHelpers.ts                          # Synthetic pose frame generator helper utilities
└── view_suppression_stress_m8_1.test.ts   # View-angle dependent metric suppression tests
```

---

### 3.3 Synthetic Data Generator Capability Audit (`testHelpers.ts`)

`src/lib/gait/__tests__/testHelpers.ts` currently provides basic synthetic data generation capabilities:

1. **`generateSyntheticWalkingFrames(opts)`**:
   - Generates 33 MediaPipe pose landmarks over time $t = 0 \dots T$.
   - Uses sine waves for ankle oscillations: $y_{\text{ankle}}(t) = 0.85 - 0.05 \max(0, \sin(2\pi f t))$.
   - Parametric controls: `fps`, `durationSec`, `direction`, `asymmetryFactor`, `lowVisibilityLandmarks`, `noiseLevel`, `viewAngle`.
2. **`generateStationaryPoseFrames()`**:
   - Generates static standing pose for baseline/control testing.
3. **`generateAsymmetricWalkingFrames()`** (in `m7_steptimecv_stress.test.ts`):
   - Generates constant-velocity asymmetric gait with customizable phase shift.

#### Limitations of Current Synthetic Generator:
- **No Transient Ramp Simulation**: Current synthetic frames run at constant step frequency ($f = 1.6 \text{ Hz}$) from $t=0$ to $t=T$. They do not simulate initial acceleration (where $f$ starts lower and increases) or terminal deceleration (where speed decays).
- **No Ground-Truth Homography World Coordinates**: Does not simulate physical floor plane markers (QR/AprilTag) or oblique 3D tilt angles.
- **No 60 FPS Camera Jitter / Motion Blur**: Does not model high-framerate camera acquisition dynamics or exposure variations.

---

### 3.4 Ground-Truth Synthetic Regression Framework Architecture (R1–R4)

To satisfy Acceptance Criteria #5 ("`npm test` passes 100% of all unit, integration, and synthetic ground-truth regression tests without regressions"), we design modular ground-truth synthetic test generators for each requirement tier:

```
                        Synthetic Ground-Truth Framework
                                       │
      ┌──────────────────┬─────────────┴─────────────┬──────────────────┐
      ▼                  ▼                           ▼                  ▼
 R1 Ground-Truth    R2 Ground-Truth             R3 Ground-Truth    R4 Ground-Truth
 Generator          Generator                   Generator          Generator
 ───────────────    ───────────────             ───────────────    ───────────────
 - Landmark Jitter  - 60 FPS Timestamps         - Combined Foot    - Accel Ramp (2 strides)
 - Model Fallback   - Floor Tag Pixels (mm/px)    Displacement     - Steady Phase (6 strides)
 - 1D SG/Kalman     - Absolute Velocity (m/s)   - Ankle Accel Min  - Decel Ramp (2 strides)
   Filter Eval        Distance Mapping          - 2D Homography    - Verification of
                                                  Tilt Matrix        steadyStateCV vs True CV
```

#### Ground-Truth Test Specifications:

1. **R1 Ground-Truth Synthetic Generator (`generateR1SyntheticFrames`)**:
   - Injects zero-mean Gaussian landmark noise $\mathcal{N}(0, \sigma^2)$ on raw keypoints.
   - Evaluates filtered landmark trajectories (1D Savitzky-Golay / Kalman) against exact analytical ground-truth trajectories $x_{\text{true}}(t)$.
   - Assertion: Noise reduction ratio $\frac{\text{RMSE}_{\text{filtered}}}{\text{RMSE}_{\text{raw}}} \le 0.35$.

2. **R2 Ground-Truth Synthetic Generator (`generateR2SyntheticFrames`)**:
   - Simulates 60 FPS WebRTC capture stream ($dt = 16.67 \text{ ms}$).
   - Injects a reference marker of known size ($100 \text{ mm} \times 100 \text{ mm}$) at image location $(x_{ref}, y_{ref})$.
   - Computes expected gait speed $v = \text{distance}_{\text{mm}} / \Delta t$ and compares against `gaitSpeedMps`.
   - Assertion: `gaitSpeedMps` error $< 3\%$.

3. **R3 Ground-Truth Synthetic Generator (`generateR3SyntheticFrames`)**:
   - Injects oblique camera tilt ($\theta = 30^\circ$) projecting 3D floor coordinates $(X, Y, Z=0)$ to 2D image coordinates $(x_{img}, y_{img})$ via perspective matrix $H$.
   - Fuses relative AP displacement, vertical ankle acceleration $a_y(t) = \frac{d^2 y}{dt^2}$, and zero-velocity updates (ZUPT).
   - Assertion: Step events detected within $\pm 1$ frame of ground-truth initial contact timestamps; top-down step width matches true 3D step width within $\pm 5 \text{ mm}$.

4. **R4 Ground-Truth Synthetic Generator (`generateR4SyntheticFrames`)**:
   - Synthesizes a 10-stride gait trial with 3 distinct kinematic phases:
     - **Phase 1 (Acceleration)**: Strides 1–2 with step intervals $[0.85\text{s}, 0.70\text{s}]$ and step lengths $[0.35\text{m}, 0.50\text{m}]$.
     - **Phase 2 (Steady-State)**: Strides 3–8 with constant step interval $[0.55\text{s} \pm 0.01\text{s}]$ and step length $[0.65\text{m} \pm 0.01\text{m}]$ (True $\text{stepTimeCV} = 0.018$).
     - **Phase 3 (Deceleration)**: Strides 9–10 with step intervals $[0.72\text{s}, 0.90\text{s}]$ and step lengths $[0.48\text{m}, 0.30\text{m}]$.
   - **Verification Requirement**:
     - `metrics.stepTimeCV` (unfiltered) $= 0.185$ (inflated by transient ramps).
     - `metrics.stepTimeCV` (steady-state filtered) $= 0.018 \pm 0.003$ (matching ground-truth Phase 2).
     - `metrics.excludedAccelSteps` $= 2$, `metrics.excludedDecelSteps` $= 2$, `metrics.isSteadyStateReliable` $= \text{true}$.

---

## 4. Verification Procedures & Build/Lint Standards

To maintain standard compliance across development, the following commands must be executed and verified before submitting code:

```bash
# 1. Typecheck: Verify zero TypeScript errors
npm run typecheck

# 2. Lint: Verify zero ESLint errors
npm run lint

# 3. Test: Verify 100% test pass rate across all unit and ground-truth regression tests
npm test

# 4. Build: Verify successful production bundle & Vercel Nitro server packaging
npm run build
```

### Invalidation Conditions:
- Any `tsc` compilation error or unhandled `any` type violation.
- Any failing test in `src/lib/gait/__tests__/` or `src/components/gait/__tests__/`.
- Discrepancy between steady-state filtered `stepTimeCV` and true ground-truth steady-state CV exceeding $\pm 0.005$.
- Production build failure under Nitro Vercel preset (`npm run build`).

---

## 5. Conclusion & Actionable Handoff Recommendations

1. **R4 Implementation Roadmap**:
   - Add `partitionSteadyStateEvents()` function in `src/lib/gait/events.ts` implementing hybrid adaptive/fixed margin trimming.
   - Refactor `computeGaitMetricsCore` in `src/lib/gait/analysis.ts` to compute variability metrics (`stepTimeCV`, `strideTimeCV`, `stepLengthCV`, `symmetryAngle`) strictly on steady-state events.
   - Extend `GaitMetrics` interface in `src/lib/gait/types.ts` with R4 QC properties (`totalStepCount`, `steadyStateStepCount`, `excludedAccelSteps`, `excludedDecelSteps`, `isSteadyStateReliable`).
2. **Ground-Truth Test Infrastructure Roadmap**:
   - Create `src/lib/gait/__tests__/ground_truth_r1_r4_regression.test.ts` implementing synthetic ground-truth generators for R1, R2, R3, and R4.
   - Add regression tests verifying that steady-state filtering eliminates artificial CV inflation on transient acceleration/deceleration ramps.
