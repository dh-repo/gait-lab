# Forensic Audit Report: Milestone 6 (M6: R2 Harmonic Ratio Fundamental Frequency & Hann Leakage)

**Work Product**: Milestone 6 (M6) implementation (`src/lib/gait/signal.ts`, `src/lib/gait/smoothness.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/__tests__/smoothness.test.ts`, and `src/lib/gait/__tests__/signal.test.ts`)  
**Profile**: General Project (Forensic Audit)  
**Verdict**: CLEAN  

---

## 1. Observation

Direct forensic inspection of the modified codebase and verification output revealed the following empirical findings:

1. **`src/lib/gait/signal.ts`**:
   - Lines 259–264: `computeFFTHarmonics` updated with parameters `(data: number[], fps?: number, strideFreq?: number, numHarmonics = 10)`.
   - Lines 308–328: Computes true fundamental stride frequency $f_0 = \text{strideFreq}$ when provided, deriving `f0Bin = Math.max(1, Math.round((f0 * fftSize) / samplingFps))`. Falls back to peak magnitude search in range `1..fftSize/4` when `strideFreq` is unprovided.
   - Lines 337–358: Calculates harmonic magnitude by summing across a 3-bin neighborhood around `centerBin = Math.round(k * f0 * fftSize / samplingFps)`:
     ```typescript
     let harmonicMag = 0;
     const bMin = Math.max(1, centerBin - 1);
     const bMax = Math.min(halfSize - 1, centerBin + 1);
     for (let b = bMin; b <= bMax; b++) {
       harmonicMag += mag[b];
     }
     ```
     This accurately captures Hann window spectral leakage across non-integer frequency bins.
   - Lines 353–360: Aggregates `oddSum` and `evenSum` based on harmonic index $k$, returning `harmonicRatio = evenSum / (oddSum + 1e-6)`.
   - Complete absence of magic return values, constant mocks, or hardcoded expected outputs.

2. **`src/lib/gait/smoothness.ts`**:
   - Lines 24–29: `computeHarmonicRatio` signature updated to `(hipY: number[], hipX: number[], fps: number, meanStrideSec?: number)`.
   - Line 36: Computes `strideFreq = meanStrideSec && meanStrideSec > 0 ? 1 / meanStrideSec : undefined`.
   - Lines 39–43: Passes `fps` and `strideFreq` to `computeFFTHarmonics` for both vertical (`hipY`) and lateral (`hipX`) displacements.
   - Lines 40, 45, 48: Rounds ratios to 2 decimal places with a safe floor of 0.1, computing `overallHR = Number(Math.sqrt(hrVertical * hrLateral).toFixed(2))`.

3. **`src/lib/gait/analysis.ts`**:
   - Lines 358–362: Derives `meanStrideSec = meanStride > 0 ? meanStride : (avgStepTimeSec > 0 ? avgStepTimeSec * 2 : undefined)` and passes it directly to `computeHarmonicRatio(midHipY, midHipX, fps, meanStrideSec)`.

4. **Unit & Integration Test Suite (`src/lib/gait/__tests__/`)**:
   - `signal.test.ts` (lines 241–276): Verifies that explicit `strideFreq` parameters properly compute `f0Bin` and that $\pm 1$ bin neighborhood summation captures leaked spectral energy for non-integer bin frequencies.
   - `smoothness.test.ts` (lines 65–118): Verifies literature-aligned vertical HR values ($\sim 2.5 - 4.0$) for synthetic symmetric gait and confirms sensitivity to step asymmetry when odd stride harmonics are present.

5. **Tool Execution Results**:
   - M6 test suite (`npx vitest run src/lib/gait/__tests__/smoothness.test.ts src/lib/gait/__tests__/signal.test.ts`): **26 passed out of 26**.
   - Full test suite (`npm test`): **25 node tests passed, 164 vitest tests passed (189 total)**.
   - TypeScript compilation (`npm run typecheck`): **0 errors**.
   - ESLint check (`npm run lint`): **0 errors** (32 unused var warnings across legacy files, 0 errors).

---

## 2. Logic Chain

