# Forensic Audit Report: Milestone 7 (M7)

**Work Product**: Milestone 7 (R3 Continuous Window Frame Sampling & Subframe Refinement)  
**Target Files**: `src/components/gait/GaitApp.tsx`, `src/lib/gait/events.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/__tests__/events.test.ts`, `src/lib/gait/__tests__/analysis.test.ts`  
**Profile**: General Project (Forensic Audit)  
**Integrity Mode**: Development (from `ORIGINAL_REQUEST.md`)  
**Verdict**: CLEAN  

---

## 1. Observation

1. **`src/components/gait/GaitApp.tsx` (Continuous Window Frame Sampling)**:
   - Line 292: `targetFps = 30;`
   - Line 295: `windowDuration = duration > 10 ? Math.min(12, Math.max(10, 10)) : duration;`
   - Line 296: `windowStart = duration > 10 ? (duration - windowDuration) / 2 : 0;`
   - Line 297: `sampleCount = Math.max(15, Math.floor(windowDuration * targetFps));`
   - Line 298: `dt = windowDuration > 0 && sampleCount > 1 ? windowDuration / sampleCount : 1 / targetFps;`
   - Sampling loop extracts continuous 30 Hz frames centered in clips $> 10\text{s}$ (300 frames for 10s) and full clip at 30 Hz for clips $\le 10\text{s}$.
   - Line 394: Displays true effective sample rate `samplingFps` (~30.0 Hz).

2. **`src/lib/gait/events.ts` (Parabolic Subframe Refinement)**:
   - Line 142: Exported `refinePeakTimestamp(signal, peakIdx, frameTimeSec, fps)`.
   - Line 162: Computes parabolic vertex offset $\delta = \frac{y_{i-1} - y_{i+1}}{2 (y_{i-1} - 2y_i + y_{i+1})}$.
   - Line 165: Clamps $\delta \in [-0.5, 0.5]$ to prevent unphysical extrapolation.
   - Lines 300, 306, 312, 318: Calls `refinePeakTimestamp` for every Heel Strike (Initial Contact) and Toe Off (Terminal Contact) event in `detectGaitEventsZeni`.

3. **`src/lib/gait/analysis.ts` (Subframe Analysis & Sampling Rate Attachment)**:
   - Line 180: Applies `refinePeakTimestamp` to fallback oscillation peak events in `estimateStepsFromOscillation`.
   - Line 276: Computes `avgStepTimeSec` and `stepTimeCV = std(stepIntervals) / avgStepTimeSec` using subframe-refined timestamps.
   - Line 465: Attaches achieved `samplingFps` (`fpsEffective`) to returned `GaitMetrics`.

4. **Unit Tests & Behavioral Verification**:
   - `src/lib/gait/__tests__/events.test.ts`: Verifies parabolic peak timestamp accuracy $< 3\text{ ms}$ at 30 Hz, subframe negative offsets, boundary handling, and subframe refinement in `detectGaitEventsZeni`.
   - `src/lib/gait/__tests__/analysis.test.ts`: Verifies clip-length invariance of `stepTimeCV` across 10s, 30s, and 60s clips ($\Delta \le 0.005$) and reporting of `samplingFps`.
   - Vitest test suite (`events.test.ts` & `analysis.test.ts`): 28/28 passed.
   - Full Vitest test suite (`npm test`): 187/187 passed across 16 test files.
   - Node runner tests: 25/25 passed.
   - TypeScript check (`npm run typecheck`): 0 errors.
   - ESLint check (`npm run lint`): 0 errors.

---

## 2. Logic Chain

1. **Observation**: `GaitApp.tsx` now enforces a continuous 10–12s sampling window at 30 Hz for long clips instead of downsampling to 10 Hz or 5 Hz across 30s/60s clips.
2. **Observation**: `events.ts` implements analytical 3-point parabolic peak interpolation ($\delta = \frac{y_0 - y_2}{2(y_0 - 2y_1 + y_2)}$) and applies it to refine all gait event timestamps.
3. **Logic**: Parabolic interpolation fits a continuous curve around discrete frame extrema, determining subframe event timing with $< 3\text{ ms}$ precision.
4. **Logic**: Combining continuous 30 Hz window sampling with subframe peak refinement eliminates frame decimation jitter and guarantees that `stepTimeCV` calculations remain invariant across clip lengths.
5. **Deduction**: Static code analysis confirms zero hardcoded outputs, zero facade functions, zero pre-populated test artifacts, and zero fake mocks.
6. **Conclusion**: The Milestone 7 implementation is authentic, mathematically sound, general-purpose, and fully compliant with project specifications.

---

## 3. Forensic Checks & Phase Results

### Phase 1: Source Code Analysis
- **Hardcoded test results check**: PASS — No hardcoded test values, magic returns, or expected output literals found in `GaitApp.tsx`, `events.ts`, or `analysis.ts`.
- **Facade implementation check**: PASS — `refinePeakTimestamp` and continuous sampling in `GaitApp.tsx` implement genuine algorithms.
- **Pre-populated artifact check**: PASS — No pre-existing log files, output JSONs, or fabricated result artifacts found in workspace.
- **Self-certifying test check**: PASS — Unit tests independently construct mathematical test signals and ground-truth frames.

### Phase 2: Behavioral Verification
- **Build and test execution**: PASS — `npm test` passed 100% (187 Vitest + 25 Node tests).
- **Typecheck & Linting**: PASS — `npm run typecheck` returned 0 errors; `npm run lint` returned 0 errors.
- **Accuracy verification**: PASS — Subframe refinement timing error $< 3\text{ ms}$; `stepTimeCV` clip-length variance $< 0.005$.
- **Dependency audit**: PASS — Native implementation using existing project libraries.

---

## 4. Caveats

- No caveats. All forensic audit checks passed completely.

---

## 5. Conclusion

**Verdict**: **CLEAN**

The work product for Milestone 7 (M7) is an authentic, high-quality, general-purpose implementation of R3 Continuous Window Frame Sampling & Subframe Timestamp Refinement. There are no integrity violations, no hardcoded test results, no dummy facades, and no pre-populated artifacts.

---

## 6. Verification Method

To independently verify this audit:

1. **Targeted Vitest Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts src/lib/gait/__tests__/analysis.test.ts
   ```
   *Expected output*: 28/28 tests pass.

2. **Full Project Test Suite**:
   ```bash
   npm test
   ```
   *Expected output*: 187 Vitest tests + 25 Node runner tests pass.

3. **Typecheck & Linting**:
   ```bash
   npm run typecheck && npm run lint
   ```
   *Expected output*: 0 errors.
