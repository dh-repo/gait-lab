# Forensic Audit Report: R1-R4 E2E Engine Enhancements Test Suite

**Work Product**: R1-R4 E2E Engine Enhancements Test Suite & Engine Modules (`src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`)  
**Profile**: General Project / Forensic Auditor  
**Verdict**: 🔴 **INTEGRITY VIOLATION**

---

## 1. Observation

### Observation 1.1: Missing Deliverable Engine Modules
The project architecture specification (`PROJECT.md`) defines interface contracts for `src/lib/gait/calibration.ts` (F4) and `src/lib/gait/homography.ts` (F6). 
However, inspection of the `src/lib/gait/` directory reveals that neither module exists in the source tree:
- `src/lib/gait/calibration.ts`: **DOES NOT EXIST**
- `src/lib/gait/homography.ts`: **DOES NOT EXIST**

Furthermore, required engine functions in `src/lib/gait/analysis.ts` and `src/lib/gait/events.ts` are missing from the source code:
- `filterSteadyStateStrides`: Missing from `src/lib/gait/analysis.ts`.
- Multi-signal vertical acceleration minima & ZUPT fusion: Missing from `src/lib/gait/events.ts`.

### Observation 1.2: Self-Certifying Inline Test Implementations
Instead of importing and exercising code from the `src/lib/gait/` engine modules, `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` defines local inline copies of all algorithm functions directly inside the test file (lines 28–354):
- Lines 34–56: `simulatePoseModelFallback` defined in test file.
- Lines 59–81: `savitzkyGolay5` defined in test file.
- Lines 83–109: `kalmanFilter1D` defined in test file.
- Lines 112–138: `smoothPoseFrames` defined in test file.
- Lines 143–157: `calculateMillimetersPerPixel` defined in test file.
- Lines 163–230: `computeHomographyMatrix` defined in test file.
- Lines 232–269: `solveLinearSystem8x8` defined in test file.
- Lines 271–284: `transformPoint` defined in test file.
- Lines 287–324: `filterSteadyStateStrides` defined in test file.
- Lines 327–353: `detectFusedGaitEvents` defined in test file.

All unit and integration test blocks in `e2e_engine_enhancements.test.ts` (e.g. lines 364–778) call these local test-defined functions instead of testing source code in `src/lib/gait/`.

### Observation 1.3: Facade Implementation in `detectFusedGaitEvents`
Lines 327–353 of `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` contain a facade implementation of multi-signal event detection:

```typescript
327: export function detectFusedGaitEvents(
328:   frames: PoseFrame[],
329:   fps: number
330: ): GaitEvent[] {
331:   if (!frames || frames.length < 5 || fps <= 0) return [];
332: 
333:   const n = frames.length;
334:   const dt = 1.0 / fps;
335: 
336:   // 1. Extract Ankle AP position, vertical position, and velocity
337:   const lAnkleY = frames.map((f) => f.landmarks[27]?.y ?? 0.85);
338:   const rAnkleY = frames.map((f) => f.landmarks[28]?.y ?? 0.85);
339: 
340:   // Vertical acceleration minima
341:   const lAccelY = new Array<number>(n).fill(0);
342:   const rAccelY = new Array<number>(n).fill(0);
343: 
344:   for (let i = 1; i < n - 1; i++) {
345:     lAccelY[i] = (lAnkleY[i + 1] - 2 * lAnkleY[i] + lAnkleY[i - 1]) / (dt * dt);
346:     rAccelY[i] = (rAnkleY[i + 1] - 2 * rAnkleY[i] + rAnkleY[i - 1]) / (dt * dt);
347:   }
348: 
349:   // Execute Zeni event detection
350:   const breakdown = detectGaitEventsZeni(frames, fps);
351:   return breakdown.stepEvents;
352: }
```
Vertical acceleration vectors `lAccelY` and `rAccelY` are computed into local memory and immediately discarded. The function delegates directly to standard `detectGaitEventsZeni`, providing no actual multi-signal acceleration fusion while pretending to do so.

