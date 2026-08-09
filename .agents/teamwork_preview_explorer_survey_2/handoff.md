# Handoff Report: Deep Algorithmic Logic & Signal Processing Analysis of Gait-Lab

## 1. Observation

### System Overview & Entry Points
The `gait-lab` repository is a browser-based computer vision application designed to perform spatio-temporal gait analysis from video recordings using MediaPipe Pose estimation.
- **Entry Points & Core Modules**:
  - `src/lib/gait/types.ts`: Core data structures (`Landmark`, `PoseFrame`, `TrackedPerson`, `GaitMetrics`, `EducatedGuess`, `DualTaskCost`, `AnalysisResult`).
  - `src/lib/gait/landmarks.ts`: Landmark definitions, 2D geometry functions (`dist`, `angleDeg`, `mid`, `torsoHeight`, `boundingBox`, `hipCenter`), statistical primitives (`mean`, `std`, `range`).
  - `src/lib/gait/pose.ts`: MediaPipe Pose Landmarker initialization (`/models/pose_landmarker_lite.task`), canvas rendering (`detectPosesOnVideoFrame`), and frame-seeking utilities (`seekAndDetect`, `seekVideo`).
  - `src/lib/gait/analysis.ts`: Signal filtering (`smooth`, `detrend`), view angle detection (`detectViewAngle`), multi-strategy step event detection (`findPeaks`, `findLocalStance`, `estimateStepsFromOscillation`), metric computation (`computeGaitMetrics`), multi-person tracking (`matchPeople`, `tracksToPeople`), and dual-task cost estimation (`computeDualTaskCost`).
  - `src/lib/gait/ratings.ts`: Structured report generation, domain composite scoring, metric favorability mapping, and clinical disclaimer ladder.
  - `src/lib/gait/guesses.ts`: Rule-based heuristic decision tree mapping metrics to observational pattern hypotheses (`EducatedGuess`).
  - `src/components/gait/GaitApp.tsx`: Main UI orchestrator managing scan pass, person selection, analysis pass, and results display.
  - `src/components/gait/SkeletonCanvas.tsx`: HTML5 Canvas overlay renderer for pose skeletons.
  - `src/components/gait/MetricsPanel.tsx`: Recharts-based visualization of time-series signals (ankle height, hip path, knee angles).

---

### Comprehensive Mathematical Formula Mapping

