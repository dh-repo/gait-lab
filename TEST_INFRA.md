# E2E Test Infra: gait-lab

## Test Philosophy
- Opaque-box, requirement-driven. Derived from ORIGINAL_REQUEST.md.
- Methodology: Category-Partition + BVA + Pairwise + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | Person Tracking & ReID Invariance | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| 2 | Transient Background & Candidate Filtering | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| 3 | Target Lock Retention in Live Webcam | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| 4 | Fast-Walking Velocity Gate Motion | ORIGINAL_REQUEST R1 & R3 | 5 | 5 | ✓ | ✓ |
| 5 | Occlusion & Scale Variation Sweeps | ORIGINAL_REQUEST R1 & R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test runner: Vitest (`npx vitest run`)
- TypeScript typecheck: (`npx tsc --noEmit`)
- Files: `src/lib/gait/__tests__/person_identification_stress.test.ts`, `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts`, `src/lib/gait/__tests__/testHelpers.ts`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | U-turn walk with scale shift & 5-frame occlusion | F1, F4, F5 | High |
| 2 | Live webcam streaming with 2 crossing background passersby | F2, F3 | High |
| 3 | Fast-walking subject ($\Delta x = 0.08$) across sample steps | F4 | Medium |
| 4 | Low visibility landmark noise + 10-frame occlusion sweep | F2, F5 | High |
| 5 | Dual subject parallel walking with zero track ID swap | F1, F2 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (boundary/corner)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥5 realistic application scenarios
- Total minimum: ~55 test assertions
