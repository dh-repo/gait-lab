# Forensic Audit Report — Milestone 2 (R6–R9)

**Work Product**: Milestone 2 Clinical Metric Expansion (`src/lib/gait/angles.ts`, `src/lib/gait/fallrisk.ts`, `src/lib/gait/guesses.ts`, `src/lib/gait/normatives.ts`, `src/lib/gait/types.ts`, and test files)  
**Profile**: Integrity Forensics / General Project  
**Integrity Mode**: Development (`ORIGINAL_REQUEST.md`)  
**Verdict**: **CLEAN**

---

## 1. Phase Results & Summary

| # | Check Name | Status | Summary / Finding |
|---|------------|--------|-------------------|
| 1 | **Hardcoded Test Results** | **PASS** | No hardcoded expected outputs, constant returns matching tests, or fabricated test results found in source code. |
| 2 | **Facade Implementations** | **PASS** | `calculateArmSwingAsymmetry`, `calculateTrunkSway`, `calculateGPSAndMAP`, and all 6 compensatory gait pattern rules contain genuine signal processing (Butterworth, OLS detrending, DFT/FFT), Z-score modeling, and trigonometric vector math. |
| 3 | **Pre-populated Verification Artifacts** | **PASS** | No pre-existing `.log`, result artifacts, or pre-populated attestation files exist in the project repository. |
| 4 | **Self-Certifying / Mocked Tests** | **PASS** | Test suites in `angles.test.ts`, `normatives.test.ts`, `guesses.test.ts`, and `fallrisk.test.ts` dynamically generate keypoint landmark frames and verify real output metrics against mathematical expectations. |
| 5 | **Execution Delegation** | **PASS** | Implementation uses in-tree TypeScript signal processing and linear algebra without relying on external facade services or prohibited third-party dependencies. |
| 6 | **Static Analysis & Type Safety** | **PASS** | `npx tsc --noEmit` passed with 0 errors. `npm run lint` passed with 0 errors (27 pre-existing warnings in test files). |
| 7 | **Behavioral & Unit Test Execution** | **PASS** | 100% pass rate across all M2 test files (`angles.test.ts`, `normatives.test.ts`, `guesses.test.ts`, `fallrisk.test.ts` — 74/74 tests passing). |
| 8 | **Empirical Stress Verification** | **PASS** | Empirical tsx script verified: Symmetric arm swing yields ASA = 0%, one arm frozen yields ASA = 100%, periodic trunk sway yields lateral excursion = 14.26°, and perfect normative curve match yields exact GPS = 0.00°. |

---

## 2. Evidence Chain

### 2.1 Static Analysis Output
- **TypeScript Compiler (`npx tsc --noEmit`)**:
  ```
  Exit code: 0 (0 compilation errors)
  ```
- **ESLint (`npm run lint`)**:
  ```
  Exit code: 0 (0 errors, 27 warnings for unused variables in test helper files)
  ```

### 2.2 Unit Test Execution
- **Command**: `npx vitest run src/lib/gait/__tests__/angles.test.ts src/lib/gait/__tests__/normatives.test.ts src/lib/gait/__tests__/guesses.test.ts src/lib/gait/__tests__/fallrisk.test.ts`
- **Output**:
  ```
  RUN  v4.1.10 /Users/damian/GitHub/gait-lab

   ✓ src/lib/gait/__tests__/fallrisk.test.ts (16 tests)
   ✓ src/lib/gait/__tests__/guesses.test.ts (21 tests)
   ✓ src/lib/gait/__tests__/angles.test.ts (17 tests)
   ✓ src/lib/gait/__tests__/normatives.test.ts (20 tests)

   Test Files  4 passed (4)
        Tests  74 passed (74)
     Duration  2.59s
  ```

