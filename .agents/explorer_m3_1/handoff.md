# Technical Handoff Report: `PoseTracker.ts` Architecture & WebCam Real-Time Capture Design

**Author:** Explorer 1 (Milestone 3 — Live WebCam Real-Time Gait Capture Mode)  
**Date:** 2026-08-09  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_1/`  
**Target Architecture File:** `src/lib/gait/PoseTracker.ts`  

---

## 1. Observation

Direct code analysis of the existing `gait-lab` codebase reveals the following baseline state across `src/lib/gait/` and `src/components/gait/`:

1. **MediaPipe Setup (`src/lib/gait/pose.ts`)**:
   - `pose.ts:8-16` defines `PoseLandmarkerLike` interface containing `detect` and `detectForVideo(video, timestamp)`.
   - `pose.ts:29-66` defines `getPoseLandmarker()`, which initializes MediaPipe `PoseLandmarker` hardcoded with `runningMode: "IMAGE"` (lines 39-45).
   - `pose.ts:24-27` exports `nextVideoTimestamp()`, incrementing by 33ms per call.
   - `pose.ts:68-77` exports `toLandmarks(raw)` to map raw MediaPipe landmarks to `Landmark[]`.
   - Currently, `pose.ts` is optimized for offline, seek-based frame analysis of uploaded video files (`seekAndDetect`). There is no class or manager for continuous live webcam streaming acquisition or real-time frame loops.

2. **UI & Stream Controls (`src/components/gait/GaitApp.tsx`)**:
   - `GaitApp.tsx:75` mounts a hidden `<video ref={videoRef} />` used solely for seeking uploaded blob URLs.
   - `GaitApp.tsx:276-414` handles static file upload (`processFile`) via `seekAndDetect` sampling.
   - No webcam stream acquisition (`navigator.mediaDevices.getUserMedia`), live camera picker, or real-time frame loop exists in `GaitApp.tsx` yet.

3. **Skeleton Canvas Overlay (`src/components/gait/SkeletonCanvas.tsx`)**:
   - Accepts `video: HTMLVideoElement | null`, `poses: { id: number; landmarks: Landmark[] }[]`, `showSkeleton`, `showJointArcs`, and `showSwayVector`.
   - Renders 2D skeleton overlays over a video element at 60 FPS using `requestAnimationFrame`. It is ready to accept real-time pose updates from a live camera feed.

4. **Missing Component**:
   - No `PoseTracker.ts` exists yet in `src/lib/gait/`. A new module `src/lib/gait/PoseTracker.ts` must be created to manage webcam stream lifecycle, MediaPipe `"VIDEO"` mode configuration, monotonic timestamps, frame loop throttling, rolling frame buffer, and resource teardown.

---

## 2. Logic Chain

### 2.1 WebCam Stream Acquisition Architecture (`navigator.mediaDevices.getUserMedia`)

`PoseTracker` will encapsulate all `MediaStream` acquisition, device selection, video element binding, and hardware constraint negotiation.

#### Configuration Interface & Default Constraints
```ts
export interface WebcamOptions {
  deviceId?: string;
  facingMode?: "user" | "environment";
  width?: number | { ideal: number; max?: number };
  height?: number | { ideal: number; max?: number };
  frameRate?: number | { ideal: number; max?: number };
}

