# Empirical Stress Test Report — Visibility-Gated Biometrics & Sagittal Fix (R6)

**Agent**: teamwork_preview_challenger_m1_iter2_2  
**Date**: 2026-08-10  
**Milestone**: M1 Iteration 2 (Challenger 2)  
**Status**: APPROVED  

---

## Executive Summary

As Empirical Challenger 2 for Milestone 1 Iteration 2, I conducted rigorous empirical stress testing on the **Visibility-Gated Biometrics & Sagittal Fix (R6)** implementation in `src/lib/gait/analysis.ts`.

All 10 focused stress tests in `src/lib/gait/__tests__/challenger_m1_2_empirical_stress.test.ts` passed cleanly. Furthermore, the global test suite of **90 test files (1,224 individual tests)** passed with 100% success rate. TypeScript compilation (`npx tsc --noEmit`), ESLint (`npx eslint .`), and production build (`npm run build`) were verified with zero errors.

---

## Empirical Stress Test Results

### 1. Focused Stress Suite (`challenger_m1_2_empirical_stress.test.ts`)
- **Command**: `npx vitest run src/lib/gait/__tests__/challenger_m1_2_empirical_stress.test.ts`
- **Result**: PASSED (10/10 tests passed in 15ms)

### 2. Global Test Suite
- **Command**: `npx vitest run`
- **Result**: PASSED (90/90 test files passed, 1,224/1,224 tests passed)

### 3. Static Analysis & Type Safety
- **TypeScript**: `npx tsc --noEmit` — 0 errors
- **ESLint**: `npx eslint .` — 0 errors, 27 warnings (all unused variable warnings in test helpers/fixtures)

### 4. Production Build Verification
- **Command**: `npm run build`
- **Result**: PASSED (Vite + Nitro Vercel target build succeeded in < 2s)

---

## Detailed Scenario Analysis

### Scenario 1: Low-Visibility & Occlusion Stress Testing
- **Hypothesis**: Keypoints with low visibility (< 0.4) or missing visibility properties could produce garbage biometric ratios and cause downstream `NaN` or tracking mismatches.
- **Empirical Findings**:
  - **Threshold Enforcement**: Any landmark in the required biometric set `[11, 12, 23, 24, 27, 28]` with `visibility < 0.4` correctly forces `computeBiometricSignature()` to return `undefined`.
  - **Combination Testing**: Tested single, paired, triplet, and full-set occlusions. All sub-threshold visibility cases safely returned `undefined`.
  - **Missing Property Defaulting**: Landmarks lacking a `visibility` property default safely to `1.0`, ensuring backward compatibility with unannotated mock inputs.
  - **Caller Safety**: Verified `biometricDistance(undefined, sig)`, `humanLikenessScore(undefined, box)`, `isLikelyHumanTrack(undefined, box)`, and `matchPeople(...)` with occluded detections operate safely without throwing exceptions or propagating `NaN`/`Infinity`.

### Scenario 2: Sagittal View Aspect Ratio Sweep
- **Hypothesis**: In sagittal (profile) walking views (`aspectRatio < 0.35`), 2D projected shoulder/hip width varies dramatically due to arm swing and overlapping limbs, which can explode scale-invariant distance metrics.
- **Empirical Findings**:
  - **Aspect Ratio Sweep**: Swept `aspectRatio` from `0.7` down to `0.1` in `0.02` increments. The distance metric `biometricDistance()` remained smooth, bounded, and non-exploding.
  - **Dynamic Reweighting**: When `aspectRatio < 0.35` for both signatures, `wShoulderHip` is automatically reduced from `0.30` to `0.05`, while `wAspect` and `wTorsoLeg` increase to `0.475` each.
  - **Extreme Fluctuations**: Introduced extreme `shoulderHipRatio` differences (from 0.01x up to 100x). In sagittal mode, total distance remained strictly capped below `0.10`, preventing track fragmentation or false disassociations.
  - **Boundary Continuity**: Evaluated distance behavior around the `0.35` threshold (`0.349` vs `0.351`), confirming proper threshold switching without discontinuity bugs.

### Scenario 3: Dynamic Visibility EMA Trajectory
- **Hypothesis**: Fluctuating landmark visibility during tracking could allow noisy low-visibility frames to corrupt high-confidence biometric profiles.
- **Empirical Findings**:
  - **High-Visibility Dominance**: Tested a 50-frame sequence alternating high-visibility (`meanVis = 0.95`), low-visibility (`meanVis = 0.42`), and occluded (`meanVis = 0.20`) frames.
  - **EMA Weighting**: Since update weight $\alpha = 0.30 \times \text{meanVis}$, high-visibility updates ($\alpha = 0.285$) carry $> 2.26\times$ higher weight than low-visibility updates ($\alpha = 0.126$). The resulting trajectory remained anchored close to the high-visibility signature (`finalBio.aspectRatio` closer to high-vis baseline, tracked `meanVisibility > 0.65`).
  - **Zero Drift on Occlusion**: Frames with sub-threshold visibility (`< 0.4`) returned `undefined` biometrics and were ignored by `matchPeople()`, maintaining identical biometrics across long occlusion intervals.

---

## Verdict & Recommendation

**Verdict**: **APPROVE**

The Visibility-Gated Biometrics & Sagittal Fix (R6) implementation is mathematically sound, highly resilient to occlusion/noise, properly handles sagittal perspective changes, and passes all empirical stress tests and project build checks.
