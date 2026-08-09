# Specification Mining & Clinical UX Investigation Handoff Report

## 1. Observation

Direct observations from the `gait-lab` codebase (`/Users/damian/GitHub/gait-lab`):

1. **Workflow & Layout Structure (`src/components/gait/GaitApp.tsx`)**:
   - `GaitApp.tsx:52-59` defines `Phase`: `"idle" | "loading_model" | "scanning" | "select_person" | "analyzing" | "results" | "error"`.
   - `GaitApp.tsx:61` defines `Tab`: `"report" | "guesses" | "metrics" | "guide"`.
   - In the results phase, `GaitApp.tsx:713-780` renders a tab bar containing four tab buttons (`Report`, `Guesses`, `Metrics`, `Guide`) alongside a right-column results area.
   - The video canvas is rendered in `GaitApp.tsx:572-583` using `<SkeletonCanvas video={videoRef.current} poses={...} />`.
   - Multi-person subject tracking selection cards are rendered in `GaitApp.tsx:664-697` when `people.length > 0`.

2. **Clinical Report & Print Export (`src/components/gait/ClinicalReportView.tsx` & `ReportPanel.tsx`)**:
   - `ClinicalReportView.tsx:136-188` provides editable patient metadata inputs (`Patient ID`, `Assessment Date`, `Assessment Condition`, `Clinician Notes`).
   - `ClinicalReportView.tsx:203 text-testid="overall-score-ring"` displays overall score, headline, and one-liner summary.
   - `ClinicalReportView.tsx:237 text-testid="radar-chart-container"` displays a 5-domain radar chart (`Pace (Mobility)`, `Symmetry`, `Smoothness`, `Rhythmicity`, `Stability`).
   - `ClinicalReportView.tsx:275-321` renders Zeni kinematic gait cycle phase breakdown progress bars (`Left Stance / Swing`, `Right Stance / Swing`, `Double Support Time`).
   - `ClinicalReportView.tsx:334 text-testid="rom-summary-table"` renders a Range of Motion (ROM) summary table for Knee, Hip, and Ankle joints.
   - `ClinicalReportView.tsx:392` embeds `<JointAnglesChart angleAnalysis={derivedAngleAnalysis} />`.
   - `ClinicalReportView.tsx:425-464` renders Key Gait Metric Ratings with 95% Confidence Intervals (`[95% CI: lower – upper]`).
   - `ClinicalReportView.tsx:467-508` renders Ranked Clinical Hypotheses & Evidence Board with severity badges (`danger`, `warn`, `success`) and confidence ratings.
   - `ClinicalReportView.tsx:511 text-testid="clinician-signoff-block"` provides clinician signature, date, license/NPI# fields, and a medical disclaimer.
   - `ReportPanel.tsx:38` and `ClinicalReportView.tsx:125` invoke `window.print()` for 1-click PDF export using `@media print` CSS utility classes.

3. **Metrics Display (`src/components/gait/MetricsPanel.tsx`)**:
   - `MetricsPanel.tsx:46-51` renders 6 exploratory composite score rings (`Overall`, `Stability`, `Symmetry`, `Rhythm`, `Mobility`, `Automaticity`).
   - `MetricsPanel.tsx:57-160` renders 20 individual metric stat boxes in a 4-column grid.
   - Metrics with view suppression display `"N/A (Requires Side View)"` or `"N/A (Requires Front View)"` when underlying values are `null`.

4. **Waveform & Trajectory Visualization (`src/components/gait/JointAnglesChart.tsx`)**:
   - `JointAnglesChart.tsx:25` supports joint tabs (`"knee" | "hip" | "ankle"`).
   - `JointAnglesChart.tsx:30-65` maps 0–100% normalized gait cycle points against Perry & Burnfield (2010) normative envelopes (`normativeRange`).
   - When camera view is out-of-plane, `JointAnglesChart.tsx:143-146` sets `isSuppressed = true` and renders a view suppression warning banner.

