# Scope: Milestone 2 — 2-State Kalman Filter & Adaptive SG Window

## Requirements
- **R2: 2-State Kalman Filter**: Upgrade `kalmanFilter1D()` in `src/lib/gait/signal.ts` (lines ~244-289) to a 2-state constant-velocity model `[position, velocity]^T`. State transition $F = \begin{bmatrix} 1 & dt \\ 0 & 1 \end{bmatrix}$. Tune process noise Q and measurement noise R against existing synthetic tests. During occlusion (`visibility < 0.4` or NaNs), coast with velocity prediction and inflate uncertainty covariance.
- **R7: Adaptive SG Window & Uniform Resampling Guard**: Scale Savitzky-Golay window size in `savitzkyGolay5()` (`src/lib/gait/signal.ts`, lines ~190-232) proportional to FPS (`fps * 0.17`, 5 to 15 odd points). Add uniform resampling guard to `zeroPhaseButterworth()` (lines ~135-180) when dt variance > 10% of mean dt.

## Key Files
- Target: `src/lib/gait/signal.ts`
- Tests: `src/lib/gait/__tests__/signal.test.ts` and existing signal tests.

## Survey References
- Explorer Survey 1 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_1/report.md`
- Explorer Survey 2 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md`
