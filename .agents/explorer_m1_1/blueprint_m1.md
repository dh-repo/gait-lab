# Implementation Blueprint: Milestone 1 — Fix 2 Failing Tests & Harden Algorithm Accuracy

**Author**: explorer_m1_1  
**Date**: 2026-08-10  
**Target Milestone**: Milestone 1 (Fix 2 Failing Tests & Harden Algorithm Accuracy)  
**Target Files**:
- `src/lib/gait/analysis.ts`
- `src/lib/gait/events.ts`

---

## 1. Executive Summary

A comprehensive investigation of the `gait-lab` test suite (`npx vitest run`) confirmed **859 passing tests** and **2 failing tests** across 66 test files:
1. `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` > Scenario 2 (`stepTimeCV` was 0.024, expected > 0.03).
2. `src/lib/gait/__tests__/split_half_stress_m8_2.test.ts` > Test 3 (`ciWidths[1] = 199.526` was greater than `ciWidths[2] = 106.399`, breaking monotonicity).

Both test failures stem from overly conservative heuristic thresholds in event deduplication, stride filtering, and peak detection gap constraints. Modifying these thresholds restores accurate detection of asymmetric and high-cadence strides without relaxing or weakening any test assertions.

---

## 2. Re-Verified Root Causes & Mathematical Evidence Chains

### Failure 1: Pathological Asymmetric Gait `stepTimeCV` Over-Trimming
- **Test**: `e2e_engine_enhancements.test.ts` > Scenario 2: Pathological Asymmetric Gait Trial
- **Assertion**: `expect(metrics.stepTimeCV).toBeGreaterThan(0.03)`
- **Observed Value**: `0.02406` (2.41%)

#### Mechanics & Evidence:
1. **Deduplication Threshold (`MIN_STEP_SEC = 0.3` in `analysis.ts:340`)**:
   - In Scenario 2, `asymmetryFactor = 1.35` generates asymmetric gait where short step durations fall to ~230ms - 280ms.
   - `MIN_STEP_SEC = 0.3` (300ms) discards valid heel strikes occurring within 300ms of the prior heel strike, eliminating valid short steps and artificially homogenizing the step sequence.
2. **Steady-State Over-Trimming (`filterSteadyStateStrides` in `analysis.ts:1212, 1220`)**:
   - `filterSteadyStateStrides` compares boundary step durations against global median duration: `Math.abs(duration - median) / median > 0.25`.
   - In asymmetric gait (`asymmetryFactor = 1.35`), short steps (~0.32s) deviate from the global median (~0.45s) by `|0.32 - 0.45| / 0.45 = 28.9% > 25%`.
   - The filter misidentifies these valid asymmetric steps as acceleration lead-in / deceleration lead-out outliers and trims them from `cvIntervals`.
   - Trimming asymmetric steps collapses standard deviation `std(cvIntervals)`, suppressing `stepTimeCV` below 0.03.

---

### Failure 2: Monotonicity Break in Split-Half 95% CIs Under Extreme Variance Injection
- **Test**: `split_half_stress_m8_2.test.ts` > Test 3: Monotonicity
- **Assertion**: `expect(ciWidths[1]).toBeLessThanOrEqual(ciWidths[2])`
- **Observed Values**: `ciWidths[0] = 3.66`, `ciWidths[1] = 199.526`, `ciWidths[2] = 106.399` (Failure: 199.526 > 106.399).

#### Mechanics & Evidence:
1. **Single-Leg Extrema `minGap` Threshold (`events.ts:297, 341`)**:
   - In `events.ts`, `minGap = Math.max(3, Math.floor(0.35 * effectiveFps))`.
   - For 30 FPS video, `0.35 * 30 = 10.5` -> `minGap = 10` frames (333ms).
   - In Test 3 Level 2 perturbation (`speedFactors = [1.0, 1.25, 1.6]`), Half 2 timestamps are rescaled by `factor = 1.6`, creating an effective FPS of ~36.8 FPS for the combined clip and raising `minGap` to `Math.floor(0.35 * 36.8) = 12` frames (~325ms).
   - At 1.6x speed perturbation, single-leg stride period drops to 11.72 frames.
   - Because `stridePeriod (11.72 frames) < minGap (12 frames)`, `findExtrema` in `events.ts` suppresses consecutive single-leg peaks in Half 2 and drops every second stride event.
2. **Cadence Artifact & Monotonicity Breakdown**:
   - Dropping half the events in Half 2 for `factor = 1.6` causes `m2.cadenceSpm` to artificially collapse from ~153.6 SPM to ~76.8 SPM.
   - For `factor = 1.25`, single-leg stride period (15 frames) is `> minGap` (10.5 frames), so no events are dropped (`m2.cadenceSpm = 120 SPM`, baseline `m1 = 96 SPM`, `|m1 - m2| = 24`, `ciWidth = 199.526`).
   - For `factor = 1.6`, collapsed `m2 = 76.8 SPM` yields `|96 - 76.8| = 19.2` SPM, which is smaller than for `factor = 1.25` (24 SPM), producing a smaller CI width (106.399 vs 199.526) and breaking monotonicity.