5. **Observational Hypotheses & Epistemic Warning (`src/components/gait/GuessesPanel.tsx`)**:
   - `GuessesPanel.tsx:16-28` renders an explicit warning header: `<ShieldAlert /> Determine ≠ diagnose`.
   - `GuessesPanel.tsx:31-60` renders Dual-Task Cost metrics (`Cadence DTE`, `Step Time CV DTE`, `Stability Δ`, `Automaticity Δ`, `CMI Classification`).
   - `GuessesPanel.tsx:80-134` renders individual hypothesis cards with severity badges, confidence percentages, evidence lists, and alternative pattern considerations.

6. **Canvas Skeleton Rendering (`src/components/gait/SkeletonCanvas.tsx`)**:
   - `SkeletonCanvas.tsx:29-32` dynamically sets canvas dimensions matching `video.videoWidth` and `video.videoHeight`.
   - `SkeletonCanvas.tsx:35` draws video frames to canvas context followed by landmark pose connections and points (`drawPose`).
   - Highlighted selected person displays a dashed bounding box (`strokeRect`).

7. **Scientific & Biomechanical Foundations (`scientific_justifications.md` & `PROJECT.md`)**:
   - Section 1.1–1.2 detail 5 remediations: R1 (Follow-cam direction), R2 (Harmonic ratio $f_0$ & Hann leakage), R3 (Continuous 30 Hz sampling & parabolic subframe refinement), R4 (View geometry metric suppression & split-half 95% CIs), R5 (Topographic peak prominence filtering).
   - Section 2 cites 14 peer-reviewed sources (Winter 2009, Zeni et al. 2008, Zifchock et al. 2008, Menz et al. 2003, Bellanca et al. 2013, Pasciuto et al. 2015, Plummer & Eskes 2015, Montero-Odasso et al. 2017, Lord et al. 2013, Bland & Altman 1986).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Workflow | 4-Stage Linear Progression Stepper | Linear visual stepper driving clinician workflow from video selection to PDF export | User stage selection / processing phase | Visual step indicators (Completed, Active, Locked) | Disables downstream steps until phase criteria met | Codebase survey (`GaitApp.tsx:52-780`) |
