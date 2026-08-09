# Forensic Audit Report — Milestone 5 (M5: R1 Follow-Cam Direction & R5 Peak Prominence Filtering)

**Auditor:** `teamwork_preview_auditor_m5_1`  
**Date:** 2026-08-09  
**Work Product:** `src/lib/gait/events.ts`, `src/lib/gait/__tests__/events.test.ts`, `src/lib/gait/__tests__/testHelpers.ts`  
**Profile:** General Project (Integrity Forensics)  
**Integrity Mode:** Development  
**Verdict:** **CLEAN**

---

## 1. Observation

### 1.1 Direct Code Audit Findings

1. **Follow-Cam Direction Inference (R1 in `events.ts`)**:
   - `events.ts` collects relative sagittal foot displacement samples `toe.x - heel.x` for both left and right feet across frames where landmark visibility $\ge 0.4$.
   - Computes exact median foot difference `medianFootDiff` across gathered samples (minimum 5 valid samples required).
   - If valid samples $\ge 5$ and $|\text{medianFootDiff}| > 0.005$, direction is inferred as `medianFootDiff > 0 ? 1 : -1`.
   - If valid samples $< 5$ or $|\text{medianFootDiff}| \le 0.005$ (e.g., low visibility or pure frontal view), gracefully falls back to net mid-hip displacement `midHipX[n-1] - midHipX[0] < -0.05 ? -1 : 1`.
   - Returns `inferredDirection: direction` as part of `GaitPhaseBreakdown`.

2. **Topographic Peak Prominence Filtering (R5 in `events.ts`)**:
   - Implements `calculateProminence(signal, i, mode)` computing true 1D topographic peak prominence:
     - For `"max"` mode: Scans left and right to find peak boundaries (where signal exceeds peak value `val`) and finds minimum valleys (`leftMin`, `rightMin`). Reference level is $\max(\text{leftMin}, \text{rightMin})$. Prominence is $\text{val} - \text{refLevel}$.
     - For `"min"` mode: Scans left and right to find valley boundaries and finds maximum peaks (`leftMax`, `rightMax`). Reference level is $\min(\text{leftMax}, \text{rightMax})$. Prominence is $\text{refLevel} - \text{val}$.
   - Updates `findExtrema(signal, mode, minGap, userMinProminence)`:
     - Dynamically computes threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{signalRange})$ when `userMinProminence` is unspecified.
     - Filters out noise ripples where $\text{prom} < P_{\text{min}}$.
     - Within candidate window `minGap`, compares peak prominence values (`prom > prevProm`) to retain the most prominent extremum.

3. **Synthetic Frame Helper (`testHelpers.ts`)**:
   - Adds `followCam?: boolean` parameter to `SyntheticFrameOptions`.
   - When `opts.followCam` is true, `progress` (net hip movement) is set to `0`, accurately modeling camera tracking shots while keeping realistic foot oscillation and heel/toe relative displacements ($+0.04 \times \text{direction}$ for toe, $-0.02 \times \text{direction}$ for heel).

4. **Unit Test Suite (`events.test.ts`)**:
   - Includes 11 comprehensive unit tests testing L->R and R->L follow-cam shots (`followCam = true`), low landmark visibility fallbacks, dynamic peak prominence noise suppression (`noiseLevel = 0.04`), and physiological stance/swing/double-support phase bounds.

### 1.2 Empirical Command Execution Results

1. **Target Unit Test Suite (`npx vitest run src/lib/gait/__tests__/events.test.ts`)**:
   - Result: **Passed 11 / 11 tests** (8 ms)

2. **Full Repository Test Suite (`npm test`)**:
   - Result: **Passed 25 / 25 node script tests** and **Passed 160 / 160 vitest unit tests across 15 test files** (693 ms)

3. **TypeScript Type Checking (`npm run typecheck`)**:
   - Result: **Passed with 0 errors**

4. **ESLint Audit (`npm run lint`)**:
   - Result: **Passed with 0 errors** (32 warnings in unrelated files, 0 errors)

---

## 2. Phase Results & Forensic Verification

