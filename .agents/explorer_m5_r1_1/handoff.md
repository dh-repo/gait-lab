# Handoff Report: Milestone 5 (R1 Follow-Cam Direction & R5 Peak Prominence Filtering)

**Agent:** Explorer M5 R1 (`explorer_m5_r1_1`)  
**Target:** `src/lib/gait/events.ts`, `src/lib/gait/__tests__/events.test.ts`, `src/lib/gait/__tests__/testHelpers.ts`  
**Handoff Type:** Hard Handoff (Read-only analysis and concrete implementation blueprint completed)  
**Date:** 2026-08-09  

---

## 1. Observation

1. **`src/lib/gait/events.ts` Lines 127–129**:
   ```typescript
   const totalDisplacement = midHipX[n - 1] - midHipX[0];
   const direction = totalDisplacement < -0.05 ? -1 : 1;
   ```
   *Direct Observation*: Direction inference currently relies strictly on net horizontal mid-hip displacement (`midHipX[n-1] - midHipX[0]`). In handheld or panning follow-cam videos, the subject remains centered in the frame ($X_{\text{midHip}} \approx 0.50$), so net mid-hip displacement is near zero ($|\Delta X| \le 0.02$). For Right-to-Left walking (where true `direction = -1`), net hip displacement `-0.01` or `0.00` is NOT `< -0.05`, causing misclassification as `direction = 1` (Left-to-Right).

2. **`src/lib/gait/events.ts` Lines 41–74**:
   ```typescript
   function findExtrema(
     signal: number[],
     mode: "max" | "min",
     minGap: number,
   ): number[]
   ```
   *Direct Observation*: `findExtrema` evaluates simple 3-point local inequalities (`signal[i] > signal[i-1] && signal[i] >= signal[i+1]`) without computing peak prominence or enforcing an amplitude threshold. Low-amplitude noise ripples from landmark jitter or filter ringing create false extrema.

3. **`src/lib/gait/__tests__/testHelpers.ts` Lines 51–88 & `events.test.ts`**:
   *Direct Observation*: Synthetic walking frame generators currently assume progress across X (`(t / duration) * 0.4 * direction`). There are no options to simulate handheld follow-cam tracking (`followCam: true` where `progress = 0` while preserving relative foot movement) or test direction inference accuracy in follow-cam shots.

---

## 2. Logic Chain

1. **Observation 1 $\implies$ R1 Fix Rationale**:
   - Misclassifying R->L follow-cam gait as `direction = 1` forces `findExtrema` to search for local MAXIMA of relative heel position for Heel Strikes. In R->L gait, Heel Strike occurs at anterior extension, corresponding to local MINIMA in image X coordinates.
   - Searching for maxima in R->L gait detects Toe-Off/Late Swing instead of Heel Strike, inverting event ordering and corrupting stance phase percentages.
   - *Fix*: Infer direction using median foot orientation difference ($X_{\text{toe}} - X_{\text{heel}}$) across valid frames (`visibility >= 0.4`). In 2D sagittal view, $X_{\text{toe}} - X_{\text{heel}} > 0$ for L->R walking and $< 0$ for R->L walking, invariant to camera translation. Fall back to mid-hip displacement only when foot landmark visibility is low (`< 0.4`) or valid sample count $< 5$.

2. **Observation 2 $\implies$ R5 Fix Rationale**:
   - Without amplitude or prominence thresholds, noise ripples $> \text{minGap}$ frames away from a true stride peak are accepted as valid Heel Strikes or Toe Offs.
   - Spurious events corrupt step timing, stance phase percentages, and double support calculations.
   - *Fix*: Implement topographic peak prominence calculation in `findExtrema` and enforce a dynamic minimum prominence threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{signalRange})$. Discard candidate extrema with prominence $< P_{\text{min}}$.

3. **Observation 3 $\implies$ Test Suite Enhancement**:
   - Adding `followCam?: boolean` to `SyntheticFrameOptions` in `testHelpers.ts` enables testing follow-cam shots where `progress = 0` (centered hip tracking) while `lToe.x - lHeel.x = 0.06 * direction`.
   - New unit tests in `events.test.ts` verify that stance phase percentages stay within valid physiological bounds ($[40\%, 80\%]$, expecting $\approx 60\%$) for both L->R and R->L follow-cam shots.

---

## 3. Caveats

- **Frontal View Fallback**: In strict frontal (anterior-posterior) views, foot orientation difference ($X_{\text{toe}} - X_{\text{heel}}$) approaches zero. The logic checks `Math.abs(medianFootDiff) > 0.005` and falls back to mid-hip displacement if near zero.
- **Landmark Visibility Score**: MediaPipe Pose outputs visibility scores between `0.0` and `1.0`. The threshold `0.4` is selected to filter out occluded or low-confidence foot landmarks.

---

## 4. Conclusion

- **R1 Solution**: Update `detectGaitEventsZeni` in `src/lib/gait/events.ts` to derive direction from median foot orientation difference (`toe.x - heel.x`) across valid frames (`>= 0.4` visibility), falling back to hip displacement when sample count $< 5$ or foot diff magnitude $\le 0.005$.
- **R5 Solution**: Implement `calculateProminence` and update `findExtrema` in `src/lib/gait/events.ts` to filter local extrema using dynamic prominence $P_{\text{min}} = \max(0.01, 0.15 \times \text{signalRange})$.
- **Test Enhancements**: Add `followCam?: boolean` to `testHelpers.ts` and add follow-cam and prominence noise unit tests to `events.test.ts`.
- Full code blueprint written to `/Users/damian/GitHub/gait-lab/.agents/explorer_m5_r1_1/analysis.md`.

---

## 5. Verification Method

1. **Inspect Blueprint**:
   Review `/Users/damian/GitHub/gait-lab/.agents/explorer_m5_r1_1/analysis.md` for exact code changes and line numbers.
2. **Execute Type Check**:
   ```bash
   npm run typecheck
   ```
3. **Execute Unit Tests**:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts
   ```
4. **Invalidation Condition**:
   If a synthetic R->L follow-cam clip (`followCam: true`, `direction: -1`) returns inverted event types or stance phase percentage outside $[40\%, 80\%]$, the implementation is invalid.