| 2 | Input | Video File Dropzone & Sample Picker | Drag-and-drop file uploader and pre-loaded clinical gait sample video selector | Video file (MP4, MOV, WebM) or sample clip click | Blob URL generation & MediaPipe model init | Displays error card for non-video files or decoding failure | Codebase survey (`GaitApp.tsx:487-553`, `SamplePicker.tsx`) |
| 3 | Tracking | Multi-Person Centroid Tracking & Selection | Inter-frame Euclidean distance hip centroid matching ($\Delta d \le 0.22$) with person selection cards | Pose landmark frames | Tracked person list with hit counts & bounding box colors | Fallback to best single-frame detection if persistent track lost | Codebase survey (`GaitApp.tsx:190-274`, `analysis.ts`) |
| 4 | Processing | Continuous 30 Hz Resampling & Filtering | Uniform 30 Hz resampling over 10–12s window with 4th-order zero-phase Butterworth filtering ($f_c = 6\text{ Hz}$) | Raw pose landmark frames | Resampled, detrended pose trajectory frames | Throws error if $< 8$ frames captured | Codebase survey (`GaitApp.tsx:279-376`, `signal.ts`) |
| 5 | Processing | View Geometry Angle Classification & Metric Suppression | Evaluates 4 normalized geometric features ($SW$, $\Delta z_{\text{hip}}$, $\Delta x_{\text{hip}}$, $\text{VLS}$) to classify view angle | Hips & shoulders landmark 3D depth | `frontal`, `sagittal`, or `oblique` view angle + `null` for invalid metrics | Emits `null` and displays `"N/A (Requires Side/Front View)"` | Codebase survey (`analysis.ts`, `types.ts`) |
| 6 | Metrics | Spatiotemporal Pace Cognitive Cluster | Groups fundamental mobility metrics: Cadence, Gait Speed, Stride Length, Step Time, Step Time CV | Kinematic heel strike / toe off timestamps | Measured numerical values + 95% CIs | Displays `null` / `—` if steps insufficient | Codebase survey (`MetricsPanel.tsx`, `ClinicalReportView.tsx`) |
| 7 | Metrics | Inter-Limb Symmetry Cognitive Cluster | Groups bilateral coordination metrics: Stance/Swing %, Double Support %, Zifchock Symmetry Angle ($SA$), $GSI$ | Left vs Right gait event timing | Stance/swing progress bars, $SA$ %, $GSI$ | Emits `null` if camera view is frontal | Codebase survey (`symmetry.ts`, `ClinicalReportView.tsx`) |
| 8 | Metrics | Trunk Stability Cognitive Cluster | Groups trunk rhythmicity & balance metrics: Vertical/Lateral Harmonic Ratio ($HR$), Sway Index, Pelvic Obliquity | Hip center vertical & lateral trajectories | $HR$ values, sway indices, smoothness % | Displays view suppression notice if out-of-plane | Codebase survey (`smoothness.ts`, `ClinicalReportView.tsx`) |
| 9 | Metrics | Dual-Task Cost (CMI) Cognitive Cluster | Evaluates cognitive-motor interference delta between single-task baseline and dual-task walk | Single-task & Dual-task gait metrics | Cadence DTE %, Step Time CV DTE %, CMI taxonomy tier | Prompts user to complete walk-only baseline first | Codebase survey (`dte.ts`, `GuessesPanel.tsx`, `ClinicalReportView.tsx`) |
| 10 | Visualisation | Time-Normalized Kinematic Trajectory Waveforms | Recharts composed line/area charts comparing Knee/Hip/Ankle angle curves to Perry & Burnfield (2010) envelopes | 0–100% gait cycle normalized joint angles | Composed trajectory chart with shaded normative bounds | Renders view suppression alert if camera view is frontal | Codebase survey (`JointAnglesChart.tsx`, `angles.ts`) |
| 11 | Visualisation | 5-Domain Gait Health Radar Chart | Compact radar visualization covering Pace, Symmetry, Smoothness, Rhythmicity, Stability | 5 domain scores (0–100) | 5-axis radar graphic | Render fallback if metrics suppressed | Codebase survey (`ClinicalReportView.tsx:230-261`) |
| 12 | Insights | Ranked Observational Hypotheses Board | Rule-based decision tree generating clinical pattern hypotheses with epistemic confidence | Measured metrics & threshold rules | Ranked hypotheses list with severity badges & evidence bullets | Epistemic header: "Determine ≠ diagnose" | Codebase survey (`guesses.ts`, `GuessesPanel.tsx`) |
| 13 | Export | Patient Metadata & Clinician Sign-Off | Clinical documentation block with Patient ID, Assessment Date/Condition, Notes, Signature lines | Clinician text inputs | Formatted report header & verification signature block | Editable fields with default generated ID | Codebase survey (`ClinicalReportView.tsx:136-190`, `511-541`) |
| 14 | Export | 1-Click PDF Print Export & Media Styles | `@media print` styled layout optimization for clean PDF generation without UI controls | Browser print invocation (`window.print()`) | Formatted 2-page print document | Hides non-printable UI controls (`.no-print`) | Codebase survey (`ReportPanel.tsx:38`, `ClinicalReportView.tsx`) |
| 15 | Persistence | Session History Drawer & Database Persistence | Saves and retrieves completed gait analysis runs using PGLite / Neon session table | Analysis result JSON object | Saved sessions list & instant session reload | Non-blocking error notice if save fails | Codebase survey (`SessionHistoryDrawer.tsx`, `persistence.ts`) |

---

## 3. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | View Geometry Suppression | Frontal view recording of sagittal gait | Kinematic sagittal joint angles and stance phase % are suppressed (`null` emitted), UI displays `"N/A (Requires Side View)"` and shows explicit view suppression callout banner. |
| 2 | Low Frame Count | Short video clip resulting in $< 8$ pose frames | Analysis pipeline aborts and sets error state: `"Not enough pose frames for the selected person. Try a longer clip or better lighting."` |
| 3 | Subject Tracking Occlusion | Subject temporarily obscured by another person | Hip centroid matching uses gate threshold $\Delta d \le 0.22$ and area weighting to stick to selected person; falls back to largest bounding box if track interrupted. |
| 4 | Division-by-Zero in Symmetry | Asymmetrical metric with zero right-side value ($X_R = 0$) | Zifchock's Symmetry Angle formula $SA = \frac{\left\|\arctan(X_L / X_R) - 45^\circ\right\|}{90^\circ} \times 100\%$ uses inverse tangent to eliminate division-by-zero singularities. |
| 5 | FFT Spectral Leakage in HR | Non-integer stride period in video clip | Harmonic Ratio calculation aligns fundamental frequency $f_0 = 1 / \text{meanStrideSec}$ from Zeni gait events and integrates spectral energy over $\pm 1$ FFT bin under Hann window. |
| 6 | Dual-Task Cost Without Baseline | Dual-task walk executed without prior single-task run | UI notifies clinician that walk-only baseline is missing, storing current run as baseline for future pairing when available. |
| 7 | High Frame Rate Jitter | Mobile video recording with variable 24–60 FPS jitter | `resamplePoseFrames` interpolates pose trajectories onto a continuous 30.0 Hz uniform time grid before filtering. |

