## 2026-08-10T11:36:34Z
<USER_REQUEST>
You are teamwork_preview_explorer_m2_1 (Explorer 1 for Milestone 2).
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1

Scope & Tasks:
Investigate and produce a detailed implementation blueprint for Milestone 2:
1. R2: 2-State Kalman Filter in `kalmanFilter1D()` (`src/lib/gait/signal.ts`).
   - Upgrade `kalmanFilter1D()` to a 2-state constant-velocity model `[position, velocity]^T`.
   - State transition F = [[1, dt], [0, 1]].
   - Process noise covariance Q, measurement noise R tuning against existing synthetic tests.
   - Occlusion handling (`visibility < 0.4` or NaNs): coast with velocity prediction (x_k = x_{k-1} + v_{k-1} * dt, v_k = v_{k-1}) and inflate uncertainty covariance P.
   - Preserving/adapting function signature, input options, and return types expected by callers.
2. R7: Adaptive SG Window & Uniform Resampling Guard.
   - Scale Savitzky-Golay window size in `savitzkyGolay5()` (`src/lib/gait/signal.ts`) proportional to FPS: `windowSize = Math.max(5, Math.min(15, Math.round(fps * 0.17)))`. Ensure window size is always an odd integer between 5 and 15.
   - Add uniform resampling guard to `zeroPhaseButterworth()` (`src/lib/gait/signal.ts`): check if timestamp/dt variance > 10% of mean dt. If so, resample signal to a uniform time grid via linear interpolation before filtering.

Relevant Documents to Read:
- Original Request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Scope Document: /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m2_pass2/SCOPE.md
- Project Document: /Users/damian/GitHub/gait-lab/PROJECT.md
- Target File: `src/lib/gait/signal.ts`
- Existing Test Files: `src/lib/gait/__tests__/signal.test.ts` and other signal test files.

Deliverables:
Write a comprehensive report to `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1/report.md` detailing:
- Current implementation analysis of `kalmanFilter1D`, `savitzkyGolay5`, and `zeroPhaseButterworth`.
- Exact matrix math, formulas, edge cases, and code structure for 2-state Kalman filter `[x, v]^T`.
- Exact formula and boundary checks for Adaptive SG window size.
- Exact algorithm and interpolation logic for uniform resampling guard in Butterworth filter.
- Impact on existing unit tests and any potential breaking changes or edge case handling.

When finished, write `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_1/handoff.md` and send a message back to parent orchestrator.
</USER_REQUEST>
