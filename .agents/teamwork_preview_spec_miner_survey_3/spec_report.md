# Specification Mining & Requirements Report — `gait-lab`

- **Agent**: `teamwork_preview_spec_miner_survey_3`
- **Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_spec_miner_survey_3`
- **Authoritative Document**: `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- **Supporting Documents**: `scientific_justifications.md`, `PROJECT.md`, codebase in `src/lib/gait/`, `src/components/gait/`, `migrations/`

---

## Executive Summary

This specification report itemizes all functional, clinical, scientific, algorithmic, mathematical, UI component, database, export, and verification requirements for `gait-lab`. It synthesizes all request blocks from `ORIGINAL_REQUEST.md` across four core requirement groups:
- **R1: Core Engine Modules Integration & Polish** (DSP filtering, Kinematic Gait Events, Zifchock Symmetry, Harmonic Ratio status, Standardized DTE, Joint Angles Analytics, Printable PDF Exporter, Database Persistence, Sample Video Picker).
- **R2: Side-by-Side Dual Session Comparison View** (`SessionComparisonView.tsx` - dual session selectors, metric delta calculation with color-coded badges, overlaid joint trajectory charts).
- **R3: Live WebCam Real-Time Gait Capture Mode** (`GaitApp.tsx`, `PoseTracker.ts` - webcam stream acquisition, real-time MediaPipe pose tracking, live skeleton canvas overlay, live event detection).
- **R4: Complete Test Suite & Deployment Verification** (100% test pass rate, 0 TypeScript errors, 0 ESLint warnings, clean production build).

---

## 1. Mathematical & Scientific Formulations

### 1.1 Digital Signal Processing (DSP) (`src/lib/gait/signal.ts`)
- **Zero-Phase 4th-Order Low-Pass Butterworth Filter (`zeroPhaseButterworth`)**:
  - Effective cutoff frequency: $f_{c,\text{effective}} = \min(f_c, 0.95 \cdot \frac{f_s}{2})$ where default $f_c = 6.0\text{ Hz}$.
  - Bilinear pre-warping parameter: $K = \tan\left(\frac{\pi f_{c,\text{effective}}}{f_s}\right)$.
  - Quality factors: $Q_1 = \frac{1}{2 \cos(\pi/8)} \approx 0.5411961$, $Q_2 = \frac{1}{2 \cos(3\pi/8)} \approx 1.3065630$.
  - Boundary reflection padding: $M = \min(12, N-1)$ samples padded at start ($2x[0] - x[M-i]$) and end ($2x[N-1] - x[N-2-i]$) to prevent boundary transients.
  - Forward-backward filtering (`filtfilt`) eliminates phase shift: $\theta(\omega) \equiv 0$.
- **OLS Linear Detrending (`linearDetrend`)**:
  - Removes linear baseline slope $\hat{\beta}_1$ and intercept $\hat{\beta}_0$ via Ordinary Least Squares:
    $$\hat{\beta}_1 = \frac{N \sum i \cdot y[i] - \sum i \sum y[i]}{N \sum i^2 - (\sum i)^2}, \quad y_{\text{detrended}}[i] = y[i] - (\hat{\beta}_0 + \hat{\beta}_1 \cdot i)$$
- **Cooley-Tukey Radix-2 FFT with Hann Windowing**:
  - Applied for spectral signal analysis; zero-padded to power-of-two length.

### 1.2 Kinematic Gait Event Detection (`src/lib/gait/events.ts`)
- **Relative Foot-Pelvis AP Displacement**:
  $$\Delta x_{\text{foot\_AP}}^L(t) = x_{\text{foot}}^L(t) - x_{\text{pelvis\_center}}(t)$$
- **Handheld Follow-Cam Walking Direction Inference**:
  - Evaluates foot orientation difference $\Delta X = x_{\text{toe}} - x_{\text{heel}}$ across frames with landmark visibility $\ge 0.4$.
  - Direction $d = +1$ (Left-to-Right) if $\text{median}(\Delta X) > 0.005$; $d = -1$ (Right-to-Left) if $\text{median}(\Delta X) < -0.005$.