export const DEFAULT_WEBCAM_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: "user",
  },
  audio: false,
};
```

#### Stream Acquisition & Video Element Binding
```ts
async startWebcam(
  videoElement: HTMLVideoElement,
  options: WebcamOptions = {}
): Promise<MediaStream>
```
1. Build constraints merging `DEFAULT_WEBCAM_CONSTRAINTS` with user options (e.g. explicit `deviceId` or `facingMode`).
2. Request stream via `navigator.mediaDevices.getUserMedia(constraints)`.
3. If `OverconstrainedError` is thrown, catch and retry fallback with basic unconstrained `{ video: true, audio: false }`.
4. Bind stream to `HTMLVideoElement`:
   ```ts
   videoElement.srcObject = stream;
   videoElement.setAttribute("playsinline", "true");
   videoElement.muted = true;
   await videoElement.play();
   ```
5. Wait for video dimensions to populate (`videoElement.readyState >= 2 && videoElement.videoWidth > 0`).

---

### 2.2 MediaPipe PoseLandmarker Mode Switching (`runningMode: "VIDEO"`)

MediaPipe `@mediapipe/tasks-vision` `PoseLandmarker` operates in two distinct execution modes:
- `"IMAGE"` mode: Used for static images or offline seek-based video frames.
- `"VIDEO"` mode: Enables internal temporal smoothing and predictive landmark tracking across consecutive frames.

To support live webcam streaming, `PoseTracker` must ensure the underlying landmarker instance is configured for `"VIDEO"` mode.

#### Mode Switching Mechanism
```ts
export async function getPoseLandmarkerForVideo(): Promise<PoseLandmarkerLike> {
  const landmarker = await getPoseLandmarker();
  if (landmarker.setOptions) {
    await landmarker.setOptions({ runningMode: "VIDEO" });
  }
  return landmarker;
}
```
*Note:* When switching back to offline video processing, `landmarker.setOptions({ runningMode: "IMAGE" })` is called to restore seek compatibility.

---

### 2.3 Real-Time Frame Loop (`requestAnimationFrame` & `detectForVideo`)

`detectForVideo(videoElement, timestampMs)` requires a **strictly monotonically increasing integer timestamp** (in milliseconds). If a timestamp is smaller than or equal to the previous frame's timestamp, MediaPipe throws an invalid timestamp error.

#### Monotonic Timestamp Management & Frame Throttling
1. Keep track of `lastTimestampMs = -1`.
2. Use high-resolution timer `performance.now()` (or `nowMs` supplied by `requestAnimationFrame`).
3. Compute `currentTimestamp = Math.max(Math.floor(performance.now()), lastTimestampMs + 1)`.
4. Implement frame rate throttling to avoid over-executing detection on high-refresh monitors (120Hz/144Hz):
   - Target FPS: 30 FPS (target frame interval `~33.3ms`).
   - If `(currentTimestamp - lastProcessedFrameTimeMs) < targetIntervalMs`, skip detection on that animation tick.

#### Frame Processing Loop Design
```ts
private loop = (nowMs: DOMHighResTimeStamp) => {
  if (!this.isActive || !this.videoElement || !this.landmarker) return;

  const timestampMs = Math.max(Math.floor(performance.now()), this.lastTimestampMs + 1);

  // Throttle frame processing to target FPS (~30 FPS = 33ms interval)
  if (timestampMs - this.lastProcessedTimeMs >= this.targetIntervalMs) {
    if (
      this.videoElement.readyState >= 2 &&
      !this.videoElement.paused &&
      !this.videoElement.ended &&
      this.videoElement.videoWidth > 0
    ) {
      this.lastTimestampMs = timestampMs;
      this.lastProcessedTimeMs = timestampMs;

      try {
        const result = this.landmarker.detectForVideo(this.videoElement, timestampMs);
        let poseFrame: PoseFrame | null = null;

        if (result && result.landmarks && result.landmarks.length > 0) {
          const rawLandmarks = result.landmarks[0];
          poseFrame = {
            timeMs: timestampMs,
            landmarks: toLandmarks(rawLandmarks),
            worldLandmarks: result.worldLandmarks?.[0] ? toLandmarks(result.worldLandmarks[0]) : undefined,
          };
          this.addFrameToBuffer(poseFrame);
        }

        // Update live FPS counter
        this.updateFps(timestampMs);

        // Execute frame listener callback
        this.onFrameCallback?.(poseFrame, result, this.effectiveFps);
      } catch (err) {
        console.warn("[PoseTracker] Frame detection error:", err);
      }
    }
  }

  this.animFrameId = requestAnimationFrame(this.loop);
};
```

---

### 2.4 Resource Teardown & Rolling Buffer Memory Management

#### Memory Management (Rolling Frame Buffer)
To prevent memory inflation during extended live camera streaming (e.g. 10 minutes continuous session):
- Maintain a bounded array `rollingBuffer: PoseFrame[]`.
- Cap maximum buffer size (e.g., `MAX_BUFFER_FRAMES = 900` frames = 30 seconds of video at 30 FPS).
- Truncate buffer when limit is reached: `if (rollingBuffer.length > MAX_BUFFER_FRAMES) rollingBuffer.shift()`.

#### Clean Resource Teardown (`stopWebcam`)
1. Set `this.isActive = false` to break the frame loop immediately.
2. Cancel active `requestAnimationFrame`:
   ```ts
   if (this.animFrameId !== null) {
     cancelAnimationFrame(this.animFrameId);
     this.animFrameId = null;
   }
   ```
3. Stop all media tracks on the `MediaStream`:
   ```ts
   if (this.stream) {
     this.stream.getTracks().forEach((track) => track.stop());
     this.stream = null;
   }
   ```
4. Reset `videoElement`:
   ```ts
   if (this.videoElement) {
     this.videoElement.pause();
     this.videoElement.srcObject = null;
     this.videoElement = null;
   }
   ```
5. Reset timestamp tracking variables (`lastTimestampMs = -1`).

---

### 2.5 Error Handling & Robustness

#### Hardware & Permission Error Classification
`PoseTracker` will throw standardized, user-friendly `WebcamError` objects wrapping native DOMExceptions:

| Native DOM Error | Root Cause | Clinical/User Guidance | Recovery Action |
|------------------|------------|------------------------|-----------------|
| `NotAllowedError` / `PermissionDeniedError` | User or browser policy denied camera access | "Camera access was denied. Please allow camera permissions in your browser address bar settings." | Prompt user to change browser settings |
| `NotFoundError` / `DevicesNotFoundError` | No webcam hardware connected | "No video input camera detected on your device." | Ask user to connect USB webcam |
| `NotReadableError` / `TrackStartError` | Camera locked by another app (Zoom, Meet, FaceTime) | "Camera is currently in use by another application." | Prompt user to close other apps |
| `OverconstrainedError` | Device constraints (resolution/FPS) unsupported | "Camera resolution constraints not supported." | Automatic fallback to `{ video: true }` |
| `SecurityError` | Page served over insecure HTTP | "Webcam access requires an HTTPS connection or localhost." | Redirect / warn secure context required |

#### Re-Entrancy & Async Race Condition Protection
If `startWebcam()` is called multiple times in rapid succession, or if `stopWebcam()` is called while `startWebcam()` is awaiting permission:
- Maintain an internal `sessionId: number` counter.
- Increment `sessionId` at the start of `startWebcam()` and `stopWebcam()`.
- After `await getUserMedia(...)` or `await setOptions(...)`, check if `this.sessionId !== currentSessionId`.
- If canceled during `await`, immediately call `.stop()` on the acquired stream tracks and abort without starting the frame loop.

---

### 2.6 Unit Testing Strategy (Vitest Infrastructure)

To test `PoseTracker.ts` in Vitest/JSDOM without physical hardware:

#### 1. Mocking `navigator.mediaDevices`
```ts
const mockTrack = {
  stop: vi.fn(),
  kind: "video",
  enabled: true,
  getSettings: vi.fn().mockReturnValue({ width: 1280, height: 720, frameRate: 30 }),
};

