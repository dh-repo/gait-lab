# Milestone 1 Exploration Report: Core Engine Integration & UI/Persistence Audit (Explorer 3)

**Author:** Explorer 3 (Milestone 1 — Core Engine Integration & Polish)  
**Date:** 2026-08-09  
**Target Modules:** `src/components/gait/ClinicalReportView.tsx`, `src/lib/gait/persistence.ts` & `migrations/0002_gait_sessions.sql`, `src/components/gait/SamplePicker.tsx`, `src/components/gait/GaitApp.tsx`

---

## Executive Summary

An in-depth, read-only architectural investigation was conducted across the reporting, database persistence, reference sample picker, and main app orchestration modules of `gait-lab`. 

While the individual modules demonstrate clean TypeScript code, robust mathematical derivations, and a green test suite (296/296 unit/integration tests passing), a critical **disconnected logic gap** was identified in how Joint Kinematic Trajectories (`GaitAngleAnalysis`) and Patient Metadata (`PatientMetadata`) flow through the application:
1. `GaitApp.tsx` extracts resampled 30 Hz pose frames and computes `GaitMetrics`, but **fails to invoke `computeGaitAngleAnalysis(frames, ...)`** during `runAnalysis()`.
2. Consequently, `ReportPanel.tsx`, `ClinicalReportView.tsx`, and `CognitiveClusters.tsx` fall back to calling `computeGaitAngleAnalysis([], ...)` with an **empty array `[]`**, causing all 3-point joint angle curves (Knee, Hip, Ankle) to be blank/flat and all Range of Motion (ROM) table metrics in the printable report to render as `—` (null).
3. Patient metadata (Patient ID, Clinician Notes, Assessment Date, Condition) entered in `ClinicalReportView.tsx` / `ReportPanel.tsx` is stored in isolated component state and is **never passed to `GaitApp.tsx` or saved to PostgreSQL via `persistence.ts`**, causing complete data loss upon saving or reloading sessions.

Concrete fix strategies are provided below to resolve these integration gaps cleanly.

---

## 1. Examination of `ClinicalReportView.tsx`

### Architectural Role & Features
`ClinicalReportView.tsx` (580 lines) renders the formal A4 printable clinical gait and biomechanical assessment report. Key features include:
- **Printable A4 Layout & PDF Export Flow:** Styled with `@media print` rules (`print:gap-4 print:text-black`, `no-print print:hidden`, `print-card`), allowing 1-click printing or PDF export via `window.print()`.
- **5-Domain Gait Health Radar Chart:** Uses Recharts `RadarChart`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, and `Radar` to visualize normalized 0–100 scores across:
  1. *Pace (Mobility)* (`mobilityScore`)
  2. *Symmetry* (`symmetryScore`)
  3. *Smoothness* (`automaticityScore`)
  4. *Rhythmicity* (`rhythmScore`)
  5. *Stability* (`stabilityScore`)
- **Patient & Clinician Metadata Inputs:** Interactive text, date, and textarea inputs for `patientId`, `assessmentDate`, `assessmentCondition`, and `clinicianNotes`, bound to `onUpdateMeta`.
- **Zeni Gait Phase Breakdown:** Displays Stance %, Swing %, and Double Support % derived from foot AP position relative to pelvis (Zeni et al. 2008) with view-angle suppression checks.
- **ROM Summary Table & Joint Angles Chart:** Embeds `JointAnglesChart` and renders a 5-column summary table for Knee, Hip, and Ankle Range of Motion (Peak Flexion/Extension/Dorsiflexion/Plantarflexion & Asymmetry %).
- **Key Gait Metric Ratings & 95% CIs:** Renders quantitative spatial-temporal metrics alongside 95% Confidence Intervals from split-half reliability testing.
- **Ranked Clinical Hypotheses & Evidence Board:** Lists algorithmic pattern hypotheses ranked by severity and confidence.
- **Clinician Sign-off Block:** Includes signature, date, license/NPI lines, and legal medical screening disclaimer.

