# Scope: Milestone M1 — Core Tracking & Biometrics

## Architecture
- Target file: `src/lib/gait/analysis.ts`
- Associated test files: `src/lib/gait/__tests__/analysis.test.ts`, `src/lib/gait/__tests__/person_identification_stress.test.ts`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Scale-Invariant Biometric Signature | Replace absolute height weighting with scale-invariant ratios (`aspectRatio`, `torsoLegRatio`, `shoulderHipRatio`) | M1 | Survey Explorer 1 & 2 |
| 2 | Velocity-Adaptive Spatial Gating | Scale `maxAllowedDist` with velocity magnitude (||v||); fix flawed `&&` logic to strict logical OR / adaptive gating | M1 | Survey Explorer 1 & 2 |
| 3 | U-Turn & Scale Fragment Merging | Adapt `mergeFragmentedTracks` for direction flips and scale changes | M1 | Survey Explorer 1 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Tracking & Biometrics | Refactor BiometricSignature, matchPeople gating & mergeFragmentedTracks in analysis.ts | none | IN_PROGRESS |

## Interface Contracts
### `src/lib/gait/analysis.ts`
- `export type BiometricSignature = { aspectRatio: number; torsoLegRatio: number; shoulderHipRatio: number };`
- `export function computeBiometricSignature(landmarks: Landmark[]): BiometricSignature`
- `export function biometricDistance(a?: BiometricSignature, b?: BiometricSignature): number`
- `export function matchPeople(detections: Landmark[][], tracks: PersonTrack[], nextId: { value: number }, frameIndex: number): TrackedPerson[]`
- `export function mergeFragmentedTracks(tracks: PersonTrack[]): PersonTrack[]`
- `export function tracksToPeople(tracks: PersonTrack[], sampleIndex: number): TrackedPerson[]`

## Technical Details & Refactoring Requirements
1. **`BiometricSignature` & `computeBiometricSignature` / `biometricDistance`**:
   - Change `BiometricSignature` properties to `aspectRatio` (w/h), `torsoLegRatio` (torso length / leg length), and `shoulderHipRatio` (shoulder width / hip width).
   - Ensure all ratio calculations handle zero/near-zero denominators gracefully with `Math.max(0.01, ...)`.
   - Update `biometricDistance` to calculate relative differences for `aspectRatio`, `torsoLegRatio`, and `shoulderHipRatio` using scale-free normalization `Math.abs(a - b) / Math.max(0.1, a, b)`. Weight ratios appropriately (e.g. 0.35 * dAspect + 0.35 * dTorsoLeg + 0.30 * dShoulderHip).

2. **`matchPeople` Velocity-Adaptive Spatial Gating**:
   - Fix gating condition from `if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;` to strict logical OR / adaptive gating:
     `if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost) continue;`
   - Calculate track velocity magnitude `speed = Math.hypot(vx, vy)` if `velocity` exists on `PersonTrack`.
   - Scale `maxAllowedDist` adaptively with `speed`:
     `const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);`
   - Handle dual spatial distance check: distance between detection hip and predicted hip (`predHip`) VS distance between detection hip and `lastHip` to ensure sudden direction flips (U-turns) do not explode spatial distance.

3. **`mergeFragmentedTracks` Tracklet Consolidation**:
   - Handle U-turn direction flips: Compare endpoints (`lastHip` of track A to `firstHip` of track B, AND vice versa, plus direct position proximity).
   - Scale changes: Use scale-invariant biometric matching (`bioDist < 0.32`) so scale shifts during gap do not prevent tracklet merging.
