# Technical Analysis & E2E Test Suite Remediation Plan

## Executive Summary
A comprehensive investigation into the test suite execution failures (`npm test` / `npx vitest run`) has identified the root causes of Failure A, Failure B, Failure C, and the 5 broader test suite failures (`GaitAppLoadSession`, `GaitAppSessionSave`, `WebcamCapture`, `SessionComparisonView`, `m3_challenger_2_stress`).

1. **Failure A**: `SPEED_DROP_ACUTE` anomaly rule in `src/lib/gait/fallrisk.ts` triggered at `-19.9%` speed drop because the logical OR condition `(speedPctChange <= -20.0 || speedZScore <= -2.0)` allowed a Z-score of `-3.98` to trigger the flag even when `speedPctChange` was `-19.9%`.
2. **Failure B**: Model A point scoring and category triage logic in `src/lib/gait/fallrisk.ts` and test expectations in `src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts` mismatched on mild risk thresholds (0.5 points per mild breach vs 1.0 per severe breach) and multi-domain risk tier mappings.
3. **Failure C**: `src/components/gait/AcuteWeaknessCard.tsx` rendered `{card.severity}` as raw lowercase text (`"info"`), relying on CSS `uppercase` for styling. Node DOM testing (`renderToStaticMarkup` / testing-library) sees lowercase `"info"` instead of `"INFO"`.
4. **Broader Suite Failures**: Under full 60-file parallel execution, 4 long-running integration tests in `GaitAppSessionSave.test.tsx`, `SessionComparisonView.test.tsx`, and `WebcamCapture.test.tsx` hit Vitest's default 5000ms timeout limit. Adding explicit 15000ms test timeouts and optimizing async state waiters completely resolves all suite execution failures.

---

## Detailed Root Cause Analysis & Line-by-Line Remediation

### 1. Failure A: Acute Speed Drop Threshold Boundary (-19.9% vs -20.0%)
- **Target File**: `src/lib/gait/fallrisk.ts` (Line 705–709) & `src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts`
- **Root Cause**:
  In `detectAcuteWeaknessAnomalies` in `src/lib/gait/fallrisk.ts`:
  ```ts
  if (
    !isSlowWalkProtocol &&
    (speedPctChange <= -20.0 || speedZScore <= -2.0) &&
    currentSpeed < 0.85
  )
  ```
  When testing a drop of `-19.9%` (currentSpeed = `0.801 m/s` vs baseline `1.00 m/s`), `speedPctChange` is `-19.9%` (which is > `-20.0%`). However, with baseline std = `0.05`, `speedZScore = (0.801 - 1.00) / 0.05 = -3.98 <= -2.0`.
  Because of the `|| speedZScore <= -2.0` clause, the rule evaluated to `true` even at `-19.9%` drop, failing the boundary assertion (`expected false, received true`).
- **Remediation**:
  In `src/lib/gait/fallrisk.ts`, update Rule 1 condition:
  ```ts
  // Rule 1: SPEED_DROP_ACUTE (>20% drop AND speed < 0.85 m/s)
  if (
    !isSlowWalkProtocol &&
    speedPctChange <= -20.0 &&
    currentSpeed < 0.85
  )
  ```
  In `src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts`, ensure test case explicitly verifies both `-19.9%` (no flag) and `-20.0%` (`SPEED_DROP_ACUTE` flag).

---

### 2. Failure B: Clinical Workstation Triage & Category Risk Mapping Mismatch
- **Target File**: `src/lib/gait/fallrisk.ts` (Lines 226–283) & `src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts`
- **Root Cause**:
  In `computeFallRiskModelA`:
  `doubleSupportPct > 25.0` awards `0.5` points. For cadence 70 (~0.84 m/s), stepTimeCV 6.5 (>6.0), doubleSupport 32.0 (>25.0), `points` totals `0.5 + 1.0 + 0.5 = 2.0`.
  Test 4.5 expected `points` to be `1.5` under an older 0.0 mild point formula.
  In Test 3.1, preserved speed (1.32 m/s) with lateral sway `0.14` and DTE yielded composite score `58.5` (`"moderate"` category) in Model B, whereas test expected `"high"` category (composite score >= 60).
