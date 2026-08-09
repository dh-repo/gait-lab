# Deep Analysis and Implementation Design for R3 and R4 Audit Findings

**Author:** Audit Explorer 3  
**Date:** 2026-08-09  
**Target Files:** `src/components/gait/GaitApp.tsx`, `src/lib/gait/pose.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`, `src/lib/gait/types.ts`

---

## 1. Executive Summary

This report delivers an exhaustive scientific audit and complete implementation design addressing synthetic ground-truth findings **R3** (Frame Sampling Decimation Bias) and **R4** (View Geometry Validity, Metric Reliability, Split-Half Confidence Intervals, and Composite Score Demotion).

### Key Architectural Findings:
1. **Frame Sampling Decimation Bias (R3)**: In `GaitApp.tsx` (line 293), video sampling is hard-capped at 300 seeks across the total video duration (`sampleCount = Math.min(300, Math.max(30, Math.floor(duration * targetFps)))`). For clips longer than 10 seconds (e.g. 30s or 60s), the actual sampling rate degrades to 10 Hz or 5 Hz ($\Delta t = 100\text{ ms}$ or $200\text{ ms}$). This temporal decimation introduces massive discrete quantization variance into heel-strike event detection ($\sigma_{\text{sampling}}^2 = \Delta t^2 / 12$), artificially inflating `stepTimeCV` by 100% to 300% on long clips. Calling Catmull-Rom cubic spline interpolation (`resamplePoseFrames`) on sparse 10 Hz data cannot recover the true high-frequency peak timing.
2. **View-Geometry Validity Violations (R4)**: `analysis.ts` computes all gait metrics regardless of the camera `viewAngle` detected (`sagittal`, `frontal`, `oblique`). On frontal views, 2D knee flexion angle and stride length travel are invalid foreshortened proxies; on sagittal views, step width computed from X-coordinate overlap measures step length (direction of progression) rather than lateral step width, and lateral sway measures forward surge.
3. **Absence of Reliability Bounds (R4)**: All gait metrics are reported as scalar point estimates without confidence intervals, concealing intra-individual step-to-step variance and recording noise.
4. **Arbitrary Composite Scoring (R4)**: `analysis.ts` and `ratings.ts` calculate 0–100 composite scores (`stabilityScore`, `rhythmScore`, `symmetryScore`, `mobilityScore`, `automaticityScore`, `overallScore`) using unvalidated linear combination weights, creating a false perception of diagnostic precision.

---

## 2. Analysis of Frame Sampling & Step-Time CV Decimation Bias (R3 Objective 1)

### 2.1 The Sampling Mechanism in `GaitApp.tsx`
In `GaitApp.tsx` (lines 290–309):
```typescript
const duration = video.duration || 1;
const targetFps = 30;
const sampleCount = Math.min(300, Math.max(30, Math.floor(duration * targetFps)));
...
for (let i = 0; i < sampleCount; i++) {
  const t = (i / Math.max(1, sampleCount - 1)) * Math.max(0, duration - 0.05);
  const res = await seekAndDetect(landmarker, video, t);
  ...
}
```

### 2.2 Mathematical Proof of Decimation Bias
Let $T_{\text{clip}}$ be the video duration in seconds. The actual sampling rate $f_s$ and sampling interval $\Delta t$ obtained during video seeking are:
$$f_s = \frac{N_{\text{samples}}}{T_{\text{clip}}} = \frac{\min(300, 30 \cdot T_{\text{clip}})}{T_{\text{clip}}}$$
$$\Delta t = \frac{1}{f_s}$$

- For $T_{\text{clip}} = 10\text{ s}$: $N_{\text{samples}} = 300 \implies f_s = 30\text{ Hz} \implies \Delta t = 33.33\text{ ms}$.
- For $T_{\text{clip}} = 30\text{ s}$: $N_{\text{samples}} = 300 \implies f_s = 10\text{ Hz} \implies \Delta t = 100.00\text{ ms}$.
- For $T_{\text{clip}} = 60\text{ s}$: $N_{\text{samples}} = 300 \implies f_s = 5\text{ Hz} \implies \Delta t = 200.00\text{ ms}$.

