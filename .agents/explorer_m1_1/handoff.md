# Milestone 1 Investigation Handoff Report: R1 & R5

**Agent**: teamwork_preview_explorer (Explorer 1 for M1)  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_1/`  
**Date**: 2026-08-10T14:02:58Z  

---

## 1. Observation

### R1: Zifchock Symmetry Angle (SA) Equation Scaling Error
- **File**: `src/lib/gait/symmetry.ts`
- **Line 13 (Docstring)**:
  ```typescript
  * SA = (|45deg - arctan(valLeft / valRight)| / 90deg) * 100%
  ```
- **Line 37 (Implementation)**:
  ```typescript
  const rawSA = (Math.abs(45 - thetaDeg) / 90) * 100;
  ```
- **File**: `src/lib/gait/analysis.ts`
- **Line 393 (Comment)**:
  ```typescript
  // Overall composite Zifchock Symmetry Angle (SA) [0, 50]%
  ```

- **Impacted Unit Test Assertions (Found via `grep_search`)**:
  1. `src/lib/gait/__tests__/symmetry.test.ts`:
     - Line 34: `expect(sa2_1).toBeCloseTo(20.48, 1);` (for ratio 100:50)
     - Line 38: `expect(sa3_1).toBeCloseTo(29.52, 1);` (for ratio 30:10)
     - Line 42: `expect(sa10_1).toBeCloseTo(43.65, 1);` (for ratio 100:10)
     - Line 45: `it("enforces absolute maximum cap of 50.0%", () => {`
     - Line 47: `expect(symmetryAngle(10, 0)).toBe(50.0);`
     - Line 48: `expect(symmetryAngle(0, 100)).toBe(50.0);`
  2. `src/lib/gait/__tests__/m2_challenger_verification.test.ts`:
     - Line 190: `expect(symmetryAngle(10, 0)).toBe(50.0);`
     - Line 191: `expect(symmetryAngle(0, 10)).toBe(50.0);`
     - Line 192: `expect(symmetryAngle(100000, 0.0001)).toBeLessThanOrEqual(50.0);`
  3. `src/lib/gait/__tests__/m4_challenger_verification.test.ts`:
     - Line 151: `expect(symmetryAngle(100, 0)).toBe(50.0);`
     - Line 152: `expect(symmetryAngle(0, 100)).toBe(50.0);`
  4. `src/lib/gait/__tests__/nan_property.test.ts`:
     - Line 44: `expect(symmetryAngle(-100, 0)).toBe(50);`
  5. `src/lib/gait/__tests__/stress_adversarial.test.ts`:
     - Line 46: `test("symmetryAngle mathematically caps at 50% asymmetry despite [0, 100]% claim", () => {`
     - Line 52: `expect(saZeroRight).toBe(50);`
     - Line 56: `expect(saZeroLeft).toBe(50);`
     - Line 60: `expect(saExtreme).toBeLessThanOrEqual(50);`

---

### R5: Dual-Task Effect (DTE) Unbounded Percentage Spikes
- **File**: `src/lib/gait/dte.ts`
- **Lines 56–59 (Implementation)**:
  ```typescript
  // 2. Step Time CV DTE (lower is better -> inverted sign)
  let stepTimeCvDTE = 0.0;
  const baseCv = baseline.stepTimeCV > 1e-6 ? baseline.stepTimeCV : 0.05;
  stepTimeCvDTE = -((dualTask.stepTimeCV - baseCv) / baseCv) * 100;
  ```
- **Observed Behavior**:
  When `baseline.stepTimeCV` is small (e.g. `0.02`) and `dualTask.stepTimeCV` increases (e.g. `0.08`), the unclamped formula evaluates to `-((0.08 - 0.02) / 0.02) * 100 = -300%`.
- **Existing Test Coverage**:
  In `src/lib/gait/__tests__/dte.test.ts`, tests evaluate DTE values within `[-100%, +100%]`. None assert unclamped spike behavior exceeding 100% magnitude.

---

### Baseline Test Suite Execution
- **Command executed**: `npx vitest run`
- **Output**: 90 test files passed, 1224 tests passed (0 failures).

---

## 2. Logic Chain

### Logic Chain for R1: Zifchock SA Scaling Fix
1. **Observation**: `symmetry.ts` line 37 computes `rawSA = (Math.abs(45 - thetaDeg) / 90) * 100`.
2. **Mathematical Formulation (Zifchock et al. 2008)**:
   For positive metric values $X_L, X_R$, the angle $\theta = \arctan(X_L / X_R) \in [0^\circ, 90^\circ]$.
   Symmetry corresponds to $X_L = X_R \implies \theta = 45^\circ$, where $|45^\circ - \theta| = 0^\circ$.
   Maximum asymmetry occurs when one side is 0, so $\theta = 0^\circ$ or $90^\circ$, giving $|45^\circ - \theta| = 45^\circ$.
   To express SA as a percentage in $[0, 100\%]$, the maximum angle difference ($45^\circ$) must be the denominator:
   $$\text{SA} = \frac{|45^\circ - \theta|}{45^\circ} \times 100\%$$
3. **Conclusion for Code Edit**:
   - In `symmetry.ts` line 37: replace `/ 90` with `/ 45`.
   - In `symmetry.ts` line 13: replace `/ 90deg` with `/ 45deg`.
   - In `analysis.ts` line 393: update comment from `[0, 50]%` to `[0, 100]%`.
4. **Conclusion for Test Updates**:
   - Doubling the denominator scaling doubles all non-zero SA outputs.
   - For complete asymmetry ($X_L = 10, X_R = 0$), SA moves from 50.0% to 100.0%.
   - For ratio 2:1 ($100, 50$), $\theta = 63.4349^\circ \implies |45 - 63.4349| / 45 \times 100 = 40.966\% \approx 40.97\%$.
   - For ratio 3:1 ($30, 10$), $\theta = 71.5651^\circ \implies |45 - 71.5651| / 45 \times 100 = 59.033\% \approx 59.03\%$.
   - For ratio 10:1 ($100, 10$), $\theta = 84.2894^\circ \implies |45 - 84.2894| / 45 \times 100 = 87.310\% \approx 87.31\%$.

### Logic Chain for R5: DTE Clamping Fix
1. **Observation**: In `dte.ts` lines 57-58, `stepTimeCvDTE` is calculated as `-((dualTask.stepTimeCV - baseCv) / baseCv) * 100`.
2. **Risk**: A baseline CV of `0.02` combined with a dual-task CV of `0.08` generates `-300%` DTE, causing unbounded percentage spikes.
3. **Conclusion for Code Edit**:
   - Clamp `stepTimeCvDTE` to `[-100.0, +100.0]`.
   - Proposed replacement for `dte.ts` lines 58-59:
     ```typescript
     stepTimeCvDTE = -((dualTask.stepTimeCV - baseCv) / baseCv) * 100;
     stepTimeCvDTE = Math.max(-100.0, Math.min(100.0, stepTimeCvDTE));
     ```
4. **Conclusion for Test Updates**:
   - Add a unit test in `src/lib/gait/__tests__/dte.test.ts` verifying that `stepTimeCvDTE` clamps to `-100.0%` for extreme CV increases and `+100.0%` for extreme CV decreases.

---

## 3. Caveats

1. **Other Gait Symmetry Functions**:
   `gaitSymmetryIndex` (GSI) in `symmetry.ts` computes simple ratio `(min/max) * 100%`. It is unaffected by R1 and requires no changes.
2. **Downstream UI / Composite Scores**:
   `symmetryScore` in `analysis.ts` line 500 (`100 - symmetryAngleVal * 1.8 - ...`) uses `symmetryAngleVal`. When SA doubles, `symmetryAngleVal` will double, which is intended per R1 requirement ("SA scores double relative to Phase 2").
3. **Scope Limit**:
   This report covers R1 and R5 only. R2, R3, and R4 will be investigated and implemented by dedicated agents for Milestone 1.

---

## 4. Conclusion & Precise Proposed Changes

### Proposed Code Changes (Patch Preview)

#### 1. Target: `src/lib/gait/symmetry.ts`
```diff
--- a/src/lib/gait/symmetry.ts
+++ b/src/lib/gait/symmetry.ts
@@ -13,1 +13,1 @@
- * SA = (|45deg - arctan(valLeft / valRight)| / 90deg) * 100%
+ * SA = (|45deg - arctan(valLeft / valRight)| / 45deg) * 100%
@@ -37,1 +37,1 @@
-  const rawSA = (Math.abs(45 - thetaDeg) / 90) * 100;
+  const rawSA = (Math.abs(45 - thetaDeg) / 45) * 100;
```

#### 2. Target: `src/lib/gait/dte.ts`
```diff
--- a/src/lib/gait/dte.ts
+++ b/src/lib/gait/dte.ts
@@ -58,2 +58,3 @@
   const baseCv = baseline.stepTimeCV > 1e-6 ? baseline.stepTimeCV : 0.05;
   stepTimeCvDTE = -((dualTask.stepTimeCV - baseCv) / baseCv) * 100;
+  stepTimeCvDTE = Math.max(-100.0, Math.min(100.0, stepTimeCvDTE));
```

#### 3. Target: `src/lib/gait/analysis.ts`
```diff
--- a/src/lib/gait/analysis.ts
+++ b/src/lib/gait/analysis.ts
@@ -393,1 +393,1 @@
-  // Overall composite Zifchock Symmetry Angle (SA) [0, 50]%
+  // Overall composite Zifchock Symmetry Angle (SA) [0, 100]%
```

#### 4. Target Test Files
- `src/lib/gait/__tests__/symmetry.test.ts`:
  Update lines 34 (`40.97`), 38 (`59.03`), 42 (`87.31`), 45 (`100.0%` title), 47 (`100.0`), 48 (`100.0`).
- `src/lib/gait/__tests__/m2_challenger_verification.test.ts`:
  Update lines 190 (`100.0`), 191 (`100.0`), 192 (`100.0`).
- `src/lib/gait/__tests__/m4_challenger_verification.test.ts`:
  Update lines 151 (`100.0`), 152 (`100.0`).
- `src/lib/gait/__tests__/nan_property.test.ts`:
  Update line 44 (`100`).
- `src/lib/gait/__tests__/stress_adversarial.test.ts`:
  Update lines 46 (title), 52 (`100`), 56 (`100`), 60 (`100`).
- `src/lib/gait/__tests__/dte.test.ts`:
  Add test for `stepTimeCvDTE` clamping to `[-100.0, +100.0]`.

---

## 5. Verification Method

1. Run `npx vitest run src/lib/gait/__tests__/symmetry.test.ts` to verify Zifchock SA exact outputs and maximum 100% cap.
2. Run `npx vitest run src/lib/gait/__tests__/dte.test.ts` to verify DTE clamping.
3. Run `npx vitest run` across the full test suite to ensure 100% pass rate.
4. Run `npx tsc --noEmit` to verify 0 TypeScript compilation errors.
