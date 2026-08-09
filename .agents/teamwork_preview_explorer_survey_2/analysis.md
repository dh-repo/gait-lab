# Comprehensive Codebase Survey & Gap Analysis for Gait-Lab

## Executive Summary

`gait-lab` is a browser-based clinical gait analysis platform built with React 19, TypeScript, Vite, TanStack Router/Start, Tailwind CSS v4, and MediaPipe Tasks Vision. The platform extracts 2D human pose landmarks from walking videos, applies digital signal processing (4th-order zero-phase Butterworth low-pass filter at $f_c = 6.0\text{ Hz}$), performs Zeni kinematic gait event detection (Heel Strike & Toe Off), computes Zifchock Symmetry Angles (SA), calculates Plummer & Eskes Dual-Task Effect (DTE) costs, generates Perry & Burnfield normative joint kinematic angle curves (Knee, Hip, Ankle over 101 normalized gait cycle points), and renders clinical report dashboards with printable PDF support.

This survey provides a full-spectrum inspection of module interfaces, data flows, UI components, database persistence, webcam feed handling, and state management gaps across the codebase to guide the upcoming implementation phase.

---

## 1. Core Gait Analysis Engine Inspection (`src/lib/gait/`)

### 1.1 Summary of Core Modules
- **`types.ts`**: Defines `GaitMetrics`, `Landmark`, `PoseFrame`, `EducatedGuess`, `DualTaskCost`, `AnalysisResult`, `ReliabilityBounds`, `TaskMode`, and `ViewAngle`.
- **`landmarks.ts`**: Defines MediaPipe POSE_CONNECTIONS (33 landmarks), `LM` indices (Hips: 23,24; Knees: 25,26; Ankles: 27,28; Heels: 29,30; Toes: 31,32), geometry utilities (`angleDeg`, `mid`, `dist`, `torsoHeight`, `boundingBox`, `hipCenter`).
- **`pose.ts`**: Handles MediaPipe `PoseLandmarker` instantiation in `"IMAGE"` mode, video metadata/decoding helpers (`waitForVideoMetadata`, `waitForVideoData`, `seekVideo`, `seekAndDetect`), frame canvas drawing, and `resamplePoseFrames` (Catmull-Rom spline cubic interpolation onto uniform 30 Hz grid).
- **`signal.ts`**: Implements 4th-order zero-phase low-pass Butterworth filter (`zeroPhaseButterworth`) cascading two 2nd-order Biquad sections ($Q_1 \approx 0.5412, Q_2 \approx 1.3066$) with boundary reflection padding.
- **`events.ts`**: Implements Zeni kinematic gait event detection algorithm (`detectGaitEventsZeni`). Extracts anterior-posterior (AP) foot displacement relative to mid-hip, computes walking direction via median toe-to-heel vector orientation, identifies extrema with topographic peak prominence ($P_{\text{min}} = \max(0.001, 0.15 \times \text{range})$), and applies parabolic 3-point subframe timestamp refinement (`refinePeakTimestamp`).
- **`symmetry.ts`**: Implements Zifchock Symmetry Angle (`symmetryAngle`) $SA = \frac{|45^\circ - \arctan(V_L / V_R)|}{90^\circ} \times 100\%$ and Gait Symmetry Index (`gaitSymmetryIndex`).
- **`angles.ts`**: Implements 2D 3-point joint angle calculations (`calculateKneeFlexion`, `calculateHipFlexion`, `calculateAnkleAngle`), Perry & Burnfield normative reference curves (`getNormativeGaitCurves`), and 101-point stride normalization (`computeGaitAngleAnalysis`).
- **`dte.ts`**: Implements standardized Dual-Task Effect (`calculateDTE`) and Plummer & Eskes (2015) Cognitive-Motor Interference (CMI) taxonomy (`mutual_interference`, `cognitive_prioritization`, `motor_prioritization`, `no_interference`).
- **`guesses.ts` & `ratings.ts`**: Constructs non-diagnostic educated hypotheses, determination ladder layers, domain ratings, and structured report metadata.
- **`analysis.ts`**: Master analysis pipeline (`computeGaitMetrics`, `detectViewAngle`, `matchPeople`, `tracksToPeople`, `computeDualTaskCost`).
- **`persistence.ts` & `persistence.server.ts`**: Database CRUD operations via TanStack Start `createServerFn` endpoints connected to Neon / PGLite Postgres.

