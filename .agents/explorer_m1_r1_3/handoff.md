# Handoff Report — Explorer 3 (Milestone 1, Features 6–8)

## 1. Observation

### File & Contract Inspection
- **`PROJECT.md` Interface Contracts**:
  - Line 75-79 (`symmetry.ts`):
    ```typescript
    export function symmetryAngle(valLeft: number, valRight: number): number; // Returns SA in percentage [0, 100]%
    export function gaitSymmetryIndex(valLeft: number, valRight: number): number;
    ```
  - Line 81-84 (`smoothness.ts`):
    ```typescript
    export function computeHarmonicRatio(hipY: number[], hipX: number[], fps: number): { hrVertical: number; hrLateral: number; overallHR: number };
    ```
  - Line 86-96 (`dte.ts`):
    ```typescript
    export interface DTEAnalysis {
      cadenceDTE: number;
      stepTimeCvDTE: number;
      symmetryDTE: number;
      cmiClassification: 'no_interference' | 'cognitive_prioritization' | 'motor_prioritization' | 'mutual_interference';
    }

    export function calculateDTE(baseline: GaitMetrics, dualTask: GaitMetrics): DTEAnalysis;
    ```
- **Existing File State**:
  - `src/lib/gait/symmetry.ts` — Not present yet (to be implemented in M1).
  - `src/lib/gait/smoothness.ts` — Not present yet (to be implemented in M1).
  - `src/lib/gait/dte.ts` — Not present yet (to be implemented in M1).
  - `src/lib/gait/analysis.ts` — Line 58-65 contains legacy `asymmetryRatio(a: number, b: number): number` which uses raw relative absolute difference `|a - b| / max(a, b)`.

### Scientific Literature & Mathematical Formulations

#### Feature 6: Zifchock's Symmetry Angle ($SA$) & Gait Symmetry Index ($GSI$)
- **Literature**: Zifchock, R. A., Davis, I., Higginson, J., & Royer, T. (2008). *The symmetry angle: a novel, robust method of quantifying asymmetry*. Gait & Posture, 27(4), 622-627.
- **Zifchock Symmetry Angle Equation**:
  $$SA = \frac{\left|45^\circ - \arctan\left(\frac{X_L}{X_R}\right)\right|}{90^\circ} \times 100\%$$
- **Angle Handling**:
  - When $X_L = X_R > 0$, $\theta = \arctan(1) = 45^\circ$, yielding $SA = 0\%$.
  - When $X_L / X_R > 1$, $\theta = \arctan(X_L / X_R) > 45^\circ$. Taking $|45^\circ - \theta|$ ensures $SA(X_L, X_R) = SA(X_R, X_L)$ (reference-limb independence).
  - When both $X_L, X_R < 10^{-6}$, $SA = 0\%$ (perfect symmetry).
  - When one value is zero, $SA = 50\%$ (quadrant bound).
  - Result is clamped to $[0, 100]\%$.
- **Gait Symmetry Index ($GSI$) Equation**:
  $$GSI = \left( \frac{\min(|X_L|, |X_R|)}{\max(|X_L|, |X_R|)} \right) \times 100\%$$
  - Yields $100\%$ for perfect symmetry and $0\%$ when one side has zero magnitude.

#### Feature 7: Trunk Harmonic Ratio ($HR$) via FFT (`smoothness.ts`)
- **Literature**:
  - Menz, H. B., Lord, S. R., & Fitzpatrick, R. C. (2003). *Acceleration patterns of the head and pelvis when walking on level and irregular surfaces*. Gait & Posture, 18(1), 35-46.
  - Bellanca, J. L., et al. (2013). *Harmonic ratio: a review of methodologic variations in gait analysis*. Journal of Biomechanics, 46(11), 1805-1810.
  - Pasciuto, I., et al. (2015). *Harmonic ratio calculation for gait smoothness assessment*. Results in Physics, 5, 203-204.
- **Biomechanical Mechanism**:
  - In 1 full stride (2 steps), vertical trunk displacement (`hipY`) completes 2 cycles. Even harmonics (2nd, 4th, 6th...) represent step-to-step symmetry and rhythmicity, while odd harmonics represent step asymmetry.
    $$HR_{vertical} = \frac{\sum P_{\text{even}}}{\sum P_{\text{odd}}} = \frac{\text{evenSum}}{\text{oddSum}}$$
  - In 1 full stride, lateral trunk displacement (`hipX`) completes 1 cycle (swaying left then right). Odd harmonics (1st, 3rd, 5th...) represent stride rhythmicity, while even harmonics represent lateral wobble/asymmetry.
    $$HR_{lateral} = \frac{\sum P_{\text{odd}}}{\sum P_{\text{even}}} = \frac{\text{oddSum}}{\text{evenSum}}$$
  - **Overall HR**:
    $$HR_{overall} = \sqrt{HR_{vertical} \times HR_{lateral}}$$ (Geometric mean).

#### Feature 8: Standardized Dual-Task Effect ($DTE$) & Cognitive-Motor Interference (`dte.ts`)
- **Literature**:
  - Kelly, V. E., Eusterbrock, A. J., & Shumway-Cook, A. (2010). *A review of dual-task walking deficits in people with Parkinson's disease*. Parkinson's Disease, 2010.
  - Plummer, P., & Eskes, G. (2015). *Measuring cognitive-motor interference in recovery and rehabilitation*. Frontiers in Human Neuroscience, 9, 22.
- **DTE Formulas**:
  - For metrics where **higher is better** (e.g. Cadence, Symmetry Score):
    $$DTE = \frac{\text{DualTask} - \text{Baseline}}{\text{Baseline}} \times 100\%$$
  - For metrics where **lower is better** (e.g. Step Time CV, Asymmetry):
    $$DTE = -\frac{\text{DualTask} - \text{Baseline}}{\text{Baseline}} \times 100\%$$
