# Handoff Report: Milestone 6 (M6) R2 Harmonic Ratio Fundamental Frequency & Hann Window Leakage

**Agent:** Worker M6 (`worker_m6_1`)  
**Roles Activated:** implementer, qa, specialist  
**Date:** 2026-08-09  

---

## 1. Observation

- **`src/lib/gait/signal.ts`**:
  - `computeFFTHarmonics` previously accepted only `(data: number[], numHarmonics = 10)` and re-derived `f0Bin` independently via a peak search over `mag[k]`. For vertical displacement (`hipY`), the dominant spectral peak occurs at step frequency $2 f_{\text{stride}}$, setting `f0Bin = bin(2 * f_stride)` instead of stride frequency $f_{\text{stride}}$.
  - Odd stride harmonics ($1 f_{\text{stride}}, 3 f_{\text{stride}}, 5 f_{\text{stride}}$) were skipped, while even stride harmonics ($2 f_{\text{stride}}, 6 f_{\text{stride}}$) were misclassified into `oddSum`, causing `hrVertical = evenSum / oddSum` to falsely collapse near 1.0.
  - Magnitudes were extracted at single array indices `mag[harmIndex]`, losing up to 50% energy for non-integer bin frequencies due to Hann window mainlobe width (3 bins).

- **`src/lib/gait/smoothness.ts`**:
  - `computeHarmonicRatio` previously called `computeFFTHarmonics(hipY, 10)` and `computeFFTHarmonics(hipX, 10)` without passing `fps` or detected stride frequency.

- **`src/lib/gait/analysis.ts`**:
  - `computeGaitMetrics` called `computeHarmonicRatio(midHipY, midHipX, fps)` without passing `meanStride`.

- **Verification Results**:
  - `npx vitest run src/lib/gait/__tests__/smoothness.test.ts src/lib/gait/__tests__/signal.test.ts`: **26 passed (26)**
  - `npm test`: **25 node tests passed, 164 vitest tests passed (189 total)**
  - `npm run typecheck`: **0 errors**
  - `npm run lint`: **0 errors (32 warnings across workspace, 0 in modified files)**

---

## 2. Logic Chain

1. **Fundamental Frequency Mismatch Fix**:
   - In biomechanics (Menz et al. 2003, Bellanca et al. 2013), Harmonic Ratio requires harmonic power classification relative to the **stride fundamental frequency** $f_0 = 1 / \text{meanStrideSec}$.
   - By updating `computeFFTHarmonics(data, fps?, strideFreq?, numHarmonics = 10)`, `f0Bin` is set to $\max(1, \text{round}((\text{strideFreq} \cdot \text{fftSize}) / \text{fps}))$.
   - In `smoothness.ts`, `strideFreq = meanStrideSec && meanStrideSec > 0 ? 1 / meanStrideSec : undefined` is calculated and passed to `computeFFTHarmonics`.
   - In `analysis.ts`, `meanStrideSec` derived from same-side stride intervals is passed to `computeHarmonicRatio`.

2. **Spectral Leakage Fix**:
   - Hann windowing convolution spreads a harmonic's energy over a 3-bin mainlobe ($b_k - 1, b_k, b_k + 1$).
   - Summing magnitude over $b \in [\max(1, \text{centerBin} - 1), \min(\text{halfSize} - 1, \text{centerBin} + 1)]$ captures $>95\%$ of the total harmonic energy regardless of fractional bin offsets.
   - Calculating `centerBin = Math.round((k * f0 * fftSize) / fps)` for each harmonic $k$ prevents error accumulation at higher harmonics.

3. **Literature Alignment**:
   - For symmetric gait, `hipY` energy is concentrated at even harmonics $k=2, 4$ ($2 f_0, 4 f_0$), resulting in `evenSum >> oddSum` and literature-aligned vertical HR values ($\sim 2.5 - 4.0$).
   - For asymmetric gait, odd stride harmonics ($1 f_0$) appear in `hipY`, increasing `oddSum` and dropping vertical HR significantly ($< 1.8$).

---

## 3. Caveats

- When video duration is extremely short ($< 1.5$ seconds or $< 2$ full strides), `meanStrideSec` may be undefined or estimated from `avgStepTimeSec * 2`. In such cases, `computeFFTHarmonics` falls back safely to peak detection in the $1 \dots \text{fftSize}/4$ frequency range.
- Legacy calls passing `numHarmonics` as the second argument (`computeFFTHarmonics(data, 8)`) are automatically handled via signature backward compatibility checks (`fps <= 16` and `strideFreq === undefined`).

---

## 4. Conclusion

Milestone M6 (R2 Harmonic Ratio Fundamental Frequency & Hann Window Leakage) is fully implemented and verified:
- `signal.ts`, `smoothness.ts`, and `analysis.ts` updated to anchor harmonic calculations to true stride frequency $f_0 = 1 / \text{meanStrideSec}$ and integrate 3-bin Hann window leakage.
- Unit tests added to `signal.test.ts` and `smoothness.test.ts` verifying literature-aligned vertical HR ($\sim 2.5 - 4.0$), asymmetry sensitivity, `strideFreq` parameter handling, and Hann window leakage summation.
- Typecheck, lint, and the full test suite pass with zero errors and zero regressions.

---

## 5. Verification Method

To independently verify these changes:

1. **Run Unit Tests for Signal and Smoothness**:
   ```bash
   npx vitest run src/lib/gait/__tests__/smoothness.test.ts src/lib/gait/__tests__/signal.test.ts
   ```
   *Expected output*: 26 passed (26).

2. **Run Full Project Test Suite**:
   ```bash
   npm test
   ```
   *Expected output*: 25 node tests passed, 164 vitest tests passed.

3. **Run TypeScript Type Check**:
   ```bash
   npm run typecheck
   ```
   *Expected output*: 0 errors.

4. **Run ESLint Code Quality Verification**:
   ```bash
   npm run lint
   ```
   *Expected output*: 0 errors.

5. **Files to Inspect**:
   - `src/lib/gait/signal.ts` (lines 250–360)
   - `src/lib/gait/smoothness.ts` (lines 24–48)
   - `src/lib/gait/analysis.ts` (lines 357–360)
   - `src/lib/gait/__tests__/signal.test.ts`
   - `src/lib/gait/__tests__/smoothness.test.ts`
