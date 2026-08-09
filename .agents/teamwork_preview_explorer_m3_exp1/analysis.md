# Scientific Core Modules Test Coverage & Expansion Analysis

**Target Modules**:
1. `src/lib/gait/signal.ts` (Butterworth Filtering, Linear Detrending, FFT Harmonic Decomposition)
2. `src/lib/gait/events.ts` (Zeni Kinematic Gait Event Detection & Phase Breakdown)
3. `src/lib/gait/symmetry.ts` (Zifchock Symmetry Angle & Gait Symmetry Index)

---

## 1. Executive Summary & Inventory

| Module | Primary Exported Functions | Current Dedicated Test File | Current Test Count in Dedicated File | Global Test Coverage Status across Suite |
|---|---|---|---|---|
| `signal.ts` | `butterworthLowPass`, `zeroPhaseButterworth`, `linearDetrend`, `computeFFTHarmonics` | `src/lib/gait/__tests__/signal.test.ts` | 3 tests | **Partial**: Causal `butterworthLowPass` lacks direct unit tests. `zeroPhaseButterworth` lacks cutoff frequency sweep & boundary padding tests. `computeFFTHarmonics` lacks fundamental frequency bin search & non-power-of-2 tests. |
| `events.ts` | `detectGaitEventsZeni` | `src/lib/gait/__tests__/events.test.ts` | 1 test | **Minimal**: Only 1 synthetic test for left-to-right walking exists in `events.test.ts`. Lacks right-to-left walking, landmark fallback (ANKLE fallback when HEEL/FOOT visibility < 0.3), stance/swing phase asymmetry, and double support boundary tests. |
| `symmetry.ts` | `symmetryAngle`, `gaitSymmetryIndex` | `src/lib/gait/__tests__/symmetry.test.ts` | 2 tests | **Moderate**: Basic sanity tests present. Lacks near-zero threshold (`1e-6`), specific ratio verification (2:1, 3:1, 10:1), negative input handling, and floating point rounding checks. |

---

## 2. In-Depth Module Analysis & Gap Identification

### 2.1 `src/lib/gait/signal.ts`

#### Code Mechanics & Logic:
- `butterworthLowPass`: Cascades two 2nd-order biquad stages with Butterworth pole Q values ($Q_1 \approx 0.5412$, $Q_2 \approx 1.3066$). Clamps cutoff frequency at $0.95 \times f_{nyquist}$. Returns copy if `data.length < 5` or `fps <= 0`.
- `zeroPhaseButterworth`: Performs forward pass, array reversal, backward pass, and re-reversal with boundary reflection padding (`padLen = Math.min(12, n - 1)`).
- `linearDetrend`: Computes OLS linear regression $y = \alpha + \beta i$. Returns detrended signal and baseline trend function. Handles $n=0$, $n=1$, and constant signals (where `denom` approach 0).
- `computeFFTHarmonics`: Detrends signal, applies Hann window, zero-pads to next power of 2, computes Cooley-Tukey Radix-2 FFT, finds peak fundamental frequency bin $f_0$, sums odd vs even harmonic magnitudes, and calculates $HR = \text{evenSum} / (\text{oddSum} + 1e-6)$.

#### Current Test Gaps & Missing Edge Cases:
1. **`butterworthLowPass` (Causal Filter)**:
   - Missing direct unit tests in `signal.test.ts` (currently only invoked indirectly by `zeroPhaseButterworth`).
   - Needs direct verification of phase delay (lag) inherent to causal filtering vs zero-phase filtering.
   - Needs cutoff frequency clamp test ($f_c \ge f_{nyquist}$).
2. **`zeroPhaseButterworth`**:
   - Short signal boundary: exact minimum valid length $n=5$ where boundary reflection padding is active (`padLen = 4`).
   - Cutoff frequency sweep: testing behavior at $f_c = 1.0\text{ Hz}, 3.0\text{ Hz}, 6.0\text{ Hz}, 12.0\text{ Hz}$.
   - Impulse response symmetry: verifying impulse centered at index $k$ produces perfectly symmetric response around $k$.
   - Sampling rate variation: testing at $10, 30, 60, 120, 240\text{ Hz}$.
3. **`linearDetrend`**:
   - Boundary array sizes: $n=0$ (`[]`), $n=1$ (`[42]`), $n=2$ (`[10, 20]`).
   - Exact slope & intercept recovery: linear signal $y = 3i - 7$ must yield detrended values $\approx 0$.
   - Scale invariance: very large inputs ($10^8$) and tiny inputs ($10^{-8}$).