- **Topographic Peak Prominence Filtering**:
  - Dynamic threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$ where $\text{sigRange} = \max(x) - \min(x)$. Filters out noise ripples.
- **Parabolic Subframe Timestamp Refinement**:
  - Refines peak frame index $i^*$ via offset $\delta = \frac{y_{i^*-1} - y_{i^*+1}}{2(y_{i^*-1} - 2y_{i^*} + y_{i^*+1})}$, yielding refined timestamp $t_{\text{refined}} = t_{i^*} + \delta \cdot \Delta t$.

### 1.3 Inter-Limb Gait Symmetry (`src/lib/gait/symmetry.ts`)
- **Zifchock's Reference-Free Symmetry Angle ($SA$)**:
  $$\theta = \text{atan2}(|X_L|, |X_R|) \quad (\text{if } \theta_{\text{deg}} > 90^\circ, \text{ wrap: } \theta_{\text{deg}} = 180^\circ - \theta_{\text{deg}})$$
  $$SA = \frac{|45^\circ - \theta_{\text{deg}}|}{90^\circ} \times 100\%$$
- **Gait Symmetry Index ($GSI$)**:
  $$GSI = \frac{\min(X_L, X_R)}{\max(X_L, X_R)} \times 100\%$$

### 1.4 Dual-Task Effect ($DTE$) & CMI Taxonomy (`src/lib/gait/dte.ts`)
- **Standardized Directional $DTE$**:
  - Higher-is-better metrics (cadence, speed): $DTE = \frac{\text{Dual} - \text{Single}}{\text{Single}} \times 100\%$
  - Lower-is-better metrics (step time CV, stance asymmetry): $DTE = \frac{\text{Single} - \text{Dual}}{\text{Single}} \times 100\%$
- **Plummer & Eskes (2015) 4-Tier Cognitive-Motor Interference Taxonomy**:
  - `mutual_interference`: Both gait performance and cognitive accuracy decrease under dual-task conditions ($DTE < -5\%$).
  - `cognitive_prioritization`: Gait performance preserved ($DTE \ge -5\%$), cognitive performance decreases.
  - `motor_prioritization`: Gait performance decreases ($DTE < -5\%$), cognitive performance preserved.
  - `no_interference`: Both gait and cognitive performance maintained ($DTE \ge -5\%$).

### 1.5 Joint Kinematic Trajectories & Time Normalization (`src/lib/gait/angles.ts`)
- **3-Point 2D Sagittal Joint Angles**:
  - Knee Flexion/Extension: $\angle \text{Hip-Knee-Ankle} = \arccos\left(\frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}\right)$
  - Hip Flexion/Extension: $\angle \text{Shoulder-Hip-Knee}$
  - Ankle Dorsiflexion/Plantarflexion: $\angle \text{Knee-Ankle-Toe}$
- **0–100% Gait Cycle Time Normalization**:
  - Resamples individual stride cycles into 101 uniform percentage points ($0\%, 1\%, \dots, 100\%$).
- **View Geometry Metric Suppression**:
  - Frontal camera view suppresses sagittal joint angle metrics (`isSuppressed = true`) to prevent 2D projection foreshortening error.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: DSP | Zero-Phase Butterworth Low-Pass Filter | 4th-order low-pass zero-phase Butterworth filter ($f_c = 6.0\text{ Hz}$) with boundary reflection padding and Nyquist frequency clamping | `data: number[]`, `fps: number`, `cutoffHz?: number` | `filteredData: number[]` | Returns original data if length $< 4$ or invalid `fps` | `ORIGINAL_REQUEST.md` (R1), `signal.ts` |