1. **Harmonic Ratio Fundamental Frequency Logic**:
   - Biomechanical literature (Menz et al. 2003, Bellanca et al. 2013) defines Harmonic Ratio relative to the stride fundamental frequency $f_0 = 1 / \text{meanStrideSec}$.
   - The implementation dynamically calculates `meanStrideSec` from detected gait events in `analysis.ts`, computes `strideFreq = 1 / meanStrideSec` in `smoothness.ts`, and uses `f0Bin = Math.round((f0 * fftSize) / fps)` in `signal.ts`.
   - Observation 1 & 2 confirm that $f_0$ is anchored to actual gait kinematics rather than arbitrary peak magnitude bin search, restoring proper classification of even vs. odd stride harmonics.

2. **Hann Window Spectral Leakage Compensation Logic**:
   - Applying a Hann window in time domain causes spectral leakage over a 3-bin mainlobe in frequency domain.
   - The implementation sums magnitudes across $b \in [\max(1, \text{centerBin} - 1), \min(\text{halfSize} - 1, \text{centerBin} + 1)]$.
   - Observation 1 confirms that center bins are computed independently per harmonic $k$ (`round(k * f0 * fftSize / fps)`), eliminating phase and rounding error accumulation across higher harmonics.

3. **Absence of Integrity Violations**:
   - **Hardcoded test results**: None. All harmonic ratios are computed dynamically via Cooley-Tukey Radix-2 FFT and magnitude summation.
   - **Facade implementations**: None. Signal processing algorithms (Butterworth, linear detrending, Cooley-Tukey FFT, Hann windowing, 3-bin leakage integration) are genuine and general-purpose.
   - **Pre-populated artifacts**: None found.
   - **Self-certifying tests**: None. Unit tests generate synthetic trigonometric signals and assert expected mathematical/physical relationships.
   - **Execution delegation**: None. Implementation is pure TypeScript in `signal.ts`.

---

## 3. Caveats

- In short clips ($< 1.5$ seconds or $< 2$ full strides) where gait event detection yields no valid `meanStrideSec`, `computeFFTHarmonics` falls back to lower-frequency dominant peak detection. This is an intended signal-processing fallback and does not affect normal multi-stride analyses.
- The 3-bin Hann window summation assumes standard Hann window mainlobe width ($\pm 1$ bin). If a different windowing function (e.g. Blackman-Harris) were introduced in the future, the neighborhood width would need adjustment.

---

## 4. Conclusion

**Verdict**: **`CLEAN`**

The implementation of Milestone 6 (M6: R2 Harmonic Ratio Fundamental Frequency & Hann Leakage) strictly adheres to project requirements, scientific principles, and integrity guidelines:
- Fundamental stride frequency $f_0 = 1 / \text{meanStrideSec}$ is correctly passed and utilized in spectral harmonic decomposition.
- Hann window spectral leakage is accurately compensated via 3-bin neighborhood magnitude summation.
- Zero hardcoded outputs, fake facades, mock overrides, or integrity violations were detected.
- All 189 unit/integration tests pass cleanly with 0 typecheck and 0 linting errors.

---

## 5. Verification Method

To independently verify this audit verdict, run the following commands from `/Users/damian/GitHub/gait-lab`:

1. **Verify M6 Unit Tests**:
   ```bash
   npx vitest run src/lib/gait/__tests__/smoothness.test.ts src/lib/gait/__tests__/signal.test.ts
   ```
   *Expected Output*: `26 passed (26)`

2. **Verify Full Project Test Suite**:
   ```bash
   npm test
   ```
   *Expected Output*: `25 node tests passed, 164 vitest tests passed`

3. **Verify TypeScript Types**:
   ```bash
   npm run typecheck
   ```
   *Expected Output*: `0 errors`

4. **Verify ESLint Quality**:
   ```bash
   npm run lint
   ```
   *Expected Output*: `0 errors`

5. **Inspect Implementation Files**:
   - `src/lib/gait/signal.ts` (lines 259–363)
   - `src/lib/gait/smoothness.ts` (lines 24–51)
   - `src/lib/gait/analysis.ts` (lines 357–362)
   - `src/lib/gait/__tests__/signal.test.ts` (lines 241–276)
   - `src/lib/gait/__tests__/smoothness.test.ts` (lines 65–118)
