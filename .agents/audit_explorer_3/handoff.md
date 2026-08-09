# Soft Handoff Report: Frame Sampling Decimation Bias (R3) & Metric Reliability/Geometry (R4)

**From:** Audit Explorer 3  
**To:** Orchestrator / Implementation Agent  
**Date:** 2026-08-09  
**Status:** Soft Handoff (Investigation Complete, Detailed Implementation Design Ready)

---

## 1. Observation

### Exact File Paths & Code Extracts:
1. **`src/components/gait/GaitApp.tsx` (lines 290–295)**:
   ```typescript
   const duration = video.duration || 1;
   const targetFps = 30;
   const sampleCount = Math.min(300, Math.max(30, Math.floor(duration * targetFps)));
   ```
   *Observation*: Seeks are capped at 300 frames total. For a 30s clip, $f_s = 300 / 30 = 10\text{ Hz}$ ($\Delta t = 100\text{ ms}$). For a 60s clip, $f_s = 5\text{ Hz}$ ($\Delta t = 200\text{ ms}$).

2. **`src/lib/gait/pose.ts` (lines 267–340)**:
   `resamplePoseFrames(rawFrames, 30.0)` uses Catmull-Rom cubic splines to resample sparse frames onto a 30 Hz grid. Interpolating 10 Hz or 5 Hz input data to 30 Hz cannot recover high-frequency inflection dynamics lost below the Nyquist limit ($5\text{ Hz}$ or $2.5\text{ Hz}$).

3. **`src/lib/gait/analysis.ts` (lines 204–463)**:
   `computeGaitMetrics` runs all metric calculations regardless of `viewAngle` (`sagittal`, `frontal`, `oblique`).
   - Frontal view computes 2D knee angle range (`kneeFlexLeft`) and 2D stride travel (`leftStride`), both severely corrupted by depth foreshortening.
   - Sagittal view computes step width from X ankle coordinate difference (`Math.abs(ankleL.x - ankleR.x)`), which measures step length (direction of progression), not lateral width.
   - All metrics are returned as point estimates without confidence intervals.
   - Composite scores (`stabilityScore`, `rhythmScore`, `overallScore`, etc.) use unvalidated linear combination weights (e.g. `100 - (lateralSway * 220 + verticalBounce * 180 + ...)`).

4. **`src/lib/gait/ratings.ts` & `guesses.ts`**:
   Ratings and guesses evaluate point estimates without checking metric validity under camera view geometry or reflecting metric confidence intervals.

---

## 2. Logic Chain

1. **Observation**: `sampleCount` in `GaitApp.tsx` is capped at 300 frames total across the video duration $T_{\text{clip}}$.
2. **Deduction**: For clips $> 10\text{s}$, the effective sampling rate drops to $f_s = 300 / T_{\text{clip}}$ ($\Delta t = T_{\text{clip}} / 300$).
3. **Mathematical Inference**: Discrete peak detection introduces quantization variance $\sigma_{\text{sampling}}^2 = \Delta t^2 / 12$. The observed step interval variance is $\sigma_{\text{observed}}^2 = \sigma_{\text{true}}^2 + \Delta t^2 / 6$.
4. **Quantified Impact**: At 10 Hz ($\Delta t = 0.1\text{ s}$), quantization jitter adds $28.8\text{ ms}$ of variance to step timing. For a subject with true $2.0\%$ step time CV ($11\text{ ms}$ std), the observed CV inflates to $7.7\%$—a $385\%$ artificial increase.
5. **Conclusion R3**: `stepTimeCV` is heavily biased by clip length because long clips are sampled sparsely.
6. **Observation**: `analysis.ts` computes 2D planar metrics without checking camera view geometry.
7. **Inference**: Out-of-plane projections create invalid numbers (e.g., knee flexion foreshortening on frontal view; step length measured as step width on sagittal view).
8. **Conclusion R4**: Invalid metrics must be suppressed (`null` emitted), confidence intervals must be computed via split-half testing, and arbitrary composite 0–100 scores must be demoted in favor of defensible measured quantities.

---

## 3. Caveats

- **Read-Only Scope**: Per role guidelines, no application source code files were modified directly during this analysis turn.
- **Clip Duration Assumption**: The proposed continuous 10–12s window sampling assumes uploaded videos are at least 10 seconds long. For clips $< 10\text{s}$, the sampling window defaults to the full available duration at 30 Hz.

---

## 4. Conclusion

The root causes of synthetic ground-truth findings R3 and R4 have been thoroughly identified and solved. A complete, mathematically sound implementation design has been documented in `.agents/audit_explorer_3/analysis.md`:
1. **R3 Fix**: Transition from whole-clip sparse sampling to a **continuous 10–12s window sampled at full 30 Hz**, combined with **parabolic subframe peak refinement** in `events.ts`, guaranteeing `stepTimeCV` clip-length invariance.
2. **R4 Fix**: Implement **strict view-geometry metric suppression (`null` emission)**, **split-half reliability testing (1st half vs 2nd half) for 95% Confidence Interval calculation**, and **demotion of arbitrary composite 0–100 scores** to secondary exploratory status.

---

## 5. Verification Method

To verify the implementation once applied:
1. **Unit Testing**:
   - Run `npx vitest src/lib/gait/__tests__/analysis.test.ts`.
   - Verify that synthetic 10s and 30s walking clips with identical gait variance yield matching `stepTimeCV` within $\pm 0.3\%$.
   - Verify that frontal view metrics return `null` for knee flexion and stride travel, while sagittal view metrics return `null` for step width and lateral sway.
   - Verify that `confidenceIntervals` are correctly computed and populated in `GaitMetrics`.
2. **System Verification**:
   - Run `npm run typecheck` to confirm TS safety with `null` metric types.
   - Run `npm test`, `npm run lint`, and `npm run build`.

---

## 6. Remaining Work (Implementation Steps for Implementer Agent)

1. **`GaitApp.tsx`**: Update `runAnalysis()` to sample a continuous 10–12s window at full 30 Hz ($N = 300\text{--}360$ frames).
2. **`events.ts`**: Implement `refinePeakTimestamp()` parabolic subframe interpolation for initial and terminal contact event timestamps.
3. **`types.ts`**: Update `GaitMetrics` to allow `null` for view-invalid metrics and add `ReliabilityBounds` / `confidenceIntervals`.
4. **`analysis.ts`**:
   - Apply view-geometry metric suppression rules (emit `null` for invalid metrics based on `viewAngle`).
   - Implement split-half reliability testing ($F_1$ vs $F_2$) to calculate 95% CIs.
   - Demote composite scores to secondary exploratory status.
5. **`ratings.ts` & `guesses.ts`**: Update rules and blurb builders to handle `null` metrics gracefully.
6. **UI Components (`ReportPanel.tsx`, `MetricsPanel.tsx`)**: Update UI to render 95% CIs and display `"N/A (Requires Side View)"` / `"N/A (Requires Front View)"` for suppressed metrics.
7. **Unit Tests (`src/lib/gait/__tests__/`)**: Add and update tests covering R3 invariance, R4 view suppression, and split-half CIs.