| Parameter / Feature | Code File & Line Numbers | Mathematical Formula / Implementation Logic |
| :--- | :--- | :--- |
| **Torso Height Normalization ($h_{\text{torso}}$)** | `landmarks.ts`:84-89 | $h_{\text{torso}} = \max\left(\left\| \text{mid}(LM_{11}, LM_{12}) - \text{mid}(LM_{23}, LM_{24}) \right\|_2, 0.05\right)$ |
| **2D Joint Angle ($\theta_{\text{knee}}$)** | `landmarks.ts`:72-82 | $\vec{u} = P_{\text{hip}} - P_{\text{knee}}$, $\vec{v} = P_{\text{ankle}} - P_{\text{knee}}$, $\theta = \arccos\left(\text{clamp}\left(\frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2}, -1, 1\right)\right) \cdot \frac{180}{\pi}$ |
| **Moving Average Smoothing** | `analysis.ts`:23-37 | $\hat{x}[i] = \frac{1}{N_{\text{valid}}} \sum_{j = \max(0, i-2)}^{\min(M-1, i+2)} x[j]$ (5-point boxcar moving average) |
| **Linear Detrending** | `analysis.ts`:582-595 | $x_{\text{detrended}}[i] = x[i] - (a + b \cdot i)$, where $b = \frac{\sum (i - \bar{i})(x_i - \bar{x})}{\sum (i - \bar{i})^2}, a = \bar{x} - b \bar{i}$ |
| **Asymmetry Ratio** | `analysis.ts`:58-65 | $\text{asym}(A, B) = \frac{||A| - |B||}{\max(|A|, |B|, 10^{-6})}$ if $\max(|A|,|B|) \ge 10^{-3}$, else $0$ |
| **Cadence (spm)** | `analysis.ts`:344 | $\text{cadenceSpm} = \frac{N_{\text{steps}}}{T_{\text{duration}}} \cdot 60$ |
| **Step Time Asymmetry** | `analysis.ts`:360 | $\text{stepTimeAsymmetry} = \text{asym}(\overline{\Delta t_L}, \overline{\Delta t_R})$ where $\Delta t = t_i - t_{i-1}$ |
| **Stride Length Proxy & Asymmetry** | `analysis.ts`:364-378 | $\text{travel}_i = \frac{\left\| P_{\text{hip}}(t_i) - P_{\text{hip}}(t_{i-1}) \right\|_2}{\overline{h_{\text{torso}}}}$, $\text{strideAsym} = \text{asym}(\overline{\text{travel}_L}, \overline{\text{travel}_R})$ |
| **Lateral Sway Index** | `analysis.ts`:380-399 | $\tilde{X} = \frac{X_{\text{hip}}}{h_{\text{torso}}}$, $R_X = \tilde{X} - \text{MA}(\tilde{X}, W)$, $\text{lateralSway} = \min(\text{std}(R_X), 0.12)$ where $W = \max(2, \lfloor f_{\text{fps}} \cdot 0.6 \rfloor)$ |
| **Vertical Bounce Index** | `analysis.ts`:380-400 | $\tilde{Y} = \frac{Y_{\text{hip}}}{h_{\text{torso}}}$, $R_Y = \tilde{Y} - \text{MA}(\tilde{Y}, W)$, $\text{verticalBounce} = \min(\text{std}(R_Y), 0.10)$ |
| **Arm Swing Amplitude & Asym** | `analysis.ts`:402-404 | $W_{\text{rel}} = \frac{X_{\text{wrist}} - X_{\text{hip}}}{h_{\text{torso}}}$, $\text{armSwing} = \max(W_{\text{rel}}) - \min(W_{\text{rel}})$, $\text{armAsym} = \text{asym}(\text{arm}_L, \text{arm}_R)$ |
| **Knee Flexion Range & Asym** | `analysis.ts`:406-408 | $\text{kneeFlex} = \max(\theta_{\text{knee}}) - \min(\theta_{\text{knee}})$, $\text{kneeAsym} = \text{asym}(\text{knee}_L, \text{knee}_R)$ |
| **Step Width & Variability** | `analysis.ts`:410, 438 | $SW[i] = \frac{|X_{\text{ankle}, L}[i] - X_{\text{ankle}, R}[i]|}{h_{\text{torso}}[i]}$, $\text{meanStepWidth} = \overline{SW}$, $\text{stepWidthVar} = \text{std}(SW)$ |
| **Double Support Hint** | `analysis.ts`:412-421 | Fraction of frames where $Y_{\text{ankle}, L} - Y_{\text{hip}} > T_L \land Y_{\text{ankle}, R} - Y_{\text{hip}} > T_R$, with $T = \mu + 0.15 \sigma$ |
| **Step Time CV** | `analysis.ts`:424-425 | $\text{stepTimeCV} = \frac{\text{std}(\{\Delta t_{\text{step}}\})}{\overline{\Delta t_{\text{step}}}}$ |
| **Stride Time CV** | `analysis.ts`:427-434 | $\text{strideTimeCV} = \frac{\text{std}(\{\Delta t_{\text{stride}}\})}{\overline{\Delta t_{\text{stride}}}}$ for same-side step intervals ($L \to L, R \to R$) |
| **Pelvic Obliquity & Var** | `analysis.ts`:436-437 | $HD[i] = \frac{Y_{\text{hip}, L}[i] - Y_{\text{hip}, R}[i]}{h_{\text{torso}}[i]}$, $\text{pelvicObliquity} = \overline{|HD|}$, $\text{pelvicObliquityVar} = \text{std}(HD)$ |
| **Path Smoothness** | `analysis.ts`:440-448 | $\text{pathSmoothness} = \text{clamp}\left(1 - \frac{\text{std}(\text{detrend}(X_{\text{hip}}))}{\max(\text{range}(X_{\text{hip}}), 0.02)}, 0, 1\right)$ |
| **Dual-Task Cost (Cadence)** | `analysis.ts`:725-728 | $\text{cadenceCostPct} = \frac{\text{cadence}_{\text{single}} - \text{cadence}_{\text{dual}}}{\text{cadence}_{\text{single}}} \cdot 100$ |
| **Dual-Task Cost (Step CV)** | `analysis.ts`:729 | $\text{stepTimeCvCostPct} = \frac{\text{CV}_{\text{dual}} - \text{CV}_{\text{single}}}{\max(\text{CV}_{\text{single}}, 0.01)} \cdot 100$ |