4. **`computeFFTHarmonics`**:
   - Array length thresholds: $n < 8$ (returns fallback `{ evenSum: 0, oddSum: 0, harmonicRatio: 1.0 }`), $n = 8$ (minimum valid size).
   - Signal spectral composition: pure fundamental sine wave vs odd-harmonic-dominated signal vs even-harmonic-dominated signal.
   - Non-power-of-2 array lengths: $n = 15, 33, 100, 250$ to test zero-padding and Hann window windowing artifacts.

---

### 2.2 `src/lib/gait/events.ts`

#### Code Mechanics & Logic:
- Extracts mid-hip AP trajectory ($x$-coordinate) and relative heel/toe trajectories.
- `getLandmarkX`: Checks primary landmark visibility (`> 0.3`). Fallbacks to ANKLE if HEEL/FOOT visibility is low or missing.
- Walking direction determination: `totalDisplacement = midHipX[n - 1] - midHipX[0]`. If `< -0.05`, direction is $-1$ (right-to-left, Heel Strike = min, Toe Off = max); otherwise $+1$ (left-to-right, Heel Strike = max, Toe Off = min).
- Filters relative trajectories at $f_c = 6.0\text{ Hz}$ using `zeroPhaseButterworth`.
- Peak detection (`findExtrema`): minimum gap constraint `minGap = Math.max(3, Math.floor(0.35 * fps))`.
- Stance & Swing %: computes stride duration from consecutive ICs ($0.3\text{s} < \text{dur} < 2.5\text{s}$), matches TO event, calculates stance % ($40\% \le \text{pct} \le 80\%$). Fallbacks to $60.0\%$ if invalid.
- Double support %: pairs left IC to right TO and right IC to left TO ($< 0.5\text{s}$). Validates total double support per stride ($5\% \le \text{ds} \le 45\%$). Fallbacks to $20.0\%$.

#### Current Test Gaps & Missing Edge Cases:
1. **Walking Direction Invariance**:
   - Current `events.test.ts` only tests left-to-right walking. Right-to-left walking (subject moving in negative AP direction) is completely untested in `events.test.ts`.
   - Boundary displacement around $-0.05$ (e.g., $-0.049$ vs $-0.051$).
2. **Landmark Fallback Mechanism (`getLandmarkX`)**:
   - Primary landmarks (HEEL/FOOT) set to low visibility ($0.1$) or `undefined`.
   - Verify fallback to ANKLE landmarks without algorithm crash or loss of gait events.
3. **Asymmetric Gait Phase Breakdown**:
   - Pathological asymmetry: Left limb prolonged stance ($70\%$ stance / $30\%$ swing) vs Right limb shortened stance ($50\%$ stance / $50\%$ swing).
   - Verify `leftStancePct` and `rightStancePct` accurately capture asymmetric stance durations.
4. **Cadence & Stride Duration Limits**:
   - High cadence (fast gait, stride duration $\approx 0.5\text{s}$, $60\text{ fps}$).
   - Low cadence (slow gait, stride duration $\approx 2.0\text{s}$, $30\text{ fps}$).
   - Stride duration window filtering ($< 0.3\text{s}$ or $> 2.5\text{s}$ rejected).
5. **Frame Count Boundaries & Missing Timestamps**:
   - $n < 10$ frames (returns `defaultResult`).
   - Missing `timeMs` property on frames (verify fallback to `f / effectiveFps`).

---

### 2.3 `src/lib/gait/symmetry.ts`

#### Code Mechanics & Logic:
- `symmetryAngle(valLeft, valRight)`:
  - Takes absolute values $|L|, |R|$. If both $< 10^{-6}$, returns $0.0\%$.
  - Computes $\theta = \arctan(|L|, |R|)$ in degrees. If $\theta > 90^\circ$, adjusts $\theta = 180^\circ - \theta$.
  - Formula: $SA = \frac{|45^\circ - \theta|}{90^\circ} \times 100\%$.
  - Mathematical note: Theoretical maximum for non-negative inputs is **$50.0\%$** (when one limb is zero and the other is non-zero, $\theta = 90^\circ$ or $0^\circ \implies |45 - 90|/90 \times 100 = 50\%$).
- `gaitSymmetryIndex(valLeft, valRight)`:
  - Takes absolute values. If $\max(|L|, |R|) < 10^{-6}$, returns $100.0\%$.
  - Formula: $GSI = \frac{\min(|L|, |R|)}{\max(|L|, |R|)} \times 100\%$.

