# Technical Investigation Report: Live WebCam Real-Time Gait Capture Mode Architecture

**Author**: Explorer 2 (Milestone 3 — Live WebCam Real-Time Gait Capture Mode)  
**Date**: 2026-08-09  
**Target Path**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m3_2/handoff.md`  

---

## 1. Observation

A detailed audit of the `gait-lab` codebase (`src/lib/gait/` and `src/components/gait/`) was conducted to evaluate existing pose processing, canvas rendering, gait event detection, metric calculation, and state management mechanisms.

### Key Codebase Observations & Exact Locations:

1. **MediaPipe Pose Landmarker Integration (`src/lib/gait/pose.ts`)**:
   - `PoseLandmarkerLike` interface (lines 8–16):
     ```typescript
     export type PoseLandmarkerLike = {
       detect: (image: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => PoseDetectionResult;
       detectForVideo: (
         video: HTMLVideoElement | HTMLCanvasElement,
         timestamp: number,
       ) => PoseDetectionResult;
       setOptions?: (options: Record<string, unknown>) => Promise<void> | void;
       close?: () => void;
     };
     ```
   - Monotonic Timestamp Generator (lines 23–27): `nextVideoTimestamp()` increments by 33 ms per frame for MediaPipe `VIDEO` mode.
   - Landmarker Initialization (lines 29–66): `getPoseLandmarker()` currently hardcodes `runningMode: "IMAGE"` (line 40). For live streaming webcam, MediaPipe requires setting `runningMode: "VIDEO"` and calling `detectForVideo(videoElement, timestamp)`.
   - Spline Resampling (lines 259–340): `resamplePoseFrames(frames, targetFps = 30.0)` interpolates non-uniform pose frame sequences onto an exact uniform 30 Hz grid using Catmull-Rom cubic splines.

2. **Live Skeleton Canvas Rendering (`src/components/gait/SkeletonCanvas.tsx`)**:
   - Canvas Rendering Loop (lines 38–72): `renderFrame()` runs via `requestAnimationFrame`. Canvas width/height are synchronized with video dimensions:
     ```typescript
     const w = video.videoWidth || 640;
     const h = video.videoHeight || 360;
     if (canvas.width !== w) canvas.width = w;
     if (canvas.height !== h) canvas.height = h;
     ```
   - Drawing Logic (`drawPoseOptimized`, lines 135–226): Batches POSE_CONNECTIONS (lines 156–164) and landmark points (lines 166–174), filtering by `(visibility ?? 1) < 0.25`. Sway vector (lines 177–188) and knee arcs (lines 191–208) are drawn. Currently lacks landmark confidence color-coding, One Euro landmark smoothing, and live numeric angle text labels.

3. **Gait Event Detection & Filtering (`src/lib/gait/events.ts` & `src/lib/gait/signal.ts`)**:
   - `detectGaitEventsZeni()` (lines 190–451): Batch Zeni algorithm. Extracts mid-hip AP trajectory and relative heel/toe positions ($x_{\text{heel}} - x_{\text{hip}}$), filters signal via `zeroPhaseButterworth()` (lines 292–295), identifies extrema via `findExtrema()` (lines 99–148), and applies parabolic timestamp refinement `refinePeakTimestamp()` (lines 155–183).
   - `butterworthLowPass()` (`signal.ts`, lines 102–123): Causal 4th-order low-pass biquad filter section (fc = 6.0 Hz default).
   - `zeroPhaseButterworth()` (`signal.ts`, lines 130–175): Non-causal zero-phase filter via forward-backward passes.

4. **Symmetry & Kinematic Angles (`src/lib/gait/symmetry.ts` & `src/lib/gait/angles.ts`)**:
   - `symmetryAngle(valLeft, valRight)` (`symmetry.ts`, lines 19–42): Computes Zifchock's Symmetry Angle (SA) in percentage:
     $$\text{SA} = \frac{|45^\circ - \arctan(|V_{\text{left}}| / |V_{\text{right}}|)|}{90^\circ} \times 100\%$$
   - `calculateKneeFlexion()`, `calculateHipFlexion()`, `calculateAnkleAngle()` (`angles.ts`, lines 77–162): Single-frame 3-point joint angle calculations in degrees ($0\text{--}180^\circ$).

5. **Application Integration (`src/components/gait/GaitApp.tsx`)**:
   - Stage-based workflow management (`computedStage`, lines 183–199). Currently processes pre-recorded video files (`processFile`, lines 276–414) and batch runs offline analysis (`runAnalysis`, lines 416–561). Needs live webcam stream acquisition, live rolling buffer state, and seamless "Freeze & Analyze" transition.

---

## 2. Logic Chain

Based on these observations, a step-by-step design is established across the three primary focus areas:

### Focus Area 1: Live Skeleton Overlay (`SkeletonCanvas.tsx` / Canvas rendering)

1. **Canvas & Video Dimension Synchronization**:
   - HTML5 `<video>` elements in live webcam mode have intrinsic video dimensions (`videoWidth`, `videoHeight`, e.g., $1280 \times 720$) that differ from CSS display dimensions.
   - Setting `canvas.width = video.videoWidth` and `canvas.height = video.videoHeight` inside `requestAnimationFrame` preserves the intrinsic aspect ratio. The CSS styling `w-full h-full object-contain` handles scaling without distorting MediaPipe normalized coordinates $(x \cdot w, y \cdot h)$.

2. **Landmark Confidence Visual Indicators**:
   - MediaPipe landmarks include a `visibility` probability score ($[0.0, 1.0]$).
   - Rendering visual indicators based on confidence:
     - High Confidence ($\text{visibility} \ge 0.70$): Green dot (`#22c55e`), full opacity ($\alpha = 1.0$).
     - Moderate Confidence ($0.40 \le \text{visibility} < 0.70$): Yellow dot (`#eab308`), moderate opacity ($\alpha = 0.8$).
     - Low Confidence ($\text{visibility} < 0.40$): Red dot (`#ef4444`), low opacity ($\alpha = 0.35$).
     - Hidden ($\text{visibility} < 0.25$): Omit line connections and dots.

3. **Real-Time Joint Angle Text Annotations**:
   - Calculate live joint angles for active frame using `calculateKneeFlexion()`, `calculateHipFlexion()`, `calculateAnkleAngle()`.
   - Render numeric degree overlays (e.g. `Knee: 42°`) directly next to joint positions on canvas with semi-transparent background pills for clinical visibility.

4. **One Euro Filter / Exponential Moving Average (EMA) Landmark Smoothing**:
   - Live MediaPipe landmarks can display slight high-frequency spatial jitter frame-to-frame.
   - Applying a low-latency 1st-order EMA filter on normalized landmark coordinates:
     $$\hat{x}_t = \alpha \cdot x_t + (1 - \alpha) \cdot \hat{x}_{t-1}$$
     where $\alpha \approx 0.35$. This eliminates visual jitter on the live canvas overlay without introducing perceptible lag.

---

### Focus Area 2: Rolling Buffer & Instantaneous Real-Time Gait Metrics

1. **Rolling Frame Buffer Memory Management**:
   - Store incoming `PoseFrame` objects in a bounded circular buffer (`RollingGaitBuffer`) in memory.
   - Capacity: $300$ frames at $30$ FPS = $10$ seconds of gait history (or $600$ frames at $60$ FPS). Memory per `PoseFrame` (33 landmarks $\times 4$ floats $\approx 500$ bytes) is $\approx 150$ KB total—extremely lightweight and browser-safe.

2. **Causal Real-Time Event Detection (Online Heel Strike & Toe Off)**:
   - Zero-phase filtering (`zeroPhaseButterworth`, non-causal) requires forward and backward passes over the full signal, which cannot run in real time on individual incoming stream frames.
   - **Solution**: Use causal 4th-order low-pass Butterworth filtering (`butterworthLowPass` from `signal.ts`, fc = 6.0 Hz) applied incrementally to the rolling anterior-posterior (AP) heel displacement $x_{\text{heel}} - x_{\text{hip}}$.
   - **Sliding Window Extremum Detection**:
     - Monitor slope change ($\frac{d}{dt} = 0$, derivative sign change across 3 consecutive frames) over the last 15–30 frames in the rolling buffer.
     - Confirm Heel Strike (max AP displacement in walking direction) and Toe Off (min AP displacement in walking direction) when peak prominence $P \ge 0.01$ and inter-event gap $\Delta t \ge 0.35\text{ s}$.

3. **Instantaneous Metric Calculations**:
   - **Live Cadence (spm)**: Computed over detected heel strikes in rolling 5–10s window:
     $$\text{Cadence}_{\text{live}} = \frac{N_{\text{strikes}}}{\Delta t_{\text{window}}} \times 60$$
   - **Live Step Count**: Cumulative integer counter incremented upon each confirmed live heel strike.
   - **Live Symmetry Angle (%)**: Calculated from mean left vs right step intervals over recent strides using Zifchock's formula:
     $$\text{SA}_{\text{live}} = \text{symmetryAngle}(\bar{t}_{\text{step, left}}, \bar{t}_{\text{step, right}})$$
   - **Live Joint Angles**: Instantaneous knee flexion, hip flexion, and ankle angle ($^\circ$) for current frame.

4. **React State & Render Architecture (Decoupled High-FPS Canvas & Low-FPS React State)**:
   - React state updates (`setState`) on every 60 FPS frame trigger severe DOM thrashing, state lag, and UI frozen frames.
   - **Architecture**:
     - Keep raw pose frames and rolling event buffer inside React Mutable Refs (`rollingBufferRef`, `liveMetricsRef`).
     - High-frequency canvas rendering executes in `requestAnimationFrame` loop (30–60 FPS), reading directly from `liveMetricsRef.current` and `videoRef.current`.
     - React state updates (`setLiveMetrics`) are throttled to **10–15 Hz** (every 66–100 ms) via a timestamp check, updating live UI metric cards smoothly without triggering React re-render thrashing.

---

### Focus Area 3: Teardown & Transition to Full Analysis ("Freeze & Analyze")

1. **WebCam Stream & Resource Teardown**:
   - When clinician clicks "Freeze & Analyze", call `stopWebcam()`:
     ```typescript
     if (mediaStream) {
       mediaStream.getTracks().forEach((track) => track.stop());
     }
     if (videoElement) {
       videoElement.srcObject = null;
     }
     if (animationFrameId) {
       cancelAnimationFrame(animationFrameId);
     }
     ```

2. **Transition Pipeline**:
   - Retrieve complete array of recorded `PoseFrame` objects accumulated in `rollingBufferRef`.
   - If session duration exceeds 20 seconds, select the central 20-second window or resample entire clip.
   - Pass frames to `resamplePoseFrames(frames, 30.0)` to establish an exact uniform 30 Hz time grid.
   - Execute full offline analysis suite:
     1. `computeGaitMetrics(uniformFrames)`: Applies `zeroPhaseButterworth` (zero-phase 6 Hz filter), `detectGaitEventsZeni()`, split-half reliability confidence intervals, Zifchock symmetry, and score composites.
     2. `computeGaitAngleAnalysis(uniformFrames, stepEvents, viewAngle)`: Performs stride segmentation, 101-point normalization, ROM metrics, and normative Perry & Burnfield curves.
     3. `buildEducatedGuesses(metrics, { taskMode, dualTaskCost })`: Derives clinical evidence and severity classifications.
   - Update React state (`setPhase("results")`, `setTab("clusters")`, `setResult(analysisResult)`), seamlessly transitioning the UI from Stage 2 (Live Webcam Capture) to Stage 3/4 (Full Kinematic Analysis & Clinical Report View).

---

## 3. Caveats

1. **Variable Camera Frame Rates**: WebCam stream frame rates vary depending on browser and camera hardware (e.g. 720p @ 30 FPS vs 1080p @ 60 FPS). The rolling buffer must store actual `timeMs` timestamps rather than assuming fixed frame indices.
2. **MediaPipe RunningMode Constraints**: MediaPipe `PoseLandmarker` requires explicit `runningMode: "VIDEO"` and monotonic timestamps (`detectForVideo`). Switching between image upload mode and webcam stream mode requires updating options via `setOptions({ runningMode: "VIDEO" })`.
3. **View Angle Dependencies**: Certain metrics (e.g., knee flexion angles in sagittal view vs lateral sway in frontal view) depend on camera orientation. Live webcam mode should display a real-time View Angle Indicator ("Sagittal" vs "Frontal") so clinicians understand which metrics are active.

---

## 4. Conclusion

The proposed architecture for Milestone 3 Live WebCam Real-Time Gait Capture Mode provides a complete, performant, zero-lag solution:
1. `PoseTracker.ts` manages webcam stream acquisition (`getUserMedia`), MediaPipe `VIDEO` mode lifecycle, and frame extraction.
2. `SkeletonCanvas.tsx` renders 30–60 FPS skeleton overlays with landmark confidence visual indicators, live angle labels, and One Euro landmark smoothing.
3. `RollingGaitBuffer` maintains a 10s frame window in memory, running causal real-time event detection and computing instantaneous metrics.
4. React state updates are decoupled from the 60 FPS canvas loop and throttled to 10–15 Hz to ensure zero UI lag.
5. Clicking "Freeze & Analyze" cleanly tears down the stream, passes recorded frames to `resamplePoseFrames()` and `computeGaitMetrics()`, and seamlessly transitions to the full clinical analysis report view.

---

## 5. Verification Method

1. **Regression & Build Verification**:
   - Run `npm test` to ensure existing unit tests pass cleanly.
   - Run `npx tsc --noEmit` to confirm complete TypeScript type safety across all modified interfaces (`PoseFrame`, `GaitMetrics`, `PoseLandmarkerLike`).
2. **Canvas Rendering Verification**:
   - Inspect `SkeletonCanvas.tsx` rendering to verify skeleton connections, joint angle labels, sway vector, and landmark confidence colors render cleanly without console warnings.
3. **WebCam Stream Lifecycle Verification**:
   - Test webcam stream initialization (`startWebcam`) and teardown (`stopWebcam`), ensuring camera indicator light turns off when clicking "Freeze & Analyze".
   - Confirm transition from Stage 2 live streaming mode to Stage 3/4 clinical analysis report view.