const mockStream = {
  getTracks: vi.fn().mockReturnValue([mockTrack]),
  getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
};

vi.stubGlobal("navigator", {
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue(mockStream),
    enumerateDevices: vi.fn().mockResolvedValue([
      { deviceId: "cam1", kind: "videoinput", label: "FaceTime HD Camera" },
    ]),
  },
});
```

#### 2. Mocking `HTMLVideoElement`
```ts
function createMockVideoElement(): HTMLVideoElement {
  const video = document.createElement("video");
  Object.defineProperty(video, "readyState", { value: 4, writable: true }); // HAVE_ENOUGH_DATA
  Object.defineProperty(video, "videoWidth", { value: 1280, writable: true });
  Object.defineProperty(video, "videoHeight", { value: 720, writable: true });
  video.play = vi.fn().mockResolvedValue(undefined);
  video.pause = vi.fn();
  return video;
}
```

#### 3. Mocking MediaPipe `PoseLandmarker.detectForVideo`
```ts
const mockLandmarker: PoseLandmarkerLike = {
  detect: vi.fn(),
  detectForVideo: vi.fn().mockImplementation((video, ts) => ({
    landmarks: [generateSyntheticWalkingFrames({ durationSec: 0.1 })[0].landmarks],
    worldLandmarks: [generateSyntheticWalkingFrames({ durationSec: 0.1 })[0].landmarks],
  })),
  setOptions: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
};
```

---

## 3. Caveats

1. **Browser Permission Behavior**: Safari macOS/iOS handles camera permissions strictly per session. Rapid toggle of stream acquisition may cause Safari to display permission banners repeatedly if tracks are stopped too quickly.
2. **MediaPipe WASM Delegate Fallback**: On low-end systems or mobile devices where WebGL/GPU acceleration fails, MediaPipe falls back to CPU WASM. Detection time may increase from ~8ms to ~35ms per frame. The 30 FPS throttle in `PoseTracker` prevents frame backlog under CPU fallback.
3. **Monotonic Clock Reset**: Browsers may suspend `performance.now()` when tabs are backgrounded. Resuming a tab while webcam mode is active must ensure `lastTimestampMs` resets to avoid timestamp jump errors in `detectForVideo`.

---

## 4. Conclusion & Proposed Implementation Specification

### Proposed Class Structure for `src/lib/gait/PoseTracker.ts`

```ts
import { getPoseLandmarker, toLandmarks, type PoseLandmarkerLike } from "./pose";
import type { Landmark, PoseFrame } from "./types";