---

### Step Event Detection Architecture
Step detection in `analysis.ts` (lines 231-341) uses a multi-strategy cascade to detect foot contact events:
1. **Strategy A (Ankle Image-Y Local Maxima)**: Finds local peaks in image $Y$ coordinates of left and right ankles (`findPeaks(leftY, minDist, prom)`). In image space, $Y=0$ is top and $Y=1$ is bottom, so peak $Y$ corresponds to the lowest vertical position of the ankle in the image frame.
2. **Strategy B (Frontal/Oblique Stance Velocity Gate)**: For frontal/oblique views, identifies frames where horizontal ankle velocity $|\Delta X| \le 0.55 \cdot \overline{|\Delta X|}$ and ankle $Y \ge \bar{Y}$ (`findLocalStance`).
3. **Strategy C (Hip Vertical Bounce Side Assignment)**: Finds local peaks in hip $Y$ position (CoM vertical bounce) and assigns the step side based on which ankle is lower in the image frame ($Y_{\text{ankle}, L} \ge Y_{\text{ankle}, R} \implies L$).
4. **Strategy D (Ankle Height Crossover Events)**: Finds zero-crossings of $(Y_{\text{ankle}, L} - Y_{\text{ankle}, R})$.
5. **Strategy E (Autocorrelation Fallback)**: If discrete detectors yield $< 4$ steps or $< 0.7 \cdot T_{\text{duration}}$, computes 1D normalized autocorrelation $R(\tau)$ over lags $\tau \in [0.35\text{s}, 1.2\text{s}]$ and synthesizes step events at lag intervals.

---

### Composite Domain Scoring Logic
Composite scores ($0-100$) in `analysis.ts` (lines 450-496) combine normalized metrics using heuristic linear penalties:
- **Stability Score**: $100 - (220 \cdot \text{sway} + 180 \cdot \text{bounce} + 35 \cdot \min(\text{stepWidthVar}, 0.25))$, clamped to $[8, 98]$.
- **Rhythm Score**: $100 - 120 \cdot \text{stepTimeCV} - 0.25 \cdot |\text{cadenceSpm} - 110|$, clamped to $[5, 98]$.
- **Symmetry Score**: $100 - (55 \cdot \text{stepAsym} + 45 \cdot \text{strideAsym} + 20 \cdot \text{armAsym} + 25 \cdot \text{kneeAsym})$, clamped to $[8, 98]$.
- **Mobility Score**: $40 + 0.25 \cdot \min(\text{cadence}, 130) + 12 \cdot \min(\text{arm}_L + \text{arm}_R, 2) + 0.25 \cdot \min(\bar{\theta}_{\text{knee}}, 70) - 25 \cdot \text{doubleSupportHint}$, clamped to $[5, 98]$.
- **Automaticity Score**: $100 - 180 \cdot \text{stepTimeCV} - 80 \cdot \text{strideTimeCV} - 200 \cdot \text{sway} - 25 \cdot (1 - \text{pathSmoothness})$, clamped to $[5, 98]$.
- **Overall Composite**: $0.25 \cdot \text{stability} + 0.15 \cdot \text{rhythm} + 0.25 \cdot \text{symmetry} + 0.15 \cdot \text{mobility} + 0.20 \cdot \text{automaticity}$.

---

## 2. Logic Chain

From direct source code inspection, the mathematical and algorithmic processing pipeline flows as follows:

