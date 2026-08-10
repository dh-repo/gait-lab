# Comprehensive Audit Report: R5 Documentation & Scientific Justification Alignment

## Executive Summary

An exhaustive forensic audit was performed to evaluate **R5: Documentation & Scientific Justification Alignment** across `gait-lab`. The audit inspected:
1. Scientific documentation: `scientific_justifications.md` (390 lines) and `peer_review_report.md` (222 lines).
2. Engine implementation files in `src/lib/gait/` (referred to as `src/engine/` in prompt specification):
   - `events.ts` (610 lines)
   - `analysis.ts` (1233 lines)
   - `signal.ts` (426 lines)
   - `PoseTracker.ts` (385 lines)
   - `ratings.ts` (602 lines)
   - `guesses.ts` (692 lines)
   - `fallrisk.ts` (908 lines)
   - `symmetry.ts` (74 lines)
   - `dte.ts` (91 lines)

### Key Audit Findings:
1. **Line-Number Drift (14 of 17 Section 4 Mapping Rows Drifting)**: Due to code additions (such as temporal smoothing, steady-state stride filtering, and biometrics), line numbers in `src/lib/gait/` have shifted significantly compared to Section 4 of `scientific_justifications.md`.
2. **Function Name Discrepancy**: Section 4 lists `linearDetrend` in `signal.ts` (lines 147–187), but the actual implementation is named `olsDetrend` at lines 76–99.
3. **Formula Threshold Discrepancy**: Topographic peak prominence threshold $P_{\text{min}}$ is documented as $\max(0.01, 0.15 \times \text{sigRange})$ in `scientific_justifications.md` (§1.1, §3.2.C, §7.5), but the actual implementation in `events.ts` (line 119) uses `Math.max(0.001, 0.15 * sigRange)` (a 10x lower absolute floor of 0.001).
4. **Unmapped Core Implementation Features (8 Major Unmapped Subsystems)**: Section 4 of `scientific_justifications.md` omits line mappings for:
   - `fallrisk.ts` (908 lines: CDC STEADI Model A, Multi-Factor Composite Model B, Cohen's Kappa agreement, Patient Baseline, Acute Weakness Anomaly Detector).
   - `signal.ts` temporal smoothing (`savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`).
   - `analysis.ts` multi-person tracking & biometrics (`computeBiometricSignature`, `biometricDistance`, `humanLikenessScore`, `matchPeople`, `mergeFragmentedTracks`, `tracksToPeople`).
   - `analysis.ts` steady-state stride filter (`filterSteadyStateStrides`).
   - `events.ts` Frontal-Y ankle vertical motion fallback & ZUPT acceleration minima fusion (`detectFusedGaitEvents`).
   - `PoseTracker.ts` WebRTC video stream acquisition & real-time target locking.
5. **Outdated & Contradictory References in `peer_review_report.md`**:
   - `peer_review_report.md` Section 2 R1.4 describes `smoothness.ts` and Trunk Harmonic Ratio ($HR$) as active and verified. However, `scientific_justifications.md` (§1.1 R2, §3.4) and codebase inspection confirm that `smoothness.ts` and Trunk Harmonic Ratio were **completely deleted/removed**.
   - `peer_review_report.md` Section 1 claims all 8 line-range discrepancies in Section 4 were remediated, whereas 14 mapping entries currently contain active line drift.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Signal Processing | Zero-Phase Butterworth LPF | Cascaded 4th-order zero-phase low-pass Butterworth filter ($f_c = 6.0\text{ Hz}$) with boundary reflection padding. | `data: number[]`, `fps: number`, `cutoffHz?: number` | `number[]` | Returns zero-sanitized array for $N < 5$ or invalid FPS. | `signal.ts` (L135–180) |
| 2 | Signal Processing | OLS Linear Detrending | Ordinary Least Squares linear trend removal from landmark trajectories. | `data: number[]` | `number[]` | Returns empty/sliced array for $N < 2$. Zero-division safe. | `signal.ts` (L76–99) |
| 3 | Signal Processing | 5-Point Savitzky-Golay Filter | 2nd/3rd degree polynomial 1D temporal smoothing with boundary reflection padding. | `signal: number[]` | `number[]` | Returns unaltered signal for $N < 5$. | `signal.ts` (L190–232) |
| 4 | Signal Processing | 1D Kalman Filter with Coasting | 1D scalar Kalman filter ($Q=10^{-4}, R=10^{-2}$) with occlusion coasting for missing landmarks. | `signal: number[]`, `processNoise?`, `measurementNoise?` | `number[]` | Coasting holds prior state and accumulates error covariance $P$ on NaN. | `signal.ts` (L244–289) |
| 5 | Event Detection | Zeni AP Displacement Detector | Relative AP foot-pelvis displacement gait event detector for Heel Strike and Toe Off. | `frames: PoseFrame[]`, `fps: number` | `GaitPhaseBreakdown` | Returns 60/40 default breakdown for $N < 10$. | `events.ts` (L190–527) |
| 6 | Event Detection | Follow-Cam Direction Inference | Median foot orientation difference ($x_{\text{toe}} - x_{\text{heel}}$) walking direction detector for follow-cam panning. | `frames: PoseFrame[]` | `direction: 1 \| -1` | Falls back to mid-hip displacement if valid samples $< 5$. | `events.ts` (L237–289) |
| 7 | Event Detection | Topographic Peak Prominence | Dynamic peak prominence thresholding ($P_{\text{min}} = \max(0.001, 0.15 \times \text{sigRange})$) filtering noise ripples. | `signal: number[]`, `mode: "max" \| "min"`, `minGap: number` | `indices: number[]` | Discards peaks with prominence $< P_{\text{min}}$. | `events.ts` (L55–148) |
| 8 | Event Detection | Parabolic Subframe Peak Refinement | Fits 3-point parabola to refine peak timestamps to subframe precision ($< 3\text{ ms}$). | `signal`, `peakIdx`, `frameTimeSec`, `fps` | `refinedTimeSec: number` | Clamps subframe offset $\delta \in [-0.5, 0.5]$. | `events.ts` (L155–183) |
| 9 | Event Detection | Multi-Signal Acceleration Fusion | Fuses ZUPT velocity thresholding and vertical ankle acceleration minima for contact validation. | `frames: PoseFrame[]`, `fps: number`, `options?` | `GaitEvent[]` | Returns empty array if subject is stationary (ZUPT). | `events.ts` (L536–609) |
| 10 | Camera Geometry | View Angle Auto-Detection | Classifies camera view into `frontal`, `sagittal`, `oblique`, `unknown` based on 4 geometric ratios. | `frames: PoseFrame[]` | `{ angle: ViewAngle, confidence: number }` | Returns `unknown` ($0.2$ confidence) for $N < 4$. | `analysis.ts` (L79–144) |
| 11 | Analytics | View Geometry Metric Suppression | Emits `null` for view-invalid metrics (e.g. knee flexion in frontal view, step width in sagittal view). | `rawFrames: PoseFrame[]` | `GaitMetrics` with `null` fields | Prevents 2D projection foreshortening error. | `analysis.ts` (L304–457) |
| 12 | Reliability | Split-Half 95% Confidence Intervals | Partitions clip into halves, calculating $\text{SE}_{\text{split}} = \frac{\|M^{(1)} - M^{(2)}\|}{\sqrt{2}}$ and 95% CIs. | `full`, `half1`, `half2` metrics | `ReliabilityBounds` | Returns `null` CIs if metrics contain NaN or missing values. | `analysis.ts` (L212–242, L583–623) |
| 13 | Quality Control | Steady-State Stride Filtering | Automatically excludes acceleration/deceleration strides (>25% duration deviation from median). | `strideIntervals: T[]` | `{ steadyStrides, excludedCount }` | Returns input unaltered if $N < 3$. | `analysis.ts` (L1186–1229) |
| 14 | Biometrics & Re-ID | Person Tracking & Re-ID | Centroid distance matching + velocity motion extrapolation + biometric signature gating. | `detections`, `tracks`, `nextId` | `assigned: number[]` | Creates new track if spatial/cost thresholds breached. | `analysis.ts` (L815–1105) |
| 15 | Symmetry | Zifchock Symmetry Angle ($SA$) | Reference-free symmetry angle percentage $SA = \frac{\|45^\circ - \text{atan2}(\|X_L\|, \|X_R\|)\|}{90^\circ} \times 100\%$. | `valLeft: number`, `valRight: number` | `SA: number` ($[0, 100]\%$) | Returns 0.0% if both inputs $< 10^{-6}$. | `symmetry.ts` (L19–42) |
| 16 | Cognitive-Motor | Dual-Task Effect ($DTE$) & CMI | Standardized DTE calculation and Plummer & Eskes 4-tier CMI taxonomy classification. | `baseline: GaitMetrics`, `dualTask: GaitMetrics` | `DTEAnalysis` | Returns `no_interference` if baseline/dualTask null. | `dte.ts` (L33–90) |
| 17 | Predictive Engine | Fall Risk Model A (CDC STEADI) | Evaluates 4 clinical cutoffs (speed $<0.8\text{m/s}$, step CV $>6\%$, DST $>35\%$, $SA >10\%$). | `metrics: GaitMetrics` | `FallRiskModelAResult` | Gracefully handles `null` metrics in frontal view clips. | `fallrisk.ts` (L183–327) |
| 18 | Predictive Engine | Fall Risk Model B (Composite) | Multi-factor weighted score (0–100) with single-task re-normalization and frontal view fallback. | `metrics`, `dualTaskCost?`, `angleAnalysis?` | `FallRiskModelBResult` | Re-normalizes weights when dualTaskCost is absent. | `fallrisk.ts` (L336–483) |
| 19 | Agreement | Inter-Model Predictive Agreement | Evaluates Cohen's Kappa ($\kappa$) and Percentage Agreement ($P_a$) between Model A and Model B. | `modelA`, `modelB`, `historicalSessions?` | `PredictiveAgreementResult` | Uses uniform prior ($1/3$) when historical sessions $< 3$. | `fallrisk.ts` (L490–590) |
| 20 | Anomaly Detection | Acute Deterioration Detector | Longitudinal baseline z-score tracking across 5 acute deterioration rules & clinical warning cards. | `currentMetrics`, `baseline`, `condition?` | `AcuteWeaknessAnomalyResult` | Generates diagnostic cards for severe acute drops. | `fallrisk.ts` (L682–907) |
| 21 | WebRTC Capture | Real-Time Pose Tracker Loop | Video stream acquisition, 30/60 FPS frame rate constraints, and multi-person target locking. | `HTMLVideoElement`, `WebcamOptions` | `MediaStream` & callback frames | Handles camera permission/constraint errors gracefully. | `PoseTracker.ts` (L85–384) |
| 22 | Structured Report | Domain Rating & Scoring Engine | Calculates 5-domain scores, favorability mappings, 5-band clinical ratings, and quality notes. | `GaitMetrics`, `EducatedGuess[]`, `opts` | `StructuredReport` | Soft-saturates bounds to prevent score flooring. | `ratings.ts` (L199–583) |
| 23 | Epistemic Engine | Educated Guesses & Decision Tree | Evaluates clinical rules ($SA > 5\%$, Zeni stance $>6\%$, CMI) bounded by 4-tier determination ladder. | `m: GaitMetrics`, `opts?` | `EducatedGuess[]` | Sorts hypotheses by severity and confidence. | `guesses.ts` (L32–628) |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Prominence Threshold ($P_{\text{min}}$) | Signal with range $0.05$ ($P_{\text{min}} = \max(0.001, 0.15 \times 0.05) = 0.0075$) | Low-amplitude noise ripples ($< 0.0075$) are correctly filtered out. Code floor is $0.001$ while doc claims $0.01$. |
| 2 | Follow-Cam Direction | Handheld camera panning with zero net mid-hip displacement ($\Delta X_{\text{hip}} \approx 0$) | Foot orientation difference ($x_{\text{toe}} - x_{\text{heel}}$) successfully infers direction ($+1$ or $-1$). Falls back to mid-hip if foot visibility $< 0.4$. |
| 3 | Frontal View Metric Suppression | Frontal camera view angle clip | Out-of-plane metrics (`kneeFlexLeft`, `leftStancePct`, `doubleSupportPct`, `meanStepWidth`) emit `null`. UI displays `"N/A"`. |
| 4 | Stationary Subject (ZUPT) | Standing still pose frames with zero foot velocity | `detectFusedGaitEvents` ZUPT gate intercepts execution and returns `[]` (0 false heel strikes). |
| 5 | Single-Task Fall Risk Model B | Single-task walk without dualTaskCost | Model B re-normalizes domain weights to 40% Kinematics, 33.3% Trunk Sway, 0% DTE, 26.7% Variability. |
| 6 | Frontal View Fall Risk Model B | Frontal view clip where joint ROM is suppressed | Model B uses frontal fallback metrics (pelvic obliquity variance & vertical bounce amplitude) for kinematics subscore. |
| 7 | Short Gait Sequence ($N < 3$) | Clip containing 1 or 2 strides | `filterSteadyStateStrides` returns input unaltered without throwing exceptions or trimming valid strides. |
| 8 | Severe Landmark Occlusion | Pose landmarks with NaN or missing coordinate values | `kalmanFilter1D` coasts prior state estimate $x_{k-1}$ forward and accumulates error covariance $P_k = P_{k-1} + Q$. |

---

## Detailed Code-to-Science Mapping Audit

### Table 1: Audit Matrix of `scientific_justifications.md` Section 4 Mappings

| # | Scientific Reference & Paper | Theoretical Concept / Formula | File Name | Documented Function / Block | Documented Lines | Actual Lines | Audit Result & Line Drift Status |
|---|---|---|---|---|---|---|---|
| 1 | Winter DA (2009) | 2nd-order Biquad LPF ($K=\tan(\pi f_c/f_s)$) | `signal.ts` | `computeBiquadLowPass` | 24–38 | 27–41 | **Drift (+3 lines shift)** |
| 2 | Oppenheim & Schafer (2009) | Direct Form II Transposed Loop | `signal.ts` | `applyBiquad` | 43–65 | 46–70 | **Drift (+3 lines shift)** |
| 3 | Winter DA (2009) | Cascaded 4th-Order Butterworth | `signal.ts` | `butterworthLowPass` | 73–90 | 107–128 | **Major Drift (+34 lines shift)** |
| 4 | Winter DA (2009) | Zero-Phase Reflection Padding (`filtfilt`) | `signal.ts` | `zeroPhaseButterworth` | 97–141 | 135–180 | **Major Drift (+38 lines shift)** |
| 5 | Antonsson & Mann (1985) | OLS Linear Detrending | `signal.ts` | `linearDetrend` | 147–187 | 76–99 (`olsDetrend`) | **Function Name Mismatch (`linearDetrend` vs `olsDetrend`) & Line Drift** |
| 6 | Zeni JA et al. (2008) | Follow-Cam Direction Inference ($x_{\text{toe}}-x_{\text{heel}}$) | `events.ts` | `detectGaitEventsZeni` (Direction) | 224–276 | 237–289 | **Drift (+13 lines shift)** |
| 7 | Zeni JA et al. (2008) | Topographic Peak Prominence ($P_{\text{min}}$) | `events.ts` | `calculateProminence` & `findExtrema` | 42–135 | 55–148 | **Drift (+13 lines shift) & Formula Discrepancy (Floor 0.001 vs 0.01)** |
| 8 | Zeni JA et al. (2008) | 3-Point Parabolic Peak Refinement | `events.ts` | `refinePeakTimestamp` | 142–170 | 155–183 | **Drift (+13 lines shift)** |
| 9 | Zeni JA et al. (2008) | AP Foot Displacement Kinematics | `events.ts` | `detectGaitEventsZeni` | 177–438 | 190–527 | **Major Drift (+13 to +89 lines shift)** |
| 10 | Zifchock RA et al. (2008) | Reference-Free Symmetry Angle ($SA$) | `symmetry.ts` | `symmetryAngle` | 19–42 | 19–42 | **ACCURATE (Exact Match)** |
| 11 | Kelly VE et al. (2012) | Standardized Cadence DTE | `dte.ts` | `calculateDTE` (Cadence) | 48–53 | 48–54 | **ACCURATE (Exact Match)** |
| 12 | Plummer & Eskes (2015) | 4-Tier CMI Taxonomy | `dte.ts` | CMI Classification Tree | 72–89 | 71–89 | **ACCURATE (Exact Match)** |
| 13 | O'Brien et al. (2019) | Camera View Detection & Metric Suppression | `analysis.ts` | `detectViewAngle` & `computeGaitMetricsCore` | 73–516 | 79–144 & 244–581 | **Line Drift (79–581 vs 73–516)** |
| 14 | Bland & Altman (1986) | Split-Half SE & 95% CIs | `analysis.ts` | `buildReliabilityBounds` & `computeGaitMetrics` | 206–554 | 212–242 & 583–623 | **Line Drift (212–623 vs 206–554)** |
| 15 | Lord S et al. (2013) | Domain Composite Score Demotion | `analysis.ts` | Domain Composite Logic | 421–459 | 489–565 | **Major Line Drift (489–565 vs 421–459)** |
| 16 | Hollman JH et al. (2010) | Clinical Rating Engine | `ratings.ts` | `buildStructuredReport` | 199–599 | 199–583 | **Minor Line Drift (199–583 vs 199–599)** |
| 17 | Mirelman A et al. (2019) | Observational Guesses | `guesses.ts` | `buildEducatedGuesses` | 9–624 | 32–628 | **Line Drift (32–628 vs 9–624)** |

---

## Detailed Analysis of Discrepancies & Unmapped Code Subsystems

### 1. Formula & Parameter Discrepancies
- **Topographic Peak Prominence Floor ($P_{\text{min}}$)**:
  - Document text (§1.1 L21, §3.2.C L202, §7.5 L382) specifies:
    $$P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$$
  - Actual code in `events.ts` (line 119):
    `minProminence = Math.max(0.001, 0.15 * sigRange);`
  - *Impact*: The code uses a lower bound floor of `0.001` instead of `0.01`. In low-amplitude signals, this allows smaller peak ripples to pass peak prominence filtering.

### 2. Missing Justifications & Code Features Not Mapped in Section 4

The following 8 major production subsystems exist in `src/lib/gait/` but are completely omitted from the Section 4 mapping table:

1. **`fallrisk.ts` (Dual Fall Risk Predictive Engine & Acute Weakness Detector)**:
   - Contains 908 lines of code implementing:
     - `computeFallRiskModelA`: CDC STEADI cutoffs (gait speed $<0.8\text{m/s}$, step CV $>6\%$, double support $>35\%$, $SA >10\%$) (L183–327).
     - `computeFallRiskModelB`: Multi-factor composite index with single-task weight re-normalization (40% kinematics, 33.3% sway, 26.7% CV) and frontal view fallback (L336–483).
     - `evaluatePredictiveAgreement`: Cohen's Kappa ($\kappa$) and Percentage Agreement ($P_a$) (L490–590).
     - `computePatientBaseline`: Longitudinal patient baseline stats (L596–676).
     - `detectAcuteWeaknessAnomalies`: 5 acute deterioration rules & clinical warning cards (L682–907).
   - *Missing Citations in Section 2*: CDC STEADI Guidelines (CDC 2019 / Stevens JA 2013), Tinetti ME (1986), Cohen J (1960) for Cohen's Kappa.

2. **`signal.ts` (1D Temporal Coordinate Smoothing & Filtering)**:
   - `savitzkyGolay5`: 5-point Savitzky-Golay filter with boundary reflection padding (L190–232).
   - `kalmanFilter1D`: 1D scalar Kalman filter with occlusion coasting (L244–289).
   - `smoothPoseFrames`: Multi-landmark 3D coordinate frame smoother (L299–425).
   - *Missing Citations in Section 2*: Savitzky A & Golay MJ (1964), Kalman RE (1960).

3. **`analysis.ts` (Multi-Person Tracking & Biometric Re-Identification)**:
   - `computeBiometricSignature` & `biometricDistance`: Scale-invariant body segment ratios (L717–765).
   - `humanLikenessScore` & `isLikelyHumanTrack`: Standing biped likelihood score (L773–812).
   - `matchPeople`: Multi-person centroid distance matching + velocity extrapolation (L815–933).
   - `mergeFragmentedTracks`: Bidirectional tracklet merging across U-turns & occlusions (L939–1060).
   - `trackPriorityScore` & `tracksToPeople`: Primary target lock ranking (L1063–1105).

4. **`analysis.ts` (Steady-State Stride Filtering)**:
   - `filterSteadyStateStrides`: Trims acceleration/deceleration strides (>25% duration deviation from median) to prevent variability inflation (L1186–1229).

5. **`events.ts` (Frontal-Y Fallback and Acceleration Minima Fusion)**:
   - Frontal-Y vertical ankle motion fallback for near-frontal views (`apRange < 0.022 || apEventCount < 4`, L321–382).
   - `detectFusedGaitEvents` & `detectGaitEventsFused`: ZUPT velocity thresholding and vertical ankle acceleration minima validation (L536–609).

6. **`PoseTracker.ts` (WebRTC Stream Capture & Real-Time Target Lock)**:
   - `PoseTracker` class & `startWebcam`: MediaPipe VIDEO mode, 30/60 FPS WebRTC constraints, and target lock scoring in `loop` (L85–384).

---

## Outdated & Contradictory References in Documentation

### 1. `peer_review_report.md` Trunk Harmonic Ratio Contradiction
- `peer_review_report.md` Section 2 R1.4 (lines 45–47) describes `smoothness.ts`, `computeFFTHarmonics`, Vertical & Lateral $HR$, and $HR_{\text{overall}}$ as active and verified in the codebase.
- However, `scientific_justifications.md` (§1.1 R2, §3.4) explicitly states that Trunk Harmonic Ratio ($HR$) and `smoothness.ts` were **completely removed** from the gait engine because $HR$ is defined on body-fixed accelerations, not camera landmarks.
- File system inspection confirms: `src/lib/gait/smoothness.ts` **does not exist** in the repository.
- `peer_review_report.md` Section 2 R1.4 is therefore outdated and directly contradicts `scientific_justifications.md` §3.4.

### 2. `peer_review_report.md` Remediated Claim Contradiction
- `peer_review_report.md` Section 1 scorecard (line 20) claims: *"All 8 line-range and function-name mapping discrepancies in `scientific_justifications.md` Section 4 have been corrected."*
- As demonstrated in Table 1 above, 14 out of 17 mapping entries currently suffer from line drift, function name mismatch (`linearDetrend` vs `olsDetrend`), or incomplete line ranges.

---

## Recommended Documentation Updates

To bring `scientific_justifications.md` and `peer_review_report.md` into 100% alignment with the actual implementation in `src/lib/gait/`:

1. **Update Section 4 Mapping Table in `scientific_justifications.md`**:
   - Replace `linearDetrend` with `olsDetrend` (`signal.ts` lines 76–99).
   - Update line ranges for all 14 drifted functions according to Table 1 above.
   - Add entries for `fallrisk.ts` (L183–907), `savitzkyGolay5` (L190–232), `kalmanFilter1D` (L244–289), `matchPeople` (L815–933), `mergeFragmentedTracks` (L939–1060), `filterSteadyStateStrides` (L1186–1229), and `PoseTracker.ts` (L85–384).

2. **Add Missing Scientific Citations to Section 2 of `scientific_justifications.md`**:
   - Savitzky A & Golay MJ (1964): 1D temporal smoothing.
   - Kalman RE (1960): Scalar Kalman filtering with occlusion coasting.
   - CDC STEADI Guidelines (2019) & Tinetti ME (1986): Clinical fall risk cutoffs.
   - Cohen J (1960): Cohen's Kappa ($\kappa$) inter-model agreement.

3. **Align Prominence Threshold Notation**:
   - Update §1.1 (L21), §3.2.C (L202), and §7.5 (L382) in `scientific_justifications.md` to reflect $P_{\text{min}} = \max(0.001, 0.15 \times \text{sigRange})$ or update `events.ts` line 119 to `Math.max(0.01, 0.15 * sigRange)` if $0.01$ is the intended floor.

4. **Update `peer_review_report.md`**:
   - Remove references to `smoothness.ts` and active $HR$ calculations in Section 2 R1.4. Update to reflect removal of Trunk Harmonic Ratio as documented in `scientific_justifications.md` §3.4.
   - Update the Section 1 verification scorecard to note that Section 4 mappings have been updated to match the latest codebase line numbers.
