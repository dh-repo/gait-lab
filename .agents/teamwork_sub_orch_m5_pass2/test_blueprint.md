# Unified Unit Test Blueprint — Milestone 5

Target Test Files:
1. `src/lib/gait/__tests__/landmarks.test.ts`
2. `src/lib/gait/__tests__/calibration.test.ts`
3. `src/lib/gait/__tests__/homography.test.ts`
4. `src/lib/gait/__tests__/liveCapture.test.ts`
5. `src/lib/gait/__tests__/persistence.server.test.ts`

## 1. landmarks.test.ts Specification
- Exports to test: `mid`, `dist`, `angleDeg`, `torsoHeight`, `boundingBox`, `hipCenter`, `mean`, `std`, `range`, `clamp`, `pct`, `LM`, `POSE_CONNECTIONS`, `PERSON_COLORS`.
- Edge cases to cover: missing/null landmarks, NaN/Infinity coordinates, zero-height torso (<0.05), short landmark arrays (<25 items), low landmark visibility (<0.2), empty array stats, zero-length vector angles.

## 2. calibration.test.ts Specification
- Exports to test: `calculateMillimetersPerPixel`, `computeCalibrationScale`, `applyCalibrationToPoint`.
- Edge cases to cover: marker types ("card", "qr", "apriltag", "custom"), zero/negative pixel dimensions/lengths, invalid/sub-pixel widths, non-finite scale factors.

## 3. homography.test.ts Specification
- Exports to test: `solveLinearSystem8x8`, `computeHomographyMatrix`, `transformPoint`, `projectToFloorPlane`.
- Edge cases to cover: singular matrices (pivot < 1e-9), <4 points, collinear points (triArea < 1e-7), 3x3 identity fallbacks, tuple vs object inputs, wPrime near zero (|w'| <= 1e-9).

## 4. liveCapture.test.ts Specification
- Exports to test: `bufferedSpanSec`, `longestContinuousRun`, `defaultFacingMode`.
- Edge cases to cover: 0/1/N frame buffers, MAX_LIVE_GAP_SEC (0.35s) exact boundary gaps, split gaps (>0.35s), pointer: coarse/fine matchMedia queries, SSR/undefined window.matchMedia fallbacks.

## 5. persistence.server.test.ts Specification
- Exports to test: `saveGaitSession`, `listGaitSessions`, `listPatientSessions`, `getGaitSession`, `deleteGaitSession`, `getPersistenceMode`, re-exported types.
- Edge cases to cover: re-export completeness, server function handler structure, type definitions, function contracts.
