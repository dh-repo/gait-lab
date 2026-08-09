# DISPATCH — Worker 2 (Milestone 2 Iteration 2 Typecheck Remediation & Verification)

## Task Objective
Apply the exact type safety remediations to `src/components/gait/__tests__/SessionComparisonView.stress.test.tsx` detailed by Iteration 2 Explorer 1, ensuring all mock `JointAnglePoint` objects conform strictly to the `JointAnglePoint` interface (`kneeAngleLeft`, `kneeAngleRight`, `hipAngleLeft`, `hipAngleRight`, `ankleAngleLeft`, `ankleAngleRight` as `number | null`).
Execute and verify `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.

## Reference Inputs
- Authoritative User Request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Reviewer 1 Handoff (Iteration 1): /Users/damian/GitHub/gait-lab/.agents/reviewer_m2_1/handoff.md
- Explorer 1 Handoff (Iteration 2): /Users/damian/GitHub/gait-lab/.agents/explorer_m2_r2_1/handoff.md

## Execution Protocol
1. Modify `src/components/gait/__tests__/SessionComparisonView.stress.test.tsx`:
   - Replace `undefined as any` and `null as unknown as number` with `null`.
   - Add missing joint angle properties (`hipAngleLeft`, `hipAngleRight`, `ankleAngleLeft`, `ankleAngleRight`) to mock `JointAnglePoint` arrays.
   - Remove `as any` type suppression casts.
2. Run and document results for:
   - `npm run typecheck` (`tsc --noEmit`) → must pass with 0 errors.
   - `npm test` → all unit tests must pass with 100% green status.
   - `npm run lint` → 0 errors.
   - `npm run build` → Nitro/Vercel build succeeds.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
