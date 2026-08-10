# Scope: Milestone 1 — Multi-Person Hungarian Matching & Visibility-Gated Biometrics

## Requirements
- **R1: Hungarian Algorithm**: Replace greedy pair matching in `matchPeople()` (`src/lib/gait/analysis.ts`, lines ~815-933) with the Hungarian (Kuhn-Munkres) algorithm for optimal bipartite matching. Keep cost function (`minDist + bioDist * 0.25`), `maxAllowedDist`, and `maxAllowedCost` gating. Pad to $K \times K$ with $10^9$ cost sentinel values.
- **R6: Visibility-Gated Biometrics & Sagittal Fix**: Gate keypoint biometrics in `computeBiometricSignature()` (`src/lib/gait/analysis.ts`, lines ~717-756) on `visibility >= 0.4` (return `undefined` if insufficient). Suppress/down-weight `shoulderHipRatio` in `biometricDistance()` when `aspectRatio < 0.35`. Weight biometric EMA updates by mean landmark visibility of the frame.

## Key Files
- Target: `src/lib/gait/analysis.ts`
- Tests: `src/lib/gait/__tests__/person_identification_stress.test.ts` and existing analysis tests.

## Survey References
- Explorer Survey 1 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_1/report.md`
- Explorer Survey 2 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_2/report.md`