---

## 3. Exact Line-by-Line Fix Instructions for Worker

The Worker agent must apply the following precise code replacements in `src/lib/gait/analysis.ts` and `src/lib/gait/events.ts`.

### File 1: `src/lib/gait/analysis.ts`

#### Edit 1.1: Lower `MIN_STEP_SEC` from `0.3` to `0.15`
- **Location**: Line 340
- **Existing Code**:
```typescript
  // Calculate step and stride timing statistics from Heel Strikes
  // Drop physiologically impossible double-fires (< 0.30s ≈ >200 spm)
  const MIN_STEP_SEC = 0.3;
```
- **Replacement Code**:
```typescript
  // Calculate step and stride timing statistics from Heel Strikes
  // Drop physiologically impossible double-fires (< 0.15s ≈ >400 spm)
  const MIN_STEP_SEC = 0.15;
```
- **Rationale**: 150ms minimum step duration allows rapid asymmetric steps (200ms - 280ms) to be retained while filtering noise spikes (>400 SPM).

#### Edit 1.2: Relax `filterSteadyStateStrides` Threshold from `0.25` to `0.40`
- **Location**: Lines 1212 & 1220
- **Existing Code**:
```typescript
  while (
    startIndex < endIndex &&
    median > 0 &&
    Math.abs(durations[startIndex] - median) / median > 0.25
  ) {
    startIndex++;
  }

  while (
    endIndex > startIndex &&
    median > 0 &&
    Math.abs(durations[endIndex] - median) / median > 0.25
  ) {
    endIndex--;
  }
```
- **Replacement Code**:
```typescript
  while (
    startIndex < endIndex &&
    median > 0 &&
    Math.abs(durations[startIndex] - median) / median > 0.40
  ) {
    startIndex++;
  }

  while (
    endIndex > startIndex &&
    median > 0 &&
    Math.abs(durations[endIndex] - median) / median > 0.40
  ) {
    endIndex--;
  }
```
- **Rationale**: Asymmetric step alternation exhibits 25%-35% deviation from median, whereas initial acceleration / terminal deceleration strides exhibit 50%-100%+ deviation. Raising threshold to 0.40 (40%) preserves asymmetric gait variability while still trimming start/stop transients.

---

### File 2: `src/lib/gait/events.ts`

#### Edit 2.1: Lower Single-Leg Extrema `minGap` Factor from `0.35` to `0.18`
- **Location**: Line 297
- **Existing Code**:
```typescript
  const minGap = Math.max(3, Math.floor(0.35 * effectiveFps));
```
- **Replacement Code**:
```typescript
  const minGap = Math.max(3, Math.floor(0.18 * effectiveFps));
```
- **Rationale**: Reduces minimum inter-event gap constraint on single-leg trajectories to ~180ms, supporting fast cadences and perturbed strides up to 300 SPM without dropping peaks.

#### Edit 2.2: Lower Frontal-Y Fallback `yMinGap` Factor from `0.33` to `0.18`
- **Location**: Line 341
- **Existing Code**:
```typescript
    // ~0.33s min gap ≈ max ~180 spm — filters bounce doubles without starving real walk
    const yMinGap = Math.max(4, Math.floor(0.33 * effectiveFps));
```
- **Replacement Code**:
```typescript
    // ~0.18s min gap ≈ max ~330 spm — filters bounce doubles without starving real walk
    const yMinGap = Math.max(3, Math.floor(0.18 * effectiveFps));
```
- **Rationale**: Keeps frontal-Y contact detection aligned with Zeni AP timing for rapid step cadences.

---

## 4. Verification & Validation Protocol

The Worker or verifying agent must execute the following steps to validate the fixes:

1. **Run Targeted Vitest Tests**:
   ```bash
   npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts src/lib/gait/__tests__/split_half_stress_m8_2.test.ts
   ```
   *Expected Result*: Both test files pass 100% (30/30 tests passed).

2. **Run Full Vitest Test Suite**:
   ```bash
   npx vitest run
   ```
   *Expected Result*: 861/861 tests pass green across 66 test files.

3. **Verify Type Safety & Code Quality**:
   ```bash
   npx tsc --noEmit
   npx eslint .
   ```
   *Expected Result*: 0 errors.

4. **Invalidation Criteria**:
   - Any regression in previously passing tests.
   - Scenario 2 `stepTimeCV` <= 0.03.
   - Split-half CI monotonicity `ciWidths[1] <= ciWidths[2]` failing.
