# Dispatch for Explorer M1-3

**Role**: teamwork_preview_explorer (Metrics Integration & Regression Test Specialist)
**Working Directory**: /Users/damian/GitHub/gait-lab/.agents/explorer_m1_3

## Task Objective
Investigate `src/lib/gait/analysis.ts`, `src/lib/gait/types.ts`, and test infrastructure across `src/lib/gait/__tests__/`:
1. Analyze where `smoothPoseFrames` should be called inside `computeGaitMetricsCore()` in `analysis.ts` prior to kinematic metric computation.
2. Verify any updates needed in `types.ts` or interface exports for `smoothPoseFrames` and `getPoseLandmarker`.
3. Audit existing test files in `src/lib/gait/__tests__/` to identify which tests exercise `pose.ts` and `signal.ts` or integration metrics.
4. Detail test execution requirements (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) and synthetic noise regression tests (`cat1_landmark_jitter_noise.test.ts`).

## Authoritative Reference Inputs
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md`
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md`
- `/Users/damian/GitHub/gait-lab/.agents/explorer_survey_1/analysis.md`

## Output Requirements
Write your detailed findings and implementation recommendations to `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_3/analysis.md` and deliver `handoff.md`.

## 2026-08-09T21:07:02Z
You are Explorer M1-3 for gait-lab.
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/explorer_m1_3
Mandatory Reference: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md

Read /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md, /Users/damian/GitHub/gait-lab/PROJECT.md, /Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md, /Users/damian/GitHub/gait-lab/.agents/explorer_m1_3/DISPATCH.md, and /Users/damian/GitHub/gait-lab/.agents/explorer_survey_1/analysis.md.

Investigate `src/lib/gait/analysis.ts`, `src/lib/gait/types.ts`, and test infrastructure across `src/lib/gait/__tests__/`:
1. Analyze where `smoothPoseFrames` should be called inside `computeGaitMetricsCore()` in `analysis.ts` prior to kinematic metric computation.
2. Verify any updates needed in `types.ts` or interface exports for `smoothPoseFrames` and `getPoseLandmarker`.
3. Audit existing test files in `src/lib/gait/__tests__/` to identify which tests exercise `pose.ts` and `signal.ts` or integration metrics.
4. Detail test execution requirements (npm test, npm run typecheck, npm run lint, npm run build) and synthetic noise regression tests (`cat1_landmark_jitter_noise.test.ts`).

Write your detailed technical report to `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_3/analysis.md` and deliver `handoff.md`. Communicate completion via send_message to parent.

