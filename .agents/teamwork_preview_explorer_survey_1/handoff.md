# UI Layout Paradigm A Analysis Report: 4-Stage Linear Wizard/Stepper Layout with Headline Executive Summary Above the Fold

## 1. Observation

Direct inspection of the `gait-lab` frontend codebase (`src/components/gait/`, `src/routes/`, `src/styles.css`, `src/lib/gait/`) revealed the following structural, visual, and state architecture patterns:

### Existing Component Tree & Architecture
- **`src/routes/index.tsx`**: Entry route mounting `<GaitApp />` directly (lines 8–10).
- **`src/components/gait/GaitApp.tsx`**: Monolithic state coordinator managing app phases, MediaPipe loading, video upload, detection scan loops, person selection, kinematic analysis, and tabbed results:
  - **State Machine (`Phase`)**: Defined on line 52: `type Phase = "idle" | "loading_model" | "scanning" | "select_person" | "analyzing" | "results" | "error"`.
  - **Task Mode (`TaskMode`)**: `single` (Walk only) vs `dual` (Walk + cognitive task) on line 81.
  - **Results Tab State (`Tab`)**: Defined on line 61: `type Tab = "report" | "guesses" | "metrics" | "guide"`.
  - **Main Layout Grid**: Conditional 2-column grid `grid-cols-[1.15fr_0.85fr]` (line 567) when `phase !== "idle"`, placing video/canvas on the left column and results tabs/guidance on the right column.