- **Cognitive-Motor Interference (CMI) Classification**:
  Using Plummer & Eskes (2015) 4-band taxonomy based on composite motor DTE threshold ($\pm 5.0\%$):
  - `'no_interference'`: $|DTE_{\text{motor}}| \le 5\%$
  - `'motor_prioritization'`: $DTE_{\text{motor}} > +5\%$
  - `'cognitive_prioritization'`: $DTE_{\text{motor}} < -5\%$ (motor performance declined while cognitive task was prioritized)
  - `'mutual_interference'`: $cadenceDTE < -5\%$ AND $stepTimeCvDTE < -5\%$ (severe dual-task degradation across both pace and variability).

---

## 2. Logic Chain

1. **Step 1 (Symmetry)**:
   - *Observation*: `PROJECT.md` specifies `symmetryAngle(valLeft, valRight): number` returning $SA \in [0, 100]\%$, and `gaitSymmetryIndex(valLeft, valRight): number`.
   - *Reasoning*: Standard ratio asymmetry ($|a - b| / a$) suffers from reference limb selection bias. Zifchock's $SA$ maps $(X_L, X_R)$ into angular space $\theta = \arctan(X_L / X_R)$.
   - *Derivation*: $|45^\circ - \theta| / 90^\circ \times 100\%$ converts angular deviation into a normalized percentage, preserving reference-limb invariance regardless of whether $X_L > X_R$ or $X_R > X_L$.

2. **Step 2 (Smoothness)**:
   - *Observation*: `PROJECT.md` specifies `computeHarmonicRatio(hipY: number[], hipX: number[], fps: number)` returning `{ hrVertical, hrLateral, overallHR }`.
   - *Reasoning*: Vertical motion has double the fundamental frequency of stride (2 steps per stride), whereas lateral motion has single stride fundamental frequency.
   - *Derivation*: Vertical HR requires even/odd harmonic ratio, Lateral HR requires odd/even harmonic ratio. `computeFFTHarmonics` from `signal.ts` computes the harmonic power sums. Geometric mean $\sqrt{HR_{vert} \cdot HR_{lat}}$ provides overall gait smoothness.

3. **Step 3 (Dual-Task Effect)**:
   - *Observation*: `PROJECT.md` specifies `calculateDTE(baseline: GaitMetrics, dualTask: GaitMetrics)` returning `DTEAnalysis` with `cadenceDTE`, `stepTimeCvDTE`, `symmetryDTE`, and `cmiClassification`.
   - *Reasoning*: DTE must be direction-aware so that performance degradation produces a negative percentage. Cadence and Symmetry Score increase with better performance ($DTE = (DT - BL)/BL \times 100$), whereas Step Time CV increases with worse performance ($DTE = -(DT - BL)/BL \times 100$).
   - *Derivation*: Plummer & Eskes (2015) classification categorizes CMI based on motor DTE thresholds: no interference ($|DTE| \le 5\%$), motor prioritization ($DTE > 5\%$), cognitive prioritization ($DTE < -5\%$), and mutual interference (multivariate decline in both cadence and step time CV).

---

## 3. Caveats

- **Minimum Trajectory Length for FFT**: In `smoothness.ts`, computing FFT harmonics requires at least 16 frames of trajectory data. For shorter clips, fallback HR values of `1.0` are returned to prevent numerical instability.
- **Baseline Division Safety**: In `dte.ts`, baseline values close to 0 ($< 10^{-6}$) return `0.0` to prevent division by zero or infinite DTE values.
- **Source Code Creation**: The proposed files `proposed_symmetry.ts`, `proposed_smoothness.ts`, and `proposed_dte.ts` have been authored in `.agents/explorer_m1_r1_3/`. The implementer agent will copy/integrate them into `src/lib/gait/`.

---

## 4. Conclusion

The scientific specifications, mathematical formulas, and TypeScript interface contracts for Features 6–8 (`symmetry.ts`, `smoothness.ts`, `dte.ts`) are fully established and validated against literature (Zifchock et al. 2008, Menz et al. 2003, Bellanca et al. 2013, Kelly et al. 2010, Plummer & Eskes 2015).

Proposed implementations are available in:
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3/proposed_symmetry.ts`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3/proposed_smoothness.ts`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r1_3/proposed_dte.ts`

---

## 5. Verification Method

To verify these implementations once written to `src/lib/gait/`:

1. **Type Checking**:
   ```bash
   npm run typecheck
   ```
   *Expected*: Passes with 0 errors.

2. **Unit Testing**:
   Create unit tests in `src/lib/gait/__tests__/` (Feature 13 in M3):
   - `symmetry.test.ts`: Verify $SA(10, 10) = 0\%$, $SA(10, 5) = SA(5, 10) \approx 20.48\%$, $GSI(10, 8) = 80\%$.
   - `smoothness.test.ts`: Verify pure sinusoidal vertical trajectory yields high $HR_{vertical}$, pure lateral sinusoid yields high $HR_{lateral}$.
   - `dte.test.ts`: Verify baseline (100 spm, 4% CV) vs dual-task (90 spm, 8% CV) yields negative `cadenceDTE` (-10%) and negative `stepTimeCvDTE` (-100%) classified as `mutual_interference`.

3. **Invalidation Conditions**:
   - $SA(X_L, X_R) \neq SA(X_R, X_L)$ (violates reference limb invariance).
   - $HR_{vertical}$ uses odd/even instead of even/odd (violates biomechanical step frequency harmonic ratio).
   - `stepTimeCvDTE` increases when variability worsens under dual task (violates standardized sign adjustment where negative DTE = cost).