| 2 | R1: DSP | OLS Linear Detrending | Removes OLS linear drift slope and intercept from time series signals | `data: number[]` | `{ detrended: number[], trend: (i) => number }` | Returns zero array if input length $< 2$ | `scientific_justifications.md`, `signal.ts` |
| 3 | R1: Events | Zeni Kinematic Gait Event Detection | Relative AP foot-pelvis displacement algorithm extracting Heel Strike (IC), Toe Off (TO), stance %, swing %, double support % | `frames: PoseFrame[]`, `fps: number` | `GaitPhaseBreakdown` object | Fallbacks to ANKLE landmarks if HEEL/TOE visibility $< 0.4$ | `ORIGINAL_REQUEST.md` (R1), `events.ts` |
| 4 | R1: Events | Handheld Follow-Cam Direction Inference | Infers L->R ($+1$) or R->L ($-1$) walking direction in tracking shots using median foot orientation vector diff ($\Delta X = x_{\text{toe}} - x_{\text{heel}}$) | `frames: PoseFrame[]` | `direction: 1 \| -1` | Fallback to net hip displacement if valid foot samples $< 5$ | `scientific_justifications.md` (R1), `events.ts` |
| 5 | R1: Events | Topographic Peak Prominence Filtering | Rejects noise ripples using dynamic prominence threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$ | `signal: number[]`, `mode: 'max' \| 'min'`, `minGap: number` | `peakIndices: number[]` | Returns empty array if signal is flat | `scientific_justifications.md` (R5), `events.ts` |
| 6 | R1: Events | Parabolic Subframe Timestamp Refinement | Interpolates subframe peak offset $\delta$ to eliminate frame rate quantization jitter | `signal: number[]`, `peakIdx: number`, `frameTimeSec: number`, `fps: number` | `refinedTimeSec: number` | Unchanged timestamp if denominator is zero/flat | `scientific_justifications.md` (R3), `events.ts` |
| 7 | R1: Symmetry | Zifchock Reference-Free Symmetry Angle | Calculates reference-free limb symmetry angle ($SA$) and symmetry index ($GSI$) for step time, arm swing, and knee flexion | `valLeft: number`, `valRight: number` | `SA: number` (%) | Returns $0.0\%$ if both values are zero | `ORIGINAL_REQUEST.md` (R1), `symmetry.ts` |
| 8 | R1: Smoothness | Trunk Harmonic Ratio Status & Removal | Record of FFT trunk harmonic ratio removal from active metrics engine (invalid for 2D position data) while keeping schema column nullable | `hipY: number[]`, `hipX: number[]` | `null` for active metrics | Emits `null` values; no runtime error | `scientific_justifications.md` (§3.4), `persistence.ts` |
| 9 | R1: Dual-Task | Standardized Dual-Task Effect ($DTE$) | Standardizes $DTE$ direction for higher-better vs lower-better metrics & classifies Plummer & Eskes 4-tier CMI taxonomy | `singleTask: GaitMetrics`, `dualTask: GaitMetrics` | `DualTaskCost` object | Returns zero cost if single-task baseline metric is zero/missing | `ORIGINAL_REQUEST.md` (R1), `dte.ts` |
| 10 | R1: Joint Angles | 2D Joint Kinematics & Time-Normalization | Computes Knee, Hip, Ankle 3-point joint angles, resamples to $0\text{--}100\%$ gait cycle (101 points), extracts peak ROM & asymmetry % | `frames: PoseFrame[]`, `events: GaitEvent[]`, `viewAngle: ViewAngle` | `GaitAngleAnalysis` object | Sets `isSuppressed = true` with warning text for frontal camera view | `ORIGINAL_REQUEST.md` (15:00:00Z R1), `angles.ts` |
| 11 | R1: Visualization | Interactive Joint Trajectory Chart | Recharts composed chart (`JointAnglesChart.tsx`) displaying Left vs Right joint angle curves against Perry & Burnfield (2010) normative envelopes | `angleAnalysis: GaitAngleAnalysis` | React JSX Chart Component | Renders prominent warning banner when view is suppressed | `ORIGINAL_REQUEST.md` (15:00:00Z R1), `JointAnglesChart.tsx` |
| 12 | R1: Export | Printable Clinical Report & 5-Domain Radar Chart | Printable view (`ClinicalReportView.tsx`) with 5-domain radar chart (Pace, Symmetry, Smoothness, Rhythmicity, Stability), patient metadata, `@media print`, and 1-click export button | `result: AnalysisResult`, `patientMeta: PatientMetadata` | Printable React UI & PDF output | Gracefully displays "View Suppressed" for invalid view metrics | `ORIGINAL_REQUEST.md` (15:00:00Z R2), `ClinicalReportView.tsx` |
| 13 | R1: Database | PostgreSQL Session Persistence Schema | DB schema (`migrations/0002_gait_sessions.sql`) & server functions (`persistence.ts`) for saving, listing, fetching, deleting gait sessions | `sessionData`, `userId` | `GaitSessionRecord` object | Throws auth error if unauthenticated | `ORIGINAL_REQUEST.md` (16:40:29Z R1), `persistence.ts` |
| 14 | R1: Sample Picker | Curated Reference Video Sample Picker | Sample selector (`SamplePicker.tsx`) providing 4 reference gait videos (`sagittal-gait.mp4`, `frontal-gait.mp4`, `follow-cam-gait.mp4`, `general-gait.mp4`) | `onSelectSample: (file) => void` | Triggers sample load & analysis | Fallback error alert if sample file fetch fails | `ORIGINAL_REQUEST.md` (06:52:24Z R5), `SamplePicker.tsx` |
| 15 | R2: Comparison | Dual Session Selectors | Dropdown selectors in `SessionComparisonView.tsx` loading historical gait sessions for Session A (Baseline) and Session B (Follow-up) | `sessions: GaitSessionRecord[]` | `selectedSessionA`, `selectedSessionB` | Shows empty state UI if $<2$ saved sessions exist | `ORIGINAL_REQUEST.md` (16:40:29Z R2), `SessionComparisonView.tsx` |
| 16 | R2: Comparison | Metric Delta & Percentage Calculation | Computes absolute ($\Delta = M_B - M_A$) and relative ($\% \Delta = \frac{M_B - M_A}{M_A} \times 100\%$) metric differences across spatio-temporal metrics | `sessionA: GaitSessionRecord`, `sessionB: GaitSessionRecord` | `metricDeltas: Record<string, DeltaInfo>` | Handles null/missing metrics with `N/A` | `ORIGINAL_REQUEST.md` (16:40:29Z R2), `SessionComparisonView.tsx` |
| 17 | R2: Comparison | Visual Delta Badges | Directional color-coded badges (Green = improvement, Red = degradation, Gray = unchanged) based on clinical favorability of metric delta | `metricDelta: DeltaInfo` | Color-coded Badge UI component | Renders neutral badge if $|\%\Delta| < 1\%$ | `ORIGINAL_REQUEST.md` (16:40:29Z R2), `SessionComparisonView.tsx` |
| 18 | R2: Comparison | Overlaid Joint Angle Trajectory Chart | Recharts overlaid trajectory chart comparing Session A vs Session B normalized joint angle curves across $0\text{--}100\%$ gait cycle | `angleAnalysisA`, `angleAnalysisB` | Overlaid Recharts Line Component | Displays suppression message if either session view angle is suppressed | `ORIGINAL_REQUEST.md` (16:40:29Z R2), `SessionComparisonView.tsx` |
| 19 | R3: Live Webcam | MediaPipe Pose WebCam Capture Engine | Real-time pose tracking engine (`PoseTracker.ts`) processing live camera video stream via MediaPipe Pose Landmarker | `videoElement: HTMLVideoElement` | `landmarksStream: Subject<PoseFrame>` | Triggers error boundary if camera permission denied | `ORIGINAL_REQUEST.md` (16:40:29Z R3), `PoseTracker.ts` |
| 20 | R3: Live Webcam | Live Skeleton Canvas Overlay | Real-time canvas overlay rendering pose skeleton keypoints and bone connections over live video feed at ~30–60 FPS | `canvasElement: HTMLCanvasElement`, `poseFrame: PoseFrame` | Visual canvas animation frame | Clears canvas when video stops or stream drops | `ORIGINAL_REQUEST.md` (16:40:29Z R3), `GaitApp.tsx` |
| 21 | R3: Live Webcam | Live Real-Time Event & Metric Calculation | Continuous rolling 10–12s frame window executing real-time gait event detection and live cadence/step count rendering | `rollingBuffer: PoseFrame[]` | Live `GaitMetrics` update | Displays "Calibrating..." until minimum buffer frames collected | `ORIGINAL_REQUEST.md` (16:40:29Z R3), `GaitApp.tsx` |
| 22 | R4: Verification | Automated Unit & Synthetic Test Suite | 100% passing test suite (`npm test`) covering DSP, Zeni events, symmetry, DTE, joint angles, ratings, guesses, persistence, and synthetic ground truth | `npm test` command | `0` exit code, all tests pass | Test runner logs failing test assertions | `ORIGINAL_REQUEST.md` (16:40:29Z R4), `src/**/__tests__/` |
| 23 | R4: Verification | TypeScript Strict Type Verification | Zero TypeScript compilation errors (`tsc --noEmit` / `npm run typecheck`) across all components, lib files, and test files | `npm run typecheck` command | `0` exit code, 0 type errors | `tsc` prints error details and non-zero exit code | `ORIGINAL_REQUEST.md` (16:40:29Z R4), `tsconfig.json` |
| 24 | R4: Verification | ESLint Static Analysis Clean Pass | Zero ESLint errors and warnings (`eslint .` / `npm run lint`) across whole repository | `npm run lint` command | `0` exit code, 0 lint warnings | `eslint` prints lint rule violations and non-zero exit code | `ORIGINAL_REQUEST.md` (16:40:29Z R4), `eslint.config.mjs` |
| 25 | R4: Verification | Production Vercel Nitro Build | Clean production build (`npm run build`) compiling Vite client bundle and Vercel Nitro server preset | `npm run build` command | `0` exit code, build artifacts in `.output/` | Build script fails with error trace | `ORIGINAL_REQUEST.md` (16:40:29Z R4), `package.json` |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input | Observed Behavior & Fallback |
|---|---------|-------|------------------------------|
| 1 | Follow-Cam Direction | Handheld tracking video where subject stays at center $X_{\text{midHip}} \approx 0.50$ | Net displacement $\Delta X_{\text{hip}} \approx 0$. Foot orientation difference $\Delta X = x_{\text{toe}} - x_{\text{heel}}$ correctly determines L->R vs R->L direction. |
| 2 | Follow-Cam Direction | Low foot landmark visibility ($\text{vis} < 0.4$) or obscured feet | Valid foot samples $|\mathcal{S}| < 5$. System falls back to net hip displacement direction inference. |
| 3 | Peak Prominence | High landmark jitter or camera shake creating micro-ripples | Small local peaks with prominence $< P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$ are rejected, preventing false gait event detection. |
| 4 | Temporal Decimation | Long video clips (e.g. 60s or 120s) | Clip is sampled as a continuous 10–12s window at full 30 Hz. Parabolic subframe interpolation maintains `stepTimeCV` variation $< 0.1\%$. |
| 5 | View Geometry | Frontal camera view selected for joint angle analysis | `angles.ts` sets `isSuppressed = true` and `JointAnglesChart.tsx` displays an explicit view angle suppression warning banner instead of incorrect 2D angles. |
| 6 | View Geometry | Frontal view evaluated for spatial step width vs stance % | Frontal view emits `null` for sagittal stance/swing % and valid values for lateral step width; sagittal view emits reverse. |
| 7 | Symmetry Angle | Zero or near-zero bilateral metric values ($X_L = X_R = 0$) | Zifchock algorithm evaluates $\theta = \text{atan2}(0,0) = 0$, yielding $SA = 0.0\%$ without division-by-zero errors. |
| 8 | Dual-Task Effect | Single-task baseline metric is missing or zero ($M_{\text{single}} = 0$) | `calculateDTE` handles zero denominator gracefully, returning $0.0\%$ cost to prevent `NaN` propagation. |
| 9 | Dual Session Comparison | Fewer than 2 gait sessions stored in database | `SessionComparisonView.tsx` renders a clean empty state prompt inviting clinician to complete and save gait sessions first. |
| 10 | Live WebCam Capture | User denies camera access permissions in browser | `GaitApp.tsx` catches MediaDevices DOMException and presents clear UI fallback instructions for granting camera permissions. |
| 11 | Real-Time Pose Tracker | Variable camera frame rates or dropped frames during live capture | Timestamp delta estimation adapts dynamically per requestAnimationFrame tick, maintaining continuous time-series continuity. |
| 12 | Database Persistence | Nullable `harmonic_ratio` column in legacy database schema | New sessions write `null` for `harmonic_ratio`; existing historical rows retain recorded value upon hydration. |

