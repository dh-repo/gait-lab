# Handoff Report: Milestone 3 — `GaitApp.tsx` Live WebCam UI Integration & UI Test Suite Architecture

**Agent**: Explorer 3 (UI & Frontend Architecture Specialist)  
**Milestone**: Milestone 3 — Live WebCam Real-Time Gait Capture Mode  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_3`  
**Date**: 2026-08-09  

---

## 1. Observation

### 1.1 Existing `GaitApp.tsx` Architecture
- **Location**: `src/components/gait/GaitApp.tsx` (1,307 lines)
- **Current Flow**:
  - `phase` state (`"idle" | "loading_model" | "scanning" | "select_person" | "analyzing" | "results" | "error"`).
  - 4-Stage Workflow managed by `WorkflowHeader` and `computedStage` (Stage 1: Ingestion, Stage 2: Tracking, Stage 3: Workstation, Stage 4: Report).
  - Stage 1 currently only supports video file dropzone (`processFile(file: File)`) and pre-validated sample picker (`SamplePicker`).
  - MediaPipe pose model loaded via `ensureModel()` calling `getPoseLandmarker()` in `src/lib/gait/pose.ts`.
- **Canvas & Video Setup**:
  - `SkeletonCanvas.tsx` renders a 16:9 canvas element (`role="img"`, `aria-label="Pose estimation skeleton rendering canvas"`) over `HTMLVideoElement`.
  - Supports canvas overlay toggles (`showSkeleton`, `showJointArcs`, `showSwayVector`).

### 1.2 MediaPipe Pose Engine Capabilities
- **Location**: `src/lib/gait/pose.ts` (341 lines)
- **Functions & Types**:
  - `PoseLandmarkerLike` supporting both `.detect(canvas|video)` and `.detectForVideo(video, timestamp)`.
  - `nextVideoTimestamp()` producing monotonic timestamps for MediaPipe VIDEO mode.
  - `resamplePoseFrames(frames, targetFps)` interpolating non-uniform timestamps onto a uniform 30 Hz grid using Catmull-Rom cubic splines.

### 1.3 Baseline Scope Contract for Milestone 3
- **Location**: `.agents/sub_orch_m3/SCOPE.md`
- **Requirements**:
  - `GaitApp.tsx`: Input mode toggle (`Video File Upload` vs `Live WebCam Mode`).
  - WebCam Mode UI: Live camera stream, `<SkeletonCanvas />` overlay, real-time FPS gauge, live step count, cadence, joint angle gauge, confidence indicator.
  - Controls: Camera device selector dropdown, "Start WebCam", "Stop WebCam", "Freeze & Analyze Session".
  - Test Suite: `src/components/gait/__tests__/WebcamCapture.test.tsx` verifying mode toggling, permission errors, controls, and freeze/analyze interactions.

---

## 2. Logic Chain

### 2.1 Input Mode Toggling Architecture in `GaitApp.tsx`
To support both Video File Upload and Live WebCam Mode seamlessly without breaking the existing 4-stage workflow:
1. Introduce state variable `inputMode: "file" | "webcam"`.
2. Render tab switcher in Stage 1:
   - **`Video File Upload` Tab**: Renders existing dropzone and sample picker.
   - **`Live WebCam` Tab**: Renders WebCam control panel, device selector dropdown, camera view preview, live metric gauges, and "Freeze & Analyze Session" trigger.

### 2.2 Live WebCam State & Device Control
- **`webcamState`**: `"idle" | "requesting" | "streaming" | "paused" | "error"`
- **Device Enumeration**:
  ```ts
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  useEffect(() => {
    async function enumerate() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (e) {
        console.warn("Device enumeration failed:", e);
      }
    }
    void enumerate();
  }, [inputMode]);
  ```
- **Stream Lifecycle**:
  - `startWebcam(deviceId?: string)`: Requests stream via `navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } })`.
  - Assigns stream to `videoRef.current.srcObject = stream` and starts video playback (`video.play()`).
  - Initiates animation frame loop (`requestAnimationFrame`) to pass video frames to `PoseTracker` in `VIDEO` mode.
  - `stopWebcam()`: Stops all tracks (`stream.getTracks().forEach(t => t.stop())`), sets `videoRef.current.srcObject = null`, and cancels loop.

### 2.3 Real-Time Rolling Metric Gauges
During live streaming, a lightweight rolling frame buffer (`webcamBufferRef: useRef<PoseFrame[]>([])`) stores the last $N$ seconds of pose frames (~15–30s at 30 FPS = 450–900 frames).
Instantaneous metrics are updated every ~100ms:
- **FPS Gauge**: $\text{FPS} = 1000 / \text{frameDeltaMs}$, smoothed with exponential moving average ($\alpha = 0.1$).
- **Live Step Count & Cadence**: Count heel strikes from ankle/knee $Y$-position local minima in rolling window.
- **Live Joint Angles**: Calculated in real-time for current frame:
  - Knee Flexion Angle: $\angle(\text{Hip}, \text{Knee}, \text{Ankle})$
  - Hip Flexion Angle: $\angle(\text{Shoulder}, \text{Hip}, \text{Knee})$
- **Landmark Confidence**: Percentage of key lower-body landmarks with `visibility >= 0.5`.

### 2.4 Transitioning from Live Capture to Clinical Session Analysis ("Freeze & Analyze")
When clinician clicks **"Freeze & Analyze Session"**:
1. Live WebCam stream loop is paused.
2. The accumulated `PoseFrame[]` in `webcamBufferRef.current` is extracted.
3. Resampled onto a uniform 30 Hz grid via `resamplePoseFrames(buffer, 30.0)`.
4. Processed through the analytical engine (`computeGaitMetrics`, `computeGaitAngleAnalysis`, `buildEducatedGuesses`).
5. `result` state is set, `phase` transitions to `"results"`, and workflow stage moves directly to Stage 3 (`Clinical Insights & Workstation`).

### 2.5 Camera Access Permission & Hardware Error Fallbacks
When `getUserMedia` throws an exception:
- **`NotAllowedError` / `PermissionDeniedError`**: Render alert modal explaining browser permission blocking and direct instructions on how to unblock camera settings.
- **`NotReadableError` / `NotFoundError`**: Render alert card notifying user that camera is in use or disconnected, with a 1-click **"Switch to File Upload Mode"** button.

---

## 3. Caveats

1. **Browser SSR & Headless Test Environments**: `navigator.mediaDevices` and `HTMLVideoElement.srcObject` are undefined in Node/JSDOM environments. All UI tests must mock `navigator.mediaDevices.getUserMedia` and `enumerateDevices`.
2. **MediaPipe VIDEO Mode Monotonic Timestamp Rule**: MediaPipe `detectForVideo` throws a runtime error if timestamps do not strictly increase. Live timestamp tracking must use `performance.now()` or `nextVideoTimestamp()`.
3. **Camera Resolution & Aspect Ratio**: Webcams report variable aspect ratios (4:3 vs 16:9). `SkeletonCanvas.tsx` automatically adapts canvas drawing to `video.videoWidth` and `video.videoHeight` to eliminate layout shift.

---

## 4. Conclusion & Proposed Implementation Specs

### 4.1 Proposed `GaitApp.tsx` Modifications (Structure & Code)

```tsx
// New State Additions in GaitApp.tsx
const [inputMode, setInputMode] = useState<"file" | "webcam">("file");
const [webcamState, setWebcamState] = useState<"idle" | "requesting" | "streaming" | "paused" | "error">("idle");
const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
const [webcamError, setWebcamError] = useState<string | null>(null);

