# Milestone 1 Empirical Challenger Handoff Report

**Agent**: teamwork_preview_challenger (Challenger 1 for M1)  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/challenger_m1_1/`  
**Date**: 2026-08-10T14:07:27Z  
**Verdict**: **APPROVE**

---

## 1. Observation

All 5 Milestone 1 Critical Bug Fixes (R1–R5) were independently investigated and empirically verified using custom stress harnesses (`src/lib/gait/__tests__/m1_empirical_challenger.test.ts`), strict TypeScript checks (`npx tsc --noEmit`), and Vitest test execution (`npx vitest run`).

### R1: Zifchock Symmetry Angle (SA) Mathematical Correctness
- **Source Code**: `src/lib/gait/symmetry.ts` line 37:
  ```typescript
  const rawSA = (Math.abs(45 - thetaDeg) / 45) * 100;
  ```
- **Docstring**: `src/lib/gait/symmetry.ts` line 13: `SA = (|45deg - arctan(valLeft / valRight)| / 45deg) * 100%`.
- **Empirical Results**:
  - Ratio 1:1 (`valLeft = 10, valRight = 10`): `0.00%`
  - Ratio 2:1 (`valLeft = 20, valRight = 10`): `40.97%` (doubled relative to Phase 2's `/ 90` formula result of `20.48%`)
  - Ratio 3:1 (`valLeft = 30, valRight = 10`): `59.03%` (doubled relative to Phase 2's `29.52%`)
  - Ratio 10:1 (`valLeft = 100, valRight = 10`): `87.31%` (doubled relative to Phase 2's `43.65%`)
  - Zero inputs (`valLeft = 0, valRight = 0`): `0.00%`
  - One-sided zero (`valLeft = 10, valRight = 0`): `100.00%` (capped at max 100%)
  - Negative inputs (`valLeft = -20, valRight = 10`): `40.97%` (takes absolute magnitudes)
  - Extreme values (`valLeft = 1e6, valRight = 1`): `100.00%` (clamped)

### R2: Ipsilateral Stride Length vs Contralateral Step Distance
- **Source Code**: `src/lib/gait/analysis.ts` lines 401–433:
  - Lines 402–415: `leftStep` / `rightStep` computed between contralateral strikes (`heelStrikes[i].side !== heelStrikes[i - 1].side`).
  - Lines 418–432: `leftStride` / `rightStride` computed between ipsilateral strikes (`heelStrikes.filter((e) => e.side === side)`).
- **Empirical Results**:
  - Synthetic sagittal walking sequence (advancing hips, alternating foot strikes):
    - `stepLengthLeft` / `stepLengthRight`: ~0.60 torso units
    - `strideLengthLeft` / `strideLengthRight`: ~1.20 torso units
    - Measured ratio `strideLength / stepLength`: exactly 2.0 (ipsilateral travel equals 2x contralateral travel).

### R3: Low-Cadence Walking (50 SPM) Retention in Frontal View
- **Source Code**: `src/lib/gait/analysis.ts` lines 328–332:
  ```typescript
  const walkFit = (c: number) => {
    if (c < 40 || c > 140) return -1e9;
    return -Math.abs(c - 108);
  };
  ```
- **Empirical Results**:
  - Removed low-cadence penalty `- (c < 70 ? 40 : 0)`.
  - Frontal view walking sequence at 50 SPM processed without false penalty or override by noisy oscillation peaks.

### R4: 3.5s Stride Duration Acceptance & Double Support Search Scaling
- **Source Code**: `src/lib/gait/events.ts` and `src/lib/gait/analysis.ts`:
  - `src/lib/gait/events.ts` line 679: raised stance phase calculation stride duration limit from `2.5` to `4.0` seconds (`strideDur > 0.3 && strideDur < 4.0`).
  - `src/lib/gait/events.ts` line 725: raised step interval limit from `2.5` to `4.0` seconds (`dt > 0.15 && dt < 4.0`).
  - `src/lib/gait/events.ts` line 734: `dsSearchLimit = Math.min(0.75 * meanStepTime, 1.0)`.
  - `src/lib/gait/analysis.ts` line 363: `avgStepTimeSec` upper limit raised to `<= 2.5`s.
- **Empirical Results**:
  - Slow walking sequence with 3.5s stride duration (34 SPM): accepted without rejection, stance % and double support % correctly computed with search limit scaled to 1.0s.

### R5: DTE Clamping
- **Source Code**: `src/lib/gait/dte.ts` line 59:
  ```typescript
  stepTimeCvDTE = Math.max(-100.0, Math.min(100.0, stepTimeCvDTE));
  ```
- **Empirical Results**:
  - Baseline CV = `0.01`, Dual-Task CV = `0.50`: raw DTE `-4900%` properly clamped to `-100.0%`.
  - Baseline CV = `0.50`, Dual-Task CV = `0.001`: raw DTE `+99.8%` retained within `[-100%, +100%]`.

---

## 2. Logic Chain

1. **R1**: Zifchock et al. (2008) defines symmetry angle $SA = \frac{|45^\circ - \theta|}{45^\circ} \times 100\%$ where $\theta = \arctan(x_L / x_R)$. Setting the denominator to 45 (instead of 90) doubles all SA values to their true physiological scale $[0, 100\%]$. Empirical ratio testing confirmed that ratio 2:1 yields 40.97% (exactly double 20.48%) and maximum asymmetry reaches 100.0%.
2. **R2**: Step length measures travel between opposite foot contacts (left to right, right to left). Stride length measures travel between consecutive contacts of the same foot (left to left, right to right). Filtering heel strikes by matching `side` isolates ipsilateral strides, yielding a stride length exactly double the step length in uniform gait.
3. **R3**: Eliminating the hardcoded 40-point penalty for cadences below 70 SPM ensures that slow walking clips (such as Parkinsonian gait at 50 SPM) are retained by `walkFit` rather than overridden by false harmonic oscillation peaks.
4. **R4**: Impaired or walker-assisted patients exhibit stride durations up to 3.5s–4.0s and double support phases lasting >0.5s. Raising the duration ceiling from 2.5s to 4.0s and dynamically scaling the double support search limit to $\min(0.75 \times \bar{t}_{\text{step}}, 1.0)$ prevents false rejection of valid slow strides while preserving tight search windows for normal gait.
5. **R5**: Small baseline step time variability (e.g. CV = 0.01) creates extreme relative percent changes under dual-task perturbation. Clamping `stepTimeCvDTE` to $[-100.0\%, +100.0\%]$ bounds metric swings while preserving directional cost classification.

---

## 3. Caveats

- **Upstream SA Threshold Adjustments**: Because SA values doubled across the engine, assertion thresholds checking high symmetry in E2E tests were updated from `< 8.0` to `< 16.0` (e.g., in `e2e_engine_enhancements.test.ts`). This is expected and mathematically correct.
- No caveats regarding mathematical accuracy or edge case handling.

---

## 4. Conclusion

All 5 Milestone 1 Critical Bug Fixes (R1–R5) pass empirical challenge verification, edge case testing, and mathematical validation.

**Verdict: APPROVE**

---

## 5. Verification Method

1. **TypeScript Typecheck**:
   `npx tsc --noEmit` -> 0 errors.
2. **Empirical Test Suite Execution**:
   `npx vitest run src/lib/gait/__tests__/m1_empirical_challenger.test.ts` -> 11/11 tests passing.
3. **Full Vitest Suite Execution**:
   `npx vitest run` -> 100% test pass rate across unit and integration suites.
