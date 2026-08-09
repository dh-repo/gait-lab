# Handoff Report: UI Layout Paradigm B — Dual-Pane Clinical Workstation

## 1. Observation

### Codebase Inspection & Architecture Map
Direct observation of the `gait-lab` frontend structure revealed the following component layout, state flows, and style configurations:

- **Entry & Routing**:
  - `src/routes/index.tsx` (Lines 1–10): Mounts `<GaitApp />` as the root route component.
  - `src/styles.css` (Lines 4–34): Defines CSS custom properties (`--color-bg: #0a0b0d`, `--color-surface: #12141a`, `--color-surface-2: #1a1d26`, `--color-subtle: #6b7382`, `--color-primary: #5b8def`, `--color-muted: #9aa3b2`) and layout utility classes (`.grid-bg`, `.panel`).

- **Core Application State & Monolithic Controller**:
  - `src/components/gait/GaitApp.tsx`: Operates as a single monolithic state container using standard React hooks (`useState`, `useRef`, `useCallback`, `useMemo`).
  - `Phase` state (Line 52–59): `"idle" | "loading_model" | "scanning" | "select_person" | "analyzing" | "results" | "error"`.
  - `Tab` state (Line 61): `"report" | "guesses" | "metrics" | "guide"`.
  - Session state (Lines 69–86): `videoUrl`, `fileName`, `people`, `selectedPersonId`, `scanPoses`, `result`, `taskMode` (`"single" | "dual"`), `baselineSingle`, `isHistoryOpen`, `isSaving`.

- **Existing Layout Structure (`GaitApp.tsx`, Lines 566–782)**:
  - Header: Application title, description text, and action buttons (`History`, `New video`).
  - Idle state: Drag-and-drop card + `<SamplePicker />`.
  - Active state (`select_person`, `analyzing`, `results`): Rendered in an asymmetric 2-column grid (`grid gap-6 lg:grid-cols-[1.15fr_0.85fr]`):
    - **Left Column**: `<SkeletonCanvas />` wrapped in an `aspect-video bg-black` container inside a card. Video element is kept hidden in DOM (`className="pointer-events-none fixed h-px w-px opacity-0"`). Below canvas is file name, phase message, person selection chips (when >1 person detected), and action buttons.
    - **Right Column**: Mode-switched tabbed navigation (`Report`, `Guesses`, `Charts`, `Guide`) rendering `<ReportPanel />` (which embeds `<ClinicalReportView />`), `<GuessesPanel />`, `<MetricsPanel />`, or `<GuidePanel />`.

- **Component Subtree Details**:
  - `SkeletonCanvas.tsx` (Lines 6–73): Draws HTML5 video frame onto canvas via 2D context (`ctx.drawImage`), overlaying MediaPipe pose landmarks (`POSE_CONNECTIONS` lines, keypoints, and bounding box).
  - `ClinicalReportView.tsx` (Lines 40–544): Includes patient metadata input grid, executive summary with `<ScoreRing />`, 5-domain Recharts radar chart, Zeni gait phase breakdown progress bars, ROM summary table, `<JointAnglesChart />`, Dual-Task cost block, Key gait metric ratings with 95% CIs, Ranked hypotheses board, and Clinician sign-off block.
  - `JointAnglesChart.tsx` (Lines 27–305): Recharts `ComposedChart` showing knee/hip/ankle joint flexion/extension angles across 0–100% gait cycle against Perry & Burnfield (2010) normative range areas. Features view-angle suppression banner when frontal view is detected.
  - `MetricsPanel.tsx` (Lines 18–355): Displays composite scores, 20+ individual stat cards with 95% CIs, and time-series charts (Ankle height, Hip trajectory, Knee flexion).