// Live metrics rolling state
const [liveMetrics, setLiveMetrics] = useState<{
  fps: number;
  stepCount: number;
  cadence: number;
  kneeAngleLeft: number;
  kneeAngleRight: number;
  confidence: number;
}>({ fps: 0, stepCount: 0, cadence: 0, kneeAngleLeft: 0, kneeAngleRight: 0, confidence: 0 });

const webcamBufferRef = useRef<PoseFrame[]>([]);
const streamRef = useRef<MediaStream | null>(null);
```

#### Stage 1 Input Mode Toggle UI Snippet:
```tsx
<div className="flex rounded-[var(--radius-lg)] border border-[var(--color-border)] p-1 bg-[var(--color-surface-2)] max-w-md">
  <button
    type="button"
    onClick={() => {
      if (webcamState === "streaming") stopWebcam();
      setInputMode("file");
    }}
    className={cn(
      "flex-1 rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-colors",
      inputMode === "file"
        ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-xs"
        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
    )}
  >
    <Film className="size-4 mr-2 inline" />
    Video File Upload
  </button>
  <button
    type="button"
    onClick={() => setInputMode("webcam")}
    className={cn(
      "flex-1 rounded-[var(--radius-md)] px-4 py-2 text-xs font-semibold transition-colors",
      inputMode === "webcam"
        ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)] shadow-xs"
        : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
    )}
  >
    <Camera className="size-4 mr-2 inline" />
    Live WebCam Mode
  </button>
