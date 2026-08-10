# Scope: Milestone 5 — Expand Unit Test Coverage for 5 Untested Modules

## Status: DONE

## Requirements
- **R8: Unit Test Coverage Expansion**: Added 5 dedicated unit test files under `src/lib/gait/__tests__/`:
  1. `src/lib/gait/__tests__/landmarks.test.ts`: 32 tests covering `hipCenter`, `torsoHeight`, `boundingBox`, `dist`, `angleDeg`, `mean`, `std`, `range`, `clamp`, `pct`, missing landmarks, NaN coordinates, zero-height torso.
  2. `src/lib/gait/__tests__/calibration.test.ts`: 13 tests covering `calculateMillimetersPerPixel`, `computeCalibrationScale`, `applyCalibrationToPoint`, marker detection, px-to-mm conversion, zero/negative inputs.
  3. `src/lib/gait/__tests__/homography.test.ts`: 15 tests covering `solveLinearSystem8x8`, `computeHomographyMatrix`, `transformPoint`, `projectToFloorPlane`, identity transform, singular matrices, oblique angles.
  4. `src/lib/gait/__tests__/liveCapture.test.ts`: 13 tests covering `bufferedSpanSec`, `longestContinuousRun`, `defaultFacingMode`, window/matchMedia mocking, frame rate constraints, error handling.
  5. `src/lib/gait/__tests__/persistence.server.test.ts`: 3 tests exercising re-exported persistence methods and server wrapper.

## Key Files
- Target Test Files: `src/lib/gait/__tests__/landmarks.test.ts`, `calibration.test.ts`, `homography.test.ts`, `liveCapture.test.ts`, `persistence.server.test.ts`
- Source Modules: `src/lib/gait/landmarks.ts`, `calibration.ts`, `homography.ts`, `liveCapture.ts`, `persistence.server.ts`

## Verification Summary
- Vitest: 76/76 new unit tests pass (846/846 full suite pass)
- TypeScript (`npx tsc --noEmit`): 0 errors
- ESLint (`npx eslint`): 0 errors
- Reviewers: 2 APPROVE
- Challengers: 2 APPROVE
- Auditor: CLEAN
