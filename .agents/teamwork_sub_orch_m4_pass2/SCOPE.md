# Scope: Milestone 4 — Dynamic Walking Direction for U-Turn Handling & Lateral Ankle Fix

## Requirements
- **R5: Dynamic Per-Stride Walking Direction**: Compute time-varying walking direction using a sliding window (~1.5s / 45 frames) in `detectGaitEventsZeni()` (`src/lib/gait/events.ts`, lines ~237-290). Calculate local foot orientation median, apply sign-flip hysteresis > 0.01 to prevent flickering, and select correct `heelStrikeMode`/`toeOffMode` per segment for 180° U-turn walk-and-turn protocols.
- **Frontal-Y Contact Disambiguation**: Replace modulo index parity alternation (`k % 2`) in the frontal-Y fallback path (lines ~349-370) with lateral ankle position inspection (`lAnkleX vs rAnkleX` / `lAnkleY vs rAnkleY`) at each contact frame.

## Key Files
- Target: `src/lib/gait/events.ts`
- Tests: `src/lib/gait/__tests__/events.test.ts` and existing event detection test suites.

## Survey References
- Explorer Survey 2 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md`
