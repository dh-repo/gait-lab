# DISPATCH — Worker 1 (Milestone 2 Implementation & Verification)

## Task Objective
Implement `SessionComparisonView.tsx`, integrate it into `GaitApp.tsx`, `WorkflowHeader.tsx`, and `SessionHistoryDrawer.tsx`, write comprehensive unit tests in `src/components/gait/__tests__/SessionComparisonView.test.tsx`, and execute all verification commands (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`).

## Reference Reports & Inputs
- Authoritative User Request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Scope Document: /Users/damian/GitHub/gait-lab/.agents/sub_orch_m2/SCOPE.md
- Explorer 1 Architecture Report: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/handoff.md
- Explorer 2 Metrics & Curves Report: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_2/handoff.md
- Explorer 3 UI Integration Report: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_3/handoff.md

## Detailed Deliverables
1. **`src/components/gait/SessionComparisonView.tsx`**:
   - Implement side-by-side session selectors (Baseline Session A vs Target Session B).
   - Compute absolute and percentage deltas with favorability-based color-coded badges (`success` green, `danger` red, `neutral` gray).
   - Display stat cards and comparison tables for gait domain scores, spatio-temporal parameters, symmetry angle, and variability.
   - Render overlaid joint trajectory charts (Knee, Hip, Ankle) using Recharts, with solid vs dashed line styling and Perry & Burnfield normative range bands.
   - Handle 0, 1, and 2+ session states gracefully with informational fallback cards.
   - Handle view suppression (`isSuppressed === true`) for frontal views with warning banners.
2. **UI Integration**:
   - Update `WorkflowHeader.tsx` to add "Compare" button.
   - Update `GaitApp.tsx` to handle `"workflow" | "comparison"` view mode routing.
   - Update `SessionHistoryDrawer.tsx` to add multi-session selection checkboxes and "Compare Selected (2)" action button.
3. **Unit Tests (`src/components/gait/__tests__/SessionComparisonView.test.tsx`)**:
   - Test rendering with 0, 1, and 2+ sessions.
   - Test metric delta calculations and color badge assignments (improvement vs decline vs neutral).
   - Test dropdown session selection switching.
   - Test joint tab switching (Knee, Hip, Ankle curves).
   - Test view suppression banner rendering.
4. **Verification**:
   - Execute and document results for:
     - `npm test`
     - `npm run typecheck`
     - `npm run lint`
     - `npm run build`

## Mandatory Integrity Warning

## 2026-08-09T16:48:13Z

<USER_REQUEST>
You are Worker 1 for Milestone 2 (M2) in `gait-lab`.
Your working directory is /Users/damian/GitHub/gait-lab/.agents/worker_m2_1.
Read DISPATCH.md in your working directory (/Users/damian/GitHub/gait-lab/.agents/worker_m2_1/DISPATCH.md), the authoritative request (/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md), and the Explorer handoff reports:
- Explorer 1: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_1/handoff.md
- Explorer 2: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_2/handoff.md
- Explorer 3: /Users/damian/GitHub/gait-lab/.agents/explorer_m2_3/handoff.md

Your tasks:
1. Implement `src/components/gait/SessionComparisonView.tsx` with side-by-side session dropdown selectors, metric delta calculations with color-coded badges, overlaid Recharts joint trajectory curves, and fallback cards for 0, 1, and 2+ sessions.
2. Integrate into `src/components/gait/GaitApp.tsx`, `src/components/gait/WorkflowHeader.tsx`, and `src/components/gait/SessionHistoryDrawer.tsx`.
3. Create unit tests in `src/components/gait/__tests__/SessionComparisonView.test.tsx` verifying session selection, metric deltas, chart rendering, and edge cases.
4. Execute `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` using terminal execution tools, and document exact outputs in your handoff report at /Users/damian/GitHub/gait-lab/.agents/worker_m2_1/handoff.md.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished, write your handoff report to /Users/damian/GitHub/gait-lab/.agents/worker_m2_1/handoff.md and send a message back to parent conversation ID d1ec1083-2d60-429a-9f15-484f0050dc21.
</USER_REQUEST>
