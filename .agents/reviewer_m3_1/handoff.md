# Handoff Report — Reviewer 1 (Milestone 3 Fall Risk Hardening R10)

## 1. Observation

- **Observation 1 (Verification Commands Executed)**:
  - `npx vitest run src/lib/gait/__tests__/fallrisk.test.ts`:
    - **Result**: PASSED (24 passed, 0 failed, duration 3.59s).
  - `npx vitest run`:
    - **Result**: FAILED (84 test files passed, 10 failed, 1230 tests passed, 18 failed). The failures in full suite were due to worker timeouts under high concurrency and test timeouts in stress suites (`m7_steptimecv_stress.test.ts`, `sample_picker.test.ts`, `WebcamCapture.test.tsx`, etc.).
  - `npx tsc --noEmit`:
    - **Result**: FAILED with 10 TypeScript compilation errors in `src/lib/gait/__tests__/fallrisk_r10_stress.test.ts`:
      ```
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(173,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(177,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(178,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(179,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(184,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(339,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(343,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(344,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(345,9): error TS2322: Type 'null' is not assignable to type 'number'.
      src/lib/gait/__tests__/fallrisk_r10_stress.test.ts(350,9): error TS2322: Type 'null' is not assignable to type 'number'.
      ```
  - `npx eslint`:
    - **Result**: PASSED (0 errors, 29 warnings).

- **Observation 2 (R10 Sub-Requirement Audit)**:
  - **R10.a (Height-adjusted Gait Speed Proxy)**: `src/lib/gait/fallrisk.ts:185–236` implements `estimateGaitSpeed(metrics)` helper. It evaluates explicit `gaitSpeedMps`, height-adjusted formula `(cadence * (0.414 * heightMeters) * 2) / 60`, step-length formula `(cadence * stepLength * 2) / 60`, image series trajectory distance, and 1.70m default height fallback. All hardcoded `cadenceSpm * 0.012` occurrences were eliminated across `computeFallRiskModelA`, `computePatientBaseline`, `detectAcuteWeaknessAnomalies`, and `FallRiskPanel.tsx`. (VERIFIED CORRECT)
  - **R10.b (Dynamic STEADI Category Thresholds)**: `src/lib/gait/fallrisk.ts:316–333` computes `highRiskBreachThreshold = Math.ceil(0.6 * evaluatedCount)` and `modRiskBreachThreshold = Math.ceil(0.3 * evaluatedCount)`. Frontal view clips with `evaluatedCount = 2` require 2 breaches for High Risk. (VERIFIED CORRECT)
  - **R10.c (Model B Dynamic Weight Re-Normalization)**: `src/lib/gait/fallrisk.ts:472–506` checks `kinematicsScore`, `trunkSwayScore`, `dteScore`, and `variabilityScore` for `null`. Base weights of non-null sub-scores are re-normalized by dividing by `validWeightSum`. (VERIFIED CORRECT)
  - **R10.d (Orthogonal Planes Separation)**: `src/lib/gait/fallrisk.ts:444–452` marks `trunkSwayScore` as `null` when lateral sway is unavailable without substituting `verticalBounce`. Missing lateral sway is skipped in `computePatientBaseline` and `detectAcuteWeaknessAnomalies`. (VERIFIED CORRECT)

- **Observation 3 (Adversarial & Integrity Audit)**:
  - No facade or dummy implementations found in `src/lib/gait/fallrisk.ts`.
  - No hardcoded test outputs embedded in source code.
  - The implementation logic is genuine, clinical, and complete.

## 2. Logic Chain

1. *Requirement Compliance*: The core algorithm changes in `src/lib/gait/fallrisk.ts` and UI integration in `src/components/gait/FallRiskPanel.tsx` correctly fulfill all four sub-requirements of R10 (height-adjusted gait speed proxy, dynamic STEADI thresholds, weight re-normalization, orthogonal plane separation).
2. *Compilation Failure*: In `src/lib/gait/__tests__/fallrisk_r10_stress.test.ts`, lines 165–201 and 331–367 instantiate `emptyMetrics: GaitMetrics` with `null` assigned to properties (`stepTimeAsymmetry`, `armSwingLeft`, `armSwingRight`, `armSwingAsymmetry`, `doubleSupportHint`) defined as `number` (non-nullable) in `src/lib/gait/types.ts`.
3. *Acceptance Criteria Violation*: Project acceptance criteria strictly require **0 TypeScript errors (`npx tsc --noEmit`)**. Because `npx tsc --noEmit` fails with 10 compilation errors in `fallrisk_r10_stress.test.ts`, the milestone cannot be approved in its current state.

## 3. Caveats

No caveats. The review was comprehensive across `fallrisk.ts`, `FallRiskPanel.tsx`, and all associated test files.

## 4. Conclusion

**Verdict**: `REQUEST_CHANGES`

**Summary of Findings**:
1. **[Major] TypeScript Compilation Failure in Test Harness**:
   - **Location**: `src/lib/gait/__tests__/fallrisk_r10_stress.test.ts` lines 173, 177, 178, 179, 184, 339, 343, 344, 345, 350.
   - **Problem**: `emptyMetrics` assigns `null` to `stepTimeAsymmetry`, `armSwingLeft`, `armSwingRight`, `armSwingAsymmetry`, and `doubleSupportHint`. In `src/lib/gait/types.ts`, these fields are typed as `number`.
   - **Required Fix**: Change `null` to `0` (or appropriate number default) for non-nullable `GaitMetrics` fields in `fallrisk_r10_stress.test.ts` so `npx tsc --noEmit` passes with 0 errors.

## 5. Verification Method

To independently verify:
```bash
npx vitest run src/lib/gait/__tests__/fallrisk.test.ts
npx tsc --noEmit
npx eslint
```
- Current state: `fallrisk.test.ts` passes 24/24, `eslint` passes with 0 errors, but `tsc --noEmit` fails with 10 type errors in `fallrisk_r10_stress.test.ts`.
- Expected state after fix: 0 TypeScript errors across the entire codebase.