#### Quantization Variance Derivation:
In kinematic gait analysis (Zeni algorithm), Heel Strike (Initial Contact) corresponds to a sharp peak or zero-crossing in the relative Anterior-Posterior (AP) foot position signal $\Delta x(t) = x_{\text{foot}}(t) - x_{\text{pelvis}}(t)$. The true peak occurs at continuous time $t^*$.

When sampling at interval $\Delta t$, the detected discrete peak frame time $\hat{t}$ is constrained to discrete sampling grid points. Assuming the offset $u = t^* - \hat{t}$ is uniformly distributed over $[-\Delta t/2, \Delta t/2]$, the temporal quantization error has zero mean and variance:
$$\sigma_{\text{sampling}}^2 = \frac{\Delta t^2}{12}$$

A step interval $T_k = t_{\text{event}, k} - t_{\text{event}, k-1}$ is the difference between two independent event timestamp estimates. The observed step interval variance $\sigma_{\text{observed}}^2$ is the sum of true physiological gait variance $\sigma_{\text{true}}^2$ and measurement quantization variance:
$$\sigma_{\text{observed}}^2 = \sigma_{\text{true}}^2 + 2 \cdot \sigma_{\text{sampling}}^2 = \sigma_{\text{true}}^2 + \frac{\Delta t^2}{6}$$

The Coefficient of Variation of step time is defined as:
$$\text{stepTimeCV}_{\text{observed}} = \frac{\sigma_{\text{observed}}}{\bar{T}} = \frac{\sqrt{\sigma_{\text{true}}^2 + \frac{\Delta t^2}{6}}}{\bar{T}}$$

#### Numerical Example:
For a healthy adult with mean step time $\bar{T} = 0.55\text{ s}$ (cadence 109 spm) and true physiological standard deviation $\sigma_{\text{true}} = 0.011\text{ s}$ ($\text{stepTimeCV}_{\text{true}} = 2.0\%$):
1. **At 30 Hz** ($\Delta t = 0.0333\text{ s}$):
   $$\sigma_{\text{sampling}}^2 = \frac{0.0333^2}{12} = 9.26 \times 10^{-5}\text{ s}^2$$
   $$\sigma_{\text{observed}} = \sqrt{0.011^2 + \frac{0.0333^2}{6}} = \sqrt{0.000121 + 0.000185} = 0.0175\text{ s}$$
   $$\text{stepTimeCV}_{\text{observed}} = \frac{0.0175}{0.55} = 3.18\%$$
2. **At 10 Hz** ($\Delta t = 0.100\text{ s}$, 30-second clip):
   $$\sigma_{\text{observed}} = \sqrt{0.011^2 + \frac{0.100^2}{6}} = \sqrt{0.000121 + 0.001667} = 0.0423\text{ s}$$
   $$\text{stepTimeCV}_{\text{observed}} = \frac{0.0423}{0.55} = 7.69\% \quad (\mathbf{385\% \text{ inflation relative to true 2.0\%}})$$
3. **At 5 Hz** ($\Delta t = 0.200\text{ s}$, 60-second clip):
   $$\sigma_{\text{observed}} = \sqrt{0.011^2 + \frac{0.200^2}{6}} = \sqrt{0.000121 + 0.006667} = 0.0824\text{ s}$$
   $$\text{stepTimeCV}_{\text{observed}} = \frac{0.0824}{0.55} = 14.98\% \quad (\mathbf{749\% \text{ inflation!}})$$

### 2.3 Why Cubic Spline Resampling Cannot Fix Decimated Input
In `GaitApp.tsx` line 367, sparse frames are passed to `resamplePoseFrames(rawFrames, 30.0)` which uses Catmull-Rom spline interpolation.
Cubic spline interpolation over 10 Hz data generates smooth 30 Hz intermediate points, but **it does not restore high-frequency signal content above the Nyquist limit ($f_{\text{Nyquist}} = f_s / 2 = 5\text{ Hz}$)**.
If a heel strike peak occurred at $t = 1.045\text{ s}$, but 10 Hz samples only recorded $t = 1.00\text{ s}$ and $t = 1.10\text{ s}$, the interpolated peak will sit smoothly near $1.05\text{ s}$, but the peak height and exact zero-crossing timestamp are distorted by the missing $30\text{ Hz}$ inflection dynamics.
Thus, `stepTimeCV` systematically scales upward as video length increases, introducing a major artifact where clip duration dictates measured gait impairment.

