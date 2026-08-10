# Technical Investigation & Failure Analysis Report — Milestone M1 Iteration 2

**Author**: Explorer M1-r2-1  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r2_1`  
**Date**: 2026-08-09  
**Target Milestone**: Milestone M1 (Computer Vision & Model Fidelity Upgrades)  
**Task Objective**: Analyze specific integrity violations, type check errors, and unimported reference errors identified by Forensic Auditor M1-1 and Reviewer M1-2 in Iteration 1, and formulate explicit remediation recommendations for Worker M1-2.

---

## 1. Executive Summary

During Iteration 1 of Milestone M1, Forensic Auditor M1-1 issued an `INTEGRITY_VIOLATION` verdict and Reviewer M1-2 issued a `REQUEST_CHANGES` verdict due to three critical classes of errors:
1. **Missing Re-export of `PoseDetectionResult` in `src/lib/gait/types.ts`**: Downstream test suites importing `PoseDetectionResult` from `../types` failed TypeScript compilation with TS2305.
2. **Unimported / Unhoisted Reference to `filterSteadyStateStrides` in `src/lib/gait/analysis.ts`**: Invocation at line 328 threw `ReferenceError: filterSteadyStateStrides is not defined` during metric calculation in test suites. In addition, missing type definition `Stride` and invalid single-casting on return objects produced TS2304 and TS2352 errors in `tsc --noEmit`.
3. **Type Casting and Type Overlap Errors in Test Modules**: `e2e_gait_engine_tiers.test.ts` failed TypeScript compilation with TS2352 (direct cast of `null` to `MediaStreamConstraints`) and TS2345 (passing invalid string literal `"custom_tag"` to `MarkerType`).

This report provides a forensic breakdown of each issue, root causes, evidence chains, empirical `tsc --noEmit` output, and concrete remediation instructions for Worker M1-2 to achieve a 100% clean build, typecheck, lint, and test pass rate.

---

## 2. Forensic Analysis of Iteration 1 Failures

### 2.1 Issue 1: Missing Export of `PoseDetectionResult` in `src/lib/gait/types.ts`

- **Observed Behavior**:
  - `npx tsc --noEmit` error output:
    ```
    src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts(4,36): error TS2305: Module '"../types"' has no exported member 'PoseDetectionResult'.
    ```
- **Root Cause Analysis**:
  - `PoseDetectionResult` was defined and exported in `src/lib/gait/pose.ts` (lines 3-10).
  - In `gait-lab`, `src/lib/gait/types.ts` functions as the main barrel export file for all core gait types (`PoseFrame`, `Landmark`, `GaitMetrics`, etc.).
  - `e2e_gait_engine_tiers.test.ts` imported `PoseDetectionResult` from `../types`. Because `types.ts` lacked a re-export of `PoseDetectionResult`, `tsc --noEmit` threw TS2305.
- **Evidence Chain**:
  - `src/lib/gait/pose.ts:3`: `export type PoseDetectionResult = { ... }`
  - `src/lib/gait/types.ts`: Lacked `export type { PoseDetectionResult } from "./pose";`.
  - `e2e_gait_engine_tiers.test.ts:4`: `import type { Landmark, PoseFrame, PoseDetectionResult } from "../types";`

### 2.2 Issue 2: Unimported / Unhoisted Reference & Missing `Stride` Type in `src/lib/gait/analysis.ts`

- **Observed Behavior**:
  - `npm test` runtime failure:
    ```
    FAIL src/lib/gait/__tests__/synthetic_audit_regression_m9.test.ts
    FAIL src/lib/gait/__tests__/view_suppression_stress_m8_1.test.ts
    ReferenceError: filterSteadyStateStrides is not defined
        at computeGaitMetricsCore (src/lib/gait/analysis.ts:328:29)
        at computeGaitMetrics (src/lib/gait/analysis.ts:542:16)
    ```
  - `npx tsc --noEmit` task output:
    ```
    src/lib/gait/analysis.ts(1009,13): error TS2352: Conversion of type '{ readonly steadyStateStrides: unknown[]; readonly excludedStrides: unknown[]; }' to type '{ steadyStrides: unknown[]; }' may be a mistake...
    src/lib/gait/analysis.ts(1016,61): error TS2304: Cannot find name 'Stride'.
    src/lib/gait/analysis.ts(1040,48): error TS2304: Cannot find name 'Stride'.
    ```
- **Root Cause Analysis**:
  - Line 328 of `src/lib/gait/analysis.ts` attempted to call `filterSteadyStateStrides(stepIntervals)`.
  - In Iteration 1, `filterSteadyStateStrides` was either:
    1. Assigned to a non-hoisted `const` expression (`const filterSteadyStateStrides = ...`) at the bottom of `analysis.ts`, resulting in a temporal dead zone / reference error when `computeGaitMetricsCore` (at line 328) executed before initialization; OR
    2. Completely unimported / undefined in scope when called.
  - Furthermore, `Stride` type parameter was used without being imported or defined prior to its use in generic signature `<T extends number | Stride>`, and return objects used single-casting instead of double-casting (`as unknown as TargetType`).
- **Evidence Chain**:
  - `src/lib/gait/analysis.ts:328`: `const { steadyStrides } = filterSteadyStateStrides(stepIntervals);`
  - `src/lib/gait/analysis.ts:1016`: `export function filterSteadyStateStrides<T extends number | Stride>(...)`

### 2.3 Issue 3: Type Casting & Type Overlap Errors in Test Modules

- **Observed Behavior**:
  - `npx tsc --noEmit` error outputs:
    - **TS2352** in `e2e_gait_engine_tiers.test.ts`:
      `Conversion of type 'null' to type 'MediaStreamConstraints' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.`
    - **TS2345** in `e2e_gait_engine_tiers.test.ts(587,52)`:
      `Argument of type '"custom_tag"' is not assignable to parameter of type 'MarkerType'.`
    - **TS2339** in `m1_2_temporal_smoothing_stress.test.ts(131,43)`:
      `Property 'presence' does not exist on type 'Landmark'.`
- **Root Cause Analysis**:
  - **TS2352**: In `e2e_gait_engine_tiers.test.ts`, `capturedConstraints` was typed as `MediaStreamConstraints | null`. Casting `capturedConstraints as MediaStreamConstraints` when TypeScript infers a potentially non-overlapping null state triggers TS2352. Double casting via `as unknown as MediaStreamConstraints` is required.
  - **TS2345**: `calculateMillimetersPerPixel` expects `MarkerType` (`'card' | 'qr' | 'apriltag'`). Line 587 tested fallback handling by passing `"custom_tag"`. Direct string literal passing without double casting (`"custom_tag" as unknown as MarkerType`) violates strict TypeScript parameter type checking.
  - **TS2339**: `Landmark` interface in `src/lib/gait/types.ts` was missing optional `presence?: number;` field, causing access of `landmark.presence` in smoothing tests to fail compilation.

---

## 3. Explicit Remediation Recommendations for Worker M1-2

Worker M1-2 must implement the following precise code remedies:

### Remedy 1: Interface & Barrel Export Completeness (`src/lib/gait/types.ts`)
1. Ensure `src/lib/gait/types.ts` includes `presence?: number;` on `Landmark`:
   ```typescript
   export type Landmark = {
     x: number;
     y: number;
     z: number;
     visibility?: number;
     presence?: number;
   };
   ```
2. Re-export `PoseDetectionResult` at the bottom of `src/lib/gait/types.ts`:
   ```typescript
   export type { PoseDetectionResult } from "./pose";
   ```

### Remedy 2: Function Declaration, Type Hoisting, and Safe Casting (`src/lib/gait/analysis.ts`)
1. Define `Stride` type before function usage:
   ```typescript
   export type Stride = {
     durationSec: number;
     [key: string]: unknown;
   };
   ```
2. Ensure `filterSteadyStateStrides` is defined as a standard hoisted function declaration (`export function filterSteadyStateStrides`) placed above usages or as top-level function:
   ```typescript
   export function filterSteadyStateStrides<T extends number | Stride>(
     strideIntervals: T[]
   ): {
     steadyStrides: T[];
     excludedCount: number;
     steadyStateStrides: T[];
     excludedStrides: T[];
   } {
     if (!strideIntervals || strideIntervals.length === 0) {
       const res = { steadyStrides: [] as T[], excludedCount: 0 };
       Object.defineProperty(res, "steadyStateStrides", { get() { return []; }, enumerable: false, configurable: true });
       Object.defineProperty(res, "excludedStrides", { get() { return []; }, enumerable: false, configurable: true });
       return res as unknown as { steadyStrides: T[]; excludedCount: number; steadyStateStrides: T[]; excludedStrides: T[] };
     }
     // ... Filtering logic excluding initial acceleration and terminal deceleration strides ...
   }
   ```
3. Use `as unknown as ...` double casting when returning prototype/decorated objects to avoid TS2352.

### Remedy 3: Double-Casting & Strict Type Overlap Fixes in Test Suites
1. In `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts`:
   - Line 175: Use double casting for `capturedConstraints`:
     ```typescript
     const vOpts = (capturedConstraints as unknown as MediaStreamConstraints).video as MediaTrackConstraints;
     ```
   - Line 587: Use double casting for out-of-domain `MarkerType`:
     ```typescript
     const scale = calculateMillimetersPerPixel("custom_tag" as unknown as MarkerType, { width: 100, height: 100 });
     ```
2. In `src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts`:
   - Ensure `presence` property checks reference `(rawFrames[i].landmarks[j] as { presence?: number }).presence` or direct `Landmark.presence`.

### Remedy 4: Linting & Syntax Safeguards (`src/lib/gait/pose.ts`)
1. Check `src/lib/gait/pose.ts` around lines 475-495 to confirm all trailing commas, array brackets, and function closing braces are syntactically valid to ensure `npm run lint` completes with 0 errors.

---

## 4. Verification Plan for Worker M1-2

Worker M1-2 can independently verify remediation by executing:

```bash
# 1. Typecheck validation (must return exit code 0, 0 errors)
npx tsc --noEmit

# 2. Test suite validation (must return exit code 0, 100% tests passing)
npx vitest run

# 3. Code quality lint validation (must return exit code 0, 0 errors)
npm run lint

# 4. Production build validation (must produce valid build)
npm run build
```

---

## 5. Summary Conclusion

The root causes of the Iteration 1 failure were incomplete type exports in `types.ts`, improper scoping/hoisting and missing `Stride` definition in `analysis.ts`, and single-casting errors in `e2e_gait_engine_tiers.test.ts`. Following the 4-part remediation plan will restore full integrity and enable Milestone M1 to pass all verification gates.