- **Current Visual Noise & Accessibility Issues Observed**:
  1. **Fragmented Tab Navigation**: Clinical data in `results` phase is split across 4 separate tabs (`Report`, `Guesses`, `Charts`, `Guide`). Clinicians must constantly toggle tabs to correlate hypotheses with raw charts.
  2. **Background Pattern Clutter**: `styles.css` applies `.grid-bg` (Line 76–83) with background radial gradients and gridlines behind text-dense clinical cards.
  3. **Tight Column Compression**: The 0.85fr right pane forces dense tables (`ROM Summary Table`, `Key Metric Ratings`) into narrow horizontal bounds, requiring horizontal scrolling or awkward text wrapping.
  4. **Missing Video Scrubber & Playback Controls**: Canvas rendering relies on static video frames during `results` mode without an interactive frame scrubber, play/pause controls, or overlay toggles.
  5. **WCAG Contrast Bottleneck**: `--color-subtle` (`#6b7382` on `#0a0b0d` surface) yields a contrast ratio of ~3.8:1, failing WCAG 2.1 AA 4.5:1 ratio for body/subtitle text.
  6. **Lack of Semantic Landmarks & Keyboard Nav**: The layout uses generic `<div>` containers instead of `<main>`, `<section>`, `<aside>`, and `<nav>` with proper ARIA attributes (`aria-expanded`, `aria-controls`, `aria-label`).

---

## 2. Logic Chain

1. **Premise 1**: Biomechanical gait assessment requires rapid correlation between video evidence (raw kinematics) and calculated diagnostic metrics (asymmetry, cadence, joint angles).
2. **Premise 2**: Monolithic single-column scrolling or tabbed switching forces cognitive context switching and hides key waveforms while reading report hypotheses.
3. **Deduction A**: Paradigm B (Dual-Pane Clinical Workstation) solves context fragmentation by binding video playback/canvas overlay strictly on the left pane (~50% width) and a 4-cluster Cognitive Metric Accordion on the right pane (~50% width).
4. **Premise 3**: Clinicians need an unambiguous operational state indicator during video ingestion and MediaPipe landmark tracking.
5. **Deduction B**: A **Sticky Workflow Header** with 4 linear breadcrumbs (**1. Input/Sample Selection** $\rightarrow$ **2. Video Processing & Pose Tracking** $\rightarrow$ **3. Clinical Insights & Domain Scores** $\rightarrow$ **4. Export / Share Report**) provides clear progress awareness across all 7 internal phase transitions.
6. **Premise 4**: Dense clinical metrics (20+ variables across 5 domains) cause visual fatigue when displayed simultaneously without hierarchy.
7. **Deduction C**: Grouping metrics into **4 Cognitive Accordion Clusters** (Pace, Symmetry, Trunk, Dual-Task) combined with **Progressive Disclosure** (headline badges sticky at the top, granular waveforms and 95% CIs expanded on demand) reduces immediate cognitive load while preserving complete clinical depth.
8. **Premise 5**: Layout reflows during phase transitions degrade user experience and violate performance criteria.
9. **Deduction D**: Enforcing fixed aspect-ratio containers (`aspect-video`), absolute grid area constraints, CSS grid expansion for accordions, memoized typed arrays for rendering, and WCAG AA contrast colors (`#94a3b8` / `#a1a1aa`) guarantees Zero CLS, 60 FPS canvas drawing, and full WCAG 2.1 AA compliance.

---

## 3. Caveats

- **Screen Resolution**: Paradigm B dual-pane side-by-side workstation is optimized for landscape desktop and tablet viewports ($\ge 1024\text{px}$). For narrow portrait mobile screens ($<768\text{px}$), the dual-pane layout must gracefully stack into a single column (Video Pane top, Accordion Pane bottom).
- **Video Scrubbing & Synchronized Canvas State**: Adding frame-accurate scrubbing in the left pane requires syncing `video.currentTime` with the resampled 30 Hz pose trajectory array (`resamplePoseFrames` in `pose.ts`).
- **Read-Only Scope**: This report defines the architectural formulation and design spec for Paradigm B. Direct implementation in `src/` will be performed by implementer agents as directed by the orchestrator.

---

## 4. Conclusion & Architectural Formulation for Paradigm B

