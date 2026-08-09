## 2026-08-09T12:47:28Z
Task Objective:
Investigate and design `PoseTracker.ts` webcam stream acquisition, MediaPipe video pose detection (`runningMode: "VIDEO"` with `detectForVideo`), frame processing loop (`requestAnimationFrame`), and stream resource cleanup (stopping media tracks, handling permissions, camera switching).

Authoritative Files & Context:
- Read /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Read /Users/damian/GitHub/gait-lab/.agents/sub_orch_m3/SCOPE.md
- Examine existing files in `src/lib/gait/` (especially `PoseTracker.ts`, `types.ts`, `GaitEngine.ts`) and `src/components/gait/`.

Specific Focus Areas for Explorer 1:
1. `PoseTracker.ts` Architecture:
   - How to manage `navigator.mediaDevices.getUserMedia({ video: { width: ..., height: ..., frameRate: ... } })`.
   - MediaPipe PoseLandmarker initialization & mode switching (`runningMode: "VIDEO"` vs `"IMAGE"`).
   - Real-time frame loop using `requestAnimationFrame` and `detectForVideo(videoElement, timestamp)`.
   - Memory management, timestamp management, and clean teardown of media tracks when stopping webcam mode or unmounting.
2. Error Handling & Robustness:
   - Handling `NotAllowedError` (camera permission denied), `NotFoundError` (no camera available), `NotReadableError` (camera in use by another app).
   - Re-entrancy and race conditions when quickly toggling start/stop.
3. Unit Testing Strategy:
   - How to mock `navigator.mediaDevices.getUserMedia`, `MediaStream`, `HTMLVideoElement`, and MediaPipe `PoseLandmarker.detectForVideo` in Vitest/Jest unit tests.
