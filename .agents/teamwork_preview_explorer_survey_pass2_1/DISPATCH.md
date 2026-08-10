## 2026-08-10T11:34:36Z

<USER_REQUEST>
You are teamwork_preview_explorer_survey_pass2_1.
Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_1
Project root: /Users/damian/GitHub/gait-lab

MANDATORY INSTRCTION: Read /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md (specifically section `## Follow-up — 2026-08-10T11:33:30Z`).

Your task:
Investigate requirements R1, R2, R3 for Phase 2:
1. R1: Hungarian Algorithm for `matchPeople()` in `src/lib/gait/analysis.ts` (lines ~815-933). Check cost matrix structure, `minDist + bioDist * 0.25` cost function, `maxAllowedDist` gating, matrix dimensions, and how Hungarian (Kuhn-Munkres) can be implemented or integrated concisely without external dependencies.
2. R2: 2-State Kalman Filter in `src/lib/gait/signal.ts` (`kalmanFilter1D`, lines ~244-289). Check state vector `[position, velocity]^T`, state transition `x_k = x_{k-1} + v_{k-1}*dt, v_k = v_{k-1}`, covariance matrices Q and R tuning, occlusion coasting when `visibility < 0.4`.
3. R3: One Euro Adaptive Filter in `src/lib/gait/PoseTracker.ts`. Check `lastTargetHip` usage, landmark/hip-center smoothing, adaptive cutoff formula (Casiez et al. 2012), parameters (`minCutoff`, `beta`, `dCutoff`), and integration points.

Check existing code, line numbers, function signatures, dependencies, and test coverage for these 3 areas. Write a comprehensive survey report to `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_1/report.md` and send a handoff message when done.
</USER_REQUEST>
