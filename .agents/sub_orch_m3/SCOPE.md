# Scope: Milestone 3 — Live WebCam Real-Time Gait Capture Mode (R3)

## Architecture
Integrate live browser webcam video streaming into `PoseTracker.ts` and `GaitApp.tsx`, enabling real-time MediaPipe pose landmark extraction (`runningMode: "VIDEO"` / `detectForVideo`), live HTML5 canvas landmark visualization at ~30–60 FPS, continuous rolling frame buffer, and instantaneous real-time gait event detection and metric calculations directly from the camera stream.

## Feature Inventory (Milestone 3)
| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 17 | WebCam Stream Acquisition | MediaDevices `getUserMedia` webcam stream acquisition & canvas setup in `PoseTracker.ts` | DONE |
| 18 | Live Real-Time Pose Tracking | Frame-by-frame real-time landmark extraction from live webcam feed using MediaPipe Pose Landmarker | DONE |
| 19 | Live Skeleton Canvas Overlay | Real-time 60 FPS canvas skeleton & joint angle rendering over live webcam stream | DONE |
| 20 | Real-Time Event & Metric Engine | Rolling frame buffer processing real-time gait events & instantaneous metrics in `GaitApp.tsx` | DONE |

## Interface Contracts
- `PoseTracker.ts`:
  - `class PoseTracker` or helper methods:
    - `startWebcam(videoElement: HTMLVideoElement): Promise<MediaStream>`
    - `stopWebcam(): void`
    - `processWebcamFrame(timestampMs: number): PoseFrame | null`
- `GaitApp.tsx`:
  - Input mode toggle: `Video File Upload` vs `Live WebCam Mode`.
  - In Live WebCam mode, display live video feed with `<SkeletonCanvas />`, real-time FPS gauge, live landmark tracker indicator, and instantaneous rolling metric cards (Cadence, Step Count, Symmetry Angle, Live Joint Angles).
  - Stop/Analyze button allowing clinician to freeze capture and execute complete kinematic analysis report on recorded webcam session.

## Code Layout
- `src/lib/gait/PoseTracker.ts`: Live webcam stream manager & MediaPipe video pose tracking engine.
- `src/components/gait/GaitApp.tsx`: Live webcam UI mode, video element stream binding, live rolling buffer state.
- `src/lib/gait/__tests__/PoseTracker.test.ts` & `src/components/gait/__tests__/WebcamCapture.test.tsx`: Unit and UI test suite for live webcam capture.