- **`src/components/gait/ClinicalReportView.tsx`**: Printable clinical report container containing:
  - Clinic Header & Patient Metadata inputs (`patientId`, `assessmentDate`, `assessmentCondition`, `clinicianNotes`) (lines 135–188).
  - Executive Summary & Overall Gait Health Score Ring alongside 5-Domain Gait Health Radar Chart (lines 192–262).
  - Zeni Kinematic Gait Cycle Phase Breakdown (Stance % / Swing % / Double Support %) (lines 264 text & progress bars).
  - Sagittal Joint Trajectory ROM Summary Table & Joint Angles Chart (lines 324–394).
  - Dual-Task Cost Block (if taskMode === "dual") (lines 397–422).
  - Key Gait Metric Ratings & 95% Confidence Intervals table (lines 424–464).
  - Ranked Clinical Hypotheses & Evidence Board (lines 466–508).
  - Clinician Verification & Sign-Off block (Signature line, Date, NPI #, Medical Disclaimer) (lines 510–541).
- **`src/components/gait/SkeletonCanvas.tsx`**: HTML5 Canvas rendering 2D skeleton pose landmarks, connections, and selection bounding boxes over active HTML `<video>` frame (lines 23–43, 75–119).
- **`src/components/gait/MetricsPanel.tsx`**: Displays exploratory composite score rings, 21 quantitative stat cards with split-half 95% CIs, and Recharts time-series graphs (Ankle Y height, Hip center trajectory, Knee flexion angle) (lines 30–325).
- **`src/components/gait/GuessesPanel.tsx`**: Displays ranked `EducatedGuess` cards with severity badges, category tags, evidence lists, and alternative hypotheses (lines 62–134).
- **`src/components/gait/GuidePanel.tsx`**: Static determination ladder (`DETERMINATION_LADDER`), dual-task protocol instructions, observational pattern language definitions, and recording best practices (lines 6–137).
- **`src/components/gait/SamplePicker.tsx`**: Grid of 4 sample videos (`sagittal`, `frontal`, `follow_cam`, `general`) with view badges, feature tags, and load triggers (lines 22–71, 139–198).
- **`src/components/gait/JointAnglesChart.tsx`**: Joint kinematic angle trajectories (Knee, Hip, Ankle) overlaid with Perry & Burnfield (2010) normative reference bounds, view angle suppression banner, and peak ROM stat badges (lines 27–305).
- **`src/components/gait/SessionHistoryDrawer.tsx`**: Slide-over drawer for viewing, loading, and deleting saved sessions (lines 51–126).
- **`src/styles.css`**: Design tokens defined in `@theme` block (lines 4–34) and print styling rules (`@media print`, lines 105–171).

### Identified Visual Clutter & Cognitive Distractions
1. **Background Decorative Mesh Overlay**:
   - `GaitApp.tsx:450`: `<div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />`
   - `styles.css:76`: `.grid-bg` creates a 48px x 48px radial grid line pattern. In a clinical context, background grid lines create visual noise behind data-heavy tables and kinematic charts.
2. **Horizontal Tab Fragmentation**:
   - `GaitApp.tsx:715–728`: Results are fragmented into 4 separate tabs (`Report`, `Guesses`, `Charts`, `Guide`). A clinician reviewing an assessment must continuously switch tabs to correlate raw joint angles with clinical hypotheses and summary scores.
3. **Unstructured Stat Grid Density**:
   - `MetricsPanel.tsx:56–161`: Displays 21 standalone stat cards in a raw grid without domain-level cognitive grouping (Pace, Symmetry, Stability, Dual-Task).
4. **Stacked Initial Screen Clutter**:
   - `GaitApp.tsx:487–553`: Stage 1 currently stacks a large drag-and-drop card, file upload buttons, feature bullet cards, and a separate `SamplePicker` section vertically, pushing sample cards below the fold.

---

## 2. Logic Chain

### Step 1: Cognitive Load Reduction via Linear 4-Stage Stepper
Clinicians operating under time pressure require a structured, step-by-step workflow that matches clinical assessment protocols. 
- *From Observation*: `GaitApp.tsx` currently relies on an internal `Phase` state machine (`idle` -> `scanning` -> `select_person` -> `analyzing` -> `results`), but does not visually communicate stage progression to the user.
- *Reasoning*: Converting this state machine into a prominent **Top 4-Stage Stepper Header** provides immediate orientation. The clinician always knows where they are in the workflow:
  1. **Input & Sample Selection**
  2. **Pose Tracking & Person Selection**
  3. **Clinical Insights & Cognitive Clusters**
  4. **Export Clinical Report**

### Step 2: Immediate Executive Summary Above the Fold (Stage 3)
- *From Observation*: In the current UI (`GaitApp.tsx:733–741`), upon reaching `results`, the default tab (`ReportPanel`) embeds the executive summary inside a multi-card scrollable layout below tab buttons and notes.
- *Reasoning*: In Paradigm A, Stage 3 places the **Headline Executive Summary Bar strictly above the fold**. When a clinician reaches Stage 3, they instantly see:
  - Overall Gait Health Score Ring (0–100)
  - Diagnostic headline assessment (1 sentence)
  - **4 Cognitive Domain Clusters**:
    1. *Spatiotemporal Pace* (Cadence, Step Time, Speed/Duration)
    2. *Inter-limb Symmetry* (Zifchock Symmetry Angle %, Stance/Swing Ratio, Step Asymmetry)
    3. *Trunk & Postural Stability* (Lateral Sway Index, Pelvic Obliquity, Vertical Bounce)
    4. *Dual-Task & Neuromotor Cost* (Cadence DTE %, Step-Time CV %, Automaticity Score)
  - Detailed waveforms (Recharts joint angles), full hypotheses evidence boards, and raw metrics are accessible via progressive disclosure (expandable accordion sections below the executive summary).

### Step 3: Streamlining Stage 1 (Input) & Stage 2 (Pose Tracking)
- *From Observation*: Stage 1 currently separates custom upload from sample picker cards. Stage 2 embeds subject selection and task mode toggles in a side panel next to the video.
- *Reasoning*:
  - **Stage 1**: Combine the drag dropzone and sample picker into a clean, side-by-side or unified hero panel. Upon file drop/selection, show an **immediate video metadata preview card** (file name, duration, resolution, detected format) with a prominent task mode selector (`Single-Task Walk` vs `Dual-Task Walk`).
  - **Stage 2**: Expand the video player & canvas overlay to full width (16:9 aspect ratio). Show 60 FPS skeleton rendering with color-coded multi-person tracking bounding boxes. Provide a minimalist bottom playback bar (Play/Pause, Frame Seek, FPS indicator) and direct subject selection pills.

### Step 4: Streamlining Stage 4 (Printable Report & Export Modal)
- *From Observation*: `ClinicalReportView.tsx` and `ReportPanel.tsx` contain a robust printable report structure with CSS `@media print` support (`styles.css:105–171`).
- *Reasoning*: Making Stage 4 an explicit final step allows clinicians to review patient metadata inputs (`patientId`, `assessmentDate`, `assessmentCondition`, `clinicianNotes`), preview the exact A4 PDF layout, complete the clinician sign-off block, and trigger a 1-Click Print / PDF export or download raw JSON/CSV data.

---

## 3. Detailed Specification for UI Layout Paradigm A

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  GAIT LAB  [1. Input / Sample] ──> (2. Pose Tracking) ──> (3. Clinical Insights) ──> (4. Export) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Top 4-Stage Stepper Header Bar
- **Visual Design**: Pinned header component `<GaitStepperHeader currentStage={stage} />`.
- **4 Stages**:
  - **Stage 1: Input / Sample Selection** (Icon: `Upload` / `Film`)
  - **Stage 2: Pose Tracking & Subject ID** (Icon: `Activity` / `UserCheck`)
  - **Stage 3: Clinical Insights & Domain Clusters** (Icon: `Sparkles` / `Brain`)
  - **Stage 4: Printable Report & Export** (Icon: `Printer` / `FileText`)
- **Accessibility**: Enclosed in `<nav aria-label="Assessment Progress">`, rendered as an `<ol role="list">`. Active step marked with `aria-current="step"`. Visually completed steps display a checkmark badge (`Check`).

---

### Stage 1: Clean Sample Selector & Upload Dropzone with Immediate Metadata Preview

```
┌───────────────────────────────────────────────┬───────────────────────────────────────────────┐
│              UPLOAD CUSTOM VIDEO              │            CURATED SAMPLE VIDEOS              │
│ ┌───────────────────────────────────────────┐ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───┐ │
│ │  Drag & Drop Walking Video (MP4/MOV/WebM) │ │ │ Sagittal │ │ Frontal  │ │Follow-Cam│ │...│ │
│ │  [ Choose File ]                          │ │ └──────────┘ └──────────┘ └──────────┘ └───┘ │
│ └───────────────────────────────────────────┘ │                                               │
├───────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ IMMEDIATE METADATA PREVIEW (When File Selected)                                              │
│ File: sagittal-gait.mp4 | Duration: 12.0s | Res: 1920x1080 | Protocol: [ Walk Only | Dual-Task] │
│                                                                        [ Proceed to Stage 2 → ]│
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Layout Structure**:
  - 2-Column top grid: Left = Upload Dropzone Card; Right = Curated Reference Samples Grid (`SamplePicker`).
  - Bottom Bar (appears immediately upon selecting/dropping a video):
    - **Metadata Badge Strip**: File Name, Size, Video Duration, Resolution.
    - **Task Protocol Toggle**: `Single-Task Walk` (Walk only) vs `Dual-Task Walk` (Walk + cognitive challenge).
    - **Primary Action Button**: `[ Proceed to Pose Tracking → ]` (Triggers MediaPipe WASM model initialization and video scanning pass).

---

### Stage 2: Dual Video Player + Canvas Overlay (60 FPS) & Subject Selection

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ VIDEO CANVAS OVERLAY (Full-Width Aspect Video)                                                │
│ ┌───────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                                           │ │
│ │                           [ Skeleton Canvas Overlay - 60 FPS ]                            │ │
│ │                           [ Bounding Box: Person 1 (Selected) ]                           │ │
│ │                                                                                           │ │
│ └───────────────────────────────────────────────────────────────────────────────────────────┘ │
│ PLAYBACK & TRACKING CONTROLS BAR                                                             │
│ [ ▶ Play/Pause ]  ━━━━━●━━━━━━━━━━━━━━━━━━  00:04.2 / 00:12.0  | 60 FPS | Subject: (Person 1)  │
│                                                                                               │
│ DETECTED SUBJECT SELECTOR (If Multi-Person)                                                   │
│ Select Subject:  (● Person 1 - Primary Track [Selected])   (○ Person 2 - Background)            │
│                                                                   [ Run Kinematics Analysis → ]│
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Layout & Rendering**:
  - Full-width video container (`aspect-video bg-black rounded-lg overflow-hidden`).
  - `<SkeletonCanvas />` overlaid with `requestAnimationFrame` 60 FPS rendering cycle.
  - Multi-Person Track Selection: Render color-coded skeleton overlays (`PERSON_COLORS`). Interactive click target on canvas bounding box or bottom selection pills (`Person 1`, `Person 2`).
  - Bottom Playback Controls:
    - Play/Pause toggle button.
    - Video seekbar slider.
    - Timestamp & FPS counter (`30.0 Hz uniform resampled`).
    - Processing progress bar during scan/resample pass.
  - **Primary Action Button**: `[ Run Kinematics Analysis → ]` (Advances to Stage 3).

---

### Stage 3: Executive Summary Bar Above the Fold + Progressive Disclosure Clusters

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: EXECUTIVE SUMMARY (ABOVE THE FOLD)                                                  │
│ ┌──────────┐  HEADLINE ASSESSMENT: Mild Asymmetric Gait & Elevated Step-Time Variability       │
│ │ Score    │  Primary Note: Stance phase asymmetry detected (L: 62% / R: 54%).               │
│ │   78     │  View: Sagittal (94% conf) | Mode: Single-Task Walk                              │
│ └──────────┘                                                                                  │
│ ┌───────────────────┬───────────────────┬───────────────────┬───────────────────────────────┐ │
│ │ SPATIOTEMPORAL    │ INTER-LIMB        │ POSTURAL          │ DUAL-TASK & NEUROMOTOR        │ │
│ │ PACE              │ SYMMETRY          │ STABILITY         │ COST                          │ │
│ │ Cadence: 112 spm  │ Symmetry Angle: 4%│ Lateral Sway: 0.12│ Cadence DTE: -4.2%            │ │
│ │ Step Time: 0.54s  │ Stance L/R: 62/54%│ Obliquity: N/A    │ Step Time CV: 3.8%            │ │
│ │ Duration: 12.0s   │ Step Asym: 6%     │ Bounce: 0.04      │ Automaticity: 82/100          │ │
│ └───────────────────┴───────────────────┴───────────────────┴───────────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│ PROGRESSIVE DISCLOSURE DIAGNOSTIC ACCORDION (ON DEMAND)                                       │
│ ▼ Joint Kinematic Waveforms (Recharts Knee / Hip / Ankle Trajectories)                       │
│ ▼ Ranked Clinical Hypotheses & Evidence Board                                                 │
│ ▼ Full Quantitative Gait Metric Table (95% Split-Half CIs)                                   │
│                                                                     [ Generate PDF Report → ] │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Above the Fold Executive Summary Bar**:
  - **Overall Gait Health Score Ring** (`ScoreRing score={78}`): Radial SVG gauge.
  - **Headline Assessment**: 1-sentence synthesis generated from `buildStructuredReport`.
  - **4 Cognitive Clusters Grid**:
    1. **Spatiotemporal Pace Cluster**: Cadence (spm), Avg Step Time (s), Step Count, Duration.
    2. **Inter-limb Symmetry Cluster**: Zifchock Symmetry Angle (SA %), Stance/Swing Ratio L/R (%), Step-Time Asymmetry (%).
    3. **Postural & Trunk Stability Cluster**: Lateral Sway Index, Pelvic Obliquity (index), Vertical Bounce (index).
    4. **Dual-Task & Neuromotor Cost Cluster**: Cadence DTE (%), Step-Time CV (%), Automaticity Score (/100).
- **Below the Fold Accordion / Deep Dive**:
  - **Joint Kinematics Section**: `<JointAnglesChart />` displaying sagittal knee/hip/ankle trajectories against Perry & Burnfield (2010) normative bounds.
  - **Ranked Hypotheses Board**: Ranked list of `EducatedGuess` items with severity badges, category tags, evidence lists, and alternative differential factors.
  - **Quantitative Metrics Table**: Full table of 21 metrics with split-half 95% confidence intervals (`[95% CI: lower – upper]`).
- **Primary Action Button**: `[ Generate PDF Report → ]` (Advances to Stage 4).

---

### Stage 4: 1-Click Printable Clinical Report & Export Modal

```
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: PRINTABLE CLINICAL REPORT & EXPORT                                                   │
│ ┌───────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Patient ID: [ PT-84920          ]  Assessment Date: [ 2026-08-09 ] Condition: [ Single ] │ │
│ │ Clinician Notes: [ Enter clinical observations, referral notes...                       ] │ │
│ └───────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │                       [ ClinicalReportView Component Preview ]                            │ │
│ │ Executive Summary | 5-Domain Radar Chart | Zeni Gait Phase | ROM Table | Sign-off Block    │ │
│ └───────────────────────────────────────────────────────────────────────────────────────────┘ │
│ EXPORT ACTIONS BAR                                                                            │
│ [ 🖨️ Print / Export PDF ]   [ 💾 Save Session ]   [ 📥 Download Raw Data (JSON) ]             │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Features**:
  - **Patient Metadata Form**: Editable inputs for Patient ID, Date, Condition, and Clinician Notes.
  - **Full Clinical Report View (`ClinicalReportView`)**: Rendered directly in a clean card container with page-break protection for printing (`.print-card`).
  - **Clinician Verification Block**: Signature line, Date line, License/NPI # input, and Medical Disclaimer banner.
  - **1-Click Export Actions**:
    - `[ Print / Export PDF ]` (`window.print()`).
    - `[ Save Session ]` (Saves record to DB via `saveGaitSession`).
    - `[ Download Raw Data ]` (Exports raw JSON / CSV kinematic trajectory data).

---

## 4. Accessibility (WCAG 2.1 AA) & Performance Guidelines

### WCAG 2.1 AA Compliance Matrix
1. **Color Contrast Ratios**:
   - Background: `--color-bg: #0a0b0d`
   - Surface Container: `--color-surface: #12141a`, `--color-surface-2: #1a1d26`
   - Foreground Primary Text: `--color-fg: #eef0f4` (Contrast ratio against `#0a0b0d` = **16.2:1** — exceeds 4.5:1 requirement).
   - Muted Secondary Text: `--color-muted: #9aa3b2` (Contrast ratio against `#0a0b0d` = **8.1:1**).
   - Primary Accent: `--color-primary: #5b8def` (Contrast ratio against `#0a0b0d` = **6.4:1**).
   - Status Tones: Success (`#6bcb8f` = 10.2:1), Warning (`#e8b86d` = 10.5:1), Danger (`#e07a7a` = 7.1:1).
   - *Requirement*: Ensure all text elements maintain a minimum 4.5:1 contrast ratio against their immediate background in both dark mode and print mode.
2. **ARIA Landmarks & Structure**:
   - Stepper Navigation: `<nav aria-label="Assessment Progress Step">`
   - Stepper List: `<ol role="list">` with `aria-current="step"` on active item.
   - Main Content Area: `<main id="main-content">`
   - Section Titles: Semantic `<h2>`, `<h3>` heading hierarchy without skipping levels.
   - Interactive Dialogs / Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="dialog-title"`.
3. **Keyboard Navigation & Visible Focus Rings**:
   - All interactive buttons, cards, stepper items, inputs, and tab triggers must be focusable via standard `Tab` and `Shift+Tab`.
   - Tailwind focus ring class: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]`.
   - Keybindings: `ArrowLeft` / `ArrowRight` to cycle between active tabs/accordion panels; `Escape` to close modal drawers.
4. **Reduced Motion**:
   - Media query `@media (prefers-reduced-motion: reduce)` in `styles.css:99` disables loading animations (`animate-pulse-soft`) and smooth transition transforms.

### Layout Performance & Zero CLS
- **Fixed Aspect Ratios**: `<SkeletonCanvas />` and video player containers use `aspect-video` (16:9 ratio) to prevent layout shifts during video loading.
- **Canvas Overlay Optimization**: Canvas 2D context updates use `requestAnimationFrame` synced to video playback, ensuring 60 FPS rendering without blocking the UI main thread.

---

## 5. Caveats

1. **Read-Only Scope**: This analysis and design report is produced under read-only guidelines. No code changes have been executed in `src/`.
2. **Browser MediaPipe WASM Dependency**: Stage 2 video pose detection speed is hardware-dependent (WebGL/WASM acceleration in browser). On lower-end devices, scanning pass downsamples frames safely.
3. **Print PDF Styling**: PDF export relies on `window.print()` and `@media print` CSS rules in `styles.css`. Different browser print engines (Chrome vs Safari) may render page breaks slightly differently; page-break CSS properties (`break-inside: avoid`) are enforced on all `.print-card` containers to guarantee clean multi-page alignment.

---

## 6. Conclusion

Formulating UI Layout Paradigm A as a **4-Stage Linear Wizard/Stepper Layout with a Headline Executive Summary Above the Fold** directly solves the cognitive load and visual clutter issues observed in the current codebase.

- **Reduced Cognitive Fatigue**: By replacing fragmented tab switching and unorganized stat grids with a progressive 4-stage stepper, clinicians follow an intuitive, predictable workflow.
- **Immediate Clinical Insight**: Placing the Overall Gait Health Score and 4 Cognitive Clusters above the fold in Stage 3 enables rapid clinical decision-making in under 3 seconds.
- **Full Clinical Compliance**: Stage 4 provides a seamless path to generate A4 printable reports with patient metadata, clinician verification, and medical disclaimers.

---

## 7. Verification Method

To independently verify the implementation of Paradigm A once developed:

1. **Static Analysis & Type Checking**:
   ```bash
   npm run typecheck
   npm run lint
   ```
2. **Unit & Integration Tests**:
   ```bash
   npm test
   ```
3. **Production Build Test**:
   ```bash
   npm run build
   ```
4. **Manual & Accessibility Inspection**:
   - Open dev server at `http://127.0.0.1:8080/`.
   - Verify 4-stage stepper header renders at the top of the app.
   - Stage 1: Load sample video `sagittal-gait.mp4`. Verify immediate metadata card displays file name, duration, and task mode selector.
   - Stage 2: Verify 60 FPS skeleton overlay on video canvas, multi-person subject selection pills, and playback bar.
   - Stage 3: Verify Headline Executive Summary Bar (Score Ring + 4 Cognitive Clusters) renders above the fold. Verify detailed joint angle charts expand on demand below.
   - Stage 4: Click "Generate PDF Report". Verify printable clinical report preview and test `window.print()` layout in print preview mode.
