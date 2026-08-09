# Soft Handoff Report: Harmonic Ratio Audit & Implementation Plan (R2)

**From:** Audit Explorer 2  
**To:** Orchestrator / Implementer Agent  
**Date:** 2026-08-09  
**Status:** Investigation & Fix Design Complete (Soft Handoff)

---

## 1. Observation

1. **`src/lib/gait/signal.ts` (lines 254–328)**: `computeFFTHarmonics(data: number[], numHarmonics = 10)` accepts only a 1D signal array `data`. It performs peak finding across FFT magnitude bins `mag[k]` to derive `f0Bin`. It reads single array bins `mag[harmIndex]` for odd (`(2m-1)*f0Bin`) and even (`2m*f0Bin`) harmonics without window leakage compensation.
2. **`src/lib/gait/smoothness.ts` (lines 24–48)**: `computeHarmonicRatio(hipY, hipX, fps)` calls `computeFFTHarmonics(hipY, 10)` and `computeFFTHarmonics(hipX, 10)`. It does not pass `fps` or stride duration to `computeFFTHarmonics`.
3. **`src/lib/gait/analysis.ts` (lines 357–361)**: `computeHarmonicRatio(midHipY, midHipX, fps)` is invoked without passing detected stride time (`meanStride`).
4. **`src/lib/gait/__tests__/smoothness.test.ts` (lines 6–18)**: Existing unit tests verify non-zero outputs and fallback behaviors, but do not test literature-aligned values (~2.5–4.0 for vertical HR) on synthetic symmetric gait signals.

---

## 2. Logic Chain

1. In human walking, vertical hip displacement (`hipY`) completes 2 cycles per stride (1 cycle per step). The peak frequency in `hipY` is step frequency ($2 f_{\text{stride}}$).
2. When `computeFFTHarmonics(hipY)` searches for the spectral peak to set `f0Bin`, it sets `f0Bin = bin(2 * f_stride)` instead of stride frequency $f_{\text{stride}}$.
3. Consequently, odd harmonics are extracted at $1 \times (2 f_{\text{stride}}) = 2 f_{\text{stride}}, 6 f_{\text{stride}}, 10 f_{\text{stride}}$ (which are actually even harmonics of stride frequency). The true odd stride harmonics ($1 f_{\text{stride}}, 3 f_{\text{stride}}, 5 f_{\text{stride}}$) are completely skipped.
4. Because the dominant even stride component ($2 f_{\text{stride}}$) is placed into `oddSum`, the vertical HR ratio `evenSum / oddSum` collapses near ~1.0 for symmetric gait instead of achieving expected literature values (~2.5–4.0).
5. Furthermore, single-bin lookup `mag[harmIndex]` ignores the Hann window's 3-bin mainlobe leakage, losing up to >50% harmonic power when harmonic frequencies do not align perfectly with discrete FFT bin indices.
6. Passing `meanStrideSec` (or $f_{\text{stride}} = 1 / \text{meanStrideSec}$) into `computeFFTHarmonics` and integrating harmonic magnitudes over a $\pm 1$ FFT bin neighborhood resolves both fundamental frequency mismatch and spectral leakage.

---

## 3. Caveats

- For extremely short video clips ($< 2$ strides or $< 1.5$ seconds), `detectGaitEventsZeni` may return fewer than 4 events. In such cases, `meanStrideSec` will fall back to `avgStepTimeSec * 2` or peak search fallback in `computeFFTHarmonics`.
- Synthetic signals generated with `testHelpers.ts` must use realistic step/stride frequency components ($f_{\text{stride}} \approx 0.8–1.0$ Hz, $f_{\text{step}} \approx 1.6–2.0$ Hz) to produce exact literature-aligned benchmarks.

---

## 4. Conclusion

The current HR calculation in `src/lib/gait/signal.ts` and `src/lib/gait/smoothness.ts` suffers from fundamental frequency mismatch and spectral leakage under-counting. The proposed fix updates `computeFFTHarmonics` and `computeHarmonicRatio` to accept `meanStrideSec` (or `strideFreq`), sets $f_0 = 1 / \text{meanStrideSec}$, sums harmonic magnitudes over $\pm 1$ FFT bin around each harmonic center bin, and achieves literature-aligned HR values (~2.5–4.0 for vertical HR on symmetric gait).

---

## 5. Verification Method

To verify the proposed implementation when applied by the implementer:

1. **Typecheck**:
   `npx tsc --noEmit`
2. **Run Unit Tests**:
   `npx vitest run src/lib/gait/__tests__/smoothness.test.ts src/lib/gait/__tests__/signal.test.ts`
3. **Inspect Benchmark Values**:
   Verify that synthetic symmetric walking signals return `hrVertical` in the range **2.5–4.0** (or higher for pure synthetic signals) and `hrLateral` in the range **2.0–3.5**.

---

## 6. Remaining Work (For Implementer Agent)

1. Apply proposed changes to `src/lib/gait/signal.ts` (`computeFFTHarmonics`).
2. Apply proposed changes to `src/lib/gait/smoothness.ts` (`computeHarmonicRatio`).
3. Update `src/lib/gait/analysis.ts` line 358 to pass `meanStride` to `computeHarmonicRatio`.
4. Add new test cases to `src/lib/gait/__tests__/smoothness.test.ts` and `signal.test.ts` to test symmetric walking (~2.5–4.0 vertical HR) and explicit `strideFreq` parameters.
5. Run full test suite `npx vitest run` to ensure zero regressions across all gait analysis tests.
