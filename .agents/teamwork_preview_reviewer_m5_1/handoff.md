# Handoff Report — Reviewer 1 (M5: R1 Follow-Cam Direction & R5 Peak Prominence)

**Worker:** `teamwork_preview_reviewer_m5_1`  
**Date:** 2026-08-09  
**Status:** Review Complete — Verdict: REQUEST_CHANGES  

---

## 1. Observation

### 1.1 Scope & Files Examined
The review evaluated the implementation for Milestone 5 (M5 R1 & R5) across the following files:
- `src/lib/gait/events.ts`
- `src/lib/gait/__tests__/events.test.ts`
- `src/lib/gait/__tests__/testHelpers.ts`

### 1.2 Verification Command Executions & Output Quotes

1. **Vitest `events.test.ts`**:
   Command: `npx vitest run src/lib/gait/__tests__/events.test.ts`
   ```
    RUN  v4.1.10 /Users/damian/GitHub/gait-lab

    ✓ src/lib/gait/__tests__/events.test.ts (11 tests) 8ms

    Test Files  1 passed (1)
         Tests  11 passed (11)
   ```

2. **TypeScript Typecheck**:
   Command: `npm run typecheck`
   ```
   > typecheck
   > tsc --noEmit

   src/lib/gait/__tests__/challenger_m5_2.test.ts(2,32): error TS2459: Module '"../events"' declares 'findExtrema' locally, but it is not exported.
   ```
   *Exit code: 2 (FAILED)*

3. **Full Project Test Suite**:
   Command: `npm test`
   ```
   > test
   > node --test 'scripts/**/*.test.mjs' && vitest run

   ℹ tests 25
   ℹ pass 25

   FAIL  src/lib/gait/__tests__/challenger_m5_2.test.ts
   Error: No test suite found in file /Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/challenger_m5_2.test.ts

   Test Files  1 failed | 14 passed (15)
        Tests  146 passed (146)
   ```
   *Exit code: 1 (FAILED)*

4. **ESLint**:
   Command: `npm run lint`
   ```
   ✖ 31 problems (0 errors, 31 warnings)
   ```
   *Exit code: 0 (PASSED)*

---

## 2. Logic Chain

1. **Interface Contract Verification**:
   - `PROJECT.md` line 91 under **Interface Contracts** explicitly specifies:
     `export function findExtrema(signal: number[], mode: 'max' | 'min', minGap: number, minProminence?: number): number[];`
   - In `src/lib/gait/events.ts` (line 86), `findExtrema` is declared without `export`:
     `function findExtrema(signal: number[], mode: "max" | "min", minGap: number, userMinProminence?: number): number[]`
   - Because `findExtrema` is not exported, any module importing `findExtrema` fails TypeScript compilation with error `TS2459`.

2. **Verification Failures**:
   - Running `npm run typecheck` fails due to the missing `export` keyword on `findExtrema`.
   - Consequently, running `npm test` fails during the full test suite run.

3. **Algorithmic & Mathematical Quality Audit**:
   - **R1 (Follow-Cam Direction Inference)**: The algorithm in `events.ts` correctly extracts `toe.x - heel.x` from frames with valid landmark visibility ($\ge 0.4$), computes `medianFootDiff`, and accurately infers direction ($+1$ for L->R, $-1$ for R->L) in handheld follow-cam shots where net hip displacement is zero. Fallback to mid-hip displacement when valid foot samples $< 5$ or $|\text{medianFootDiff}| \le 0.005$ functions correctly.
   - **R5 (Topographic Peak Prominence)**: `calculateProminence` accurately measures 1D discrete topographic prominence for both `"max"` and `"min"` modes. The dynamic threshold $P_{\text{min}} = \max(0.01, 0.15 \times \text{signalRange})$ correctly filters micro-ripples while preserving gait extrema.
   - **Synthetic Frame Generator**: `testHelpers.ts` properly implements `followCam: true` by setting progress to 0 while preserving foot orientation oscillations.

---

## 3. Caveats

- No integrity violations or fake logic were detected in the mathematical implementation of direction inference or peak prominence.
- The rejection of the work product is purely due to interface non-adherence (`export function findExtrema`) causing build/typecheck/test verification commands to fail.

---

## 4. Conclusion

**Verdict**: `REQUEST_CHANGES`

While the core mathematical logic for R1 (Follow-Cam Direction Inference) and R5 (Peak Prominence Filtering) is mathematically sound, robust, and well-tested within `events.test.ts`, the implementation fails interface contract adherence specified in `PROJECT.md` by omitting the `export` keyword on `findExtrema`. This omission causes `npm run typecheck` and `npm test` to fail.

### Required Remediation:
Add `export` to `findExtrema` in `src/lib/gait/events.ts`:
```typescript
export function findExtrema(
  signal: number[],
  mode: "max" | "min",
  minGap: number,
  userMinProminence?: number,
): number[]
```

---

## 5. Verification Method

To independently verify after worker remediation:

1. **Run TypeScript Typecheck**:
   ```bash
   npm run typecheck
   ```
   Must exit with code 0 and 0 errors.

2. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   Must pass all unit tests and script tests with 0 failures.

3. **Run Events Test Suite**:
   ```bash
   npx vitest run src/lib/gait/__tests__/events.test.ts
   ```
   Must pass all 11 tests in `events.test.ts`.

4. **Run ESLint**:
   ```bash
   npm run lint
   ```
   Must exit with code 0 and 0 errors.

---

## Review Findings Summary

### [Major] Finding 1: `findExtrema` is not exported per `PROJECT.md` Interface Contract
- **What**: `findExtrema` is defined as a non-exported local function in `events.ts`.
- **Where**: `src/lib/gait/events.ts`, line 86.
- **Why**: `PROJECT.md` line 91 specifies `export function findExtrema(...)`. Omitting `export` violates the contract and causes `npm run typecheck` and `npm test` to fail.
- **Suggestion**: Change `function findExtrema(` to `export function findExtrema(`.

## Verified Claims

- R1 Follow-Cam Direction Inference (`toe.x - heel.x` median) → verified via code inspection and synthetic test cases → PASS (math & logic correct)
- R5 Peak Prominence Filtering (`calculateProminence` & $P_{\text{min}}$ threshold) → verified via signal processing analysis → PASS (math & logic correct)
- Interface Contract Adherence → verified via `npm run typecheck` → FAIL (`findExtrema` not exported)
- Project Test Suite Completion → verified via `npm test` → FAIL (typecheck error cascades to test suite)