### Evidence Chain & Identified Disconnected Logic
- **Location:** `ClinicalReportView.tsx` lines 58–65 & `ReportPanel.tsx` lines 16–22.
- **Verbatim Code in `ReportPanel.tsx`:**
  ```tsx
  const angleAnalysis = useMemo(() => {
    return computeGaitAngleAnalysis(
      [],
      result.metrics.stepEvents || [],
      result.metrics.viewAngle || "unknown",
    );
  }, [result]);
  ```
- **Observation:** `ReportPanel` computes `angleAnalysis` by calling `computeGaitAngleAnalysis([], ...)` passing an empty array `[]` for `frames`. In `ClinicalReportView.tsx` (lines 58–65), if `angleAnalysis` is not supplied, it also falls back to `computeGaitAngleAnalysis([], ...)`.
- **Impact:** Passing an empty array `[]` forces `computeGaitAngleAnalysis` to return null metrics (`kneeRomLeft: null`, `hipRomLeft: null`, etc.) and 101 empty points. As a result:
  - The ROM Summary Table (lines 381–423) displays `—` for every left/right peak ROM, peak flexion, peak extension, and asymmetry value.
  - The `JointAnglesChart` renders flat zero lines.
- **Metadata Propagation Gap:** `patientMeta` state is instantiated in `ReportPanel.tsx` (line 9) using a random ID. When the user edits Clinician Notes or Patient ID, `setPatientMeta` updates local component state, but `ReportPanel` provides no callback to communicate `patientMeta` back up to `GaitApp.tsx`.

---

## 2. Examination of `persistence.ts` & `migrations/0002_gait_sessions.sql`

### Architectural Role & Schema
- **Migration Schema (`migrations/0002_gait_sessions.sql`):** Defines the PostgreSQL `gait_sessions` table:
  ```sql
  CREATE TABLE IF NOT EXISTS gait_sessions (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    session_name TEXT NOT NULL DEFAULT 'Gait Session',
    task_mode TEXT NOT NULL DEFAULT 'single' CHECK (task_mode IN ('single', 'dual')),
    overall_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    stability_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    rhythm_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    symmetry_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    mobility_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    automaticity_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    cadence_spm DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    step_count INTEGER NOT NULL DEFAULT 0,
    duration_sec DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    view_angle TEXT NOT NULL DEFAULT 'unknown',
    symmetry_angle DOUBLE PRECISION,
    harmonic_ratio DOUBLE PRECISION,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    guesses_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    dual_task_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  ```
- **Server Functions (`persistence.ts`):** Implements TanStack `createServerFn` functions:
  - `saveGaitSession`: Inserts/upserts a session record using `ON CONFLICT (id) DO UPDATE SET ...`.
  - `listGaitSessions`: Retrieves all sessions for `context.userId` ordered by `created_at DESC`.
  - `getGaitSession`: Fetches a single session by `id` for `context.userId`.
  - `deleteGaitSession`: Deletes a session by `id` for `context.userId`.
- **Security & Authorization:** All server functions are wrapped with `.middleware([authMiddleware])`, guaranteeing strict multi-tenant isolation by scoping every query to `context.userId`.

### Evidence Chain & Identified Integration Gaps
- **Missing Patient Metadata Fields in Persistence:** Neither `migrations/0002_gait_sessions.sql` nor `saveGaitSession` accepts or stores `patientId`, `clinicianNotes`, `assessmentDate`, or `assessmentCondition`.
- **Missing Angle Analysis in Persistence:** `saveGaitSession` writes `metrics_json`, `guesses_json`, and `dual_task_json`, but does not serialize `angleAnalysis`.
- **Hydration Gap in `SessionHistoryDrawer.tsx`:** Lines 96–107 construct a reconstituted `AnalysisResult`:
  ```tsx
  onLoadSession({
    metrics: s.metricsJson,
    guesses: s.guessesJson,
    personId: 1,
    analyzedFrames: s.stepCount * 10,
    notes: [`Loaded from saved session: ${s.sessionName}`],
    taskMode: (s.taskMode as any) || "single",
    dualTaskCost: s.dualTaskJson,
  }, s.sessionName);
  ```
  Because `angleAnalysis` and `patientMeta` are not present in the saved payload, loading a historical session resets patient metadata to default random values and renders blank joint angle charts.

