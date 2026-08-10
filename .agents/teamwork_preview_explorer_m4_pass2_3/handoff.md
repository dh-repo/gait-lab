# Handoff Report: Milestone 4 Pass 2 Explorer 3

**Agent ID**: `teamwork_preview_explorer_m4_pass2_3`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_3`  
**Target File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts`  
**Test File**: `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/events.test.ts`  
**Date**: 2026-08-10  

---

## 1. Observation

- **Target File**: `src/lib/gait/events.ts` (610 lines)
  - Lines 237–290: Compute single global `direction` (+1 or -1) using global median of `(lToe.x - lHeel.x)` foot differences across all frames. Fallback to total mid-hip displacement `midHipX[n-1] - midHipX[0]`.
  - Lines 300–306: Set global `heelStrikeMode` ("max" if direction = 1, "min" if direction = -1) and `toeOffMode`.
  - Lines 349–370: Naive index modulo parity alternation (`if (k % 2 === 0) rawLHeelStrikes.push(f); else rawRHeelStrikes.push(f);`) in frontal-Y fallback path (`apRange < 0.028`).
- **Test File**: `src/lib/gait/__tests__/events.test.ts` (250 lines, 15 tests, 100% passing)
  - Verifies L->R walking (`direction = 1`), R->L walking (`direction = -1`), low visibility fallback, asymmetric stance, double support bounds [5%, 45%], sub-frame parabolic timestamp refinement, and follow-cam direction inference.
- **Related Test Files**:
  - `e2e_gait_engine_tiers.test.ts`: checks `result.inferredDirection === 1` and `-1` on straight clips.
  - `challenger_m5_2.test.ts`, `events.challenger_m7_2.test.ts`, `m1_challenger_adversarial_suite.test.ts`: multi-FPS (10, 60, 120 Hz) and frontal frame tests.
- **Test Command Output**: `npx vitest run src/lib/gait/__tests__/events.test.ts` exited with code 0 (15 passed).

---

## 2. Logic Chain

1. **Global Direction Limitation**:
   - `detectGaitEventsZeni` sorts all foot orientation differences `(lToe.x - lHeel.x)` into a single array across the whole clip.
   - In a 180° U-turn protocol (L->R for N frames, turn, R->L for N frames), outbound foot differences (~+0.05) and return foot differences (~-0.05) cancel out, producing a median near 0.000.
   - Fallback checks net hip displacement `midHipX[n-1] - midHipX[0]`, which is also ~0 because the subject returns to the start position.
   - This assigns a default global `direction = 1`.
   - Outbound half (L->R) uses `heelStrikeMode = "max"` (correct). Return half (R->L) uses `heelStrikeMode = "max"` (INCORRECT for R->L walking where heel strikes are at minimum relative X).
   - Conclusion: Heel strikes in the return path are completely missed or misclassified as toe-offs.

2. **Frontal-Y Modulo Parity Fragility**:
   - In frontal view (`apRange < 0.028`), contact frames `midStrikes` are assigned to left/right legs using `k % 2`.
   - A single missed peak or extra noise artifact flips $k$, permanently swapping left and right leg event labels for all subsequent strides.
   - Conclusion: Replacing `k % 2` with vertical elevation ($y_{\text{L}}$ vs $y_{\text{R}}$) and lateral position ($x_{\text{L}}$ vs $x_{\text{R}}$) at peak frame $f$ provides robust anatomical contact disambiguation.

3. **Synthetic Test Blueprint**:
   - Designed `generateSagittalUTurnFrames` (7s sagittal U-turn walk) and `generateFrontalUTurnFrames` (6s frontal walk-and-turn) to provide deterministic ground-truth validation for R5 dynamic per-stride direction and frontal-Y contact disambiguation.

4. **Regression Safeguard Strategy**:
   - Identified explicit risk where existing tests assert `result.inferredDirection === 1` or `-1`.
   - Required `detectGaitEventsZeni` to return `inferredDirection` as a summary scalar (mode or median of local direction vector) alongside dynamic per-stride peak finding.

---

## 3. Caveats

- **No Source Code Edits**: This investigation was strictly read-only per agent constraints. Implementation of R5 will be performed by subsequent builder/fixer agents.
- **MediaPipe Coordinate Convention Assumption**: In MediaPipe Pose, normalized Y coordinates increase downward ($y=0$ top, $y=1$ bottom). Thus, stance contact (lowest vertical point in real world) corresponds to maximum Y in image coordinates.
- **Hysteresis Threshold Parameter**: We assumed a hysteresis threshold $> 0.01$ and sliding window $W \approx 1.5\text{s} \cdot \text{fps}$ based on standard gait cycle frequency (~1.6 Hz, stride period ~1.2s). Real-world pathological gait may require window clamping.

---

## 4. Conclusion

`detectGaitEventsZeni` in `src/lib/gait/events.ts` requires two core architectural upgrades for Milestone 4 (R5):
1. **Dynamic Per-Stride Walking Direction**: Implement sliding window (~1.5s / 45 frames) foot orientation median with sign-flip hysteresis $> 0.01$ to support 180° U-turn protocols, while preserving `inferredDirection` summary scalar for backward compatibility.
2. **Frontal-Y Anatomical Contact Disambiguation**: Replace `k % 2` index parity with multi-factor landmark coordinate inspection ($y_{\text{L}}$ vs $y_{\text{R}}$ and $x_{\text{L}}$ vs $x_{\text{R}}$) at each contact frame.

Detailed analysis, synthetic generator blueprints, and regression matrices are fully documented in `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_3/report.md`.

---

## 5. Verification Method

To independently verify findings and future R5 implementations:

1. **Inspect Report & Blueprint**:
   - Read `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_3/report.md`.
2. **Run Existing Event Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts
   npx vitest run src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts
   npx vitest run src/lib/gait/__tests__/events.challenger_m7_2.test.ts
   ```
3. **Run Typecheck & Lint**:
   ```bash
   npx tsc --noEmit
   npx eslint src/lib/gait/events.ts
   ```
4. **Invalidation Conditions**:
   - Any test failure in `events.test.ts` or `e2e_gait_engine_tiers.test.ts` (e.g. `inferredDirection` mismatch).
   - Failure to detect heel strikes during the return path of a 180° U-turn walk.
   - Left/right contact label inversion in frontal view walk-and-turn tests.
