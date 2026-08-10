# E2E Test Suite Execution Plan

## 1. Feature Coverage Mapping (PROJECT.md § Feature Inventory)
- **F1**: MediaPipe Heavy/Full/Lite Model Fallback (`pose.ts`)
- **F2**: 1D Coordinate Temporal Smoothing (`signal.ts`, `analysis.ts`)
- **F3**: WebRTC 60 FPS Camera Constraints (`PoseTracker.ts`)
- **F4**: Floor Marker Calibration (`calibration.ts`)
- **F5**: Multi-Signal Heel-Strike Fusion & ZUPT (`events.ts`)
- **F6**: 2D Floor Planar Homography (`homography.ts`)
- **F7**: Steady-State Stride Filtering (`analysis.ts`)

## 2. 4-Tier Test Design
- **Tier 1 (Feature Coverage)**: >= 5 test cases per feature (>= 35 cases total)
- **Tier 2 (Boundary & Corner Cases)**: >= 5 test cases per feature (>= 35 cases total)
- **Tier 3 (Cross-Feature Combinations)**: >= 7 test cases covering feature interactions (e.g. Smoothing + Homography + Heel Strike + Steady State)
- **Tier 4 (Real-World Application Scenarios)**: >= 5 end-to-end multi-step gait pipeline scenarios

## 3. Deliverables
1. `src/lib/gait/__tests__/e2e_gait_engine_tiers.test.ts` (or equivalent comprehensive E2E test files)
2. `TEST_INFRA.md` (root quality specification matching PROJECT.md features)
3. `TEST_READY.md` (root signal file indicating 100% test pass and coverage summary)