---

## 3. Examination of `SamplePicker.tsx` & Reference Video Datasets

### Architectural Role & Asset Verification
`SamplePicker.tsx` (202 lines) provides immediate clinical demo capability without requiring manual video uploads.
- **Reference Video Inventory (`SAMPLE_VIDEOS`):**
  1. `sagittal` ("Sagittal View", `/samples/sagittal-gait.mp4`, 12.0s) — Evaluates knee flexion/extension, step time CV, stance/swing %.
  2. `frontal` ("Frontal View", `/samples/frontal-gait.mp4`, 12.0s) — Evaluates lateral sway, step width, pelvic obliquity, bilateral symmetry.
  3. `follow_cam` ("Follow-Cam Tracking", `/samples/follow-cam-gait.mp4`, 12.0s) — Evaluates foot orientation vectors, direction inference, hip centering.
  4. `general` ("General Walk", `/samples/general-gait.mp4`, 23.5s; fallback `/sample-walk.mp4`) — Evaluates multi-person tracking and 6-domain normative scoring.
- **Filesystem Verification:** Confirmed all 4 MP4 files exist in `/Users/damian/GitHub/gait-lab/public/samples/`:
  - `public/samples/sagittal-gait.mp4`
  - `public/samples/frontal-gait.mp4`
  - `public/samples/follow-cam-gait.mp4`
  - `public/samples/general-gait.mp4`
  - `public/sample-walk.mp4`

### Implementation Evaluation
- **Blob Conversion Flow:** `handleLoadSample` fetches the URL via `fetch(sample.url)`, creates a `Blob`, instantiates `File([blob], sample.filename, { type: "video/mp4" })`, and invokes `onSelectSample(file)`.
- **UX & Accessibility:** Fully accessible buttons with aria labels, loading spinners (`Loader2`), clear error callouts, and feature tags.

---

## 4. Examination of `GaitApp.tsx` & Workflow Integration

### Architectural Role & Pipeline Flow
`GaitApp.tsx` (1267 lines) is the main application workstation orchestrating video processing, pose estimation, kinematics calculation, UI stage state, and database persistence.
- **4-Stage Workflow UI Architecture:**
  - **Stage 1 (Input & Sample Selection):** Task mode protocol toggle (`single` vs `dual`), video file drag-and-drop zone, file browser button, embedded `SamplePicker`.
  - **Stage 2 (Video Processing & Tracking):** MediaPipe Pose WASM landmark detection, multi-person candidate tracking (`matchPeople`, `tracksToPeople`, candidate chips, canvas overlay), subject person selection, 30 Hz uniform grid resampling (`resamplePoseFrames`).
  - **Stage 3 (Clinical Insights & Workstation):** Dual-pane workstation (~50% video canvas with frame scrubber & overlays on left, sticky clinical status bar & tabbed insights on right). Tabs: `clusters` (`CognitiveClusters`), `guesses` (`GuessesPanel`), `metrics` (`MetricsPanel`), `guide` (`GuidePanel`).
  - **Stage 4 (Export & PDF Sign-Off):** `ReportPanel` with patient metadata inputs, 5-domain radar chart, ROM summary table, joint angles chart, and PDF print export.
- **Data Engine Invocation:**
  - `computeGaitMetrics(frames)` (line 494) computes zero-phase Butterworth filtering, Zeni gait events, Zifchock symmetry angle, split-half CIs, domain scores.
  - `computeDualTaskCost(baselineSingle, metrics)` (line 497) computes Plummer & Eskes DTE and CMI classification.
  - `buildEducatedGuesses` (line 499) generates ranked clinical hypotheses.