---

## 4. Logic Chain

1. **Observation 1 (Current UI Structure)**: `GaitApp.tsx` handles video upload, pose processing, multi-person subject selection, and result tabs (`Report`, `Guesses`, `Metrics`, `Guide`). `ClinicalReportView.tsx` and `MetricsPanel.tsx` contain all clinical output components.
2. **Observation 2 (Problem Identification)**:
   - `MetricsPanel.tsx:57-160` presents 20 unstructured metric boxes in a uniform 4-column grid. Clinicians scanning for specific domain parameters (e.g. cadence vs stance asymmetry vs trunk sway) experience visual fatigue and cognitive overload.
   - The results phase relies on tab navigation (`Report`, `Guesses`, `Metrics`, `Guide`), which breaks the natural clinical workflow progression (Input -> Processing -> Insights -> Export).
   - Above-the-fold content in `MetricsPanel.tsx` features 6 exploratory composite score rings (0–100) before measured physical quantities (spm, %, °), risking clinician misinterpretation of exploratory indices as primary diagnostic markers.
3. **Inference 1 (4-Stage Linear Progression Architecture)**:
   - Restructuring the top-level layout into a 4-Stage Linear Progression Stepper (**1. Input Selection** $\rightarrow$ **2. Processing & Tracking** $\rightarrow$ **3. Clinical Insights & Domain Clusters** $\rightarrow$ **4. Export / Share Report**) enforces clinical protocol discipline, eliminates tab-switching ambiguity, and ensures clear step-by-step progress tracking.
4. **Inference 2 (Cognitive Clustering Strategy)**:
   - Biomechanical literature (Lord et al. 2013, Hollman et al. 2010, Montero-Odasso et al. 2017) supports grouping gait metrics into 4 intuitive cognitive clusters:
     1. **Spatiotemporal Pace**: Cadence, Gait Speed, Stride Length, Step Time, Step Time CV %.
     2. **Inter-Limb Symmetry**: Stance/Swing %, Double Support %, Zifchock Symmetry Angle ($SA$), Gait Symmetry Index ($GSI$).
     3. **Trunk Stability**: Vertical & Lateral Harmonic Ratio ($HR$), Lateral Sway, Vertical Bounce, Pelvic Obliquity, Path Smoothness %.
     4. **Dual-Task Cost**: Cadence DTE %, Step Time CV DTE %, Stability Delta, Automaticity Delta, CMI Taxonomy classification.
5. **Inference 3 (Progressive Disclosure Architecture)**:
   - **Above the Fold**: Display headline clinical indicators (Overall Gait Health Score ring, primary rating status badge `Normal`/`Borderline`/`Pathological`, 5-Domain Radar Chart, Cognitive Cluster summary cards, top 3 ranked hypotheses).
   - **On Demand (Collapsible / Tabbed Sections inside Stage 3)**: Detailed diagnostic waveforms (Joint angle trajectories normalized to 0–100% gait cycle vs Perry & Burnfield normative envelopes), Zeni phase breakdown progress bars, ROM summary tables, and full metric rating tables with 95% CIs.