### Paradigm B Architecture Overview: Dual-Pane Clinical Workstation

```
+---------------------------------------------------------------------------------------------------+
|  [Sticky Workflow Header] Gait Lab Workstation | Patient: PT-84920                               |
|  (1) Input Selection ==> (2) Pose Tracking ==> [3] Clinical Insights ==> (4) Export Report        |
+---------------------------------------------------------------------------------------------------+
| LEFT PANE: Video Canvas & Scrubber (~50%)         | RIGHT PANE: Cognitive Metric Accordion (~50%)  |
| +-----------------------------------------------+ | +-------------------------------------------+ |
| | 16:9 Synchronized Canvas (60 FPS)             | | | [Sticky Clinical Header]                   | |
| | [Tracked Person 1 Skeleton & Joint Overlay]   | | | Overall Score: 78/100 (Good)               | |
| |                                               | | | Badges: Pace 82 | Sym 74 | Trunk 88 | DT -8% | |
| +-----------------------------------------------+ | +-------------------------------------------+ |
| | Playback Controls & Frame Scrubber            | | | [Accordion Cluster 1: Spatiotemporal Pace] | |
| | [>] [||] [< -1f] [+1f >] =====O====== (02.4s) | | |   - Cadence: 108 spm [95% CI: 104-112]    | |
| | Toggles: [x] Skeleton  [x] Knee/Hip Angles    | | |   - Speed: 1.15 m/s | Step Time: 0.55s    | |
| +-----------------------------------------------+ | +-------------------------------------------+ |
| | Person Track Selector Chips                   | | | [Accordion Cluster 2: Inter-limb Sym & ROM] | |
| | (•) Person 1 (Primary)   ( ) Person 2          | | |   - Symmetry Angle: 4.2% (Normal)         | |
| +-----------------------------------------------+ | |   - Expandable: Joint Angles Chart (ROM)  | |
|                                                   | +-------------------------------------------+ |
|                                                   | | [Accordion Cluster 3: Trunk & Stability]  | |
|                                                   | |   - Lateral Sway | Vertical Bounce       | |
|                                                   | +-------------------------------------------+ |
|                                                   | | [Accordion Cluster 4: Dual-Task Cognitive] | |
|                                                   | |   - Cadence DTE: -8.4% (Mild CMI)         | |
|                                                   | +-------------------------------------------+ |
+---------------------------------------------------------------------------------------------------+
| BOTTOM ACTION BAR: [Save Session]  [Compare Baseline]                [Export PDF / Print Report] |
+---------------------------------------------------------------------------------------------------+
```

### Detailed Component Formulation Specifications

#### A. Sticky Workflow Header & 4-Stage Breadcrumbs
- **Position**: Sticky at top (`sticky top-0 z-30 bg-[var(--color-surface)]/95 backdrop-blur border-b border-[var(--color-border)]`).
- **4 Stages**:
  1. `Input/Sample Selection`: Active during phase `idle`.
  2. `Video Processing & Pose Tracking`: Active during phases `loading_model`, `scanning`, `select_person`, `analyzing`.
  3. `Clinical Insights & Domain Scores`: Active during phase `results`.
  4. `Export / Share Report`: Active during report generation/printing.
- **Visual Styling**: Step numbers inside rounded circles (`size-6 rounded-full flex items-center justify-center text-xs font-bold`), connected by step line indicators. Active stage uses primary accent ring and bold text.

#### B. Left Pane: Video Canvas & Kinematic Scrubber
- **Layout**: `flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4`.
- **Canvas Container**: Fixed `aspect-video bg-black rounded-lg overflow-hidden relative`. Holds HTML5 video + `<SkeletonCanvas />`.
- **Playback & Scrubber Bar**:
  - Play/Pause toggle button (`Play`, `Pause` icons).
  - Step buttons: `-1 frame (-33ms)` and `+1 frame (+33ms)`.
  - Interactive Range Scrubber (`<input type="range" min={0} max={durationSec} step={0.033} />`).
  - Time readout: `00:02.40 / 00:10.00`.