#### Current Test Gaps & Missing Edge Cases:
1. **Near-Zero Threshold ($10^{-6}$)**:
   - Inputs just below threshold ($10^{-7}, 10^{-7}$) -> $SA = 0.0\%, GSI = 100.0\%$.
   - Inputs just above threshold ($10^{-5}, 10^{-5}$) -> $SA = 0.0\%, GSI = 100.0\%$.
   - Asymmetrical inputs near threshold ($10^{-7}, 10^{-5}$).
2. **Specific Ratio Verifications**:
   - 2:1 ratio ($100, 50$): $\theta \approx 63.435^\circ \implies SA = 20.48\%, GSI = 50.0\%$.
   - 3:1 ratio ($30, 10$): $\theta \approx 71.565^\circ \implies SA = 29.52\%, GSI = 33.33\%$.
   - 10:1 ratio ($100, 10$): $\theta \approx 84.289^\circ \implies SA = 43.65\%, GSI = 10.0\%$.
3. **Negative & Zero Inputs**:
   - Negative values (e.g. joint angles or displacement deltas $-15.5$ vs $15.5$).
   - One limb zero ($10, 0$) -> $SA = 50.0\%, GSI = 0.0\%$.
   - Both limbs zero ($0, 0$) -> $SA = 0.0\%, GSI = 100.0\%$.

---

## 3. Concrete Recommendations for Test Expansion

Below are structured test suites recommended to be added to `signal.test.ts`, `events.test.ts`, and `symmetry.test.ts`.

### 3.1 Expansion Plan for `signal.test.ts`
1. `describe("butterworthLowPass (Causal Stage)")`:
   - Test return copy on $n < 5$ or $fps \le 0$.
   - Test causal phase lag compared to zero-phase filter.
   - Test cutoff frequency clamping when $cutoffHz \ge fps / 2$.
2. `describe("zeroPhaseButterworth (Boundary & Frequency Sweeps)")`:
   - Test exact minimum active length $n = 5$.
   - Test impulse response symmetry centered at index $k$.
   - Test cutoff frequency sweep ($fc = 1, 3, 6, 12\text{ Hz}$).
   - Test preservation of DC signals without baseline shift.
3. `describe("linearDetrend (Edge Cases & Precision)")`:
   - Test $n = 0$, $n = 1$, $n = 2$.
   - Test exact slope and intercept extraction on noisy linear trend.
   - Test constant signal detrending (yields array of zeros).
4. `describe("computeFFTHarmonics (Spectral & Boundary)")`:
   - Test $n < 8$ fallback return.
   - Test exact $n = 8$ array size.
   - Test odd-harmonic-dominated vs even-harmonic-dominated signals.
   - Test non-power-of-2 input array sizes ($n = 15, 33, 100$).

### 3.2 Expansion Plan for `events.test.ts`
1. `describe("Walking Direction Sensitivity")`:
   - Test right-to-left walking trajectory (`midHipX` decreasing).
   - Test boundary displacement around $-0.05$.
2. `describe("Landmark Fallback & Low Visibility")`:
   - Test HEEL & FOOT landmarks with visibility $0.1$ falling back to ANKLE.
3. `describe("Asymmetric Gait & Stance Breakdown")`:
   - Test asymmetric stride durations (Left 70% stance / Right 50% stance).
4. `describe("Cadence & Frame Rate Boundaries")`:
   - Test high cadence ($60\text{ fps}$, stride $0.5\text{s}$).
   - Test slow cadence ($30\text{ fps}$, stride $2.0\text{s}$).
   - Test frame array $n < 10$ fallback.
   - Test missing `timeMs` on frames.

### 3.3 Expansion Plan for `symmetry.test.ts`
1. `describe("Near-Zero Epsilon Thresholds")`:
   - Test inputs $< 10^{-6}$ vs $> 10^{-6}$.
2. `describe("Mathematical Ratio Verification")`:
   - Verify 2:1 ratio ($SA = 20.48\%$).
   - Verify 3:1 ratio ($SA = 29.52\%$).
   - Verify 10:1 ratio ($SA = 43.65\%$).
3. `describe("Negative & Mixed Sign Metrics")`:
   - Test negative limb values ($SA(-10, 5) == SA(10, 5)$).
4. `describe("Boundary & Capping Verification")`:
   - Test 50% capping on extreme one-sided zero input.