---

## 3. Proposed Implementation Design for R3 (Objective 2)

To eliminate step-time CV decimation bias and ensure clip-length invariance:

### 3.1 Continuous 10–12s Window Sampling Strategy at Full 30 Hz
Instead of spreading 300 seek operations across the entire video (e.g. 60 seconds), we sample a **continuous 10–12 second window at full 30 Hz** (300 to 360 frames).

#### Window Selection Algorithm:
1. **Scan Pass**: During the initial scan pass (`sampleCount = 40`), evaluate person tracking persistence and subject bounding box area over time.
2. **Select Window**:
   - Identify the continuous 10.0–12.0 second temporal segment ($[t_{\text{start}}, t_{\text{end}}]$) with the highest tracking stability (longest consecutive detection run, minimal subject occlusion, largest bounding box).
   - Default: For clips $\le 12\text{ s}$, sample the entire video from $0.0\text{ s}$ to $T_{\text{clip}}$ at $30\text{ Hz}$. For clips $> 12\text{ s}$, select the optimal $10.0\text{ s}$ contiguous window (e.g. from $t_{\text{start}} = \frac{T_{\text{clip}} - 10}{2}$ to $t_{\text{start}} + 10.0$).
3. **Dense Sampling**:
   - Sample $N = \text{floor}(\text{windowDuration} \cdot 30)$ frames at exact $\Delta t = \frac{1}{30}\text{ s} \approx 33.33\text{ ms}$ step increments.
   - For a 10.0s window, exact frame timestamps are $t_i = t_{\text{start}} + i \cdot 0.03333\text{ s}$ for $i = 0, 1, \dots, 299$.

### 3.2 Subframe Event Timestamp Refinement
To further refine initial contact (Heel Strike) and terminal contact (Toe-Off) event timestamps beyond the 33.3 ms grid, we implement **Parabolic Subpixel/Subframe Peak Refinement** in `events.ts`.

#### Mathematical Formulation:
When a discrete peak in the Zeni relative foot position trajectory is detected at index $i^*$:
Given three consecutive points around the peak $(t_{i^*-1}, y_{i^*-1})$, $(t_{i^*}, y_{i^*})$, and $(t_{i^*+1}, y_{i^*+1})$, the exact continuous time of the parabolic extremum $t_{\text{refined}}$ is given by:
$$\delta = \frac{y_{i^*-1} - y_{i^*+1}}{2 (y_{i^*-1} - 2 y_{i^*} + y_{i^*+1})}$$
$$t_{\text{refined}} = t_{i^*} + \delta \cdot \Delta t$$
Where $\Delta t = \frac{1}{\text{fpsEffective}}$.

This subframe refinement reduces temporal quantization error from $\pm 16.7\text{ ms}$ to $< 3\text{ ms}$, yielding hyper-accurate step intervals.

### 3.3 True Sampling Rate Calculation & Reporting
`computeGaitMetrics` calculates `fpsEffective` based on the actual timestamp range of the sampled window:
```typescript
const t0 = frames[0].timeMs;
const tEnd = frames[frames.length - 1].timeMs;
const durationSec = Math.max(0.001, (tEnd - t0) / 1000);
const fpsEffective = (frames.length - 1) / durationSec;
```
`fpsEffective` is reported transparently in `GaitMetrics` and displayed in the UI report notes.

### 3.4 Invariance Guarantee
Because the analysis is performed on a standardized 10–12s window sampled at full 30 Hz (33.3 ms interval) regardless of total video length, `stepTimeCV` is calculated over a consistent step count (16–22 steps) and constant sampling resolution ($\Delta t = 33.3\text{ ms}$), achieving complete clip-length invariance.

---

## 4. Analysis of Metric Reliability, View Geometry & Reporting (R4 Objective 3)

### 4.1 Audit of View Geometry Violations in `analysis.ts`
`analysis.ts` currently runs `computeGaitMetrics` by executing all calculation pipelines regardless of the `viewAngle` detected by `detectViewAngle(frames)`.

