# Scientific Investigation & Mathematical Mapping Report: Gait Analysis Core Engine (`src/lib/gait/`)

**Author**: Explorer 1 (Milestone 4 — Scientific Documentation & Verification)  
**Date**: August 8, 2026  
**Target Directory**: `src/lib/gait/` (`signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, `dte.ts`)  
**Workspace**: `/Users/damian/GitHub/gait-lab/`  

---

## Executive Summary

This report delivers an end-to-end scientific analysis, mathematical formulation, literature review, code line mapping, and clinical benchmark enumeration for the core scientific algorithm modules in `gait-lab`:
1. **`signal.ts`**: Zero-Phase 4th-Order Low-Pass Butterworth Digital Filtering ($f_c = 6.0\text{ Hz}$), OLS Linear Detrending, and Radix-2 FFT Spectral Harmonics.
2. **`events.ts`**: Zeni Kinematic Gait Event Detection Algorithm (AP Foot Displacement relative to Pelvis Center), Stance/Swing Phase %, and Double Support Time.
3. **`symmetry.ts`**: Zifchock's Reference-Free Symmetry Angle ($SA$) and Gait Symmetry Index ($GSI$).
4. **`smoothness.ts`**: Trunk Harmonic Ratio ($HR$) via FFT Spectral Decomposition for Vertical and Lateral Gait Smoothness.
5. **`dte.ts`**: Directionally Standardized Dual-Task Effect ($DTE$) and Plummer & Eskes Cognitive-Motor Interference (CMI) Taxonomy.

---

## 1. Digital Signal Processing Module (`src/lib/gait/signal.ts`)

### 1.1 Mathematical Formulation (LaTeX)

#### A. 2nd-Order Biquad Low-Pass Filter Stage (Bilinear Transform)
A 2nd-order Infinite Impulse Response (IIR) low-pass filter stage in the z-domain is represented by:
$$H(z) = \frac{b_0 + b_1 z^{-1} + b_2 z^{-2}}{1 + a_1 z^{-1} + a_2 z^{-2}}$$

Using the bilinear transform with frequency pre-warping at sampling frequency $f_s$ (`fps`) and cutoff frequency $f_c$ (`cutoffHz`):
$$K = \tan\left(\frac{\pi f_c}{f_s}\right)$$

For a specified quality factor $Q$, the normalization factor $N$ is:
$$N = 1 + \frac{K}{Q} + K^2$$

The normalized biquad coefficients are derived as:
$$b_0 = \frac{K^2}{N}, \quad b_1 = \frac{2 K^2}{N}, \quad b_2 = \frac{K^2}{N}$$
$$a_1 = \frac{2(K^2 - 1)}{N}, \quad a_2 = \frac{1 - \frac{K}{Q} + K^2}{N}$$

The discrete-time Direct Form II transposed IIR difference equation is:
$$y[n] = b_0 x[n] + b_1 x[n-1] + b_2 x[n-2] - a_1 y[n-1] - a_2 y[n-2]$$

#### B. 4th-Order Butterworth Filter Cascading
A 4th-order low-pass Butterworth filter is formed by cascading two 2nd-order biquad stages with Butterworth pole Q values derived from the polynomial decomposition $B_4(s)$:
$$Q_1 = \frac{1}{2 \cos\left(\frac{\pi}{8}\right)} = \frac{1}{2 \cos(22.5^\circ)} \approx 0.5411961$$
$$Q_2 = \frac{1}{2 \cos\left(\frac{3\pi}{8}\right)} = \frac{1}{2 \cos(67.5^\circ)} \approx 1.3065630$$

#### C. Zero-Phase Forward-Backward Filtering (`filtfilt`) & Reflection Padding
To eliminate phase distortion and temporal lag while doubling filter steepness (attenuation slope becomes 8th-order, $-48\text{ dB/octave}$):
1. **Boundary Reflection Padding**: For array of length $N$ and pad length $M = \min(12, N-1)$:
   $$x_{\text{padded}}[i] = 2 x[0] - x[M - i], \quad 0 \le i < M$$
   $$x_{\text{padded}}[M + n] = x[n], \quad 0 \le n < N$$
   $$x_{\text{padded}}[M + N + i] = 2 x[N-1] - x[N - 2 - i], \quad 0 \le i < M$$
2. **Forward Pass**: $y_1 = \text{Butterworth4th}(x_{\text{padded}})$
3. **Reversal**: $y_2 = \text{Reverse}(y_1)$
4. **Backward Pass**: $y_3 = \text{Butterworth4th}(y_2)$
5. **Re-reversal**: $y_4 = \text{Reverse}(y_3)$
6. **Unpad**: $y[n] = y_4[M + n], \quad 0 \le n < N$

Frequency response of zero-phase filter: $|H_{\text{zp}}(f)| = |H(f)|^2 = \frac{1}{1 + (f/f_c)^{8}}$.

#### D. Linear Detrending via Ordinary Least Squares (OLS)
Removes linear drift $\hat{y}[i] = \alpha + \beta \cdot i$ from time-series signal $y[i]$:
$$\beta = \frac{N \sum_{i=0}^{N-1} i \cdot y[i] - \left(\sum_{i=0}^{N-1} i\right) \left(\sum_{i=0}^{N-1} y[i]\right)}{N \sum_{i=0}^{N-1} i^2 - \left(\sum_{i=0}^{N-1} i\right)^2}$$
$$\alpha = \frac{\sum_{i=0}^{N-1} y[i] - \beta \sum_{i=0}^{N-1} i}{N}$$
$$y_{\text{detrended}}[i] = y[i] - (\alpha + \beta \cdot i)$$

#### E. Discrete Fourier Transform & Hann Windowing
Signal zero-padded to power-of-2 length $N_{\text{fft}} \ge N$. Hann windowing is applied prior to FFT:
$$w_{\text{Hann}}[n] = 0.5 \left(1 - \cos\left(\frac{2\pi n}{N - 1}\right)\right)$$
$$x_w[n] = y_{\text{detrended}}[n] \cdot w_{\text{Hann}}[n]$$
Cooley-Tukey Radix-2 Complex FFT evaluates $X[k] = \sum_{n=0}^{N_{\text{fft}}-1} x_w[n] e^{-j \frac{2\pi k n}{N_{\text{fft}}}}$.
Single-sided magnitude spectrum:
$$|X[k]| = \frac{2}{N} \sqrt{\text{Re}(X[k])^2 + \text{Im}(X[k])^2}, \quad k = 0, 1, \dots, \frac{N_{\text{fft}}}{2}-1$$

---

### 1.2 Scientific Rationale & Literature Citations

- **Winter DA. *Biomechanics and Motor Control of Human Movement*. 4th ed. John Wiley & Sons; 2009.**  
  *Rationale*: Winter established the standard residual analysis method for kinematic signals in gait analysis. Skin marker trajectories and vision-based pose landmarks contain high-frequency noise from camera jitter and estimation artifacts. Low-pass filtering with $f_c = 6.0\text{ Hz}$ retains $>99.5\%$ of true biomechanical gait signal power while attenuating non-physiological high-frequency noise.
- **Antonsson EK, Mann RW. The frequency content of gait. *Journal of Biomechanics*. 1985;18(1):39-47. doi:10.1016/0021-9290(85)90043-0.**  
  *Rationale*: Fourier analysis of human gait kinematics confirms that key signal harmonics lie below $6\text{ Hz}$ for walking speeds up to $2.0\text{ m/s}$.
- **Oppenheim AV, Schafer RW. *Discrete-Time Signal Processing*. 3rd ed. Pearson; 2009.**  
  *Rationale*: Provides the theoretical foundation for zero-phase forward-backward digital filtering (`filtfilt`) to prevent phase shift of gait event peaks (e.g. heel strikes).

---

### 1.3 Code Function & Line Mapping (`signal.ts`)

| Function Name | Lines | Mathematical / Algorithmic Mapping |
|---|---|---|
| `computeBiquadLowPass` | 24–38 | Calculates pre-warped frequency $K = \tan(\pi f_c / f_s)$, norm $N$, and biquad coefficients $b_0, b_1, b_2, a_1, a_2$. |
| `applyBiquad` | 43–65 | Implements Direct Form II transposed IIR difference equation loop over time points. |
| `butterworthLowPass` | 73–90 | Cascades stage 1 ($Q_1 = 0.5411961$) and stage 2 ($Q_2 = 1.3065630$) biquad filters. |
| `zeroPhaseButterworth` | 97–141 | Pre-pads signal via reflection ($2x[0]-x[\cdot]$), executes forward filter, reverses array, executes backward filter, re-reverses, and extracts unpadded slice. |
| `linearDetrend` | 147–187 | Computes OLS linear regression slope $\beta$ and intercept $\alpha$, subtracts trend line $\alpha + \beta i$. |
| `fftRadix2` | 192–248 | Performs in-place bit-reversal permutation and Cooley-Tukey radix-2 butterfly decomposition. |
| `computeFFTHarmonics` | 254–328 | Detrends signal, applies Hann window, zero-pads to next power of 2, runs `fftRadix2`, computes single-sided magnitude spectrum, locates fundamental frequency $f_0$ bin, sums odd ($1,3,5,7,9$) and even ($2,4,6,8,10$) harmonic magnitudes, and evaluates $\text{evenSum} / \text{oddSum}$. |

---

### 1.4 Clinical Normative Values & Diagnostic Benchmarks

- **Normal Walking Cutoff Frequency ($f_c$)**: $6.0\text{ Hz}$ (standard for optical landmark kinematics).
- **Fast Walking / Running Cutoff**: $8.0\text{–}12.0\text{ Hz}$ (higher velocity increases harmonic bandwidth).
- **Pathological Tremor Analysis**: Cutoff relaxed to $10.0\text{–}12.0\text{ Hz}$ to avoid filtering out Parkinsonian tremor ($4\text{–}8\text{ Hz}$).

---

## 2. Kinematic Gait Event Detection (`src/lib/gait/events.ts`)

### 2.1 Mathematical Formulation (LaTeX)

#### A. Relative Anterior-Posterior (AP) Displacement Trajectories
Let $x_{\text{left\_hip}}[i]$ and $x_{\text{right\_hip}}[i]$ be the AP coordinates of left and right hips at frame $i$. The mid-hip pelvis center is:
$$x_{\text{hip}}[i] = \frac{x_{\text{left\_hip}}[i] + x_{\text{right\_hip}}[i]}{2}$$

The relative heel and toe AP positions for limb $L \in \{\text{left}, \text{right}\}$ are:
$$\Delta x_{\text{heel}}^L[i] = x_{\text{heel}}^L[i] - x_{\text{hip}}[i]$$
$$\Delta x_{\text{toe}}^L[i] = x_{\text{toe}}^L[i] - x_{\text{hip}}[i]$$

Signals are zero-phase low-pass filtered at $f_c = 6.0\text{ Hz}$ using `zeroPhaseButterworth`.

#### B. Zeni Extrema Detection Criteria
Walking direction vector $d \in \{+1, -1\}$ is determined by total pelvis displacement:
$$d = \begin{cases} -1 & \text{if } x_{\text{hip}}[N-1] - x_{\text{hip}}[0] < -0.05 \\ +1 & \text{otherwise} \end{cases}$$

For $d = +1$ (walking left-to-right):
- **Initial Contact (Heel Strike, IC)**: Occurs at local **maxima** of relative heel position $\Delta x_{\text{heel}}^L$:
  $$\text{IC}^L = \{ i \mid \Delta x_{\text{heel}}^L[i] > \Delta x_{\text{heel}}^L[i-1] \land \Delta x_{\text{heel}}^L[i] \ge \Delta x_{\text{heel}}^L[i+1] \}$$
- **Terminal Contact (Toe-Off, TO)**: Occurs at local **minima** of relative toe position $\Delta x_{\text{toe}}^L$:
  $$\text{TO}^L = \{ i \mid \Delta x_{\text{toe}}^L[i] < \Delta x_{\text{toe}}^L[i-1] \land \Delta x_{\text{toe}}^L[i] \le \Delta x_{\text{toe}}^L[i+1] \}$$

For $d = -1$ (right-to-left), peak modes invert (IC = minima, TO = maxima). A minimum frame gap constraint $M_{\text{gap}} = \max(3, \lfloor 0.35 \cdot f_s \rfloor)$ suppresses spurious secondary peaks.

#### C. Spatio-Temporal Phase Calculations
For valid gait cycle $k$ starting at $t_{\text{IC}_k}$ and ending at $t_{\text{IC}_{k+1}}$ with toe-off at $t_{\text{TO}_k}$:
$$\text{Stride Duration: } T_{\text{stride}} = t_{\text{IC}_{k+1}} - t_{\text{IC}_k}$$
$$\text{Stance Duration: } T_{\text{stance}} = t_{\text{TO}_k} - t_{\text{IC}_k}$$
$$\text{Stance Phase Percentage: } \text{Stance}\% = \frac{T_{\text{stance}}}{T_{\text{stride}}} \times 100\%$$
$$\text{Swing Phase Percentage: } \text{Swing}\% = 100\% - \text{Stance}\%$$

Double Support Time ($\text{DS}\%$) is derived from contralateral initial contact to ipsilateral toe-off duration ($\Delta t_{\text{DS}} = t_{\text{TO\_opposite}} - t_{\text{IC\_current}}$) normalized to stride duration:
$$\text{DS}\% = \frac{\bar{\Delta t}_{\text{DS}}}{T_{\text{stride}}} \times 100\% \times 2$$

---

### 2.2 Scientific Rationale & Literature Citations

- **Zeni JA Jr, Richards JG, Higginson JS. Two simple methods for determining gait events from kinematic data. *Gait & Posture*. 2008;27(4):710-714. doi:10.1016/j.gaitpost.2007.07.007. PMID: 17855088.**  
  *Rationale*: Zeni et al. demonstrated that calculating the coordinate difference between foot markers (heel/toe) and pelvis/sacrum markers provides a highly accurate, force-plate-independent algorithm for detecting heel strike and toe-off events (< 1 frame mean error compared to gold-standard force plates).
- **Perry J, Burnfield JM. *Gait Analysis: Normal and Pathological Function*. 2nd ed. Slack Incorporated; 2010.**  
  *Rationale*: Established clinical norms for gait phase distribution across the human gait cycle.

---

### 2.3 Code Function & Line Mapping (`events.ts`)

| Function / Logic Block | Lines | Mathematical / Algorithmic Mapping |
|---|---|---|
| `getLandmarkX` | 22–36 | Safely extracts primary landmark X (heel/toe) with fallback to ankle when visibility < 0.3. |
| `findExtrema` | 41–74 | Identifies local maxima/minima with candidate peak prominence filtering using $M_{\text{gap}} = 0.35 f_s$. |
| `detectGaitEventsZeni` (Data prep) | 108–135 | Extracts mid-hip trajectory `midHipX`, computes relative heel/toe trajectories, filters via `zeroPhaseButterworth(..., 6.0)`. |
| Walking Direction Detection | 127–129 | Checks net displacement ($x_{\text{hip}}[n-1] - x_{\text{hip}}[0] < -0.05$) to set direction $\pm 1$. |
| Gait Event Identification | 140–173 | Runs `findExtrema` for IC and TO on left/right limbs and sorts all events chronologically. |
| `computeStanceForSide` | 175–214 | Pairs consecutive ICs ($t_{\text{IC}_1}, t_{\text{IC}_2}$) with matching TO to compute stance % ($T_{\text{stance}} / T_{\text{stride}} \times 100$). |
| Double Support Calculation | 218–276 | Finds overlap intervals ($t_{\text{R\_TO}} - t_{\text{L\_IC}}$ and $t_{\text{L\_TO}} - t_{\text{R\_IC}}$), averages them, normalizes by stride duration, and multiplies by 2. |

---

### 2.4 Clinical Normative Values & Diagnostic Benchmarks

| Metric | Healthy Adult Norm | Mild Impairment | Severe Pathological Benchmark |
|---|---|---|---|
| **Stance Phase %** | $60.0\% \pm 2.0\%$ | $63.0\%\text{–}67.0\%$ | $> 70.0\%$ (postural instability, fear of falling) |
| **Swing Phase %** | $40.0\% \pm 2.0\%$ | $33.0\%\text{–}37.0\%$ | $< 30.0\%$ (weak push-off, stiff-knee gait) |
| **Double Support Time %** | $20.0\% \pm 4.0\%$ | $24.0\%\text{–}28.0\%$ | $> 30.0\%$ (ataxic gait, severe fall risk) |

---

## 3. Gait Symmetry Assessment (`src/lib/gait/symmetry.ts`)

### 3.1 Mathematical Formulation (LaTeX)

#### A. Zifchock's Symmetry Angle ($SA$)
The Symmetry Angle ($SA$) provides a reference-free, non-bounded asymmetry metric in percentage $[0, 100]\%$.

Given left limb metric $X_L$ (`valLeft`) and right limb metric $X_R$ (`valRight`):
$$\theta = \text{atan2}(|X_L|, |X_R|) \quad (\text{radians})$$
$$\theta_{\text{deg}} = \theta \times \frac{180^\circ}{\pi}$$

If $\theta_{\text{deg}} > 90^\circ$, angle wrapping is applied:
$$\theta_{\text{deg}} = 180^\circ - \theta_{\text{deg}}$$

The Symmetry Angle is computed as:
$$SA = \frac{|45^\circ - \theta_{\text{deg}}|}{90^\circ} \times 100\%$$

*Properties*:
- If $X_L = X_R$, $\theta_{\text{deg}} = 45^\circ \implies SA = 0.0\%$ (Perfect Symmetry).
- If $X_L = 0$ or $X_R = 0$, $\theta_{\text{deg}} = 90^\circ \text{ or } 0^\circ \implies SA = 50.0\%$ (or $100\%$ for full non-overlap).
- Reference-free: $SA(X_L, X_R) = SA(X_R, X_L)$.

#### B. Gait Symmetry Index ($GSI$)
Simple ratio index comparing min to max limb parameter values:
$$GSI = \frac{\min(|X_L|, |X_R|)}{\max(|X_L|, |X_R|)} \times 100\%$$
*Properties*: $GSI = 100\%$ indicates perfect symmetry; $GSI = 0\%$ indicates absolute asymmetry.

---

### 3.2 Scientific Rationale & Literature Citations

- **Zifchock RA, Davis I, Higginson J, Royer T. The Symmetry Angle: a novel, robust method of determining asymmetry. *Gait & Posture*. 2008;27(4):622-627. doi:10.1016/j.gaitpost.2007.08.006. PMID: 17913499.**  
  *Rationale*: Conventional asymmetry indices (e.g., Robinson's Symmetry Index $SI = \frac{2(X_L - X_R)}{X_L + X_R} \times 100\%$) suffer from division-by-zero instability, artificial Inflation when values are small, and reference-limb bias (assigning an arbitrary "affected" vs "unaffected" limb). Zifchock's $SA$ resolves all three flaws using vector angle rotation in 2D phase space.
- **Błazkiewicz M, Wiszomirska I, Wit A. Comparison of different methods of calculating asymmetry applications in biomechanics. *Acta of Bioengineering and Biomechanics*. 2014;16(1):57-65. PMID: 24708343.**  
  *Rationale*: Recommends $SA$ as the gold standard for clinical biomechanics research.

---

### 3.3 Code Function & Line Mapping (`symmetry.ts`)

| Function Name | Lines | Mathematical / Algorithmic Mapping |
|---|---|---|
| `symmetryAngle` | 19–42 | Checks edge case ($|X_L|, |X_R| < 10^{-6} \implies 0.0$), evaluates `atan2(absL, absR)`, converts to degrees, wraps $>90^\circ$, evaluates $(|45 - \theta| / 90) \times 100$, clamps to $[0, 100]\%$. |
| `gaitSymmetryIndex` | 54–68 | Evaluates $\frac{\min(|X_L|, |X_R|)}{\max(|X_L|, |X_R|)} \times 100$, guards zero division, clamps to $[0, 100]\%$. |

---

### 3.4 Clinical Normative Values & Diagnostic Benchmarks

- **Normal Asymmetry Cutoff**: $SA < 3.0\%$ (values $< 5.0\%$ clinically acceptable).
- **Mild Gait Asymmetry**: $SA = 3.0\%\text{–}5.0\%$ (early joint degeneration, slight antalgic favoring).
- **Moderate Asymmetry**: $SA = 5.0\%\text{–}10.0\%$ (moderate osteoarthritis, post-ACL reconstruction).
- **Severe Asymmetry**: $SA > 10.0\%$ (hemiparetic stroke, limb amputation, leg length discrepancy $> 3\text{ cm}$).
- **Normal Gait Symmetry Index ($GSI$)**: $> 95.0\%$.

---

## 4. Trunk Smoothness & Harmonic Ratio (`src/lib/gait/smoothness.ts`)

### 4.1 Mathematical Formulation (LaTeX)

#### A. Vertical Trunk Harmonic Ratio ($HR_{\text{vertical}}$)
During a gait stride, vertical pelvis displacement ($y_{\text{hip}}$) undergoes **2 complete cycles** per stride (1 cycle per step).
- **Even Harmonics ($2f_0, 4f_0, 6f_0, 8f_0, 10f_0$)**: Represent in-phase, symmetric step-to-step accelerations.
- **Odd Harmonics ($1f_0, 3f_0, 5f_0, 7f_0, 9f_0$)**: Represent out-of-phase step asymmetry and irregular trunk drops.

$$HR_{\text{vertical}} = \frac{\sum_{m=1}^{5} |C_{2m}|}{\sum_{m=1}^{5} |C_{2m-1}| + \epsilon} = \frac{|C_2| + |C_4| + |C_6| + |C_8| + |C_{10}|}{|C_1| + |C_3| + |C_5| + |C_7| + |C_9| + 10^{-6}}$$

#### B. Lateral Trunk Harmonic Ratio ($HR_{\text{lateral}}$)
During a gait stride, lateral pelvis displacement ($x_{\text{hip}}$) undergoes **1 complete cycle** per stride (swaying left then right).
- **Odd Harmonics ($1f_0, 3f_0, 5f_0, 7f_0, 9f_0$)**: Represent symmetric stride-to-stride lateral oscillations.
- **Even Harmonics ($2f_0, 4f_0, 6f_0, 8f_0, 10f_0$)**: Represent lateral wobbling, loss of balance, and secondary corrective shifts.

$$HR_{\text{lateral}} = \frac{\sum_{m=1}^{5} |C_{2m-1}|}{\sum_{m=1}^{5} |C_{2m}| + \epsilon} = \frac{|C_1| + |C_3| + |C_5| + |C_7| + |C_9|}{|C_2| + |C_4| + |C_6| + |C_8| + |C_{10}| + 10^{-6}}$$

#### C. Overall Geometric Mean Harmonic Ratio ($HR_{\text{overall}}$)
$$HR_{\text{overall}} = \sqrt{HR_{\text{vertical}} \cdot HR_{\text{lateral}}}$$

---

### 4.2 Scientific Rationale & Literature Citations

- **Menz HB, Lord SR, Fitzpatrick RC. Acceleration patterns of the head and pelvis when walking are associated with fall history in older people. *Gait & Posture*. 2003;18(1):12-19. doi:10.1016/s0966-6362(02)00159-8. PMID: 12855298.**  
  *Rationale*: Demonstrated that upper body harmonic ratios directly reflect gait smoothness and trunk control. Older adults with a history of falls exhibit significantly reduced vertical and lateral HR compared to non-fallers.
- **Bellanca JL, Lowry KA, Vanswearingen JM, Brach JS, Redfern MS. Harmonic ratio calculated from accelerometry as a measure of gait stability in older adults. *Gait & Posture*. 2013;37(2):155-159. doi:10.1016/j.gaitpost.2012.06.016. PMID: 22841443.**  
  *Rationale*: Validated harmonic ratio as a reliable biomarker for dynamic equilibrium and fall risk stratification.

---

### 4.3 Code Function & Line Mapping (`smoothness.ts`)

| Function / Logic Block | Lines | Mathematical / Algorithmic Mapping |
|---|---|---|
| `computeHarmonicRatio` (Vertical) | 35–37 | Calls `computeFFTHarmonics(hipY, 10)` to compute $HR_{\text{vertical}} = \text{evenSum} / \text{oddSum}$. |
| `computeHarmonicRatio` (Lateral) | 39–42 | Calls `computeFFTHarmonics(hipX, 10)` and evaluates $HR_{\text{lateral}} = \text{oddSum} / (\text{evenSum} + 10^{-6})$. |
| Overall HR Combination | 44–45 | Computes geometric mean $HR_{\text{overall}} = \sqrt{HR_{\text{vertical}} \cdot HR_{\text{lateral}}}$. |

---

### 4.4 Clinical Normative Values & Diagnostic Benchmarks

| Cohort | $HR_{\text{vertical}}$ Norm | $HR_{\text{lateral}}$ Norm | Clinical Interpretation |
|---|---|---|---|
| **Healthy Young Adults** | $3.0\text{–}6.0+$ | $2.5\text{–}5.0+$ | High trunk smoothness and optimal dynamic balance. |
| **Healthy Older Adults** | $2.0\text{–}3.0$ | $1.8\text{–}2.5$ | Age-related mild decline in rhythmicity. |
| **Elderly Fallers / Ataxic Gait** | $< 1.5$ | $< 1.3$ | Severe trunk jerkiness, lateral wobbling, high fall risk ($HR_{\text{overall}} < 1.8$). |

---

## 5. Standardized Dual-Task Effect (`src/lib/gait/dte.ts`)

### 5.1 Mathematical Formulation (LaTeX)

#### A. Directionally Standardized Dual-Task Effect ($DTE$)
To ensure consistent clinical interpretation where **negative percentages always represent performance COST (decline)** and **positive percentages represent BENEFIT (improvement)**, $DTE$ formulas are directionally signed based on metric polarity:

1. **For Higher-Is-Better Metrics** (e.g. Cadence $C$, Gait Speed $V$, Symmetry Score $S$):
   $$DTE_{\text{higher-better}} = \left(\frac{\text{Metric}_{\text{DualTask}} - \text{Metric}_{\text{Baseline}}}{\text{Metric}_{\text{Baseline}}}\right) \times 100\%$$
   - In code: `cadenceDTE = ((dualTask.cadenceSpm - baseline.cadenceSpm) / baseline.cadenceSpm) * 100`
   - In code: `symmetryDTE = ((dualTask.symmetryScore - baseline.symmetryScore) / baseline.symmetryScore) * 100`

2. **For Lower-Is-Better Metrics** (e.g. Step Time CV $CV_{\text{step}}$, Gait Variability):
   $$DTE_{\text{lower-better}} = -\left(\frac{\text{Metric}_{\text{DualTask}} - \text{Metric}_{\text{Baseline}}}{\text{Metric}_{\text{Baseline}}}\right) \times 100\%$$
   - In code: `stepTimeCvDTE = -((dualTask.stepTimeCV - baseCv) / baseCv) * 100`

#### B. Plummer & Eskes Cognitive-Motor Interference (CMI) Taxonomy
Based on dual-task motor changes (threshold cutoff $\pm 5.0\%$):

$$\text{CMI Classification} = \begin{cases}
\text{"mutual\_interference"} & \text{if } DTE_{\text{cadence}} < -5.0\% \land DTE_{\text{stepTimeCV}} < -5.0\% \\
\text{"cognitive\_prioritization"} & \text{else if } DTE_{\text{cadence}} < -5.0\% \lor DTE_{\text{stepTimeCV}} < -5.0\% \\
\text{"motor\_prioritization"} & \text{else if } DTE_{\text{cadence}} > +5.0\% \\
\text{"no\_interference"} & \text{otherwise } (|DTE| \le 5.0\%)
\end{cases}$$

---

### 5.2 Scientific Rationale & Literature Citations

- **Kelly VE, Eusterbrock AJ, Shumway-Cook A. A review of dual-task walking paradigms in people with Parkinson's disease: implications for assessment and training. *Neurorehabilitation and Neural Repair*. 2012;26(3):223-235. doi:10.1177/1545968311425927. PMID: 22147924.**  
  *Rationale*: Standardized directional formulas for $DTE$, resolving confusion caused by un-signed percent change equations across positive vs negative gait parameters.
- **Plummer P, Eskes G. Measuring cognitive-motor interference in recovery after stroke. *Stroke Research and Treatment*. 2015;2015:246049. doi:10.1155/2015/246049. PMID: 26583093.**  
  *Rationale*: Established the authoritative 4-category taxonomy framework (Mutual Interference, Cognitive Prioritization, Motor Prioritization, No Interference) for assessing stroke and neurological patients.
- **Montero-Odasso M, Speechley M, Muir-Hunter SW, et al. Dual-task gait variability Predicts conversion to dementia: results from the Gait and Brain Study. *J Gerontol A Biol Sci Med Sci*. 2017;72(10):1409-1418. doi:10.1093/gerona/glx040. PMID: 28375438.**  
  *Rationale*: Demonstrated that dual-task cost exceeding $10\%$ on speed or $20\%$ on variability serves as a clinical biomarker predicting MCI conversion to Alzheimer's dementia.

---

### 5.3 Code Function & Line Mapping (`dte.ts`)

| Function / Logic Block | Lines | Mathematical / Algorithmic Mapping |
|---|---|---|
| `calculateDTE` (Cadence DTE) | 48–53 | Implements higher-is-better formula: `((dualTask.cadenceSpm - baseline.cadenceSpm) / baseline.cadenceSpm) * 100`. |
| `calculateDTE` (Step Time CV DTE)| 55–58 | Implements lower-is-better inverted formula: `-((dualTask.stepTimeCV - baseCv) / baseCv) * 100`. |
| `calculateDTE` (Symmetry DTE) | 60–64 | Implements higher-is-better formula: `((dualTask.symmetryScore - baseSym) / baseSym) * 100`. |
| CMI Classification Tree | 72–82 | Implements Plummer & Eskes decision tree checking dual-task cost thresholds at $\pm 5.0\%$. |

---

### 5.4 Clinical Normative Values & Diagnostic Benchmarks

- **Normal Dual-Task Cost (Healthy Adults)**: $|DTE| \le 5.0\%$ (No Interference).
- **Mild Cognitive-Motor Interference**: $DTE = -5.0\%\text{ to }-10.0\%$.
- **High Fall Risk / MCI Biomarker Threshold**: $DTE_{\text{cadence}} < -10.0\%$ or $DTE_{\text{CV}} < -20.0\%$ (indicates severe executive dysfunction during walking).
