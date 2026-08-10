# Handoff Report: M4 Pass 2 Frontal-Y Contact Disambiguation

**Agent ID**: `teamwork_preview_explorer_m4_pass2_2`  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_2`  
**Date**: 2026-08-10  

---

## 1. Observation

Direct inspection of `/Users/damian/GitHub/gait-lab/src/lib/gait/events.ts` (lines 349–370) revealed the following verbatim implementation for contact assignment in the frontal-Y fallback path:

```ts
349:    for (let k = 0; k < midStrikes.length; k++) {
350:      const f = midStrikes[k];
351:      if (k % 2 === 0) rawLHeelStrikes.push(f);
352:      else rawRHeelStrikes.push(f);
353:      // Toe-off: mid-swing trough after each contact when available
354:      if (k + 1 < midStrikes.length) {
355:        const a = midStrikes[k];
356:        const b = midStrikes[k + 1];
357:        let minI = a;
358:        let minV = filtMidY[a];
359:        for (let j = a + 1; j < b; j++) {
360:          if (filtMidY[j] < minV) {
361:            minV = filtMidY[j];
362:            minI = j;
363:          }
364:        }
365:        if (minI > a && minI < b) {
366:          if (k % 2 === 0) rawLToeOffs.push(minI);
367:          else rawRToeOffs.push(minI);
368:        }
369:      }
370:    }
```

Key observations:
1. Lines 351–352 use strict modulo arithmetic (`k % 2 === 0`) to assign contact $f_k$ to the Left foot when $k$ is even, and to the Right foot when $k$ is odd.
2. Lines 366–367 use the same `k % 2 === 0` check to assign toe-off events between contact $a$ and contact $b$.
3. Landmark coordinates for left/right ankles (`LM.L_ANKLE`, `LM.R_ANKLE`) and heels (`LM.L_HEEL`, `LM.R_HEEL`) are extracted in lines 328–333 (`leftAnkleY[i]`, `rightAnkleY[i]`) and filtered as `filtLY`, `filtRY` in lines 337–338, but these spatial arrays are completely unused during the assignment loop in lines 349–370.

---

## 2. Logic Chain

1. **Premise 1 (From Observation 1)**: `k % 2 === 0` assumes the 0th contact ($k=0$) is always the Left foot.
2. **Premise 2**: In real-world gait video clips, subjects frequently initiate walking with the Right foot.
3. **Inference 1 (from Premise 1 & 2)**: When a walk starts with a Right foot contact, assigning $k=0$ to Left inverts all step side labels across the entire recording (100% false assignment error).
4. **Premise 3 (From Observation 1 & 2)**: Index `k` increases sequentially ($0, 1, 2, \dots$) for each element in `midStrikes`.
5. **Inference 2 (from Premise 3)**: If a single contact peak is missed by `findExtrema` due to noise or low vertical amplitude, all subsequent elements shift by 1 index ($k \to k \pm 1$). Consequently, `k % 2` flips parity for every subsequent step, causing a cascading label inversion failure for all remaining steps in the video.
6. **Premise 4 (From Observation 3)**: MediaPipe normalized $Y$ coordinates place $Y=0.0$ at the top of the image and $Y=1.0$ at the bottom. At ground contact, the contacting ankle/heel reaches its lowest vertical position in the image (maximum $Y$), while the opposite foot is in swing (smaller $Y$).
7. **Conclusion**: Replacing `k % 2` with spatial ankle inspection ($\Delta Y(f) = \text{filtLY}[f] - \text{filtRY}[f]$) evaluates spatial ground contact evidence independently at each frame $f$, eliminating initial contact inversion and providing immunity to cascading missed-peak inversions.

---

## 3. Caveats

- **Extreme Sagittal Blur / Low Frame Rate**: In extremely low frame rate videos (< 10 FPS), ankle vertical peak resolution may span 1–2 frames, making $\Delta Y$ near the deadband threshold. Tier 3 (Alternation Memory) handles these cases safely.
- **Assumed View Scope**: Frontal-Y fallback is only triggered when `apRange < 0.028 && apEventCount < 5` (line 322). Oblique and sagittal views bypass this block entirely and use standard Zeni AP displacement event detection.

---

## 4. Conclusion

Replacing `k % 2` index parity alternation with spatial ankle height inspection ($\Delta Y(f)$), 4-tier decision tree, landmark visibility gating ($V \ge 0.3$), and alternation memory completely resolves L/R foot misassignment in frontal gait analysis. The complete blueprint and replacement code block are documented in `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_2/report.md`.

---

## 5. Verification Method

1. **Inspect Blueprint File**: Check `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m4_pass2_2/report.md` for exact replacement code and decision tree.
2. **Run Test Suites**:
   - `npx vitest run src/lib/gait/__tests__/events.test.ts`
   - `npx vitest run src/lib/gait/__tests__/events.challenger_m7_2.test.ts`
   - `npx vitest run src/lib/gait/__tests__/m1_challenger_adversarial_suite.test.ts`
3. **Verify Type & Style Compliance**:
   - `npx tsc --noEmit`
   - `npx eslint .`
4. **Invalidation Condition**: The implementation is invalid if any synthetic test starting with a Right foot contact produces `side: "left"` for the first event, or if a missed peak inverts subsequent event sides.
