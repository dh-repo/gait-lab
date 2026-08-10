# Handoff Report: R2 (Signal Processing & Event Detection Tuning) and R3 (Adversarial Coverage Gaps)

**Agent:** explorer_survey_2  
**Date:** 2026-08-10  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_2`  
**Report Location:** `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_2/survey_r2_r3.md`

---

## 1. Observation

1. **Vitest Execution & Failure Log:**
   - Command: `npx vitest run`
   - Results: 64 passed files, 2 failed files; 859 passed tests, 2 failed tests.
   - Failure 1 in `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts:410:34`:
     ```text
     AssertionError: expected 0.024060970851139524 to be greater than 0.03
     410|       expect(metrics.stepTimeCV).toBeGreaterThan(0.03);
     ```
   - Failure 2 in `src/lib/gait/__tests__/split_half_stress_m8_2.test.ts:117:25`:
     ```text
     AssertionError: expected 199.526 to be less than or equal to 106.39900000000002
     117|     expect(ciWidths[1]).toBeLessThanOrEqual(ciWidths[2]);
     ```

2. **Source Code Line Inspection:**
   - `src/lib/gait/events.ts:297`:
     ```ts
     const minGap = Math.max(3, Math.floor(0.35 * effectiveFps));
     ```
     At 30 FPS, $\text{minGap} = 10$ frames (333ms, max cadence ~180 SPM). Under $1.6\times$ speed perturbation at 48 FPS, $\text{minGap} = 16$ frames while step interval is 15 frames, causing `findExtrema` to suppress every alternate step.
   - `src/lib/gait/analysis.ts:1209-1223` in `filterSteadyStateStrides`:
     ```ts
     while (
       startIndex < endIndex &&
       median > 0 &&
       Math.abs(durations[startIndex] - median) / median > 0.25
     ) {
       startIndex++;
     }
     ```
     Over-trims asymmetric step intervals that deviate from median by $>25\%$, reducing `stepTimeCV` from expected $>0.03$ down to $0.02406$.

3. **Reference Clips & Test Catalog:**
   - Reference clips `tuning-3992.mp4` (10.55s) and `tuning-3993.mp4` (12.42s) in `public/samples/` verify real-world indoor frontal and multi-person tracking performance.
   - Cataloged existing adversarial tests (`cat1` through `cat6`) and identified 6 missing scenarios (asymmetric limb noise, blackout drop recovery, 180° U-turn self-occlusion, antalgic limping asymmetry, ultra-high cadence Parkinsonian shuffling, combined 3D camera motion).

---

## 2. Logic Chain

1. **Failure #1 Analysis (`e2e_engine_enhancements.test.ts`):**
   - Observation 1.1 shows `stepTimeCV` was $0.02406$ instead of $>0.03$.
   - Observation 1.2 shows `filterSteadyStateStrides` in `analysis.ts` prunes any stride deviating $>25\%$ from the median.
   - In asymmetric gait with asymmetry factor 1.35, step durations alternate (e.g. 0.62s vs 0.38s against 0.50s median; deviation $\approx 24-28\%$).
   - Trimming those strides reduces the variance of the retained `steadyStrides`, lowering `stepTimeCV`.
   - Therefore, expanding the trimming threshold from $0.25$ to $0.40$ (or using IQR-based bounds) will preserve genuine pathological asymmetry while excluding true acceleration/deceleration outliers.

2. **Failure #2 Analysis (`split_half_stress_m8_2.test.ts`):**
   - Observation 1.1 shows `ciWidths[1]` ($199.526$) $> \text{ciWidths}[2]$ ($106.399$).
   - Observation 1.2 shows $\text{minGap} = \lfloor 0.35 \times \text{fps} \rfloor$.
   - Under $1.6\times$ speed scaling, effective sample rate is 48 FPS ($\text{minGap} = 16$ frames), but actual step interval is 15 frames.
   - `findExtrema` skips every second peak because step interval $< \text{minGap}$.
   - Skipping half the steps cuts detected cadence in Half 2 from 192 SPM to 96 SPM, which artificially matches Half 1's 120 SPM baseline closer than Level 1 ($1.25\times$, 150 SPM).
   - This causes $|M1 - M2|$ and 95% CI width for Level 2 to drop unexpectedly, violating monotonicity.
   - Therefore, reducing the $\text{minGap}$ multiplier from $0.35$ to $0.20$ (allowing step intervals down to 200ms / 300 SPM) will allow all steps to be detected at $1.6\times$ speed, restoring monotonic expansion of the CI width.

---

## 3. Caveats

- **Read-Only Scope:** This investigation was strictly read-only and produced survey reports and analysis without directly editing `src/lib/gait/` code files.
- **Hardware Variation:** Performance of MediaPipe pose landmarker and camera frame rate capture can vary across host environments; synthetic test generators isolate algorithm behavior deterministically.

---

## 4. Conclusion

The core gait engine modules (`events.ts`, `analysis.ts`, `signal.ts`, `PoseTracker.ts`, `ratings.ts`, `guesses.ts`, `fallrisk.ts`) are architecturally sound but require two specific parameter tuning updates:
1. Reduce `minGap` factor in `detectGaitEventsZeni` from `0.35` to `0.20` ($\approx 200\text{ms}$ min step duration).
2. Relax `filterSteadyStateStrides` threshold in `analysis.ts` from `0.25` to `0.40`.

Furthermore, adding the 6 proposed adversarial test scenarios across `cat1`–`cat6` will close coverage gaps and harden engine stability under real-world camera noise, frame drops, occlusion, severe asymmetry, Parkinsonian micro-steps, and camera movement.

---

## 5. Verification Method

To verify these findings and proposed fixes:
1. Inspect survey report: `cat /Users/damian/GitHub/gait-lab/.agents/explorer_survey_2/survey_r2_r3.md`
2. Run Vitest test runner: `npx vitest run`
3. Run TypeScript check: `npx tsc --noEmit`
4. Run ESLint check: `npx eslint .`