---

### 1.2 Data Flow & Integration Gaps Identified

#### Gap A: Empty Frame Invocations in `ReportPanel.tsx` and `ClinicalReportView.tsx`
- **Location**: `src/components/gait/ReportPanel.tsx` (lines 16-22) and `src/components/gait/ClinicalReportView.tsx` (lines 58-65).
- **Code snippet in `ReportPanel.tsx`**:
  ```tsx
  const angleAnalysis = useMemo(() => {
    return computeGaitAngleAnalysis(
      [], // <--- EMPTY ARRAY PASSED FOR FRAMES
      result.metrics.stepEvents || [],
      result.metrics.viewAngle || "unknown",
    );
  }, [result]);
  ```
- **Problem**: `computeGaitAngleAnalysis` expects raw `PoseFrame[]` frames to calculate raw joint angle series (`rawKneeL`, `rawHipL`, `rawAnkleL`, etc.). When passed an empty array `[]`, `computeGaitAngleAnalysis` falls back to empty trajectories with all `JointAnglePoint` values set to `null`!
- **Impact**: `JointAnglesChart` in `ReportPanel` and `ClinicalReportView` displays empty lines or fallback curves unless `angleAnalysis` or `PoseFrame[]` / `JointAnglePoint[]` is stored directly inside `AnalysisResult` / `GaitMetrics`.
- **Remediation**:
  1. Add `angleAnalysis?: GaitAngleAnalysis` or `normalizedPoints?: JointAnglePoint[]` to `GaitMetrics` / `AnalysisResult`.
  2. Compute `angleAnalysis` during `runAnalysis` in `GaitApp.tsx` when frames are available and store it in `AnalysisResult`.
  3. Pass `result.angleAnalysis` to `ReportPanel` and `ClinicalReportView`.

#### Gap B: Inconsistent Joint ROM Calculations Between `analysis.ts` and `angles.ts`
- **Location**: `src/lib/gait/analysis.ts` (lines 333-335) vs `src/lib/gait/angles.ts` (lines 517-580).
- **Problem**: `analysis.ts` computes `kneeFlexLeft` as `range(leftKneeAngle)` over unsegmented video frames, whereas `angles.ts` computes `kneeRomLeft` from 101-point time-normalized stride cycles.
- **Remediation**: Synchronize `GaitMetrics` ROM values with `computeGaitAngleAnalysis` metrics so peak flexion, extension, dorsiflexion, plantarflexion, and ROM percentages are 100% consistent across all UI tabs.

---

## 2. Database Persistence & Session Comparison View (R2 Inspection)

### 2.1 Existing Database Architecture
- **Schema**: `migrations/0002_gait_sessions.sql` defines `gait_sessions` table:
  - `id`: TEXT PRIMARY KEY
  - `user_id`: TEXT REFERENCES "user"("id") ON DELETE CASCADE
  - `session_name`: TEXT
  - `task_mode`: TEXT ('single' | 'dual')
  - `overall_score`, `stability_score`, `rhythm_score`, `symmetry_score`, `mobility_score`, `automaticity_score`, `cadence_spm`, `step_count`, `duration_sec`, `view_angle`, `symmetry_angle`, `harmonic_ratio`
  - `metrics_json`: JSONB
  - `guesses_json`: JSONB
  - `dual_task_json`: JSONB
  - `created_at`, `updated_at`
- **Server endpoints in `persistence.ts`**:
  - `saveGaitSession`: Inserts or updates session record via `ON CONFLICT (id) DO UPDATE`.
  - `listGaitSessions`: Retrieves all sessions for authenticated user ordered by `created_at DESC`.
  - `getGaitSession`: Retrieves single session by `id`.
  - `deleteGaitSession`: Deletes session by `id`.