---

## 4. Code & Test Verification Standards

- **Unit Test Files**:
  - `src/lib/gait/__tests__/signal.test.ts`: Zero-phase LPF, OLS detrending, FFT.
  - `src/lib/gait/__tests__/events.test.ts`: Zeni events, follow-cam orientation, peak prominence, parabolic refinement.
  - `src/lib/gait/__tests__/symmetry.test.ts`: Zifchock $SA$ limb invariance & mathematical accuracy.
  - `src/lib/gait/__tests__/dte.test.ts`: Standardized DTE formulas & Plummer & Eskes taxonomy.
  - `src/lib/gait/__tests__/angles.test.ts`: 3-point joint angles, gait cycle time-normalization, view suppression.
  - `src/lib/gait/__tests__/analysis.test.ts`: Integrated engine, split-half 95% CIs, view suppression.
  - `src/lib/gait/__tests__/ratings.test.ts`: Ratings engine & composite score handling.
  - `src/lib/gait/__tests__/guesses.test.ts`: Rule-based decision tree & hypotheses.
  - `src/lib/gait/__tests__/persistence.test.ts`: DB session record serialization & hydration.
  - `src/lib/gait/__tests__/nan_property.test.ts`: Property-based NaN/Infinity sanitization.
  - `src/lib/gait/__tests__/stress_adversarial.test.ts`: Adversarial stress scenarios.
  - `src/lib/gait/__tests__/synthetic_audit_regression_m9.test.ts`: Synthetic ground-truth regression suite.
- **UI Component Test Files**:
  - `src/components/gait/__tests__/ClinicalReportView.test.tsx`
  - `src/components/gait/__tests__/JointAnglesChart.test.tsx`
  - `src/components/gait/__tests__/CognitiveClusters.test.tsx`
  - `src/components/gait/__tests__/WorkflowHeader.test.tsx`
  - `src/components/gait/__tests__/SkeletonCanvas.test.tsx`
  - `src/components/gait/__tests__/GaitAppAccessibility.test.tsx`
- **Verification Commands**:
  - `npm test`: Must return exit code 0 with 100% test pass.
  - `npm run typecheck`: Must return exit code 0 with 0 TypeScript errors (`tsc --noEmit`).
  - `npm run lint`: Must return exit code 0 with 0 ESLint warnings (`eslint .`).
  - `npm run build`: Must return exit code 0 with clean Vercel Nitro build output.
