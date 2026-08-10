# Project: gait-lab Precision Engineering Pass (Phase 2)

## Architecture
- `src/lib/gait/`: Core biomechanical engine
  - `analysis.ts`: Multi-person tracking, Hungarian (Kuhn-Munkres) assignment, visibility-gated biometric signatures, track fragmentation merging.
  - `signal.ts`: 2-State `[position, velocity]^T` Kalman filtering, adaptive Savitzky-Golay filtering, zero-phase Butterworth filtering with uniform resampling guard.
  - `PoseTracker.ts`: Real-time WebRTC pose tracking, One Euro adaptive filter, multi-factor biometric target locking, occlusion coasting timeout & velocity clamping.
  - `events.ts`: Heel-strike / toe-off event detection (`detectGaitEventsZeni`), sliding window dynamic walking direction, hysteresis, frontal-Y lateral ankle contact disambiguation.
  - `landmarks.ts`: Keypoint kinematics, geometric calculations, torso height, bounding boxes.
  - `calibration.ts`: Real-world floor-plane scale estimation (mm/px).
  - `homography.ts`: 2D planar transform, floor projection.
  - `liveCapture.ts`: Stream lifecycle, constraints, buffer management.
  - `persistence.server.ts`: Persistence re-export wrapper.
  - `normatives.ts`: Winter (2009) / Bovi (2011) normative datasets, Z-scores, percentile ranks, Gait Deviation Index (GDI).
  - `ratings.ts`, `guesses.ts`: Clinical rating reports & educated hypothesis rules.
- `scientific_justifications.md`, `peer_review_report.md`: Technical documentation & citations.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1. Hungarian Matching | Replace greedy pair matching in `matchPeople()` (analysis.ts) with Hungarian algorithm | M1 | survey_pass2_1 |
| 2 | R6. Visibility-Gated Biometrics & Sagittal Fix | Gate keypoint biometrics on `visibility >= 0.4`, down-weight `shoulderHipRatio` when `aspectRatio < 0.35` | M1 | survey_pass2_2 |
| 3 | R2. 2-State Kalman Filter | Upgrade `kalmanFilter1D()` in `signal.ts` to `[position, velocity]^T` constant-velocity model | M2 | survey_pass2_1 |
| 4 | R7. Adaptive SG Window & Uniform Resampling Guard | Scale SG window with FPS (`fps * 0.17`), add uniform resampling guard to `zeroPhaseButterworth()` | M2 | survey_pass2_2 |
| 5 | R3. One Euro Adaptive Filter | Implement One Euro Filter in `PoseTracker.ts` for real-time hip center landmark smoothing | M3 | survey_pass2_1 |
| 6 | R4. Biometric Target Lock & Occlusion Recovery | Multi-factor score in `PoseTracker.ts`, ±2σ velocity clamping, 0.9^N decay, 30-frame lock reset | M3 | survey_pass2_2 |
| 7 | R5. Dynamic Walking Direction & Lateral Ankle Fix | Sliding window (~1.5s / 45 frames) foot orientation, sign-flip hysteresis > 0.01, lateral ankle position check | M4 | survey_pass2_2 |
| 8 | R8. Unit Test Expansion for Untested Modules | Add dedicated test files for `landmarks.ts`, `calibration.ts`, `homography.ts`, `liveCapture.ts`, `persistence.server.ts` | M5 | survey_pass2_3 |
| 9 | R9. Clinical Normative References & GDI | Create `normatives.ts` (Winter 2009, Bovi 2011, Z-scores, GDI) and integrate into `ratings.ts` & `guesses.ts` | M6 | survey_pass2_3 |
| 10 | Documentation & Citation Alignment | Update `scientific_justifications.md` with line ranges & citations for Hungarian, One Euro, 2-state Kalman, GDI, Normatives | M7 | follow-up requirement |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Multi-Person Hungarian Matching & Visibility-Gated Biometrics | R1, R6 | none | PLANNED |
| M2 | 2-State Kalman Filter & Adaptive SG Window | R2, R7 | none | DONE |
| M3 | One Euro Filter & Biometric Target Lock with Occlusion Recovery | R3, R4 | M1, M2 | PLANNED |
| M4 | Dynamic Walking Direction & Lateral Ankle Disambiguation | R5 | none | DONE |
| M5 | Expand Unit Test Coverage for 5 Untested Modules | R8 | none | DONE |
| M6 | Clinical Normative Reference Integration & GDI | R9 | none | DONE |
| M7 | Documentation & Scientific Justification Alignment | Doc update | M1 - M6 | PLANNED |

## Interface Contracts
- `matchPeople`: `(prevPeople: PersonTrack[], currentDetections: Detection[], maxBiometricDist?: number) => PersonTrack[]`
- `computeBiometricSignature`: `(landmarks: Landmark[]) => BiometricSignature | undefined`
- `kalmanFilter1D`: `(signal: number[], dt: number, options?: KalmanOptions) => { position: number[], velocity: number[] }`
- `OneEuroFilter`: `class OneEuroFilter { filter(x: number, timestamp: number): number }`
- `detectGaitEventsZeni`: `(signal: number[], fps: number, landmarks?: Landmark[][]) => GaitEvents`
- `calculateGDI`: `(metrics: GaitMetrics) => number`
- `calculateZScore`: `(value: number, mean: number, sd: number) => number`

## Code Layout
- Core Engine: `src/lib/gait/`
- Test Suites: `src/lib/gait/__tests__/` and `tests/gait/`
- Documentation: `scientific_justifications.md`, `peer_review_report.md`