```
Video File Upload / Sample Selection
          │
          ▼
MediaPipe Pose Detection (`pose.ts`)
  - Scaled to maxSide 720px (`detectPosesOnVideoFrame`)
  - Runs in `IMAGE` mode on sampled video frames
          │
          ▼
Scan Pass & Multi-Person Tracking (`analysis.ts`: `matchPeople`)
  - 2D Hip Center ($LM_{23}, LM_{24}$) Euclidean distance matching ($d \le 0.22$)
  - Track priority ranking: $3 \cdot \text{frames} + 80 \cdot \text{area} + 8 \cdot \text{hipY}$
          │
          ▼
Analysis Pass Frame Extraction (`GaitApp.tsx`)
  - Sub-samples video to target FPS ($7-10$ FPS, max 100 frames)
  - Distance & area gated tracking ($d \le 0.20$, $\text{score} = 2 \cdot \text{area} - 3 \cdot d$)
          │
          ▼
View Angle Detection (`analysis.ts`: `detectViewAngle`)
  - Normalized shoulder width, hip depth $Z$, vertical limb separation, lateral velocity
  - Classifies into "sagittal", "frontal", "oblique", or "unknown"
          │
          ▼
Signal Smoothing & Feature Extraction (`analysis.ts`)
  - 5-point boxcar moving average (`smooth`)
  - Kinematic metrics: Cadence, Step Time, Asymmetries, Sway, Bounce, Arm Swing, Knee Flexion, Step Width, Pelvic Obliquity, CV
          │
          ▼
Step Event Detection (`analysis.ts`)
  - Multi-strategy cascade (Ankle $Y$ peaks, Frontal Stance, Hip Bounce, Ankle Crossovers, Autocorrelation)
  - Interval deduplication ($< 0.28$s floor)
          │
          ▼
Composite Scoring & Heuristic Interpretation (`ratings.ts`, `guesses.ts`)
  - Domain scores ($0-100$) and 5-band rating system
  - Rule-based hypothesis decision tree (`EducatedGuess`)
```

### Algorithmic Flaws & Signal Processing Limitations

1. **Primitive Filter Choice (Boxcar Filter)**:
   - *Observation*: `smooth(values, 5)` in `analysis.ts` line 23 uses a simple unweighted boxcar filter.
   - *Reasoning*: A boxcar filter has poor frequency stopband attenuation (sidelobes decaying at only -20 dB/dec) and introduces unequal attenuation across frequencies. In biomechanical signal processing (e.g., Winter, *Biomechanics and Motor Control of Human Movement*), kinematic landmark trajectories must be filtered using a zero-phase 4th-order low-pass Butterworth filter with a 6 Hz cutoff frequency to eliminate high-frequency pose jitter without phase distortion.
2. **Absence of True Gait Event Definitions (Heel Strike & Toe Off)**:
   - *Observation*: Step events are detected by looking for local maxima of raw image $Y$ ankle coordinates (`leftY`, `rightY`) or crossovers.
   - *Reasoning*: Ankle image $Y$ peaks do NOT correspond to the instant of foot-ground Initial Contact (Heel Strike) or Terminal Contact (Toe Off). True biomechanical gait event detection algorithms (e.g., Zeni et al., 2008, *Gait & Posture*) use velocity zero-crossings or horizontal position differences between foot/heel landmarks and pelvic center ($\Delta x = x_{\text{heel}} - x_{\text{hip}}$). Without true IC and TC detection, stance phase, swing phase, single support, and double support durations cannot be calculated accurately.
3. **Severe Temporal Under-Sampling (FPS Bottleneck)**:
   - *Observation*: `GaitApp.tsx` lines 284-285 cap analysis frames at `sampleCount = Math.min(100, Math.floor(duration * targetFps))` where `targetFps` is only $7-10$ FPS.
   - *Reasoning*: At 10 FPS, frame intervals are $100$ ms. A typical step duration is $500$ ms ($5$ frames). Peak detection on a 10 FPS signal has a discretization error of $\pm 50$ ms ($\pm 10\%$). This temporal jitter directly inflates the Standard Deviation of step intervals, corrupting `stepTimeCV` and `strideTimeCV` with artificial measurement noise! Standard video gait analysis requires $\ge 30$ FPS (ideally 60 FPS).
4. **2D Projection & Normalization Artifacts**:
   - *Observation*: All spatial parameters (sway, bounce, step width, stride length) are normalized by torso height $h_{\text{torso}} = \text{dist}(\text{shoulder}_{\text{mid}}, \text{hip}_{\text{mid}})$.
   - *Reasoning*: In 2D monocular video, as a person walks away from or toward the camera, depth variations cause non-linear perspective changes. Additionally, upper body tilt, shoulder sway, or garment movement causes $h_{\text{torso}}$ to fluctuate frame-to-frame, introducing multiplicative noise into all normalized metrics. Furthermore, 2D knee angles calculated via `angleDeg` neglect out-of-plane leg rotation (hip internal/external rotation), distorting true knee flexion angles.