### Evidence Chain & Identified Disconnected Logic in `GaitApp.tsx`
1. **Omission of `computeGaitAngleAnalysis`:**
   - Lines 490–521 in `GaitApp.tsx` show `runAnalysis`:
     ```tsx
     const frames = resamplePoseFrames(rawFrames, 30.0);
     const metrics = computeGaitMetrics(frames);
     let dualTaskCost = undefined;
     if (taskMode === "dual" && baselineSingle) {
       dualTaskCost = computeDualTaskCost(baselineSingle, metrics);
     }
     const guesses = buildEducatedGuesses(metrics, { taskMode, dualTaskCost });
     const analysis: AnalysisResult = {
       metrics,
       guesses,
       personId: selectedPersonId,
       analyzedFrames: frames.length,
       taskMode,
       dualTaskCost,
       notes: [...],
     };
     setResult(analysis);
     ```
   - **Root Cause:** `runAnalysis` possesses the resampled 30 Hz `frames` array, but **never calls `computeGaitAngleAnalysis(frames, metrics.stepEvents, metrics.viewAngle)`** nor stores `angleAnalysis` on `AnalysisResult`.
2. **Disconnected Downstream Rendering:**
   - Because `result.angleAnalysis` does not exist, when `GaitApp.tsx` renders `ReportPanel` (line 1198) and `CognitiveClusters` (line 1163), both components fall back to `computeGaitAngleAnalysis([], ...)`.
   - Result: Joint angle trajectory graphs remain flat and ROM tables show empty dashes.
3. **Disconnected Patient Metadata:**
   - `GaitApp.tsx` does not maintain or receive `patientMeta`.
   - `handleSaveSession` (lines 534–552) saves only `sessionName` and `result` to the database. Patient ID and Clinician Notes are not included in the payload.

---

## 5. Synthesis of Disconnected Logic & Integration Gaps

| # | Disconnected Logic / Integration Gap | Impact | Root Cause |
|---|---------------------------------------|--------|------------|
| 1 | Joint Kinematic Trajectory Disconnect | Joint angle charts in `CognitiveClusters` and `ClinicalReportView` render flat lines; ROM table shows `—` for all values. | `runAnalysis` in `GaitApp.tsx` omits `computeGaitAngleAnalysis(frames, ...)` call; `ReportPanel` and `CognitiveClusters` fall back to `computeGaitAngleAnalysis([], ...)`. |
| 2 | Patient Metadata Ephemerality & Data Loss | Patient ID, Assessment Date, Condition, and Clinician Notes edited in `ClinicalReportView` are lost on save or navigation. | `patientMeta` state is trapped in `ReportPanel.tsx` local state and not passed to `GaitApp.tsx` or `saveGaitSession`. |
| 3 | Incomplete DB Hydration in `SessionHistoryDrawer` | Loading a historical session from database renders blank joint angle charts and resets patient metadata. | `saveGaitSession` does not serialize `angleAnalysis` or `patientMeta` into `metrics_json` / DB payload; `onLoadSession` does not hydrate them. |
| 4 | Dual-Task Baseline Cross-Session Persistence | Dual-task assessment requires running a single-task walk first in the *same active browser session*. | `baselineSingle` is stored in `GaitApp.tsx` react state and reset on `resetAll`; single-task baselines are not retrieved from DB for dual-task pairing across sessions. |

---

## 6. Concrete Code Fix Strategies

### Strategy 1: Expand Types in `src/lib/gait/types.ts`
Add optional `angleAnalysis` and `patientMeta` to `AnalysisResult` and `GaitMetrics`:

