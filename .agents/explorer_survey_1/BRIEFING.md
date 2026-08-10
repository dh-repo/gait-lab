# BRIEFING — 2026-08-10T01:15:28Z

## Mission
Investigate person tracking accuracy & re-identification in `src/lib/gait/analysis.ts` and `src/lib/gait/PoseTracker.ts` for Requirement R1.

## 🔒 My Identity
- Archetype: Teamwork preview explorer
- Roles: Survey Explorer 1: Tracking & ReID
- Working directory: /Users/damian/GitHub/gait-lab/.agents/explorer_survey_1
- Original parent: af82c884-6102-41a9-89f6-28ed51dead77
- Milestone: Requirement R1 Investigation

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Investigate src/lib/gait/analysis.ts and src/lib/gait/PoseTracker.ts
- Analyze U-turns, scale changes, fast walking, occlusions (2-10 frames), false duplicate tracks
- Document data structures, interfaces, mathematical models, thresholds
- Provide actionable fix recommendations

## Current Parent
- Conversation ID: af82c884-6102-41a9-89f6-28ed51dead77
- Updated: 2026-08-10T01:15:28Z

## Investigation State
- **Explored paths**:
  - `src/lib/gait/analysis.ts` (BiometricSignature, computeBiometricSignature, biometricDistance, matchPeople, mergeFragmentedTracks)
  - `src/lib/gait/PoseTracker.ts` (startWebcam, loop, detectForVideo target selection logic)
  - `src/lib/gait/__tests__/person_identification_stress.test.ts`
  - `src/components/gait/GaitApp.tsx`
- **Key findings**:
  - `biometricDistance` includes absolute image height `h` weighted at 0.35, breaking biometric invariance during scale changes.
  - Linear velocity extrapolation + 2D projected shoulder width collapse cause track identity loss during U-turns.
  - Frame gap capping ($gap \ge 2$) causes identity loss during 2-10 frame occlusions.
  - Gating condition `(spatialDist > maxAllowedDist && cost > 0.40)` uses `&&` instead of strict logical OR.
  - Live webcam `PoseTracker.ts` candidate scoring (`score = area * 2 - d * 4 + 1.0`) lacks biometric signature and velocity prediction, allowing background passersby to steal target lock.
- **Unexplored areas**: None within R1 scope.

## Key Decisions Made
- Completed full read-only investigation and synthesized findings in `handoff.md`.

## Artifact Index
- handoff.md — Comprehensive investigation report for Requirement R1.
