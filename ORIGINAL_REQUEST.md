# Original User Request

## Initial Request — 2026-08-09T21:04:14Z

Enhance the accuracy, precision, and reliability of the `gait-lab` spatio-temporal gait analysis engine across 4 key technical tiers:

Working directory: `/Users/damian/GitHub/gait-lab`
Your orchestrator directory: `/Users/damian/GitHub/gait-lab/.agents/orchestrator`

### Requirements:
1. R1. Computer Vision & Model Fidelity Upgrades:
   - Upgrade MediaPipe Pose landmarker loading in `src/lib/gait/pose.ts` to support `pose_landmarker_heavy.task` with fallback to `pose_landmarker_full.task` and `pose_landmarker_lite.task`.
   - Implement 1D landmark coordinate temporal smoothing (Kalman or 5-point Savitzky-Golay filtering) on raw keypoints prior to kinematic metric computation.

2. R2. Video Capture Constraints & Real-World Floor Calibration:
   - Update `src/lib/gait/PoseTracker.ts` WebRTC options to request ideal 60 FPS video capture constraints (`ideal: 60`).
   - Implement real-world floor-plane marker calibration (QR / AprilTag / reference card) to map image pixels to absolute millimeters (mm/px) for distance and speed calculations.

3. R3. Multi-Signal Heel-Strike Fusion & Planar Homography:
   - Enhance event detection in `src/lib/gait/events.ts` by fusing relative AP foot displacement with vertical ankle acceleration minima and zero-velocity updates (ZUPT).
   - Implement 2D floor planar homography transformation to project 2D image coordinates into top-down floor coordinates for accurate step width estimation across oblique camera angles.

4. R4. Steady-State Stride Filtering & Quality Control:
   - Automatically detect and exclude initial acceleration and terminal deceleration strides so spatio-temporal variability (`stepTimeCV`) is computed strictly across steady-state strides.

5. Acceptance Criteria:
   - `npm test` passes 100% of all unit, integration, and synthetic ground-truth regression tests without regressions.
   - `npm run typecheck` passes with 0 TypeScript compilation errors.
   - `npm run lint` passes with 0 ESLint errors.
   - `npm run build` succeeds and produces a valid production build.

## Follow-up — 2026-08-10T01:13:18Z

Maximize person identification accuracy and minimize false positives/negatives in gait video analysis and live webcam streaming within `gait-lab`.

Working directory: /Users/damian/GitHub/gait-lab
Integrity mode: development

## Requirements

### R1. Person Tracking Accuracy & Re-Identification
Enhance MediaPipe pose landmark person tracking, re-identification, and velocity motion projection in `src/lib/gait/analysis.ts` and `src/lib/gait/PoseTracker.ts`. Optimize morphological biometric distance gating and velocity extrapolation to maintain a single unified identity across U-turns, scale changes, and temporary occlusions without creating false duplicate person tracks.

### R2. Transient Background Suppression & Candidate Filtering
Refine pose candidate confidence thresholds and spatial continuity checks in `PoseTracker.ts` and `matchPeople` to suppress transient background people, passersby, and low-confidence noise in multi-person scenes.

### R3. Empirical Benchmarks & Adversarial Stress Test Expansion
Expand synthetic and adversarial test suites (`src/lib/gait/__tests__/person_identification_stress.test.ts` and new test modules) with realistic multi-person noise models, scale variations, and camera movement to objectively quantify detection accuracy and verify zero false duplicate tracks.

## Acceptance Criteria

### Detection & Tracking Accuracy
- [ ] 0 false duplicate person tracks generated on single-subject gait walk clips (including U-turns, scale shifts, and 2-10 frame occlusions).
- [ ] Primary target lock reliably maintained during live webcam streaming when candidate background poses enter the frame.
- [ ] Fast-walking subjects correctly tracked across sample steps without exceeding velocity motion gates.

### Code Quality & Test Suite Integrity
- [ ] 100% green pass rate across all Vitest test suites (`npx vitest run`).
- [ ] 0 TypeScript compilation errors (`npx tsc --noEmit`).
