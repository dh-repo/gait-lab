# Milestone 1 (M1) Review Report

**Reviewer Agent ID**: `teamwork_preview_reviewer_m1_1`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_reviewer_m1_1`  
**Date**: 2026-08-10  

---

## 1. Executive Summary

- **Verdict**: **`REQUEST_CHANGES`**
- **Review Target**: Milestone 1 (M1) changes in `src/lib/gait/analysis.ts` and related test/component files.
- **Verification Commands Executed**:
  1. `npx vitest run` — **PASS** (100% green pass rate across all 83 test suites and 1,050+ tests).
  2. `npx tsc --noEmit` — **PASS** (0 TypeScript compilation errors).
  3. `npx eslint .` — **FAIL** (1 ESLint error, 32 warnings in `hungarian_r1_empirical_stress.test.ts`).
  4. `npm run build` — **PASS** (Production build succeeded).

---

## 2. Detailed Technical Review by Requirement

### 2.1 Requirement R1: Hungarian (Kuhn-Munkres) Optimal Bipartite Matching

- **Implementation Location**: `src/lib/gait/analysis.ts` (lines 868–931, `hungarianAlgorithm()`; lines 972–1040 in `matchPeople()`).
- **Mathematical & Engineering Audit**:
  - **Algorithm Correctness**: `hungarianAlgorithm` implements the $O(K^3)$ Jonker-Volgenant / Kuhn-Munkres augmenting path algorithm using dual variables `u` and `v`, min-potential tracking `minv`, and augmenting path back-tracking `way` and `p`.
  - **Cost Matrix Construction**:
    - Pad matrix dimensions to $K \times K$ where $K = \max(N, M)$ ($N$ = tracks, $M$ = detections).
    - Unassigned / dummy entries and invalid pairings are assigned `SENTINEL_COST = 1e9`.
    - Cost function: $\text{cost} = \text{minDist} + \text{bioDist} \times 0.25$.
    - Dynamic spatial gating: $\text{maxAllowedDist} = 0.22 + 0.15 \min(1.0, \text{speed}) + \min(0.20, (\text{gap}-1) \times 0.08) + (\text{bioDist} < 0.25 ? 0.08 : 0)$.
    - Dynamic cost gating: $\text{maxAllowedCost} = \max(0.45, \text{maxAllowedDist} + 0.10)$.
  - **Index Mapping & Validation**:
    - The returned assignment array `assignments` maps row $ti$ (track) to column $di$ (detection).
    - Checks `di < M`, `costMatrix[ti][di] < 1e8`, and `meta.isValid` before finalizing track assignment.
    - Unmatched detections ($di$ unassigned) correctly spawn new tracks with initial biometrics and velocity.
- **Verdict on R1 Implementation**: **Core algorithm is mathematically sound and correct.**

---

### 2.2 Requirement R6: Visibility-Gated Biometrics & Sagittal Aspect Ratio Fix

- **Implementation Location**: `src/lib/gait/analysis.ts` (lines 718–785, `computeBiometricSignature()`; lines 787–812, `biometricDistance()`).
- **Keypoint Visibility Gating**:
  - Required landmarks: Left/Right Shoulders (11, 12), Hips (23, 24), and Ankles (27, 28).
  - Explicit check: `(vis < 0.4)` returns `undefined`, effectively rejecting occluded or low-confidence keypoint ratios.
- **Nullability Safety Across Callers**:
  - `computeBiometricSignature()` return type updated to `BiometricSignature | undefined`.
  - `biometricDistance(a?: BiometricSignature, b?: BiometricSignature)` safely returns `0` if `!a || !b`.
  - `humanLikenessScore` uses optional chaining (`bio?.aspectRatio`) with fallbacks.
  - `matchPeople` guards biometric updates with `if (bio)`.
  - `GaitApp.tsx` guards state updates with `if (newBio)`.
- **Sagittal Profile Aspect Ratio Reweighting**:
  - Detects sagittal profile: `isSagittal = a.aspectRatio < 0.35 && b.aspectRatio < 0.35`.
  - Reweights distance components: $w_{\text{Aspect}} = 0.475$, $w_{\text{TorsoLeg}} = 0.475$, $w_{\text{ShoulderHip}} = 0.05$ (versus standard $0.35, 0.35, 0.30$).
  - Prevents noisy 2D projected shoulder/hip width fluctuations in side-view camera angles from disrupting track matching.
- **Verdict on R6 (Visibility & Sagittal)**: **Fully Compliant & Correct.**

---

### 2.3 Requirement R6: Mean-Visibility Weighted Exponential Moving Average (EMA)

- **Implementation Location**: `src/lib/gait/analysis.ts` (lines 739–740, 1067–1084).
- **Mathematical Audit**:
  - `meanVisibility` is calculated as the mean visibility of the 6 required keypoints ($[11, 12, 23, 24, 27, 28]$).
  - Alpha learning rate: $\alpha = \text{clamp}(0.30 \times \text{meanVisibility}, 0.05, 0.50)$.
  - Track update formula: $\text{val}_{\text{new}} = (1 - \alpha) \cdot \text{val}_{\text{old}} + \alpha \cdot \text{val}_{\text{frame}}$.
- **Verdict on R6 (EMA)**: **Fully Compliant & Correct.**

---

## 3. Findings

### Finding 1 [Major]: ESLint Compilation Error in `hungarian_r1_empirical_stress.test.ts`

- **What**: Running `npx eslint .` fails with exit code 1 due to 1 ESLint error:
  `src/lib/gait/__tests__/hungarian_r1_empirical_stress.test.ts:180:11 error 'greedyTracks' is never reassigned. Use 'const' instead prefer-const`
- **Where**: `src/lib/gait/__tests__/hungarian_r1_empirical_stress.test.ts`, Line 180.
- **Why**: Violates the zero ESLint error acceptance criterion (`npx eslint .` must pass with 0 errors).
- **Suggestion**: Change `let greedyTracks` to `const greedyTracks` at line 180 of `hungarian_r1_empirical_stress.test.ts`.

---

## 4. Anti-Cheating & Integrity Audit

- **Hardcoded test outputs / expected values embedded in code**: None found.
- **Facade or dummy implementations**: None. The Hungarian algorithm is a complete, working $O(K^3)$ Kuhn-Munkres implementation.
- **Bypassed requirements / shortcuts**: None.
- **Independent execution of verification commands**: Verified directly in this workspace session.

---

## 5. Final Verdict

**Verdict**: **`REQUEST_CHANGES`**  
Reason: 1 ESLint error in `src/lib/gait/__tests__/hungarian_r1_empirical_stress.test.ts:180:11` causing `npx eslint .` to fail with exit code 1.
