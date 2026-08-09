# Gait Lab UI Optimization & Clinical UX Architecture

## Executive Summary

`gait-lab` is a browser-based computer vision web application for quantitative spatio-temporal gait analysis using MediaPipe Pose estimation. To ensure rapid, low-cognitive-load clinical utility for healthcare professionals (physiotherapists, neurologists, orthopedic specialists, and clinical biomechanists), the UI layout underwent an agent swarm design debate comparing two primary architectural paradigms: a rigid **Linear Stepper** (Paradigm A) and an open **Dual-Pane Workstation** (Paradigm B).

This document outlines the multi-agent design debate, the synthesized **Hybrid Low-Cognitive-Load Clinical Interface**, the 4-stage linear workflow progression, the 4 cognitive metric clusters, progressive disclosure strategies, scannability standards, status badge design tokens, WCAG 2.1 AA accessibility compliance, and zero Cumulative Layout Shift (CLS) performance targets.

---

## 1. Multi-Agent Design Debate

### Agent Swarm Perspectives
- **Specialist A (Clinical Workflow Ergonomics)**: Advocated for a strictly gated linear wizard/stepper to minimize decision fatigue and prevent unvalidated analysis execution before subject identification.
- **Specialist B (Diagnostic Workstation & Telemetry)**: Advocated for a split-screen dual-pane dashboard with real-time video stream overlay alongside synchronous multi-chart kinematic waveform telemetry for maximum diagnostic depth.
- **Specialist C (Cognitive Load & Human Factors)**: Highlighted that busy clinicians experience context switching costs when switching between disconnected views or deciphering crowded, unclustered multi-metric dashboards.

### Paradigm Comparison

| Architecture Feature | Paradigm A: Linear Stepper | Paradigm B: Dual-Pane Workstation | Synthesized Hybrid Architecture |
| :--- | :--- | :--- | :--- |
| **Workflow Guidance** | High (step-by-step enforcement) | Low (freeform workspace) | High via sticky 4-stage workflow header |
| **Video & Kinematics** | Modal or separated tabs | Side-by-side synchronized view | Dual-panel layout (Video stream left, Telemetry right) |
| **Cognitive Load** | Very low, but restrictive | High during initial scanning | Low: progressive disclosure with headline metrics above fold |
| **Flexibility** | Poor for jumping back/forth | Excellent, but prone to clutter | Stage navigation unlocked once results are available |
| **Spatial Footprint** | Sequential page transitions | Compact 2-column workstation | Responsive sticky header + split 1.15fr / 0.85fr layout |

### Debate Resolution & Synthesis
The swarm concluded that neither a rigid wizard nor an unguided workstation alone satisfies clinical efficiency. The optimal solution is the **Hybrid Low-Cognitive-Load Clinical Interface**:
1. **Persistent Workflow Anchor**: A sticky top navigation bar (`WorkflowHeader.tsx`) visually displaying the 4 workflow stages, offering clear state tracking and instant stage switching once results exist.
2. **Asymmetric Workstation Grid**: A 1.15fr (Video & Tracking Overlay) / 0.85fr (Tabbed Clinical Telemetry) layout when processing or reviewing, maintaining visual focus on subject movement while presenting clean, scannable data.

---

## 2. Synthesized Hybrid Architecture

The Hybrid Architecture balances guided progression with instant data access:

```
+-----------------------------------------------------------------------------------+
|  Gait Lab Header  [1 Input/Sample] -> [2 Video Processing] -> [3 Clinical] -> [4 Export] |
+-----------------------------------------------------------------------------------+
|  Main Workspace                                                                   |
|  +-------------------------------------+  +------------------------------------+  |
|  | Video Stream & Skeleton Canvas      |  | Clinical Telemetry & Insights      |  |
|  | - 30 Hz continuous sampling overlay |  | - Headline Composite Scores        |  |
|  | - Interactive person track chips    |  | - 4 Cognitive Metric Clusters      |  |
|  | - Playback controls & bounding boxes|  | - Perry & Burnfield Normative Charts|  |
|  +-------------------------------------+  +------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 3. 4-Stage Linear Workflow Progression

The system state machine (`idle` $\rightarrow$ `loading_model` / `scanning` / `select_person` / `analyzing` $\rightarrow$ `results` $\rightarrow$ `error`) maps directly into 4 clear stages:

### Stage 1: Input / Sample Selection (`idle` phase)
- **Objective**: Ingest walking video clip or select pre-validated clinical benchmark sample.
- **Components**: Drag-and-drop video dropzone, `SamplePicker.tsx`, single/dual-task protocol toggle ("Walk only" vs "Walk + cognitive").
- **Clinical Utility**: Zero setup friction, supporting standard MP4/WebM/MOV files or clinical reference clips.

### Stage 2: Video Processing & Pose Tracking (`loading_model`, `scanning`, `select_person`, `analyzing` phases)
- **Objective**: Execute local MediaPipe WASM pose landmarker, track candidates, and select primary subject.
- **Components**: 30 Hz continuous sampling video viewport with pose skeleton overlay, person selection chips (`TrackedPerson`), progress status bar.
- **Clinical Utility**: Guarantees deterministic tracking of the patient even in multi-person clips (e.g. hallway walking with assistant).

### Stage 3: Clinical Insights & Domain Scores (`results` phase, "Report" / "Guesses" / "Charts" tabs)
- **Objective**: Display quantitative spatio-temporal gait metrics, 5-domain radar breakdown, joint kinematic trajectories, and evidence-based diagnostic hypotheses.
- **Components**: Composite score ring, domain rating cards (Stability, Symmetry, Rhythm, Mobility, Automaticity), joint angle curves vs Perry & Burnfield (2010) normative envelopes, split-half 95% CIs.
- **Clinical Utility**: Rapid high-level assessment above the fold, deep kinematic inspection below.

### Stage 4: Export / Share Report (`results` phase, "Export Report" / PDF view)
- **Objective**: Generate signed, shareable clinical documentation for EHR insertion or patient handover.
- **Components**: Patient metadata inputs (ID, DOB, condition, clinician notes), 1-click PDF print export (@media print optimized), session persistence saving.
- **Clinical Utility**: Instant clinical documentation with legal/professional disclaimer and clinician sign-off block.

---

## 4. 4 Cognitive Metric Clusters

To eliminate metric overload, 18+ spatio-temporal outputs are grouped into 4 distinct cognitive clusters:

```
                       +-----------------------------------+
                       |    COGNITIVE METRIC CLUSTERS     |
                       +-----------------------------------+
                                         |
     +-------------------+---------------+---------------+-------------------+
     |                   |                               |                   |
     v                   v                               v                   v
