# Scope: E2E Testing Track (sub_orch_e2e)

## Architecture & Goal
Design and implement a comprehensive, requirement-driven, opaque-box test suite for gait-lab. Ensure all tracking, multi-person handling, occlusion recovery, identity persistence, scale dynamics, and target lock logic are rigorously tested across Tiers 1-4.

## Feature Inventory & Test Mapping
| # | Requirement / Feature | Milestone | Target Test File / Helper | Status |
|---|----------------------|-----------|---------------------------|--------|
| 1 | Multi-Person Synthetic Scenario Generator (`generateMultiPersonScenario`) | TM1 | `src/lib/gait/__tests__/testHelpers.ts` | PLANNED |
| 2 | Primary target + crossing background passerby simulation | TM1 | `testHelpers.ts` / `person_identification_stress.test.ts` | PLANNED |
| 3 | Static background observer simulation | TM1 | `testHelpers.ts` / `person_identification_stress.test.ts` | PLANNED |
| 4 | Dynamic scale changes (h: 0.15 -> 0.85) | TM1 | `testHelpers.ts` / `person_identification_stress.test.ts` | PLANNED |
| 5 | Continuous U-turns & fast walking trajectories | TM1 | `testHelpers.ts` / `person_identification_stress.test.ts` | PLANNED |
| 6 | 2-10 frame occlusions simulation | TM1 | `testHelpers.ts` / `person_identification_stress.test.ts` | PLANNED |
| 7 | Multi-person ID stress testing expansion (Tiers 1-4) | TM2 | `src/lib/gait/__tests__/person_identification_stress.test.ts` | PLANNED |
| 8 | Target Lock & Re-identification validation suite (Tiers 1-4) | TM2 | `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts` | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | TM1: Test Helper Generator | Extend `testHelpers.ts` with `generateMultiPersonScenario(config)` | None | IN_PROGRESS |
| 2 | TM2: E2E Test Suite Expansion | Expand `person_identification_stress.test.ts` & create `PoseTracker_target_lock.test.ts` | TM1 | PLANNED |

## Interface Contracts & Specifications
- `generateMultiPersonScenario(config: MultiPersonScenarioConfig)`: Returns synthetic frame sequence containing bounding boxes, keypoints, and track ground truths.
- `person_identification_stress.test.ts`: Tests ID stability, ID switching avoidance under cross-over, occlusion recovery (2-10 frames), scale variation tolerance, and velocity consistency.
- `PoseTracker_target_lock.test.ts`: Tests target selection, lock retention despite background distractors, lock re-acquisition after occlusion, and lock transfer prevention.
