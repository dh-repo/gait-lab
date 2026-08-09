# Handoff Report — Milestone M8 Challenger Review (Split-Half Reliability & 95% CIs)

**Agent:** challenger_m8_2 (teamwork_preview_challenger)  
**Parent Agent:** orchestrator / 714f6b8b-4b18-498d-b79e-64b64f8d15f6  
**Date:** 2026-08-09  
**Verdict:** `APPROVE`

---

## 1. Observation

- **Empirical Stress Test Harness**: Authored and executed dedicated stress test suite `src/lib/gait/__tests__/split_half_stress_m8_2.test.ts` to empirically challenge split-half reliability calculations and 95% confidence interval accuracy.
- **Mathematical Formula Verification**: Confirmed that `buildReliabilityBounds` in `src/lib/gait/analysis.ts`:
  - Computes $\text{splitHalfDiff} = |M^{(1)} - M^{(2)}|$
  - Computes standard error $\text{SE}_{\text{split}} = \frac{|M^{(1)} - M^{(2)}|}{\sqrt{2}}$
  - Computes 95% confidence intervals $[M - 1.96 \cdot \text{SE}_{\text{split}}, M + 1.96 \cdot \text{SE}_{\text{split}}]$ (clamped at 0 for non-negative metrics when `allowNegative = false`).
  - Values match exact mathematical predictions to 3 decimal places across all reported metrics (`cadenceSpm`, `stepTimeCV`, `symmetryAngle`, `harmonicRatioVertical`, `harmonicRatioLateral`, `harmonicRatio`, `strideTimeCV`, `leftStancePct`, `rightStancePct`, `doubleSupportPct`, `kneeFlexLeft`, `kneeFlexRight`, `lateralSway`, `meanStepWidth`, `pelvicObliquity`).
- **Steady vs. Perturbed Gait Sequences**:
  - Under steady gait, Half 1 ($M^{(1)}$) and Half 2 ($M^{(2)}$) metrics are nearly identical, resulting in $\text{SE}_{\text{split}} \approx 0$ and narrow 95% CI bounds.
  - Under perturbed gait (e.g. speed shift / gait alteration between Half 1 and Half 2), $|M^{(1)} - M^{(2)}|$ increases markedly, causing $\text{SE}_{\text{split}}$ and 95% CI widths to expand proportionally.
- **Monotonic CI Expansion**:
  - Empirically verified that as intra-clip speed/gait perturbation between Half 1 and Half 2 increases, 95% CI width ($\text{CI}_{\text{upper}} - \text{CI}_{\text{lower}}$) expands monotonically.
- **Short Clips (< 10 Frames)**:
  - Verified that for clips with < 10 frames (e.g. 0, 3, 4, 5, 8, 9 frames), `computeGaitMetrics` returns valid point estimates without crashing or throwing exceptions, and safely skips split-half testing (`confidenceIntervals` entries remain undefined / unpopulated).
  - Verified that split-half testing activates at exactly 10 frames (where Half 1 has 5 frames and Half 2 has 5 frames).
- **Edge Cases & View Suppression**:
  - Odd frame counts (11, 15, 31 frames) slice safely (`halfN = Math.floor(N/2)`).
  - Suppressed view metrics (`null`) produce null bounds `{ value: null, ci95Lower: null, ci95Upper: null, splitHalfDiff: null, se: null, half1: null, half2: null }` without throwing errors or introducing `NaN`.
  - Zero-motion stationary pose sequences return 0-difference CI bounds cleanly.
- **Full Test Suite & Quality Verification**:
  - `npm test`: 19 test files pass, 220 tests pass.
  - `npm run typecheck`: Exit code 0 (0 errors).
  - `npm run lint`: Exit code 0 (0 errors).

---

## 2. Logic Chain

1. **Statistical Derivation**: Given two independent split-half metric estimates $M^{(1)}$ and $M^{(2)}$ with sample standard deviation $\sigma$, the variance of difference $D = M^{(1)} - M^{(2)}$ is $\text{Var}(D) = 2 \sigma^2$. Hence, the split-half standard error is $\text{SE}_{\text{split}} = \frac{|M^{(1)} - M^{(2)}|}{\sqrt{2}}$. The 95% confidence interval for the overall mean estimate $M$ is $M \pm 1.96 \cdot \text{SE}_{\text{split}}$.
2. **Empirical Behavior under Perturbation**: In steady gait, intra-clip variance between halves is minimal ($\text{SE}_{\text{split}} \to 0$), reflecting high measurement reliability. In perturbed or irregular gait, metrics differ between halves, causing $\text{SE}_{\text{split}}$ to increase and confidence intervals to expand appropriately to reflect uncertainty.
3. **Clip Length Guardrails**: Slicing clips shorter than 10 frames into halves produces sub-clips of < 5 frames, which are insufficient for reliable gait event autocorrelation or Butterworth filtering. Skipping split-half calculation for $< 10$ frames prevents numerical instability while preserving point estimates.
4. **View Suppression Safety**: When view geometry renders a metric non-measurable (e.g. knee flexion in frontal view), setting point estimate and split-half bounds to `null` prevents clinical misinterpretation while ensuring UI rendering gracefully hides CI badges (`hasCI = false`).

---

## 3. Caveats

- **Oblique Views**: Oblique camera angles retain both frontal and sagittal metric calculations at moderate view confidence, resulting in valid point estimates and confidence intervals, though with wider uncertainty if foot placements fluctuate across perspective.
- **Stationary / Non-Walking Clips**: For stationary clips, cadence and gait metrics return 0, and split-half testing returns 0-width confidence intervals.

---

## 4. Conclusion

The split-half reliability and 95% confidence interval calculations in `src/lib/gait/analysis.ts` are mathematically accurate, statistically sound, robust against edge cases (short clips, view suppression, odd frame counts), and fully integrated with UI rendering components. All empirical stress tests pass cleanly, along with the full workspace test suite, typecheck, and linter.

Final Verdict: **`APPROVE`**

---

## 5. Verification Method

To independently verify this verdict and test suite:

1. **Run Unit & Empirical Stress Test Suite**:
   ```bash
   npm test
   ```
   *Expected Output*: 19 test files pass, 220 tests pass (including 8 tests in `split_half_stress_m8_2.test.ts`).

2. **Run Split-Half Stress Test Harness Directly**:
   ```bash
   npx vitest run src/lib/gait/__tests__/split_half_stress_m8_2.test.ts
   ```
   *Expected Output*: 8 passed tests (0 failed).

3. **Run Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected Output*: Exit code 0 (0 errors).

4. **Run Linter**:
   ```bash
   npm run lint
   ```
   *Expected Output*: Exit code 0 (0 errors).