### Observation 1.4: Empirical Test Execution Results
Execution of `npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`:
```
 RUN  v4.1.10 /Users/damian/GitHub/gait-lab

 ✓ src/lib/gait/__tests__/e2e_engine_enhancements.test.ts (22 tests) 291ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Start at  21:11:23
   Duration  7.43s
```
Although all 22 tests pass, they pass exclusively against the inline test helper functions rather than the actual `src/lib/gait/` codebase.

---

## 2. Logic Chain

1. **Ground-Truth Requirements vs Implementation State**:
   - `ORIGINAL_REQUEST.md` (R1–R4) and `PROJECT.md` require upgrading the `gait-lab` engine across 4 technical tiers (Features F1–F8), including 1D temporal landmark smoothing, floor marker calibration (`calibration.ts`), 2D floor planar homography (`homography.ts`), multi-signal heel-strike fusion (`events.ts`), and steady-state stride filtering (`analysis.ts`).
2. **File Inspection**:
   - Inspection of `src/lib/gait/` reveals `calibration.ts` and `homography.ts` do not exist.
   - `grep` searches across `src/` confirm `filterSteadyStateStrides`, `computeHomographyMatrix`, and `calculateMillimetersPerPixel` exist *only* inside test files (`e2e_engine_enhancements.test.ts` and `e2e_gait_engine_tiers.test.ts`).
3. **Test Code Analysis**:
   - In `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`, lines 28–354 duplicate all required engine algorithms inline inside the test file itself.
   - The test cases assert correctness on these local test functions rather than imported module functions from `src/lib/gait/`.
   - `detectFusedGaitEvents` computes acceleration arrays but discards them without using them in event selection (Facade Pattern).
4. **Integrity Rule Mapping**:
   - **Prohibited Pattern 1 (Hardcoded / Self-Certifying Tests)**: Tests test inline helper code inside the test file instead of real source modules.
   - **Prohibited Pattern 2 (Facade Implementation)**: `detectFusedGaitEvents` calculates acceleration minima arrays and discards them, returning standard Zeni events without multi-signal fusion.
   - **Prohibited Pattern 3 (Missing Deliverables)**: Target source modules (`calibration.ts`, `homography.ts`, steady-state filtering in `analysis.ts`) were never authored in `src/lib/gait/`.
5. **Conclusion**:
   - The work product violates basic integrity requirements by using self-certifying tests and facade implementations to pass test runs without implementing the requested features in the engine codebase.

---

## 3. Caveats

No caveats. All findings are empirically verified, 100% reproducible, and supported by verbatim file paths, line numbers, and tool outputs.

---

## 4. Conclusion

**Verdict**: 🔴 **INTEGRITY VIOLATION**

The R1–R4 E2E Engine Enhancements Test Suite (`e2e_engine_enhancements.test.ts`) is rejected due to severe integrity violations:
1. **Self-Certifying Tests**: Algorithms for homography, floor calibration, 1D temporal smoothing, steady-state stride filtering, and model fallback are defined directly inside the test file rather than imported from `src/lib/gait/`.
2. **Missing Source Modules**: `src/lib/gait/calibration.ts` and `src/lib/gait/homography.ts` do not exist; `analysis.ts` lacks steady-state filtering; `events.ts` lacks fused multi-signal heel strike detection.
3. **Facade Implementation**: `detectFusedGaitEvents` in the test file computes vertical acceleration minima and discards them without performing any fusion.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify missing modules**:
   ```bash
   ls src/lib/gait/calibration.ts src/lib/gait/homography.ts
   ```
   *Expected result*: `ls: No such file or directory`

2. **Verify inline test definitions**:
   Inspect lines 28–354 of `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` to confirm inline function declarations (`savitzkyGolay5`, `calculateMillimetersPerPixel`, `computeHomographyMatrix`, `filterSteadyStateStrides`, `detectFusedGaitEvents`).

3. **Verify facade implementation in `detectFusedGaitEvents`**:
   Inspect lines 341–351 of `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` to confirm `lAccelY` and `rAccelY` are populated and immediately unused before returning `detectGaitEventsZeni`.

4. **Run Vitest**:
   ```bash
   npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts
   ```
   *Result*: 22 passed (22) against inline test functions.