5. **No Metric Calibration (Absence of Real-World Velocity & Stride Length)**:
   - *Observation*: Gait-lab does not compute real-world gait speed ($m/s$) or stride length ($m$). Stride length is only expressed as normalized hip travel per step relative to torso height.
   - *Reasoning*: Gait speed ($m/s$) is recognized in clinical literature as the "6th vital sign". Without camera calibration or pixel-to-meter scaling factors (e.g. using subject height or floor reference markers), true spatial parameters cannot be reported.
6. **Heuristic Arbitrary Score Weightings**:
   - *Observation*: Composite domain scores (`stabilityScore`, `rhythmScore`, `symmetryScore`, `mobilityScore`, `automaticityScore`) use arbitrary linear weighting constants (e.g., $220 \cdot \text{sway} + 180 \cdot \text{bounce}$).
   - *Reasoning*: These equations are uncalibrated empirical formulas without validation against clinical normative datasets or gold-standard 3D motion capture systems.

---

## 3. Caveats

- **Scope Limit**: Investigation was strictly read-only per agent identity constraints. No modifications were made to source files under `src/` or `scripts/`.
- **Runtime Environment**: Analysis was conducted via static code inspection and review of project execution scripts (`scripts/analyze-sample.mjs`, `scripts/test-gait.mjs`).
- **Hardware Acceleration**: MediaPipe Pose Landmarker fallback to CPU delegate occurs when WebGL/GPU delegate is unavailable (e.g. headless browser environments), which affects frame processing speed but not algorithmic logic.

---

## 4. Conclusion

`gait-lab` provides a robust client-side monocular pose processing pipeline with multi-person tracking, angle detection, multi-strategy step detection, and heuristic reporting. However, its mathematical and signal processing foundation exhibits key limitations:
1. **Filtering**: Primitive 5-point boxcar moving average filter causes phase lag and improper high-frequency noise removal.
2. **Gait Events**: Relies on image $Y$ ankle extrema rather than true biomechanical Initial Contact (Heel Strike) and Terminal Contact (Toe Off) algorithms (e.g., Zeni et al. coordinate difference method).
3. **Sampling Rate**: Capped at $7-10$ FPS (max 100 frames), introducing up to $\pm 50$ ms temporal jitter that falsely inflates step-time variability (`stepTimeCV`).
4. **Spatial Normalization**: Normalization by 2D torso height without camera calibration or 3D coordinate reconstruction limits output to relative indices rather than calibrated physical metrics ($m/s$, meters).
5. **Score Calibration**: Composite domain scores use uncalibrated heuristic formulas.

---

## 5. Verification Method

### How to Independently Verify Findings

1. **Inspect Filtering & Signal Processing Logic**:
   - Open `src/lib/gait/analysis.ts` at line 23 (`smooth`) and line 582 (`detrend`). Confirm boxcar window size of 5 and linear detrending formula.
2. **Inspect Step Event Detection Algorithms**:
   - View `src/lib/gait/analysis.ts` lines 231-341. Confirm strategies A-E (ankle Y local maxima, frontal stance velocity gate, hip bounce, crossovers, and autocorrelation fallback).
3. **Inspect Frame Sampling Constraints**:
   - View `src/components/gait/GaitApp.tsx` lines 284-285. Confirm `sampleCount = Math.min(100, Math.max(24, Math.floor(duration * targetFps)))` where `targetFps` is $7-10$ FPS.
4. **Inspect Mathematical Metrics & Composite Score Weightings**:
   - View `src/lib/gait/analysis.ts` lines 343-496. Confirm exact metric formulas and domain score penalty multipliers.
5. **Run Existing Test & Analysis Scripts**:
   - Execute test scripts to verify full pipeline execution without regression:
     - `node scripts/brand-check.mjs`
     - `node scripts/analyze-sample.mjs` (requires local dev server on port 8080)