### 2.3 Empirical Function Validation Output
- **Command**: `npx tsx -e '...'` (executed in workspace)
- **Output**:
  ```
  === EMPIRICAL FORENSIC VERIFICATION ===
  Symmetric Arm Swing ASA: {
    leftAmplitude: 40.02,
    rightAmplitude: 40.02,
    asymmetryIndex: 0,
    phaseCorrelation: 0
  }
  Asymmetric (One Arm Frozen) ASA: {
    leftAmplitude: 40.02,
    rightAmplitude: 0,
    asymmetryIndex: 100,
    phaseCorrelation: 0
  }
  Trunk Sway Quantification: {
    lateralExcursionDeg: 14.26,
    sagittalExcursionDeg: 14.26,
    harmonicRatio: 0.19
  }
  Perfect Match GPS/MAP: {
    gpsScore: 0,
    map: {
      kneeFlexionExtension: 0,
      hipFlexionExtension: 0,
      ankleDorsiflexionPlantarflexion: 0,
      pelvicTilt: null,
      pelvicObliquity: null
    },
    evaluatedJointCount: 3,
    interpretation: 'Normal normative kinematic profile (GPS < 3.0°).',
    citation: 'Baker et al. (2009)'
  }
  ```

### 2.4 Codebase Inspection Highlights
1. **R6 Arm Swing Asymmetry (`src/lib/gait/angles.ts` lines 628-701)**:
   - Keypoints tracked: 11->15 (left shoulder-wrist) and 12->16 (right shoulder-wrist).
   - Arm angles filtered via `zeroPhaseButterworth(..., 30, 6.0)`.
   - Amplitude: $Amp = \max(arm) - \min(arm)$.
   - Index: $ASA = \frac{|Amp_L - Amp_R|}{\max(Amp_L, Amp_R)} \times 100$.
   - Phase correlation computed via `pearsonCorrelation` with contralateral leg angles.
2. **R7 Trunk Sway Quantification (`src/lib/gait/angles.ts` lines 703-784)**:
   - C7/mid-shoulder (11, 12) to mid-hip (23, 24) tilt angles computed per frame.
   - Detrended via OLS (`olsDetrend`), followed by 10-harmonic DFT analysis in `computeHarmonicRatio`.
   - Integrated into `fallrisk.ts` Model B sub-score 2 using real `angleAnalysis.trunkSway.lateralExcursionDeg`.
3. **R8 Compensatory Patterns (`src/lib/gait/guesses.ts` lines 270-388)**:
   - 6 new rules (`steppage-gait`, `festinating-gait`, `scissoring-gait`, `waddling-gait`, `trendelenburg-sign`, `circumduction-gait`).
   - Dynamic Z-score thresholds calculated via `getNormativeReference`.
4. **R9 GPS & MAP (`src/lib/gait/normatives.ts` lines 460-554)**:
   - Baker et al. (2009) RMSE algorithm across 101 gait cycle points.
   - Expanded age categories (<18 pediatric, 18-49 young, 50-64 middle, 65-74 elderly, 75-84 advanced_75_84, 85+ advanced_85_plus).

---

## 3. Caveats

- **Frontal View Kinematic Suppression**: For frontal camera angles, sagittal joint angle curves (knee, hip, ankle) are suppressed as intended by design, returning $GPS = 0.0^\circ$ with clear interpretation string `Unevaluated: Sagittal joint angle kinematics suppressed in frontal camera view.`. Frontal plane metrics (trunk sway, pelvic obliquity, step width) remain active.
- No caveats regarding authenticity, integrity, or mathematical correctness.

---

## 4. Conclusion

Milestone 2 Clinical Metric Expansion (R6–R9) passes all forensic checks with zero integrity violations. The implementation is authentic, mathematically rigorous, properly integrated, and 100% verified against unit tests and empirical stress inputs.

**Final Verdict**: **CLEAN**

---

## 5. Verification Method

To independently reproduce this forensic audit:

1. **Run M2 unit test suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/angles.test.ts src/lib/gait/__tests__/normatives.test.ts src/lib/gait/__tests__/guesses.test.ts src/lib/gait/__tests__/fallrisk.test.ts
   ```
   *Expected result*: 4 files passed, 74 tests passed, 0 failures.

2. **Run TypeScript compiler check**:
   ```bash
   npx tsc --noEmit
   ```
   *Expected result*: Exit code 0, 0 errors.

3. **Run ESLint check**:
   ```bash
   npm run lint
   ```
   *Expected result*: Exit code 0, 0 errors.

4. **Run empirical script**:
   ```bash
   npx tsx -e '
   import { calculateArmSwingAsymmetry, calculateTrunkSway } from "./src/lib/gait/angles";
   import { calculateGPSAndMAP } from "./src/lib/gait/normatives";
   console.log(calculateArmSwingAsymmetry([]));
   '
   ```