### 2.2 Missing Component: `SessionComparisonView.tsx`
- **Current State**: `SessionComparisonView.tsx` DOES NOT EXIST in the codebase. Currently `SessionHistoryDrawer.tsx` only allows loading a single historical session.
- **Required Architecture for `SessionComparisonView.tsx`**:
  1. **Session Picker / Selector Header**: Dropdown selectors for Session A (e.g. Baseline / Pre-Op) and Session B (e.g. Follow-Up / Post-Op / Dual-Task).
  2. **Side-by-Side Metric Comparison Table / Cards**:
     - Metric Name (Overall Score, Cadence, Symmetry Angle, Step Time CV, Stance Phase %, Double Support %, Mobility Score, Stability Score, Automaticity Score).
     - Session A Value vs Session B Value.
     - Percentage Delta ($\Delta \% = \frac{\text{Val}_B - \text{Val}_A}{\text{Val}_A} \times 100\%$).
     - Color-coded status badges: Green for positive improvement, Amber/Red for decline or increased asymmetry/variability.
  3. **Overlaid Joint Kinematic Trajectory Chart**:
     - Render overlaid Knee, Hip, and Ankle trajectories comparing Session A (solid line) vs Session B (dashed line) over the 0-100% normalized gait cycle using Recharts `ComposedChart` / `LineChart`.
  4. **Integration**:
     - Wire `SessionComparisonView.tsx` into `GaitApp.tsx` and `SessionHistoryDrawer.tsx` (add a "Compare Sessions" button in `SessionHistoryDrawer` or `WorkflowHeader`).

---

## 3. Live Webcam Streaming Mode & `PoseTracker.ts` (R3 Inspection)

### 3.1 Missing Module: `PoseTracker.ts`
- **Current State**: `PoseTracker.ts` DOES NOT EXIST. Currently pose landmarker initialization is in `src/lib/gait/pose.ts` configured for offline video file analysis with `runningMode: "IMAGE"`.
- **Required Architecture for `PoseTracker.ts`**:
  - Class or singleton module managing real-time camera stream capturing:
    ```typescript
    export class PoseTracker {
      private landmarker: PoseLandmarkerLike | null = null;
      private stream: MediaStream | null = null;
      private isRunning = false;
      private animFrameId: number | null = null;

      async startWebcam(videoEl: HTMLVideoElement, onFrame: (poseFrame: PoseFrame) => void): Promise<void>;
      stopWebcam(): void;
      processFrame(timestamp: number): void;
    }
    ```
  - Initializes MediaPipe `PoseLandmarker` with `runningMode: "VIDEO"`.
  - Uses `navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } })`.
  - Binds stream to `HTMLVideoElement` (`videoEl.srcObject = stream; videoEl.play();`).
  - Runs continuous detection loop via `requestAnimationFrame` using `landmarker.detectForVideo(videoEl, nextVideoTimestamp())`.

### 3.2 Required `GaitApp.tsx` Wire-up for Live Webcam Mode
1. **Mode Switcher in Stage 1**:
   - Add a toggle button in `GaitApp.tsx` Stage 1: "Upload Video", "Reference Samples", or "Live Webcam Mode".
2. **Live Preview & Skeleton Overlay**:
   - Render live video canvas with real-time pose skeleton (`SkeletonCanvas`) showing live frame rate, landmark tracking status, and live step detection.
3. **Capture Session Control**:
   - Add "Start Live Capture" / "Stop Capture" button.
   - Accumulate live `PoseFrame[]` buffer for 5-15 seconds.
   - Upon capture stop, pass collected frames through `resamplePoseFrames(rawFrames, 30.0)` and run `computeGaitMetrics(frames)` and `computeGaitAngleAnalysis(...)`.

---

## 4. UI Components, State Management & Canvas Rendering Audit (R4 Inspection)