export interface WebcamOptions {
  deviceId?: string;
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  targetFps?: number;
}

export type FrameCallback = (
  frame: PoseFrame | null,
  rawResult: unknown,
  fps: number
) => void;

export class PoseTracker {
  private landmarker: PoseLandmarkerLike | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private isActive = false;

  private lastTimestampMs = -1;
  private lastProcessedTimeMs = 0;
  private targetIntervalMs = 33.3; // Default 30 FPS throttle

  private rollingBuffer: PoseFrame[] = [];
  private maxBufferFrames = 900; // 30s at 30 FPS

  private frameCount = 0;
  private fpsStartTime = 0;
  private effectiveFps = 0;

  private sessionId = 0;
  private onFrameCallback: FrameCallback | null = null;

  constructor(targetFps = 30, maxBufferFrames = 900) {
    this.targetIntervalMs = 1000 / targetFps;
    this.maxBufferFrames = maxBufferFrames;
  }

  public async startWebcam(
    videoElement: HTMLVideoElement,
    options: WebcamOptions = {}
  ): Promise<MediaStream> {
    const currentSession = ++this.sessionId;

    // 1. Initialize / switch MediaPipe landmarker to VIDEO mode
    if (!this.landmarker) {
      this.landmarker = await getPoseLandmarker();
    }
    if (this.landmarker.setOptions) {
      await this.landmarker.setOptions({ runningMode: "VIDEO" });
    }

    if (this.sessionId !== currentSession) {
      throw new Error("Webcam initialization aborted due to rapid state change.");
    }

    // 2. Request user media with constraints & fallback
    let stream: MediaStream;
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        facingMode: options.facingMode || "user",
        width: options.width ? { ideal: options.width } : { ideal: 1280 },
        height: options.height ? { ideal: options.height } : { ideal: 720 },
        frameRate: { ideal: 30, max: 60 },
      },
      audio: false,
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err instanceof DOMException && err.name === "OverconstrainedError") {
        console.warn("[PoseTracker] OverconstrainedError, falling back to basic video stream.");
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } else {
        throw err;
      }
    }

    if (this.sessionId !== currentSession) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Webcam stream acquisition aborted.");
    }

    // 3. Bind to HTMLVideoElement
    this.stopWebcam(); // Clean up previous session
    this.stream = stream;
    this.videoElement = videoElement;
    this.videoElement.srcObject = stream;
    this.videoElement.setAttribute("playsinline", "true");
    this.videoElement.muted = true;

    await this.videoElement.play();

    // 4. Reset telemetry & start animation frame loop
    this.isActive = true;
    this.lastTimestampMs = -1;
    this.lastProcessedTimeMs = 0;
    this.frameCount = 0;
    this.fpsStartTime = performance.now();
    this.loop(performance.now());

    return stream;
  }

  public stopWebcam(): void {
    this.sessionId++;
    this.isActive = false;

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.lastTimestampMs = -1;
  }

  public setCallback(callback: FrameCallback | null): void {
    this.onFrameCallback = callback;
  }

  public getRollingFrames(): PoseFrame[] {
    return [...this.rollingBuffer];
  }

  public clearBuffer(): void {
    this.rollingBuffer = [];
  }

  public getEffectiveFps(): number {
    return this.effectiveFps;
  }

  public isRunning(): boolean {
    return this.isActive;
  }

  private addFrameToBuffer(frame: PoseFrame): void {
    this.rollingBuffer.push(frame);
    if (this.rollingBuffer.length > this.maxBufferFrames) {
      this.rollingBuffer.shift();
    }
  }

  private updateFps(nowMs: number): void {
    this.frameCount++;
    const elapsed = nowMs - this.fpsStartTime;
    if (elapsed >= 1000) {
      this.effectiveFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.fpsStartTime = nowMs;
    }
  }

  private loop = (nowMs: DOMHighResTimeStamp) => {
    if (!this.isActive || !this.videoElement || !this.landmarker) return;

    const timestampMs = Math.max(Math.floor(performance.now()), this.lastTimestampMs + 1);

    if (timestampMs - this.lastProcessedTimeMs >= this.targetIntervalMs) {
      if (
        this.videoElement.readyState >= 2 &&
        !this.videoElement.paused &&
        !this.videoElement.ended &&
        this.videoElement.videoWidth > 0
      ) {
        this.lastTimestampMs = timestampMs;
        this.lastProcessedTimeMs = timestampMs;

        try {
          const result = this.landmarker.detectForVideo(this.videoElement, timestampMs);
          let poseFrame: PoseFrame | null = null;

          if (result && result.landmarks && result.landmarks.length > 0) {
            const rawLandmarks = result.landmarks[0];
            poseFrame = {
              timeMs: timestampMs,
              landmarks: toLandmarks(rawLandmarks),
              worldLandmarks: result.worldLandmarks?.[0]
                ? toLandmarks(result.worldLandmarks[0])
                : undefined,
            };
            this.addFrameToBuffer(poseFrame);
          }

          this.updateFps(timestampMs);
          this.onFrameCallback?.(poseFrame, result, this.effectiveFps);
        } catch (err) {
          console.warn("[PoseTracker] detectForVideo execution error:", err);
        }
      }
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };
}
```

---

## 5. Verification Method

To verify the implementation of `PoseTracker.ts` and its test suite:

1. **Automated Unit Testing**:
   Run Vitest against the `PoseTracker` unit test suite:
   ```bash
   npx vitest run src/lib/gait/__tests__/PoseTracker.test.ts
   ```
   *Expected Outcome:* 100% pass rate across stream start, frame processing loop, buffer rollover, error handling (`NotAllowedError`, `NotFoundError`), and teardown cleanly.

2. **Full Workspace Code Quality Checks**:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```
   *Expected Outcome:* 0 TypeScript errors, 0 ESLint warnings, 100% test pass rate across all existing unit, UI, and stress tests.

3. **Manual UI Verification**:
   - Open browser preview, switch protocol mode to "Live WebCam Mode".
   - Allow camera access: verify live webcam feed appears, skeleton overlay renders over live user at ~30 FPS, and real-time FPS gauge displays.
   - Click "Stop & Analyze": verify webcam tracks stop (camera indicator LED turns off), and full gait analysis report generates from rolling buffer frames.