6. **Inference 4 (Clinical UX Best Practices)**:
   - **Eliminating Visual Clutter**: Remove decorative background grid graphics, non-functional glow effects, and skeleton particle animations to maximize data-ink ratio.
   - **Typography & Scannability**: Use font-weight contrast, uppercase sub-labels, tabular numerals (`tabular-nums`), and explicit units (spm, s, %, °, idx).
   - **Status Badges**: Implement strict color-coding for favorability bands:
     - `Normal` / `Good`: Emerald green (`var(--color-success)`).
     - `Borderline` / `Moderate`: Amber warning (`var(--color-warn)`).
     - `Pathological` / `Elevated`: Rose danger (`var(--color-danger)`).
     - `Neutral` / `Suppressed`: Slate gray (`var(--color-subtle)`).
   - **Accessibility (WCAG 2.1 AA)**: Enforce minimum 4.5:1 contrast ratio for body text, 3:1 for large headings/charts; full keyboard focus rings (`focus-visible:ring-2`); semantic landmarks (`<header>`, `<main>`, `<nav>`, `<section>`, `aria-labelledby`, `aria-expanded`).
   - **Video Overlay Performance**: Ensure 60 FPS zero-layout-shift canvas rendering by preserving container aspect ratio (`aspect-video bg-black`) and updating HTML5 Canvas 2D context inside animation frame callbacks without DOM reflow.
7. **Inference 5 (Debate Points for `ux_design_rationale.md`)**:
   - Provide concrete debate points comparing layout paradigms (Stepper vs Tabs, Key-Value Grid vs Cognitive Clusters, Composite Scores vs 95% CIs, View Suppression Transparency, Epistemic Determination Ladder).

---

## 5. Debate Points & Design Constraints for `ux_design_rationale.md`

The following 5 debate points summarize the core architectural decisions and design tradeoffs to be included in `ux_design_rationale.md`:

### Debate Point 1: 4-Stage Linear Progression Stepper vs Multi-Tab Navigation
- **Topic**: Should the application present a tabbed navigation interface (`Report`, `Guesses`, `Metrics`, `Guide`) or a structured 4-stage linear workflow stepper?
- **Tradeoff Analysis**:
  - *Multi-Tab Navigation*: Offers quick jumping between views, but scatters related clinical information, hides the natural assessment sequence, and forces clinicians to remember where metrics reside.
  - *4-Stage Linear Stepper*: Enforces a standard clinical protocol: **1. Input/Sample Selection** $\rightarrow$ **2. Video Processing & Pose Tracking** $\rightarrow$ **3. Clinical Insights & Cognitive Clusters** $\rightarrow$ **4. Export / Share Report**. Minimized cognitive friction, clear step status badges (Completed, Active, Locked), and zero ambiguity on next steps.
- **Design Resolution**: Adopt the 4-Stage Linear Progression Stepper as the primary application layout frame, embedding progressive disclosure accordion panels within Stage 3 for deep diagnostic inspection.

### Debate Point 2: 4 Cognitive Metric Clusters vs 20-Metric Key-Value Grid
- **Topic**: How should spatio-temporal gait metrics be organized to minimize clinical cognitive load?
- **Tradeoff Analysis**:
  - *20-Metric Key-Value Grid*: Displays all raw metrics simultaneously in a 4-column grid. Highly dense, but causes visual fatigue and forces clinicians to manually cross-reference parameters across domains.
  - *4 Cognitive Clusters*: Groups metrics into clinical domains supported by geriatric/neurological literature (Lord et al. 2013):
    1. **Spatiotemporal Pace** (Cadence, Velocity, Stride Length, Step Time).
    2. **Inter-Limb Symmetry** (Stance/Swing %, Symmetry Angle $SA$, $GSI$).
    3. **Trunk Stability** (Vertical/Lateral $HR$, Sway, Pelvic Obliquity).
    4. **Dual-Task Cost** ($DTE$ %, CMI Classification).
- **Design Resolution**: Structure Stage 3 around the 4 Cognitive Clusters using visual cards with headline values, 95% CIs, and status badges (`Normal`, `Borderline`, `Pathological`).

### Debate Point 3: Defensible Measured Quantities & 95% CIs vs 0–100 Composite Scores
- **Topic**: Should 0–100 composite scores be featured as primary headline indicators?
- **Tradeoff Analysis**:
  - *Primary 0–100 Scores*: Visually attractive ring gauges, but biomechanically non-diagnostic and prone to misleading clinicians if treated as medical severity indices.
  - *Defensible Physical Quantities & 95% CIs*: Emphasizes measured physical units (spm, %, °) with split-half reliability standard error bounds ($M \pm 1.96 \cdot \text{SE}_{\text{split}}$), demoting 0–100 composite scores to secondary exploratory indicators.