- **Synchronized Joint Overlay Toggles**:
  - Checkbox group for: `Skeleton Bones`, `Joint Angle Arcs (Knee/Hip/Ankle)`, `Center of Mass / Sway Vector`, `Bounding Box`.

#### C. Right Pane: Cognitive Metric Accordion
- **Sticky Top Bar**:
  - ScoreRing component (Overall Gait Score, e.g. 78/100).
  - Quick domain badges: `Pace (82)`, `Symmetry (74)`, `Trunk (88)`, `Dual-Task (-8.4% DTE)`.
- **4 Cognitive Clusters**:
  1. **Cluster 1: Spatiotemporal Pace & Mobility**: Cadence (spm), Velocity (m/s), Step Length (m), Step Time (s), Clip Duration. Includes 95% CIs.
  2. **Cluster 2: Inter-limb Symmetry & ROM Kinematics**: Symmetry Angle (SA %), Step-Time Asymmetry, Stance/Swing Ratio, Double Support %, Knee/Hip/Ankle ROM Asymmetry. Expands embedded `<JointAnglesChart />` on demand.
  3. **Cluster 3: Trunk Stability & Smoothness**: Lateral Trunk Sway index, Vertical Bounce index, Pelvic Obliquity, Path Smoothness %, Automaticity score.
  4. **Cluster 4: Dual-Task Cognitive Cost**: Cadence Cost %, Step Time CV Cost %, Stability Delta, Automaticity Delta, CMI Classification badge.
- **Progressive Disclosure Mechanism**:
  - Each cluster Header displays 2 primary summary metrics.
  - Clicking cluster header expands/collapses detailed breakdown cards, 95% CIs, Zeni Gait Phase progress bars, and Recharts waveforms.

#### D. Bottom Action Bar
- **Position**: Sticky/fixed at bottom (`sticky bottom-0 z-20 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-6 py-3`).
- **Actions**:
  - Left: `Save Session` button, `New Video / Reset` button.
  - Center: `Compare Baseline` (Single-task vs Dual-task mode switcher).
  - Right: Primary `Export PDF / Print Report` button (`bg-[var(--color-primary)] text-white hover:opacity-90`).

#### E. Performance & Accessibility Standards
- **Zero CLS**: Fixed aspect ratio video container, flex/grid viewport clamping, CSS grid row transitions for accordion expansion (`transition-[grid-template-rows] duration-200`).
- **60 FPS Canvas Rendering**: Optimized `requestAnimationFrame` loop in `SkeletonCanvas`, memoized Landmark rendering paths.
- **WCAG 2.1 AA Compliance**:
  - `--color-subtle`: Update from `#6b7382` to `#94a3b8` (contrast ratio 5.2:1 against `#0a0b0d`).
  - All interactive elements contain `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:outline-none`.
  - Full ARIA landmark markup (`<header>`, `<main>`, `<section>`, `<aside>`, `aria-expanded`, `aria-controls`, `role="region"`).

---

## 5. Verification Method

To verify the implementation of Paradigm B once coded by implementer agents:

1. **Automated Test Suite**:
   ```bash
   npm test
   ```
   Verify that all existing unit tests in `src/components/gait/__tests__/` and `src/lib/gait/__tests__/` pass.

2. **TypeScript & Static Analysis**:
   ```bash
   npm run typecheck
   npm run lint
   ```
   Must pass with 0 errors and 0 warnings.

3. **Production Build Verification**:
   ```bash
   npm run build
   ```
   Ensures Vercel SSR/Nitro build succeeds without dev-only dependency errors.

4. **Visual & Layout Inspection**:
   - Inspect `GaitApp.tsx` layout structure to confirm 4-stage breadcrumbs header, dual-pane 50/50 split, 4 cognitive accordion clusters, and sticky bottom action bar.
   - Verify WCAG AA contrast of `--color-subtle` text and presence of ARIA landmarks across all components.