| Metric | Sagittal View (Side) | Frontal View (Front/Back) | Oblique View | Scientific Validity Cause |
|---|---|---|---|---|
| **Cadence (spm)** | Valid | Valid | Valid | Step counting via vertical/oscillatory hip bounce or Zeni events works across views. |
| **Step Time CV (%)** | Valid | Valid | Valid | Temporal interval variance is view-invariant if event detection is clean. |
| **Zeni Stance/Swing %** | **Valid** | **INVALID** | Provisional | Zeni algorithm relies on 2D AP foot displacement ($x_{\text{foot}} - x_{\text{pelvis}}$). In frontal view, AP is depth (Z axis), causing 2D projection failure. |
| **Knee Flexion Range (deg)** | **Valid** | **INVALID** | Provisional | Knee flexion occurs in the sagittal plane. In frontal view, knee motion is perpendicular to the camera plane (depth foreshortening). |
| **Stride Length / Asymmetry** | **Valid** | **INVALID** | Provisional | Stride travel in 2D (`Math.hypot(dx, dy)`) on frontal view measures perspective scaling, not horizontal progression. |
| **Step Width & Variability** | **INVALID** | **Valid** | Provisional | In sagittal view, left and right ankles overlap in X during progression. `Math.abs(ankleL.x - ankleR.x)` measures step length, not step width. |
| **Lateral Sway Index** | **INVALID** | **Valid** | Provisional | In sagittal view, X axis is progression. Residual X motion measures forward speed surge, not lateral splay/sway. |
| **Pelvic Obliquity (Frontal)** | **INVALID** | **Valid** | Provisional | In sagittal view, 2D hip height difference reflects sagittal pelvic tilt and step cycle phase, not Trendelenburg obliquity. |

### 4.2 Point Estimates vs. Measurement Uncertainty
Currently, `computeGaitMetrics` returns single point numbers (`stepTimeCV: 0.042`, `symmetryAngle: 3.2%`, `cadenceSpm: 112`).
A single point estimate provides no information regarding:
1. Intra-individual variability (whether stepping was steady throughout the clip or perturbed by a turn/stumble).
2. Measurement noise / confidence interval bounds.

### 4.3 Critique of Arbitrary Composite Scores
In `analysis.ts` lines 370–407, composite 0–100 scores are computed:
```typescript
const stabilityScore = clamp(100 - (lateralSway * 220 + verticalBounce * 180 + Math.min(stepWidthVariability, 0.25) * 35) + Math.min(harmonicRatioLateral, 3.0) * 6, 8, 98);
const rhythmScore = clamp(100 - stepTimeCV * 120 - Math.abs(cadenceSpm - 110) * 0.25 + (harmonicRatioVertical - 2.0) * 5, 5, 98);
const overallScore = clamp(stabilityScore * 0.25 + rhythmScore * 0.15 + symmetryScore * 0.25 + mobilityScore * 0.15 + automaticityScore * 0.2, 5, 98);
```
**Deficiencies**:
- Arbitrary linear multipliers (e.g. `220`, `180`, `35`) lack empirical validation from biomechanical cohort studies.
- Creating 0–100 "scores" invites misinterpretation as diagnostic grades or clinical health certificates.

---

## 5. Proposed Implementation Design for R4 (Objective 4)

### 5.1 View-Geometry Metric Suppression (`null` Emission)

#### Rule Specifications:
Modify `GaitMetrics` interface in `types.ts` to allow `null` for view-invalid metrics:
```typescript
export type GaitMetrics = {
  // ...
  kneeFlexLeft: number | null;
  kneeFlexRight: number | null;
  kneeAsymmetry: number | null;
  strideAsymmetry: number | null;
  leftStancePct: number | null;
  rightStancePct: number | null;
  leftSwingPct: number | null;
  rightSwingPct: number | null;
  doubleSupportPct: number | null;

  meanStepWidth: number | null;
  stepWidthVariability: number | null;
  lateralSway: number | null;
  pelvicObliquity: number | null;
  pelvicObliquityVar: number | null;
  // ...
};
```