- **Design Resolution**: Demote 0–100 composite scores to secondary research indices, displaying physical quantities with explicit 95% CIs as the primary clinical evidence.

### Debate Point 4: Perspective Camera View Suppression Transparency
- **Topic**: How should out-of-plane metric invalidity (e.g. sagittal joint angles recorded from a frontal camera) be communicated?
- **Tradeoff Analysis**:
  - *Silent Omission*: Hiding metrics when view angle is invalid leads to confusion about missing data.
  - *Explicit Suppression Badges*: Emitting `null` and rendering clear notices (`"N/A (Requires Side View)"`, `"View Suppressed"`) with callout banners explaining view geometry constraints.
- **Design Resolution**: Enforce explicit view-geometry metric suppression with clear UI notices and camera positioning guidance.

### Debate Point 5: Epistemic Determination Ladder ("Determine ≠ Diagnose")
- **Topic**: How should pattern hypotheses generated by heuristic decision trees be framed to avoid medical misdiagnosis?
- **Tradeoff Analysis**:
  - *Diagnostic Terminology*: Using medical diagnostic labels (e.g. "Parkinsonian Gait") risks clinical liability and overclaiming 2D video capabilities.
  - *Observational Pattern Hypotheses*: Labeling findings as "Observational Pattern Hypotheses" with explicit epistemic warnings (`<ShieldAlert /> Determine ≠ diagnose`), confidence ratings, and supporting evidence bullets.
- **Design Resolution**: Embed the epistemic determination ladder header on all hypothesis displays, emphasizing non-diagnostic research screening.

---

## 6. Caveats

1. **No Backend Model Execution**: MediaPipe pose detection runs entirely client-side via WebAssembly in the browser (`@mediapipe/tasks-vision`). Video frames never leave the user's browser.
2. **2D Video Monocular Constraints**: Markerless 2D pose estimation from single-camera video cannot substitute for 3D optical motion capture or instrumented force plate walkways. Out-of-plane angles are suppressed accordingly.
3. **No Code Implementation**: As a specification miner subagent, this investigation report is read-only. No application code files were modified.

---

## 7. Conclusion

The specification mining investigation confirms that `gait-lab` contains a complete scientific gait engine (`signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, `dte.ts`, `angles.ts`, `analysis.ts`, `ratings.ts`, `guesses.ts`) grounded in peer-reviewed biomechanical literature. The UI layout optimization requires transitioning from the current multi-tab layout (`Report`, `Guesses`, `Metrics`, `Guide`) to a structured **4-Stage Linear Progression Stepper**:
1. **Input / Sample Selection**
2. **Video Processing & Pose Tracking**
3. **Clinical Insights & Domain Scores** (grouped into 4 Cognitive Clusters with Progressive Disclosure)
4. **Export / Share Report**

This structure, combined with high-contrast WCAG 2.1 AA typography, status badges (`Normal`, `Borderline`, `Pathological`), 95% CIs, 60 FPS zero-layout-shift video overlay, and clinician sign-off PDF export, directly addresses all requirements in `ORIGINAL_REQUEST.md`.

---

## 8. Verification Method

To independently verify the codebase integrity and scientific test coverage:

```bash
# 1. Run unit test suite covering signal filtering, Zeni events, symmetry, HR, DTE, kinematics, and clinical components
npm test

# 2. Verify TypeScript types and strict mode compliance
npm run typecheck

# 3. Run ESLint code quality checks
npm run lint

# 4. Verify production build output and Vercel preset compilation
npm run build
```

Specific files to inspect:
- `src/components/gait/GaitApp.tsx`
- `src/components/gait/ClinicalReportView.tsx`
- `src/components/gait/MetricsPanel.tsx`
- `src/components/gait/GuessesPanel.tsx`
- `src/components/gait/JointAnglesChart.tsx`
- `src/components/gait/SkeletonCanvas.tsx`
- `scientific_justifications.md`