+------------+   +---------------+               +---------------+   +---------------+
| 1. PACE    |   | 2. SYMMETRY   |               | 3. STABILITY  |   | 4. DUAL-TASK  |
+------------+   +---------------+               +---------------+   +---------------+
| - Cadence  |   | - Zifchock SA |               | - Vert Bounce |   | - Cadence DTE |
| - Stride L |   | - Stance %    |               | - Lat Sway    |   | - CV DTE %    |
| - Step L   |   | - Swing %     |               | - HR Vert/Lat |   | - CMI Class   |
| - Speed    |   | - Asym Index  |               | - Step Width  |   | - Dual Cost   |
+------------+   +---------------+               +---------------+   +---------------+
```

1. **Spatiotemporal Pace Cluster**: Cadence (spm), Stride Length (m), Step Length (m), Step Width (m), Gait Speed (m/s). Assesses overall locomotion velocity and stride mechanics.
2. **Inter-limb Symmetry Cluster**: Zifchock Symmetry Angle ($SA$), Stance/Swing Ratio (%), Left/Right Knee ROM Asymmetry. Identifies unilateral antalgic limping or hemiparetic deficits.
3. **Trunk Stability & Smoothness Cluster**: Lateral Sway, Center-of-Mass Vertical Bounce, Pelvic Obliquity, Path Smoothness, Automaticity Score. Evaluates trunk rhythmicity and balance control.
4. **Dual-Task Cost Cluster**: Standardized Dual-Task Effect ($DTE$), Cognitive-Motor Interference (CMI) classification (mutual interference, cognitive priority, gait priority). Quantifies cognitive load sensitivity and fall risk under distraction.

---

## 5. Ergonomics, Accessibility & Performance Standards

### Progressive Disclosure & Scannability
- **Headline First**: Primary clinical indicators (Overall Score, Safety Rating, Primary Watch Areas) are displayed immediately above the fold.
- **On-Demand Depth**: Diagnostic waveforms, split-half reliability CIs, and raw joint angles are available on demand via structured tabs ("Report", "Guesses", "Charts", "Guide").
- **Status Badges**: Standardized 5-band rating system (`strong`, `good`, `fair`, `watch`, `elevated`) mapped to distinct color tokens for rapid scanning:
  - `strong` $\rightarrow$ Green (`var(--color-success)`)
  - `good` $\rightarrow$ Primary Accent (`var(--color-primary)`)
  - `fair` $\rightarrow$ Neutral Surface (`var(--color-muted)`)
  - `watch` $\rightarrow$ Warning Amber (`var(--color-warn)`)
  - `elevated` $\rightarrow$ Alert Danger (`var(--color-danger)`)

### Accessibility (WCAG 2.1 AA)
- **Contrast**: Text and icon tokens enforce minimum 4.5:1 contrast ratio against container background surfaces (`var(--color-bg)`, `var(--color-surface)`).
- **Semantics & ARIA**: Use semantic `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, and `<figure>` tags with appropriate ARIA landmarks (`aria-current="step"`, `aria-label="Workflow progression"`, `role="navigation"`).
- **Keyboard Navigation**: All interactive elements (stage buttons, person selection chips, tab triggers, sample pickers) are focusable (`tabIndex={0}` or native `<button>`) with explicit `:focus-visible` rings.

### Zero Cumulative Layout Shift (CLS)
- **Aspect Ratio Locking**: Video viewport and canvas overlays use fixed `aspect-video` (`16:9`) containers to eliminate shift when video metadata resolves.
- **Skeleton & Layout Reserves**: Metric cards reserve height for dynamic values, preventing content reflow during WASM model initialization or frame resampling.
- **Render Performance**: Canvas overlays run at a synchronized 60 FPS using `requestAnimationFrame`, decoupled from heavy analytical computation.

---

*Document generated as part of Milestone M1 UI Optimization for `gait-lab`.*
