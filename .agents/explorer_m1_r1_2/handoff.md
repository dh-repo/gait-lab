# Handoff Report: Signal Processing & Gait Event Detection (Features 4-5)

**Agent**: Explorer 2 (Milestone 1)  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_2`  
**Parent Conversation ID**: `9fa0c177-add2-4b10-b1ff-21a45d75ca2c`  
**Date**: 2026-08-09  

---

## 1. Observation

### 1.1 Existing Codebase & File Structure
- **Current `src/lib/gait/` Inventory**:
  - `types.ts`: Defines `PoseFrame`, `Landmark`, `GaitMetrics`, `AnalysisResult`, etc.
  - `landmarks.ts`: Defines `LM` constants (`L_HIP: 23`, `R_HIP: 24`, `L_HEEL: 29`, `R_HEEL: 30`, `L_FOOT: 31`, `R_FOOT: 32`, `L_ANKLE: 27`, `R_ANKLE: 28`), `hipCenter()`, `mid()`, `torsoHeight()`, `dist()`, `mean()`, `std()`, `range()`.
  - `analysis.ts`: Currently implements basic heuristic peak finding (`findPeaks`) and autocorrelation (`estimateStepsFromOscillation`) directly inside `computeGaitMetrics`. It does not yet utilize zero-phase Butterworth filtering or the Zeni kinematic event detection algorithm.
  - `signal.ts` and `events.ts`: **Currently missing from repository.** Must be created during Milestone 1 implementation.

### 1.2 Interface Contracts (`PROJECT.md § Interface Contracts`)
`PROJECT.md` specifies the mandatory function and type contracts for `signal.ts` and `events.ts`:

#### `src/lib/gait/signal.ts` Contract:
```typescript
export function butterworthLowPass(data: number[], fps: number, cutoffHz?: number): number[];
export function zeroPhaseButterworth(data: number[], fps: number, cutoffHz?: number): number[];
export function linearDetrend(data: number[]): { detrended: number[]; trend: (i: number) => number };
export function computeFFTHarmonics(data: number[], numHarmonics?: number): { evenSum: number; oddSum: number; harmonicRatio: number };
```

#### `src/lib/gait/events.ts` Contract:
```typescript
export interface GaitEvent {
  frame: number;
  timeSec: number;
  type: 'heel_strike' | 'toe_off';
  side: 'left' | 'right';
}

export interface GaitPhaseBreakdown {
  leftStancePct: number;
  rightStancePct: number;
  leftSwingPct: number;
  rightSwingPct: number;
  doubleSupportPct: number;
  stepEvents: GaitEvent[];
}