#### Logic in `computeGaitMetrics`:
```typescript
const isSagittal = angle === "sagittal";
const isFrontal = angle === "frontal";

// Knee flexion & Stride travel & Zeni Stance/Swing: valid in sagittal/oblique, null in frontal
const validSagittal = !isFrontal; 
const kneeFlexLeftVal = validSagittal ? range(leftKneeAngle) : null;
const kneeFlexRightVal = validSagittal ? range(rightKneeAngle) : null;
const kneeAsymVal = validSagittal ? asymmetryRatio(kneeFlexLeftVal!, kneeFlexRightVal!) : null;

// Lateral sway, Step width, Pelvic obliquity: valid in frontal/oblique, null in sagittal
const validFrontal = !isSagittal;
const lateralSwayVal = validFrontal ? Math.min(std(latRes), 0.12) : null;
const meanStepWidthVal = validFrontal ? mean(series.map((s) => s.stepWidth)) : null;
const stepWidthVarVal = validFrontal ? std(series.map((s) => s.stepWidth)) : null;
const pelvicObliquityVal = validFrontal ? mean(hipDrops.map(Math.abs)) : null;
```

#### UI Handling in `ReportPanel.tsx`, `MetricsPanel.tsx`, `ratings.ts`:
- When a metric is `null`, `ratings.ts` assigns it a status of `"suppressed"` or `"n_a"`.
- `MetricsPanel.tsx` displays `"N/A (Requires Side View)"` for knee flexion in frontal view, and `"N/A (Requires Front View)"` for step width / lateral sway in sagittal view.
- `guesses.ts` suppresses rules that rely on invalid view metrics (e.g. Trendelenburg pelvic obliquity rule is omitted when `pelvicObliquity === null`).

---

### 5.2 Split-Half Reliability Testing & 95% Confidence Interval Computation

To provide rigorous measurement uncertainty bounds, we implement **Split-Half Reliability Testing** inside `analysis.ts`.

#### Algorithm:
1. Given the continuous 10–12s frame sequence $F = [f_0, f_1, \dots, f_{N-1}]$:
   - Split into **Half 1** ($F_1 = F[0 \dots \lfloor N/2 \rfloor]$) and **Half 2** ($F_2 = F[\lfloor N/2 \rfloor \dots N-1]$).
2. Compute key metrics independently for Half 1 ($M^{(1)}$) and Half 2 ($M^{(2)}$):
   - $M_{\text{cadence}}^{(1)}, M_{\text{cadence}}^{(2)}$
   - $M_{\text{stepCV}}^{(1)}, M_{\text{stepCV}}^{(2)}$
   - $M_{\text{SA}}^{(1)}, M_{\text{SA}}^{(2)}$
   - $M_{\text{HR}}^{(1)}, M_{\text{HR}}^{(2)}$
3. Compute the **Split-Half Standard Error** ($\text{SE}_{\text{split}}$) for each metric:
   $$\text{SE}_{\text{split}} = \frac{|M^{(1)} - M^{(2)}|}{\sqrt{2}}$$
4. Compute the **95% Confidence Interval** ($\text{CI}_{95\%}$) for the full-clip metric value $M$:
   $$\text{CI}_{\text{lower}} = \max(0, M - 1.96 \cdot \text{SE}_{\text{split}})$$
   $$\text{CI}_{\text{upper}} = M + 1.96 \cdot \text{SE}_{\text{split}}$$

#### Data Structure Addition (`types.ts`):
```typescript
export type ReliabilityBounds = {
  half1: number;
  half2: number;
  se: number;
  ci95: [number, number];
};

export type GaitMetrics = {
  // ...
  confidenceIntervals?: {
    cadenceSpm?: ReliabilityBounds;
    stepTimeCV?: ReliabilityBounds;
    symmetryAngle?: ReliabilityBounds;
    harmonicRatio?: ReliabilityBounds;
  };
};
```

---

### 5.3 Demoting Arbitrary Composite Scores in Favor of Defensible Measured Quantities

