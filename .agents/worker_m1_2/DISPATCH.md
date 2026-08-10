# Dispatch for Worker M1-2 (Iteration 2 Remediation Worker)

**Role**: teamwork_preview_worker (Remediation Implementation Specialist)
**Working Directory**: /Users/damian/GitHub/gait-lab/.agents/worker_m1_2
**Target Workspace**: /Users/damian/GitHub/gait-lab

## Objective
Execute the concrete remediation fixes specified in Iteration 2 Explorer reports (`.agents/explorer_m1_r2_1/analysis.md` and `.agents/explorer_m1_r2_2/analysis.md`) to resolve all TypeScript compilation errors, runtime exceptions, and test assertion failures:

1. **Re-export `PoseDetectionResult` & Update `Landmark` Interface (`src/lib/gait/types.ts`)**:
   - Re-export `PoseDetectionResult` from `./pose`: `export type { PoseDetectionResult } from "./pose";`
   - Add `presence?: number;` to `Landmark` interface in `types.ts`.

2. **Hoist `filterSteadyStateStrides` in `src/lib/gait/analysis.ts`**:
   - Declare `filterSteadyStateStrides` as a top-level `export function filterSteadyStateStrides` in `analysis.ts` so it is hoisted and available when called inside `computeGaitMetricsCore`.
   - Ensure `filterSteadyStateStrides` returns a plain object `{ steadyStrides, excludedCount }` matching test shape assertions.

3. **Performance Optimization in `src/lib/gait/signal.ts`**:
   - Optimize `smoothPoseFrames` by replacing V8 dynamic object spread (`{ ...origLm, x, y, z }`) across landmarks with direct property assignments and inline finite-checks (< 5 ms runtime target).

4. **Type Casting Mismatches in Test Files (`src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts`)**:
   - Update `capturedConstraints` cast: `(capturedConstraints as unknown as MediaStreamConstraints)`
   - Update `"custom_tag"` cast: `("custom_tag" as unknown as MarkerType)`

5. **Build & Test Verification**:
   - Run `npm test` (must pass 100% of tests across all test suites).
   - Run `npm run typecheck` (must pass with 0 errors).
   - Run `npm run lint` (must pass with 0 errors).
   - Run `npm run build` (must succeed with code 0).

## File Ownership Boundaries
- `src/lib/gait/types.ts`
- `src/lib/gait/analysis.ts`
- `src/lib/gait/signal.ts`
- `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts`
- `src/lib/gait/__tests__/m1_2_temporal_smoothing_stress.test.ts`

## Mandatory Reference Inputs
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`
- `/Users/damian/GitHub/gait-lab/.agents/auditor_m1_1/handoff.md`
- `/Users/damian/GitHub/gait-lab/.agents/reviewer_m1_2/handoff.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r2_1/analysis.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_r2_2/analysis.md`

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Output Requirements
Write your handoff report to `/Users/damian/GitHub/gait-lab/.agents/worker_m1_2/handoff.md` and communicate completion via `send_message`.
