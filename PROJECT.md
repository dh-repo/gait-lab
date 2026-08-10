# Project: gait-lab Person Tracking & Target Lock Optimization

## Architecture
- `src/lib/gait/analysis.ts`: Offline & batch gait video processing, biometric signature calculation, multi-person frame tracking (`matchPeople`), tracklet consolidation (`mergeFragmentedTracks`), and final track priority filtering (`tracksToPeople`).
- `src/lib/gait/PoseTracker.ts`: Real-time live webcam pose detection loop, buffer management, candidate pose selection, and target locking.
- `src/lib/gait/pose.ts`: MediaPipe `PoseLandmarker` initialization parameters.
- `src/lib/gait/__tests__/`: Unit tests, synthetic pose generators (`testHelpers.ts`), stress test suites (`person_identification_stress.test.ts`, `PoseTracker.test.ts`, `cat1`–`cat6`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Scale-Invariant Biometric Signature | Replace absolute height weighting with scale-free morphological ratios | M1 | Survey Explorer 1 & 2 |
| 2 | Velocity-Adaptive Spatial Gating | Scale maxAllowedDist with velocity magnitude; fix && to logical OR | M1 | Survey Explorer 1 & 2 |
| 3 | U-Turn & Scale Fragment Merging | Adapt mergeFragmentedTracks for direction flips and scale changes | M1 | Survey Explorer 1 |
| 4 | Low-Confidence Candidate Filtering | Pre-filter poses with joint visibility < 0.40 in PoseTracker & matchPeople | M2 | Survey Explorer 2 |
| 5 | Real-Time Target Lock & Hysteresis | State-based target lock with velocity projection & biometric scoring in PoseTracker | M2 | Survey Explorer 1 & 2 |
| 6 | Transient Background Suppression | Suppress 1-3 frame noise/passersby & re-balance trackPriorityScore | M2 | Survey Explorer 2 |
| 7 | Multi-Person Synthetic Scenario Generator | Extend testHelpers.ts to generate multi-person crossing & noise scenarios | TM1 | Survey Explorer 3 |
| 8 | Multi-Tier E2E Stress Test Suite | Add synthetic & adversarial tests for U-turns, fast walking, occlusions, target lock | TM2 | Survey Explorer 3 |
| 9 | Final E2E Test Pass & Coverage Hardening | 100% pass on Vitest test suite + Tier 5 white-box adversarial hardening | M3 | System Prompt |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Tracking & Biometrics | Refactor BiometricSignature, matchPeople gating & mergeFragmentedTracks in analysis.ts | none | PLANNED |
| M2 | Target Locking & Background Suppression | Refactor PoseTracker candidate selection, low-confidence filtering & tracksToPeople | M1 | PLANNED |
| TM1 | Test Generator Infra | Expand testHelpers.ts with multi-person scenario generators | none | PLANNED |
| TM2 | Requirement E2E Test Suite | Write Tiers 1-4 tests in person_identification_stress.test.ts & PoseTracker_target_lock.test.ts | TM1 | PLANNED |
| M3 | Final Milestone & Hardening | Pass 100% E2E tests, zero false duplicate tracks, 0 tsc errors, Tier 5 hardening | M1, M2, TM2 | PLANNED |

## Interface Contracts
### `src/lib/gait/analysis.ts`
- `export type BiometricSignature`: `{ aspectRatio: number; torsoLegRatio: number; shoulderHipRatio: number }` (scale-invariant ratios, values in $[0, \infty)$).
- `export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature`
- `export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number`
- `export function matchPeople(detections: Landmark[][], tracks: PersonTrack[], nextId: { value: number }, frameIndex: number): TrackedPerson[]`
- `export function mergeFragmentedTracks(tracks: PersonTrack[]): PersonTrack[]`
- `export function tracksToPeople(tracks: PersonTrack[], sampleIndex: number): TrackedPerson[]`

### `src/lib/gait/PoseTracker.ts`
- `export class PoseTracker`: Real-time candidate lock maintaining target hip position, target biometrics, smoothed velocity, and lock hysteresis threshold.
- `public async loop(...)`: Filters low-confidence candidates, evaluates target score, updates target lock without jumping to transient background candidates.

## Code Layout
- `src/lib/gait/analysis.ts`: Core algorithm implementation
- `src/lib/gait/PoseTracker.ts`: Real-time tracker
- `src/lib/gait/__tests__/testHelpers.ts`: Synthetic test generators
- `src/lib/gait/__tests__/person_identification_stress.test.ts`: ReID & tracking stress tests
- `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts`: Live target lock retention tests