</div>
```

#### Live WebCam Controls & Live Metrics Overlay Card:
```tsx
{inputMode === "webcam" && (
  <Card className="border-[var(--color-border)] bg-[var(--color-surface)]">
    <CardHeader>
      <CardTitle className="text-base flex items-center justify-between">
        <span>Live WebCam Capture Station</span>
        <Badge tone={webcamState === "streaming" ? "success" : "neutral"}>
          {webcamState === "streaming" ? "STREAMING LIVE" : "CAMERA READY"}
        </Badge>
      </CardTitle>
      <CardDescription>
        Select camera device and record real-time gait kinematics.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* Device Selector & Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedDeviceId}
          onChange={(e) => {
            setSelectedDeviceId(e.target.value);
            if (webcamState === "streaming") {
              stopWebcam();
              startWebcam(e.target.value);
            }
          }}
          disabled={webcamState === "streaming"}
          className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-fg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>

        {webcamState !== "streaming" ? (
          <Button onClick={() => startWebcam(selectedDeviceId)}>
            <Camera className="size-4 mr-1.5" /> Start WebCam
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={stopWebcam}>
              <Square className="size-4 mr-1.5" /> Stop WebCam
            </Button>
            <Button variant="primary" onClick={freezeAndAnalyze}>
              <Sparkles className="size-4 mr-1.5" /> Freeze & Analyze Session
            </Button>
          </>
        )}
      </div>

      {/* Camera Error Fallback Alert */}
      {webcamError && (
        <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400 space-y-2">
          <p className="font-semibold">{webcamError}</p>
          <Button size="sm" variant="secondary" onClick={() => setInputMode("file")}>
            Switch to Video File Upload
          </Button>
        </div>
      )}

      {/* Live Video Canvas + Metrics Overlay */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        <SkeletonCanvas
          video={videoRef.current}
          poses={scanPoses}
          selectedId={selectedPersonId}
          personColors={personColors}
        />

        {/* Floating Telemetry Gauges */}
        {webcamState === "streaming" && (
          <div className="absolute top-3 right-3 flex flex-col gap-2 bg-black/70 backdrop-blur-md p-3 rounded-lg border border-white/10 text-white text-xs font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">FPS:</span>
              <span className={liveMetrics.fps >= 25 ? "text-green-400" : "text-yellow-400"}>
                {liveMetrics.fps.toFixed(1)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Live Steps:</span>
              <span className="text-cyan-400 font-bold">{liveMetrics.stepCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Cadence:</span>
              <span className="text-cyan-400">{liveMetrics.cadence.toFixed(0)} spm</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">L / R Knee:</span>
              <span className="text-indigo-300">
                {liveMetrics.kneeAngleLeft.toFixed(0)}° / {liveMetrics.kneeAngleRight.toFixed(0)}°
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Confidence:</span>
              <span className="text-emerald-400">{(liveMetrics.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
)}
```

---

### 4.2 Proposed UI Test Suite (`src/components/gait/__tests__/WebcamCapture.test.tsx`)

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GaitApp } from "../GaitApp";

describe("WebcamCapture UI & Stream Workflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders input mode toggle tabs in Stage 1", () => {
    render(<GaitApp />);
    expect(screen.getByText("Video File Upload")).toBeDefined();
    expect(screen.getByText("Live WebCam Mode")).toBeDefined();
  });

  it("switches to WebCam mode on tab click", () => {
    render(<GaitApp />);
    const webcamTab = screen.getByText("Live WebCam Mode");
    fireEvent.click(webcamTab);
    expect(screen.getByText("Live WebCam Capture Station")).toBeDefined();
    expect(screen.getByText("Start WebCam")).toBeDefined();
  });

  it("handles camera access denial gracefully with error alert", async () => {
    // Mock getUserMedia rejection
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "cam1", kind: "videoinput", label: "Front Camera" },
        ]),
        getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
      },
    });

    render(<GaitApp />);
    fireEvent.click(screen.getByText("Live WebCam Mode"));

    const startBtn = screen.getByText("Start WebCam");
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText(/Permission denied/i)).toBeDefined();
      expect(screen.getByText("Switch to Video File Upload")).toBeDefined();
    });
  });

  it("starts stream and enables Freeze & Analyze button", async () => {
    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: () => [mockTrack] };

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "cam1", kind: "videoinput", label: "Front Camera" },
        ]),
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    });

    render(<GaitApp />);
    fireEvent.click(screen.getByText("Live WebCam Mode"));
    fireEvent.click(screen.getByText("Start WebCam"));

    await waitFor(() => {
      expect(screen.getByText("Stop WebCam")).toBeDefined();
      expect(screen.getByText("Freeze & Analyze Session")).toBeDefined();
    });
  });
});
```

---

## 5. Verification Method

To independently verify the architecture, UX, state coordination, and test suite:
1. **Run Unit and UI Test Suite**:
   ```bash
   npx vitest run src/components/gait/__tests__/WebcamCapture.test.tsx
   npm test
   ```
2. **Execute TypeScript Compiler**:
   ```bash
   npm run typecheck
   ```
3. **Execute ESLint Check**:
   ```bash
   npm run lint
   ```
4. **Execute Production Build**:
   ```bash
   npm run build
   ```