export function detectGaitEventsZeni(frames: PoseFrame[], fps: number): GaitPhaseBreakdown;
```

---

## 2. Logic Chain & Mathematical Designs

### 2.1 Signal Processing Design (`src/lib/gait/signal.ts`)

#### A. 4th-Order Butterworth Digital Low-Pass Filter (`butterworthLowPass` & `zeroPhaseButterworth`)
1. **Cutoff Frequency ($f_c$)**: Default $f_c = 6.0\text{ Hz}$ (standard clinical biomechanics cutoff frequency, per Winter 2009). High-frequency MediaPipe landmark tracking jitter occurs above $6\text{ Hz}$, while voluntary human gait dynamics reside below $6\text{ Hz}$.
2. **Cascaded Biquad (2nd-Order Sections / SOS) Design**:
   - A 4th-order low-pass filter is implemented as two cascaded 2nd-order biquad filter sections.
   - For a 4th-order Butterworth response, the pole quality factors ($Q$) for the two biquad stages are:
     $$Q_1 = \frac{1}{2 \cos(\pi / 8)} \approx 0.5411961$$
     $$Q_2 = \frac{1}{2 \cos(3\pi / 8)} \approx 1.3065630$$
   - **Bilinear Transform Coefficient Equations**:
     For sampling rate $f_s$ (`fps`) and cutoff $f_c$, let $K = \tan\left(\frac{\pi f_c}{f_s}\right)$.
     For each biquad section $k \in \{1, 2\}$:
     $$\text{norm} = 1 + \frac{K}{Q_k} + K^2$$
     $$b_0 = \frac{K^2}{\text{norm}}, \quad b_1 = \frac{2 K^2}{\text{norm}}, \quad b_2 = \frac{K^2}{\text{norm}}$$
     $$a_0 = 1, \quad a_1 = \frac{2 (K^2 - 1)}{\text{norm}}, \quad a_2 = \frac{1 - \frac{K}{Q_k} + K^2}{\text{norm}}$$
   - **Difference Equation (Direct Form II Transposed / Direct Form I)**:
     $$y[n] = b_0 x[n] + b_1 x[n-1] + b_2 x[n-2] - a_1 y[n-1] - a_2 y[n-2]$$
3. **Zero-Phase Filtering (`zeroPhaseButterworth`)**:
   - Causal IIR filters introduce phase distortion (group delay), shifting event peak timing.
   - Zero-phase filtering applies the filter in the forward direction, reverses the resulting array, applies the filter again, and reverses back.
   - **Boundary Conditions & Transient Reduction (Padding)**:
     - Edge reflection padding of length $P = \min(12, N - 1)$ prevents startup/ending transients:
       - Left pad: $2 \cdot x[0] - x[P, P-1, \dots, 1]$
       - Right pad: $2 \cdot x[N-1] - x[N-2, N-3, \dots, N-1-P]$
     - Strip padding after forward-backward filtering.
   - Short input handling ($N < 5$): Return duplicate of input array.

#### B. Linear Detrending (`linearDetrend`)
1. Fits ordinary least squares (OLS) linear model $y(i) = \alpha + \beta \cdot i$ over sample index $i = 0, \dots, N-1$:
   $$\bar{i} = \frac{N - 1}{2}, \quad \bar{y} = \frac{1}{N} \sum_{i=0}^{N-1} y_i$$
   $$\beta = \frac{\sum_{i=0}^{N-1} (i - \bar{i})(y_i - \bar{y})}{\sum_{i=0}^{N-1} (i - \bar{i})^2} = \frac{\sum_{i=0}^{N-1} (i - \bar{i})(y_i - \bar{y})}{\frac{N(N^2 - 1)}{12}}$$
   $$\alpha = \bar{y} - \beta \cdot \bar{i}$$
2. Returns `{ detrended: y[i] - (alpha + beta * i), trend: (i: number) => alpha + beta * i }`.

#### C. FFT Harmonic Decomposition (`computeFFTHarmonics`)
1. **Purpose**: Computes harmonic amplitude distribution for trunk/gait smoothness ($HR$).
2. **Cooley-Tukey Radix-2 FFT Algorithm**:
   - Zero-pad array to nearest power of 2 $M = 2^{\lceil \log_2 N \rceil}$ (with Hann windowing $w[n] = 0.5 - 0.5 \cos(2\pi n / (N-1))$ to prevent boundary spectral leakage).
   - Compute complex FFT $X[k] = \sum_{n=0}^{M-1} x[n] w[n] e^{-j 2\pi k n / M}$.
   - Magnitude spectrum $A[k] = \frac{2}{N} |X[k]|$ for $k = 0 \dots M/2$.
3. **Fundamental Frequency ($f_0$) Identification**:
   - Find dominant peak in search range corresponding to gait stride frequency (typically $0.7\text{ Hz} \le f_0 \le 2.5\text{ Hz}$).
4. **Harmonic Summation & Ratio**:
   - Sum magnitudes at integer harmonics $k \cdot f_0$ up to `numHarmonics` (default 10):
     $$\text{evenSum} = \sum_{m=1}^{\text{numHarmonics}/2} A(2m \cdot f_0)$$
     $$\text{oddSum} = \sum_{m=1}^{\text{numHarmonics}/2} A((2m - 1) \cdot f_0)$$
     $$\text{harmonicRatio} = \frac{\text{evenSum}}{\text{oddSum} + 1e-6}$$

---

### 2.2 Zeni Kinematic Gait Event Detection Design (`src/lib/gait/events.ts`)

#### A. Algorithmic Basis (Zeni et al. 2008)
- Gait events are identified by examining the anterior-posterior (AP) trajectory of foot landmarks (heel and toe) relative to the pelvis center (mid-hip):
  $$x_{\text{rel, L\_heel}}[i] = x_{\text{L\_HEEL}}[i] - x_{\text{mid-hip}}[i]$$
  $$x_{\text{rel, R\_heel}}[i] = x_{\text{R\_HEEL}}[i] - x_{\text{mid-hip}}[i]$$
  $$x_{\text{rel, L\_toe}}[i] = x_{\text{L\_FOOT}}[i] - x_{\text{mid-hip}}[i]$$
  $$x_{\text{rel, R\_toe}}[i] = x_{\text{R\_FOOT}}[i] - x_{\text{mid-hip}}[i]$$

#### B. Walk Direction & Signal Filtering
1. **Filtering**: Each relative trajectory is pre-filtered using `zeroPhaseButterworth(trajectory, fps, 6.0)`.
2. **Direction Determination**:
   - Fit linear regression of $x_{\text{mid-hip}}$ vs $t$.
   - Direction vector $d = +1$ if walking left-to-right (increasing $x$ in image space); $d = -1$ if walking right-to-left.
   - If displacement is negligible ($|\Delta x| \le 0.05$, e.g. treadmill walking), default $d = +1$.

#### C. Event Identification Rules
1. **Initial Contact (Heel Strike, IC)**:
   - For $d = +1$: Local maximum of $x_{\text{rel, heel}}(t)$ (maximum anterior position of heel).
   - For $d = -1$: Local minimum of $x_{\text{rel, heel}}(t)$.
2. **Terminal Contact (Toe Off, TO)**:
   - For $d = +1$: Local minimum of $x_{\text{rel, toe}}(t)$ (maximum posterior position of toe).
   - For $d = -1$: Local maximum of $x_{\text{rel, toe}}(t)$.
3. **Refinement & Inter-event Constraints**:
   - Minimum frame gap between events of same type on same side: $\text{minFrameDist} = \lfloor 0.35 \times \text{fps} \rfloor$.
   - Enforce event sequence per foot: $\text{IC}_1 \to \text{TO}_1 \to \text{IC}_2 \to \text{TO}_2$.

#### D. Gait Phase & Metric Calculation Formulas
1. **Stance Phase % (`leftStancePct`, `rightStancePct`)**:
   - For complete stride $k$ starting at $\text{IC}_k$ and ending at $\text{IC}_{k+1}$:
     $$\text{StancePct}_k = \frac{t(\text{TO}_k) - t(\text{IC}_k)}{t(\text{IC}_{k+1}) - t(\text{IC}_k)} \times 100$$
   - Mean of $\text{StancePct}_k$ across all complete strides on that side (default $60.0\%$ if insufficient cycles).
2. **Swing Phase % (`leftSwingPct`, `rightSwingPct`)**:
   $$\text{leftSwingPct} = 100 - \text{leftStancePct}$$
   $$\text{rightSwingPct} = 100 - \text{rightStancePct}$$
3. **Double Support Time % (`doubleSupportPct`)**:
   - Double support intervals occur when both feet are in stance simultaneously:
     - Left IC to Right TO ($\text{DS}_1$)
     - Right IC to Left TO ($\text{DS}_2$)
   $$\text{doubleSupportPct} = \text{mean}\left(\frac{\text{DS}_1 + \text{DS}_2}{\text{StrideDuration}}\right) \times 100$$
   (default $20.0\%$ fallback).

---

## 3. Caveats
1. **MediaPipe Landmark Index Availability**:
   - MediaPipe Pose provides LM 29 (`L_HEEL`), LM 30 (`R_HEEL`), LM 31 (`L_FOOT`), LM 32 (`R_FOOT`).
   - If visibility of heel/toe landmarks drops below threshold ($< 0.3$), algorithms should fallback gracefully to ankle landmarks (LM 27 `L_ANKLE`, LM 28 `R_ANKLE`).
2. **Sampling Rate Sensitivity**:
   - At lower video frame rates (e.g. 15-20 FPS), peak locations can be quantized to discrete frame steps (up to ~66ms uncertainty). Quadratic peak interpolation ($t_{\text{subframe}} = i + \frac{y_{i-1} - y_{i+1}}{2(y_{i-1} - 2y_i + y_{i+1})}$) can be used to refine peak timestamps if needed.

---

## 4. Conclusion
The proposed mathematical algorithms for `src/lib/gait/signal.ts` and `src/lib/gait/events.ts` strictly satisfy all specifications and interface contracts in `PROJECT.md`. Implementers can implement these exact formulas cleanly in TypeScript with zero third-party dependencies.

---

## 5. Verification Method

### 5.1 Automated Unit Testing (`src/lib/gait/__tests__/`)
- **`signal.test.ts`**:
  1. Synthetic Noise Suppression: Pass a combined signal $S(t) = \sin(2\pi \cdot 2 t) + 0.5 \sin(2\pi \cdot 25 t)$ sampled at 100 FPS through `zeroPhaseButterworth`. Verify $25\text{ Hz}$ noise power is reduced by $> 95\%$ while $2\text{ Hz}$ amplitude and peak alignment remain intact without phase shift.
  2. Linear Detrending: Pass $y(t) = 5t + 10 + \cos(2\pi t)$ through `linearDetrend`. Verify line fit parameters ($\beta \approx 5, \alpha \approx 10$) and that detrended output has zero slope.
  3. FFT Harmonics: Pass $y(t) = \cos(2\pi \cdot 2 t) + 0.8 \cos(2\pi \cdot 4 t) + 0.1 \cos(2\pi \cdot 3 t)$ through `computeFFTHarmonics`. Verify `evenSum > oddSum` and `harmonicRatio > 5.0`.

- **`events.test.ts`**:
  1. Synthetic Gait Signal: Generate synthetic 30 FPS `PoseFrame[]` sequence simulating 3 gait cycles with sinusoidal heel and toe relative displacements ($x_{\text{rel}}$).
  2. Event Output Validation: Call `detectGaitEventsZeni(frames, 30)`. Verify returned `stepEvents` contains correctly ordered `heel_strike` and `toe_off` events for left and right limbs.
  3. Phase Breakdown Checks: Assert `leftStancePct` is between $55\%$ and $65\%$, `leftSwingPct` is between $35\%$ and $45\%$, and `doubleSupportPct` is between $15\%$ and $25\%$.

### 5.2 Command Verification
- `npm run typecheck`
- `npm test`
- `npm run lint`