```typescript
// In src/components/gait/ClinicalReportView.tsx (export PatientMetadata):
export type PatientMetadata = {
  patientId: string;
  clinicianNotes: string;
  assessmentDate: string;
  assessmentCondition: string;
};

// In src/lib/gait/types.ts:
import type { GaitAngleAnalysis } from "./angles";
import type { PatientMetadata } from "@/components/gait/ClinicalReportView";

export type AnalysisResult = {
  metrics: GaitMetrics;
  guesses: EducatedGuess[];
  personId: number;
  analyzedFrames: number;
  notes: string[];
  taskMode: TaskMode;
  dualTaskCost?: DualTaskCost;
  angleAnalysis?: GaitAngleAnalysis;
  patientMeta?: PatientMetadata;
};
```

### Strategy 2: Update `runAnalysis` in `GaitApp.tsx`
Compute `angleAnalysis` during video analysis when resampled `frames` are available:

```typescript
// In src/components/gait/GaitApp.tsx (inside runAnalysis):
const frames = resamplePoseFrames(rawFrames, 30.0);
const metrics = computeGaitMetrics(frames);
const angleAnalysis = computeGaitAngleAnalysis(
  frames,
  metrics.stepEvents || [],
  metrics.viewAngle || "unknown",
);

const analysis: AnalysisResult = {
  metrics,
  guesses,
  personId: selectedPersonId,
  analyzedFrames: frames.length,
  taskMode,
  dualTaskCost,
  angleAnalysis,
  patientMeta: patientMeta, // pass current patient metadata state
  notes: [...],
};
setResult(analysis);
```

### Strategy 3: Update `ReportPanel.tsx` & `CognitiveClusters.tsx`
Pass `result.angleAnalysis` to `ClinicalReportView` and `CognitiveClusters`:

```typescript
// In ReportPanel.tsx:
export function ReportPanel({
  result,
  patientMeta,
  onUpdateMeta,
}: {
  result: AnalysisResult;
  patientMeta?: PatientMetadata;
  onUpdateMeta?: (meta: Partial<PatientMetadata>) => void;
}) {
  const angleAnalysis = useMemo(() => {
    if (result.angleAnalysis) return result.angleAnalysis;
    return computeGaitAngleAnalysis(
      [],
      result.metrics.stepEvents || [],
      result.metrics.viewAngle || "unknown",
    );
  }, [result]);

  return (
    <ClinicalReportView
      result={result}
      patientMeta={patientMeta || { patientId: "PT-...", assessmentDate: "...", assessmentCondition: "...", clinicianNotes: "" }}
      angleAnalysis={angleAnalysis}
      onUpdateMeta={onUpdateMeta}
      onPrint={() => window.print()}
    />
  );
}
```

```typescript
// In GaitApp.tsx (Stage 3 rendering):
<CognitiveClusters
  metrics={result.metrics}
  dualTaskCost={result.dualTaskCost}
  angleAnalysis={result.angleAnalysis}
/>
```

### Strategy 4: Persist `angleAnalysis` and `patientMeta` in PostgreSQL DB
In `src/lib/gait/persistence.ts`:
Include `angleAnalysis` and `patientMeta` inside `metrics_json` when saving via `saveGaitSession`.

```typescript
// In saveGaitSession handler:
const extMetrics = {
  ...metrics,
  angleAnalysis: data.result.angleAnalysis,
  patientMeta: data.result.patientMeta,
};
```

And in `SessionHistoryDrawer.tsx`:
```typescript
onLoadSession(
  {
    metrics: s.metricsJson,
    guesses: s.guessesJson,
    personId: 1,
    analyzedFrames: s.stepCount * 10,
    notes: [`Loaded from saved session: ${s.sessionName}`],
    taskMode: (s.taskMode as any) || "single",
    dualTaskCost: s.dualTaskJson,
    angleAnalysis: (s.metricsJson as any)?.angleAnalysis,
    patientMeta: (s.metricsJson as any)?.patientMeta,
  },
  s.sessionName,
);
```

---

## Conclusion

The core engine modules in `gait-lab` are mathematically sound and well-tested. Resolving the 4 identified integration gaps via the recommended fix strategies will achieve 100% end-to-end integration across kinematic trajectory generation, clinical PDF report rendering, patient metadata management, and database persistence.