| Forensic Check | Result | Forensic Evidence / Details |
|---|:---:|---|
| **1. Hardcoded Test Results** | **PASS** | No hardcoded test outputs, expected strings, or conditional branches tailored to specific test parameters exist in `events.ts`. Direction and prominence are calculated dynamically from raw frame landmark data. |
| **2. Facade Implementations** | **PASS** | `calculateProminence`, `findExtrema`, and direction inference in `detectGaitEventsZeni` implement genuine 1D topographic peak prominence and median foot orientation algorithms with no dummy constants or shortcuts. |
| **3. Pre-populated Artifacts** | **PASS** | No pre-existing log files, fake verification outputs, or pre-baked result artifacts exist in the project directory. |
| **4. Self-Certifying Tests** | **PASS** | Tests in `events.test.ts` evaluate genuine algorithmic behavior against biomechanical physiological ranges (stance 40-80%, stance + swing = 100%, double support 5-45%), rather than comparing against hardcoded magic values mirror-copied from implementation code. |
| **5. Execution Delegation** | **PASS** | Core logic uses native TypeScript math routines (`Math.abs`, `Math.max`, array median sorting) without black-box third-party package delegation. |
| **6. Behavioral Verification** | **PASS** | All automated verification commands (`vitest`, `npm test`, `typecheck`, `lint`) executed independently and passed cleanly with 0 errors. |

---

## 3. Logic Chain

1. **Follow-Cam Direction Inference (R1)**:
   - In 2D sagittal MediaPipe pose estimation, foot orientation is defined by relative displacement between toe index (31/32) and heel index (29/30). In Left-to-Right walking, `toe.x > heel.x`; in Right-to-Left walking, `toe.x < heel.x`.
   - By calculating `toe.x - heel.x` across frames with visibility $\ge 0.4$ and taking the median `medianFootDiff`, the algorithm is immune to transient tracking jitter and camera translation in follow-cam clips.
   - Falling back to net hip displacement when valid foot samples are sparse ($< 5$) or near zero ($|\text{medianFootDiff}| \le 0.005$, e.g. frontal view) preserves backwards compatibility for static camera clips.

2. **Topographic Peak Prominence Filtering (R5)**:
   - In digital signal processing of gait trajectories, raw local extrema can capture high-frequency landmark jitter ripples.
   - Topographic peak prominence accurately measures how intrinsic a peak or valley is relative to surrounding signal contours.
   - Dynamic thresholding $P_{\text{min}} = \max(0.01, 0.15 \times \text{sigRange})$ scales proportionally with signal magnitude, discarding micro-ripples while preserving true initial contact (Heel Strike) and terminal contact (Toe Off) events.

3. **Empirical Verification**:
   - Independent execution of `npx vitest run src/lib/gait/__tests__/events.test.ts`, `npm test`, `npm run typecheck`, and `npm run lint` confirmed 100% test pass rate with 0 type or lint errors.

---

## 4. Caveats

- For pure frontal view clips where toe and heel $X$ coordinates coincide ($|\text{medianFootDiff}| \le 0.005$), the algorithm falls back to net hip displacement as intended, since sagittal direction inference requires non-zero sagittal foot extension.
- No other caveats.

---

## 5. Conclusion

The work product implemented by `worker_m5_r1_1` in `src/lib/gait/events.ts`, `src/lib/gait/__tests__/events.test.ts`, and `src/lib/gait/__tests__/testHelpers.ts` is authentic, scientifically sound, and fully compliant with project requirements. No integrity violations, hardcoded shortcuts, or fake verification artifacts were detected.

**Final Verdict**: **CLEAN**

---

## 6. Verification Method

To independently reproduce and verify this audit:

1. Run the target events unit test suite:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts
   ```
   Expect 11 passed tests.

2. Run the full project test suite:
   ```bash
   npm test
   ```
   Expect 25 node script tests and 160 vitest unit tests passing across 15 test files.

3. Run TypeScript type check:
   ```bash
   npm run typecheck
   ```
   Expect exit code 0 with 0 errors.

4. Run ESLint:
   ```bash
   npm run lint
   ```
   Expect exit code 0 with 0 errors.