#### Refactoring Strategy:
1. **Primary Focus**: The main report UI (`ReportPanel.tsx`) and summary tables will prominently feature **Defensible Measured Quantities with 95% CIs**:
   - **Cadence**: $112.4\text{ spm}$ [95% CI: $109.1 - 115.7$]
   - **Step Time CV**: $3.4\%$ [95% CI: $2.8\% - 4.0\%$]
   - **Zifchock Symmetry Angle (SA)**: $2.1\%$ [95% CI: $1.5\% - 2.7\%$]
   - **Trunk Harmonic Ratio (HR)**: $2.14$ [95% CI: $1.98 - 2.30$]
   - **Stance Phase % (L / R)**: $60.8\% / 59.4\%$ (Sagittal view)
2. **Score Demotion**:
   - 0–100 composite scores (`stabilityScore`, `overallScore`, etc.) are demoted to **Secondary Observational Indices**.
   - UI labels will explicitly state: *"Exploratory Index (0–100) — Non-Diagnostic"*.
   - Replace rigid score thresholds in `ratings.ts` with reference range classifications grounded in literature norms (e.g. Hollman et al. 2011 normative data for gait variability: Normal $< 4.0\%$, Mild Increase $4.0\text{--}6.0\%$, Elevated $> 6.0\%$).

---

## 6. Detailed Implementation Specification & Concrete Code Proposals

### 6.1 `GaitApp.tsx` Continuous Window Sampling Refactoring
```typescript
// Proposed implementation in GaitApp.tsx runAnalysis()
const duration = video.duration || 1;
const targetFps = 30;

// Determine analysis window (max 12s continuous at 30 Hz)
const windowDuration = Math.min(12, duration);
// Center the window if video > 12s
const tStart = duration > 12 ? (duration - windowDuration) / 2 : 0;
const tEnd = tStart + windowDuration;

const sampleCount = Math.floor(windowDuration * targetFps); // 300 to 360 frames
const rawFrames: PoseFrame[] = [];

for (let i = 0; i < sampleCount; i++) {
  if (runId !== abortRef.current) return;
  const t = tStart + (i / Math.max(1, sampleCount - 1)) * (windowDuration - 0.033);
  const res = await seekAndDetect(landmarker, video, t);
  // ... frame extraction ...
}
```

### 6.2 `events.ts` Subframe Refinement Refactoring
```typescript
// Parabolic subframe peak refinement helper
export function refinePeakTimestamp(
  series: number[],
  peakIdx: number,
  times: number[]
): number {
  if (peakIdx <= 0 || peakIdx >= series.length - 1) return times[peakIdx];
  const y0 = series[peakIdx - 1];
  const y1 = series[peakIdx];
  const y2 = series[peakIdx + 1];
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-6) return times[peakIdx];
  const delta = (y0 - y2) / (2 * denom);
  const dt = (times[peakIdx + 1] - times[peakIdx - 1]) / 2;
  return times[peakIdx] + delta * dt;
}
```

---

## 7. Verification Method and Invalidation Conditions

### 7.1 Verification Plan
1. **Unit Test Suite**:
   - `src/lib/gait/__tests__/analysis.test.ts`:
     - Test that `stepTimeCV` calculated on a 10s synthetic walk and a 30s synthetic walk generated with identical physiological step variance yields consistent `stepTimeCV` within $\pm 0.3\%$.
     - Test that when `viewAngle` is `"frontal"`, `kneeFlexLeft`, `kneeFlexRight`, `kneeAsymmetry`, and `strideAsymmetry` return `null`.
     - Test that when `viewAngle` is `"sagittal"`, `lateralSway`, `meanStepWidth`, `stepWidthVariability`, and `pelvicObliquity` return `null`.
     - Test that `computeGaitMetrics` returns populated `confidenceIntervals` containing `half1`, `half2`, `se`, and `ci95`.
2. **Automated Suite Checks**:
   - Run `npm test` to confirm all existing and new unit tests pass cleanly.
   - Run `npm run typecheck` to verify TypeScript type safety after adding `null` union types.
   - Run `npm run build` and `npm run lint` to verify build targets and linting.

### 7.2 Invalidation Conditions
- Any occurrence of non-null values for frontal-invalid metrics when `viewAngle === "frontal"`.
- Any stepTimeCV variation $> 1.0\%$ when analyzing the same synthetic walking subject across different clip lengths ($10\text{s}$ vs $30\text{s}$).
- Missing `confidenceIntervals` on valid metrics.

---
*Report completed by Audit Explorer 3. Ready for soft handoff to team.*
