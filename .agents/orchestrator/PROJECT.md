# Project: gait-lab Spatio-Temporal Engine Enhancements

## Architecture
- `src/lib/gait/pose.ts`: MediaPipe landmarker initialization, model candidate fallback hierarchy (`heavy` -> `full` -> `lite`) and GPU/CPU delegate fallbacks.
- `src/lib/gait/signal.ts`: 1D landmark coordinate temporal smoothing (5-point Savitzky-Golay and 1D Kalman filters).
- `src/lib/gait/PoseTracker.ts`: WebRTC camera stream initialization with 60 FPS ideal frame rate constraints.
- `src/lib/gait/calibration.ts`: Floor-plane marker calibration (QR / AprilTag / reference card) for image pixel to physical millimeter (mm/px) mapping.
- `src/lib/gait/events.ts`: Multi-signal heel-strike fusion algorithm fusing AP foot displacement, vertical ankle acceleration minima, and Zero-Velocity Updates (ZUPT).
- `src/lib/gait/homography.ts`: 2D floor planar homography transformation matrix to project image coordinates into top-down floor plane for step width calculation.
- `src/lib/gait/analysis.ts`: Core gait metric calculation, integrating temporal smoothing, steady-state stride detection (excluding acceleration/deceleration strides), and steady-state variability (`stepTimeCV`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | MediaPipe Heavy/Full/Lite Model Fallback | Support `pose_landmarker_heavy.task` with fallback to `full` and `lite`, plus GPU/CPU delegate fallbacks | M1 | R1.1 |
| F2 | 1D Coordinate Temporal Smoothing | Implement 5-point Savitzky-Golay & 1D Kalman filtering on keypoints prior to kinematic metrics | M1 | R1.2 |
| F3 | WebRTC 60 FPS Camera Constraints | Request `ideal: 60` FPS in `PoseTracker.ts` WebRTC video track constraints | M2 | R2.1 |
| F4 | Floor Marker Calibration | Implement floor marker calibration (QR/AprilTag/card) for physical mm/px scale mapping | M2 | R2.2 |
| F5 | Multi-Signal Heel-Strike Fusion & ZUPT | Fuse AP foot displacement, vertical ankle acceleration minima, and ZUPT in `events.ts` | M3 | R3.1 |
| F6 | 2D Floor Planar Homography | Implement 3x3 homography matrix solver for top-down floor projection and oblique camera correction | M3 | R3.2 |
| F7 | Steady-State Stride Filtering | Detect and exclude initial acceleration and terminal deceleration strides for `stepTimeCV` | M4 | R4.1 |
| F8 | Full Suite Ground-Truth Verification | Unit, integration, synthetic ground-truth regression testing, typecheck, lint, build, audit | Final E2E | R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Computer Vision & Model Fidelity | F1, F2: Model fallback hierarchy (`pose.ts`) & 1D coordinate smoothing (`signal.ts`, `analysis.ts`) | None | PLANNED |
| M2 | Video Capture & Floor Calibration | F3, F4: WebRTC 60 FPS constraints (`PoseTracker.ts`) & floor calibration (`calibration.ts`) | M1 | PLANNED |
| M3 | Multi-Signal Fusion & Homography | F5, F6: Heel-strike fusion with ZUPT (`events.ts`) & 2D planar homography (`homography.ts`) | M2 | PLANNED |
| M4 | Steady-State Filtering & QC | F7: Acceleration/deceleration stride detection & steady-state `stepTimeCV` (`analysis.ts`) | M3 | PLANNED |
| Final E2E | Final Acceptance Gate | F8: 100% test pass rate, 0 typecheck errors, 0 lint errors, clean build, clean audit | M1, M2, M3, M4 | PLANNED |

## Interface Contracts
### `src/lib/gait/pose.ts`
- `getPoseLandmarker(): Promise<PoseLandmarker>`: Attempts loading `pose_landmarker_heavy.task`, `pose_landmarker_full.task`, `pose_landmarker_lite.task` with GPU and CPU delegate fallbacks.

### `src/lib/gait/signal.ts`
- `savitzkyGolay5(signal: number[]): number[]`: 5-point Savitzky-Golay smoothing.
- `kalmanFilter1D(signal: number[], processNoise?: number, measurementNoise?: number): number[]`: 1D Kalman smoothing.
- `smoothPoseFrames(frames: PoseFrame[]): PoseFrame[]`: Applies smoothing to landmark coordinates across frame sequences.

### `src/lib/gait/calibration.ts`
- `calculateMillimetersPerPixel(markerType: 'card'|'qr'|'apriltag', pixelDimensions: {width: number, height: number}): number`: Returns mm/px conversion factor.

### `src/lib/gait/homography.ts`
- `computeHomographyMatrix(imagePoints: Point2D[], floorPoints: Point2D[]): Matrix3x3`: Solves 3x3 homography.
- `transformPoint(point: Point2D, H: Matrix3x3): Point2D`: Transforms 2D image coordinate to floor plane.

### `src/lib/gait/events.ts`
- `detectGaitEvents(frames: PoseFrame[], fps: number): GaitEvent[]`: Fuses AP displacement, vertical ankle acceleration minima, and ZUPT.

### `src/lib/gait/analysis.ts`
- `filterSteadyStateStrides(strideIntervals: number[]): { steadyStrides: number[], excludedCount: number }`: Excludes acceleration and deceleration strides.

## Code Layout
- `src/lib/gait/pose.ts`: Pose landmarker loading
- `src/lib/gait/signal.ts`: Signal processing & smoothing
- `src/lib/gait/PoseTracker.ts`: WebRTC video stream tracking
- `src/lib/gait/calibration.ts`: Floor calibration
- `src/lib/gait/events.ts`: Event detection & fusion
- `src/lib/gait/homography.ts`: Planar homography math
- `src/lib/gait/analysis.ts`: Metric computation & steady-state filtering
- `src/lib/gait/__tests__/`: Unit and integration test files
