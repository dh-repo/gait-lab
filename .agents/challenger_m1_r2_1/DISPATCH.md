# Dispatch for Challenger M1-r2-1 (Iteration 2 Stress Challenger)

**Role**: teamwork_preview_challenger (Model Hierarchy & Fallback Stress Challenger)
**Working Directory**: /Users/damian/GitHub/gait-lab/.agents/challenger_m1_r2_1

## Objective
Empirically stress-test and challenge the MediaPipe Pose Landmarker candidate trial loop in `src/lib/gait/pose.ts` and `src/lib/gait/__tests__/pose.test.ts`:
- Confirm that all 12 candidate fallback branches function cleanly.
- Confirm cache isolation via `resetPoseLandmarkerCache()`.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

## Authoritative Reference Inputs
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`
- `/Users/damian/GitHub/gait-lab/.agents/worker_m1_2/handoff.md`

## Output Requirements
Deliver `handoff.md` with explicit Verdict (`APPROVE` or `REJECT`) and send a message to parent upon completion.
