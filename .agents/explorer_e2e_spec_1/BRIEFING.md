# BRIEFING — 2026-08-09T21:17:33Z

## Mission
Investigate existing test infrastructure and formulate the detailed design specification for TM1: extending `src/lib/gait/__tests__/testHelpers.ts` with `generateMultiPersonScenario(config)`.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Test Helper Generator Spec
- Working directory: /Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_1
- Original parent: af82c884-6102-41a9-89f6-28ed51dead77
- Milestone: TM1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement src code changes directly (produce spec/report in own agent directory)
- Must design `generateMultiPersonScenario(config)` supporting 7 required scenario conditions:
  1. Primary target person trajectory
  2. Crossing background passerby (trajectory intersecting or near target)
  3. Static background observer (stationary pose over time)
  4. Dynamic scale changes (bounding box height changing 0.15 to 0.85 normalized frame height)
  5. Continuous U-turns (heading direction reversals)
  6. Fast walking trajectories
  7. Occlusions lasting 2 to 10 frames (missing or severely degraded keypoints/boxes)

## Current Parent
- Conversation ID: af82c884-6102-41a9-89f6-28ed51dead77
- Updated: 2026-08-09T21:17:33Z

## Investigation State
- **Explored paths**: `ORIGINAL_REQUEST.md`, `TEST_INFRA.md`, `PROJECT.md`, `.agents/explorer_survey_3/handoff.md`, `src/lib/gait/__tests__/testHelpers.ts`, `src/lib/gait/types.ts`, `src/lib/gait/pose.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/__tests__/person_identification_stress.test.ts`.
- **Key findings**: `testHelpers.ts` currently only generates single-person `PoseFrame[]` sequences. Multi-person tracking in `matchPeople` and `PoseTracker.ts` requires `Landmark[][]` detection arrays per frame. Designed `generateMultiPersonScenario(config)` which outputs `MultiPersonScenarioResult` with `frames: MultiPersonFrame[]` (containing `landmarks: Landmark[][]` and `groundTruthPersonIds: string[]`), fully supporting all 7 scenario conditions with shorthand preset flags and fine-grained per-person trajectory overrides.
- **Unexplored areas**: None.

## Key Decisions Made
- Formulated `MultiPersonScenarioConfig`, `PersonTrajectoryConfig`, `MultiPersonFrame`, and `MultiPersonScenarioResult` interface contracts.
- Defined raised-cosine U-turn heading curve math $\theta(f)$, linear scale transition math $h(f)$, high-velocity step mechanics ($\Delta x \ge 0.08$), and 2–10 frame occlusion gap mechanics.
- Wrote full technical design report to `.agents/explorer_e2e_spec_1/handoff.md`.

## Artifact Index
- `/Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_1/DISPATCH.md` — Log of incoming dispatch messages
- `/Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_1/BRIEFING.md` — Agent working memory
- `/Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_1/handoff.md` — Technical specification and handoff report