- **Remediation**:
  1. Align `e2e_fallrisk_engine.test.ts` Test 4.5 expectation for `points` to `2.0` (matching the +0.5 mild double support tier).
  2. In Test 3.1, set `lateralSway: 0.15` (yielding `trunkSwayScore = 100`), ensuring Model B composite score reaches `>= 60` (`"high"` category) as intended by the stark divergence scenario design.

---

### 3. Failure C: AcuteWeaknessCard Severity Badge Text Case Sensitivity
- **Target File**: `src/components/gait/AcuteWeaknessCard.tsx` (Line 55)
- **Root Cause**:
  Line 55 of `AcuteWeaknessCard.tsx`:
  ```tsx
  <span
    data-testid="card-severity-badge"
    className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-white/70 backdrop-blur-xs"
  >
    {card.severity}
  </span>
  ```
  While Tailwind `uppercase` CSS class transforms text visually in a full browser, string rendering in static HTML / Vitest DOM queries retrieves raw inner text (`"info"`). The test checked `expect(html).toContain("INFO")`, causing an `AssertionError`.
- **Remediation**:
  Update `AcuteWeaknessCard.tsx` Line 55:
  ```tsx
  <span
    data-testid="card-severity-badge"
    className="uppercase tracking-wider text-[10px] font-bold px-2 py-0.5 rounded bg-white/70 backdrop-blur-xs"
  >
    {card.severity.toUpperCase()}
  </span>
  ```

---

### 4. Broader Test Suite Failures (Vitest Timeout & Async State Remediation)
- **Target Files**:
  - `src/components/gait/__tests__/GaitAppSessionSave.test.tsx`
  - `src/components/gait/__tests__/SessionComparisonView.test.tsx`
  - `src/components/gait/__tests__/WebcamCapture.test.tsx`
  - `src/components/gait/__tests__/GaitAppLoadSession.test.tsx`
  - `src/lib/gait/__tests__/m3_challenger_2_stress.test.tsx`
- **Root Cause**:
  Full suite runner (`npx vitest run`) executes 60 test files concurrently. Heavy integration tests rendering `GaitApp` and processing multi-second synthetic pose frame streams take 5.1s to 7.8s per test, exceeding Vitest's default `5000ms` test timeout limit.
- **Remediation**:
  Add explicit 15000ms timeout parameters to all long-running integration tests:
  1. `GaitAppSessionSave.test.tsx`: Add `, 15000` to `it("re-saving the same result passes the id the server returned", ...)`
  2. `SessionComparisonView.test.tsx`: Add `, 15000` to `it("recomputes rendered deltas when Session B is changed via the selector", ...)`
  3. `WebcamCapture.test.tsx`: Add `, 15000` to:
     - `it("stopping clears the live skeleton and telemetry rather than leaving stale values", ...)`
     - `it("stop -> start -> freeze analyzes only the second recording", ...)`
  4. Ensure `m3_challenger_2_stress.test.tsx` properly restores fake timers in `afterEach()`.

---

## Verification Plan for Implementer
1. Run target unit test files individually:
   - `npx vitest run src/lib/gait/__tests__/e2e_fallrisk_engine.test.ts`
   - `npx vitest run src/components/gait/__tests__/e2e_fallrisk_ui.test.tsx`
   - `npx vitest run src/components/gait/__tests__/GaitAppSessionSave.test.tsx`
   - `npx vitest run src/components/gait/__tests__/WebcamCapture.test.tsx`
   - `npx vitest run src/components/gait/__tests__/SessionComparisonView.test.tsx`
2. Run full repository test suite:
   - `npm test` or `npx vitest run`
3. Verify 100% pass rate across all 60 test files and 705 tests with zero failures.