### 4.1 UI Component Status
| Component | Status | Operational Notes / Gaps |
| flex | flex | flex |
| `GaitApp.tsx` | Complete scaffold | Missing Live Webcam Mode state and Session Comparison View entry point. |
| `WorkflowHeader.tsx` | Complete | 4-stage progression bar (Input, Processing, Insights, Export). |
| `SkeletonCanvas.tsx` | Complete | Renders skeleton, joint arcs, sway vector. During static preview, only last scan pose is drawn. |
| `JointAnglesChart.tsx` | Complete | Recharts chart for Knee, Hip, Ankle with Perry & Burnfield shaded normative bands. |
| `ClinicalReportView.tsx` | Complete | Printable clinical PDF layout, 5-domain radar chart, patient metadata inputs, clinician sign-off block. |
| `ReportPanel.tsx` | Partial | Recomputes `angleAnalysis` with empty frames `[]`. |
| `CognitiveClusters.tsx` | Complete | 4 expandable accordions for Spatiotemporal, Symmetry, Stability, and Dual-Task. |
| `GuessesPanel.tsx` | Complete | Educated guess cards with confidence badges and alternative explanations. |
| `MetricsPanel.tsx` | Complete | Grid of individual metric cards with 95% CIs and trajectory charts. |
| `SamplePicker.tsx` | Complete | Loads 4 sample videos (`sagittal-gait.mp4`, `frontal-gait.mp4`, `follow-cam-gait.mp4`, `general-gait.mp4`). |
| `SessionHistoryDrawer.tsx` | Complete | Lists, loads, and deletes saved DB sessions. Needs "Compare" action. |
| `SessionComparisonView.tsx` | **Missing** | Needs to be created. |
| `PoseTracker.ts` | **Missing** | Needs to be created. |

### 4.2 State Management & Video-Canvas Sync Gaps
- `GaitApp.tsx` stores `scanPoses` as the list of detected poses from the scanning pass.
- When scrubbing or playing the video in Stage 3, `SkeletonCanvas` uses `scanPoses`. If `scanPoses` only contains one frame, the skeleton does not animate smoothly during video playback.
- **Fix**: Store full frame-by-frame pose landmark map `Map<number, PoseFrame>` or `PoseFrame[]` indexed by time so `SkeletonCanvas` displays the exact pose corresponding to `currentTime`.

---

## 5. Actionable Implementation Plan

### Priority 1: Data Flow & Angle Analysis Fix
1. Update `GaitMetrics` / `AnalysisResult` in `src/lib/gait/types.ts` to include `angleAnalysis?: GaitAngleAnalysis`.
2. Compute `angleAnalysis = computeGaitAngleAnalysis(frames, metrics.stepEvents, metrics.viewAngle)` in `GaitApp.tsx` `runAnalysis` and include it in `AnalysisResult`.
3. Update `ReportPanel.tsx` and `ClinicalReportView.tsx` to use `result.angleAnalysis` so `JointAnglesChart` displays accurate trajectory curves.

### Priority 2: Create `PoseTracker.ts` & Live Webcam Mode
1. Create `src/lib/gait/PoseTracker.ts` supporting `runningMode: "VIDEO"`, `getUserMedia`, and `detectForVideo`.
2. Update `GaitApp.tsx` Stage 1 to support "Live Webcam Streaming Mode".
3. Provide live webcam preview canvas, record button, frame buffer collection, and transition to analysis.

### Priority 3: Create `SessionComparisonView.tsx`
1. Create `src/components/gait/SessionComparisonView.tsx`.
2. Implement Session A vs Session B selection, side-by-side metric comparison cards with $\Delta\%$ badges, and overlaid joint angle trajectory curves.
3. Wire `SessionComparisonView.tsx` into `GaitApp.tsx` and `SessionHistoryDrawer.tsx`.

### Priority 4: Test Suite Verification & Clean Build
1. Update test suite (`npm test`) covering `PoseTracker.ts`, `SessionComparisonView.tsx`, and joint angle data flow.
2. Verify 0 TypeScript errors (`npm run typecheck`), 0 ESLint warnings (`npm run lint`), and clean production build (`npm run build`).

---
