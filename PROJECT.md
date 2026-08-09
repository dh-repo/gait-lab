# Project: gait-lab

## Architecture
`gait-lab` is a browser-based computer vision web application for quantitative spatio-temporal gait analysis using MediaPipe Pose estimation.
- **Frontend Stack**: React 19, TypeScript 5.7, Vite 8, TanStack Start/Router, Tailwind CSS v4, Recharts, `@mediapipe/tasks-vision`.
- **Database & Backend Stack**: Node-Postgres / PGLite (`@electric-sql/pglite`), Better Auth (`better-auth`).
- **Scientific Gait Engine (`src/lib/gait/`)**:
  - `signal.ts`: Zero-phase 4th-order low-pass Butterworth digital filtering ($f_c = 6\text{ Hz}$), FFT spectral decomposition, $f_0$ stride frequency calculation, $\pm 1$ bin Hann window leakage integration.
  - `events.ts`: Zeni Kinematic Algorithm for Initial Contact (Heel Strike) and Terminal Contact (Toe-Off) detection; median foot orientation difference (`toe.x - heel.x`) follow-cam direction inference; peak prominence filtering in `findExtrema`; parabolic subframe timestamp refinement.
  - `symmetry.ts`: Zifchock's Symmetry Angle ($SA$) and Gait Symmetry Index ($GSI$).
  - `smoothness.ts`: Harmonic Ratio ($HR$) via FFT using stride fundamental frequency $f_0 = 1 / \text{meanStrideSec}$ and $\pm 1$ bin magnitude summation.
  - `dte.ts`: Standardized Dual-Task Effect ($DTE$) for cognitive-motor interference.
  - `angles.ts`: 2D joint kinematic calculations (Hip flexion/extension, Knee flexion/extension, Ankle dorsiflexion/plantarflexion), 0–100% gait cycle time-normalization, Perry & Burnfield (2010) normative curves, peak ROM and asymmetry metrics.
  - `analysis.ts`: Integrated spatio-temporal gait metric calculation engine with split-half reliability 95% CIs and view-geometry metric suppression (`null` emission).
  - `ratings.ts`: Clinical rating engine with support for view-suppressed `null` metrics and demoted secondary composite scores.
  - `guesses.ts`: Rule-based decision tree for observational pattern hypothesis generation.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | TypeScript & Build Tooling Fixes | Fix `tsconfig.json` types for `@types/node` and `vite/client`, remove deprecated `baseUrl` | M1 | survey |
| 2 | ESLint WASM Exclusion | Update `eslint.config.mjs` to ignore `public/wasm/**` | M1 | survey |
| 3 | Database Session Persistence Schema | Add `migrations/0002_gait_sessions.sql` and DB helper methods for persisting gait sessions | M1 | survey |
| 4 | Butterworth Digital Filter (`signal.ts`) | Implement 4th-order zero-phase low-pass Butterworth filter ($f_c = 6\text{ Hz}$) for pose landmark trajectories | M1 | survey |
| 5 | Zeni Gait Event Detection (`events.ts`) | Implement AP coordinate difference algorithm for Heel Strike (IC) & Toe-Off (TO) detection, stance/swing % | M1 | survey |
| 6 | Zifchock Symmetry Angle (`symmetry.ts`) | Implement reference-free Symmetry Angle ($SA$) for inter-limb gait symmetry | M1 | survey |
| 7 | Harmonic Ratio & Smoothness (`smoothness.ts`)| Implement FFT-based Harmonic Ratio ($HR$) for trunk path rhythmicity & smoothness | M1 | survey |
| 8 | Standardized Dual-Task Effect (`dte.ts`) | Implement standardized $DTE$ formula for cognitive-motor interference | M1 | survey |
| 9 | Integrated Gait Analysis Engine Update | Integrate `signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, and `dte.ts` into `analysis.ts` | M2 | survey |
| 10 | Sampling Rate & Interpolation Upgrade | Optimize `GaitApp.tsx` frame sampling rate and high-resolution time interpolation | M2 | survey |
| 11 | Ratings & Guesses Engine Update | Incorporate $SA$, $HR$, Zeni stance/swing %, and $DTE$ into `ratings.ts` and `guesses.ts` | M2 | survey |
| 12 | UI Visualization & Session History | Upgrade `ReportPanel.tsx`, `MetricsPanel.tsx`, and `GaitApp.tsx` with SOTA metrics and session persistence | M2 | survey |
| 13 | Comprehensive Unit Test Suite | Write unit tests in `src/lib/gait/__tests__/` covering filtering, Zeni events, $SA$, $HR$, $DTE$, and analysis engine | M3 | survey |
| 14 | Scientific Justifications Document | Create `scientific_justifications.md` in root with complete literature review, equations, and citations | M4 | survey |
| 15 | Verification & Integrity Audit | Pass `npm test`, `npm run typecheck`, `npm run build`, `npm run lint`, and Forensic Audit | M4 | survey |
| 16 | R1 & R5: Follow-Cam Direction & Peak Prominence | Fix direction inference using median foot orientation (`toe.x - heel.x`) and add prominence filtering to `findExtrema` in `events.ts` | M5 | audit |
| 17 | R2: Harmonic Ratio $f_0$ & Hann Leakage | Set $f_0 = 1 / \text{meanStrideSec}$ from gait events and sum harmonic magnitudes over $\pm 1$ FFT bin in `signal.ts` & `smoothness.ts` | M6 | audit |
| 18 | R3: Continuous Window Frame Sampling & Subframe Refinement | Continuous 10–12s 30 Hz sampling in `GaitApp.tsx`, parabolic subframe timestamp refinement in `events.ts`, report true sampling rate | M7 | audit |
| 19 | R4: Split-Half Reliability, View Geometry Suppression & Score Transparency | 95% CIs via split-half testing, emit `null` for invalid view geometry, demote composite scores in `types.ts`, `analysis.ts`, `ratings.ts`, UI | M8 | audit |
| 20 | M9: Synthetic Test Suite, Justifications Update & Verification | Comprehensive synthetic ground-truth tests (follow-cam ~60% stance, HR ~2.5-4.0, stepTimeCV invariance), `scientific_justifications.md` update, full test pass & audit | M9 | audit |
| 21 | Joint Kinematics Calculation (`angles.ts`) | Calculate 2D sagittal/frontal joint angles (Hip, Knee, Ankle), 0–100% gait cycle time-normalization, peak ROM and asymmetry % | M10 | audit |
| 22 | Time-Normalized Kinematic Trajectory Chart (`JointAnglesChart.tsx`) | Recharts composed time-series chart displaying patient joint angle trajectories against Perry & Burnfield (2010) 0–100% normative envelopes with view suppression handling | M10 | audit |
| 23 | 5-Domain Radar Chart & Patient Metadata (`ClinicalReportView.tsx`) | 5-domain radar chart (Pace, Symmetry, Smoothness, Rhythmicity, Stability) and editable patient metadata fields (ID, date, condition, clinician notes) | M10 | audit |
| 24 | Clinical Report View & PDF Print Export | Full clinical report view with Zeni phase breakdown, ROM summary table, metric ratings, 95% CIs, hypothesis board, clinician sign-off block, `@media print` styles, and 1-click PDF export button | M10 | audit |
| 25 | Multi-Agent Design Debate & `ux_design_rationale.md` | Execute multi-agent design debate (Challenger vs Advocate) establishing clinical UI principles and document rationale in `ux_design_rationale.md` | M11 | audit |
| 26 | 4-Stage Linear Workflow Progression & `WorkflowHeader.tsx` | 4-stage linear workflow header (Setup, Capture, Analysis, Clinical Report) with progress indicator and step navigation | M11 | audit |
| 27 | Cognitive Clustering (4 Clusters) & `CognitiveClusters.tsx` | Group 20+ clinical metrics into 4 cognitive clusters (Primary Spatio-Temporal, Symmetry & Smoothness, Joint Kinematics, Clinical Assessment) with progressive disclosure | M11 | audit |
| 28 | Responsive Dual-Pane Workstation Layout | ~50%/~50% responsive desktop dual-pane workstation layout in `GaitApp.tsx` pairing video canvas overlay with workflow-aware metrics workspace | M11 | audit |
| 29 | Accessibility, Hotkeys & Canvas Optimization | WCAG 2.1 AA contrast ratios (`#94a3b8`), semantic HTML, ARIA landmarks, keyboard hotkeys (`Space`/`Left`/`Right`), and 60 FPS canvas overlay optimization | M11 | audit |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Environment, Tooling & Scientific Core Architecture | Features 1–8: `tsconfig.json`, `eslint.config.mjs`, DB migration, `signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, `dte.ts` | none | DONE |
| 2 | M2: Analysis Engine Integration & UI Enhancement | Features 9–12: `analysis.ts` refactoring, `GaitApp.tsx` frame rate update, `ratings.ts`, `guesses.ts`, UI panel enhancements | M1 | DONE |
| 3 | M3: Comprehensive Unit & Integration Test Suite | Feature 13: `src/lib/gait/__tests__/` unit test suite for all scientific modules and overall engine | M1, M2 | DONE |
| 4 | M4: Scientific Documentation & Verification | Features 14–15: `scientific_justifications.md`, full verification (`npm test`, `npm run typecheck`, `npm run build`, `npm run lint`), Forensic Audit | M1, M2, M3 | DONE |
| 5 | M5: R1 & R5 — Follow-Cam Direction & Peak Prominence | Feature 16: Update `src/lib/gait/events.ts` with median foot orientation difference direction inference and `findExtrema` peak prominence | M1–M4 | DONE |
| 6 | M6: R2 — Harmonic Ratio $f_0$ & Hann Window Leakage | Feature 17: Update `src/lib/gait/signal.ts`, `smoothness.ts`, `analysis.ts` to derive $f_0$ from gait events & sum $\pm 1$ FFT bins | M5 | DONE |
| 7 | M7: R3 — Continuous Window Frame Sampling & Subframe Refinement | Feature 18: Refactor `GaitApp.tsx` to sample continuous 10–12s window at 30 Hz and `events.ts` parabolic subframe refinement | M5 | DONE |
| 8 | M8: R4 — Split-Half Reliability, Camera View Suppression & Score Transparency | Feature 19: Implement 95% CIs, view-geometry metric suppression (`null`), demote composite scores in `types.ts`, `analysis.ts`, `ratings.ts`, UI | M6, M7 | DONE |
| 9 | M9: Comprehensive Synthetic Ground-Truth Test Suite & Verification | Feature 20: Comprehensive synthetic tests in `src/lib/gait/__tests__/`, update `scientific_justifications.md`, full verification pass & audit | M5–M8 | DONE |
| 10 | M10: Joint Kinematics & Clinical Report View | Features 21–24: `angles.ts`, `JointAnglesChart.tsx`, `ClinicalReportView.tsx`, `@media print` PDF export, comprehensive unit tests | M5–M9 | DONE |
| 11 | M11: Clinical UI Layout Optimization & Cognitive Load Reduction | Features 25–29: `ux_design_rationale.md`, `WorkflowHeader.tsx`, `CognitiveClusters.tsx`, dual-pane layout in `GaitApp.tsx`, WCAG/ARIA/hotkeys/60FPS optimization, test suites | M10 | DONE |

## Interface Contracts

### `src/lib/gait/signal.ts`
```typescript
export function butterworthLowPass(data: number[], fps: number, cutoffHz?: number): number[];
export function zeroPhaseButterworth(data: number[], fps: number, cutoffHz?: number): number[];
export function linearDetrend(data: number[]): { detrended: number[]; trend: (i: number) => number };
export function computeFFTHarmonics(
  data: number[],
  numHarmonics?: number,
  strideFreq?: number,
  fps?: number
): { evenSum: number; oddSum: number; harmonicRatio: number };
```

### `src/lib/gait/events.ts`
```typescript
export interface GaitEvent {
  frame: number;
  timeSec: number;
  type: 'heel_strike' | 'toe_off';
  side: 'left' | 'right';
}

export interface GaitPhaseBreakdown {
  leftStancePct: number;
  rightStancePct: number;
  leftSwingPct: number;
  rightSwingPct: number;
  doubleSupportPct: number;
  stepEvents: GaitEvent[];
  inferredDirection: 1 | -1;
  meanStrideSec: number;
  avgStepTimeSec: number;
}

export function detectGaitEventsZeni(frames: PoseFrame[], fps: number): GaitPhaseBreakdown;
export function findExtrema(signal: number[], mode: 'max' | 'min', minGap: number, minProminence?: number): number[];
export function refinePeakTimestamp(signal: number[], peakIdx: number, frameTimeSec: number, fps: number): number;
```

### `src/lib/gait/smoothness.ts`
```typescript
export function computeHarmonicRatio(
  hipY: number[],
  hipX: number[],
  fps: number,
  meanStrideSec?: number
): { hrVertical: number; hrLateral: number; overallHR: number };
```

### `src/lib/gait/angles.ts`
```typescript
export interface JointAnglePoint {
  gaitCyclePct: number;
  kneeAngleLeft: number | null;
  kneeAngleRight: number | null;
  hipAngleLeft: number | null;
  hipAngleRight: number | null;
  ankleAngleLeft: number | null;
  ankleAngleRight: number | null;
}

export interface NormativeRangePoint {
  gaitCyclePct: number;
  kneeMean: number;
  kneeMin: number;
  kneeMax: number;
  hipMean: number;
  hipMin: number;
  hipMax: number;
  ankleMean: number;
  ankleMin: number;
  ankleMax: number;
}

export interface JointAngleMetrics {
  kneeRomLeft: number | null;
  kneeRomRight: number | null;
  kneePeakFlexionLeft: number | null;
  kneePeakFlexionRight: number | null;
  kneeAsymmetryPct: number | null;
  hipRomLeft: number | null;
  hipRomRight: number | null;
  hipPeakFlexionLeft: number | null;
  hipPeakExtensionLeft: number | null;
  hipPeakFlexionRight: number | null;
  hipPeakExtensionRight: number | null;
  hipAsymmetryPct: number | null;
  ankleRomLeft: number | null;
  ankleRomRight: number | null;
  anklePeakDorsiflexionLeft: number | null;
  anklePeakDorsiflexionRight: number | null;
  anklePeakPlantarflexionLeft: number | null;
  anklePeakPlantarflexionRight: number | null;
  ankleAsymmetryPct: number | null;
}

export interface GaitAngleAnalysis {
  isSuppressed: boolean;
  suppressionReason?: string;
  normalizedPoints: JointAnglePoint[];
  leftStrides: NormalizedGaitCycle[];
  rightStrides: NormalizedGaitCycle[];
  metrics: JointAngleMetrics;
  normativeData: NormativeRangePoint[];
}

export function computeGaitAngleAnalysis(
  frames: PoseFrame[],
  events: GaitEvent[],
  viewAngle: ViewAngle,
  walkDir?: number
): GaitAngleAnalysis;

export function getNormativeGaitCurves(): NormativeRangePoint[];
```

### `src/lib/gait/types.ts`
```typescript
export interface ReliabilityBounds {
  value: number | null;
  ci95Lower: number | null;
  ci95Upper: number | null;
  splitHalfDiff: number | null;
}

export interface GaitMetrics {
  cadence: number | null;
  strideLength: number | null;
  stepLength: number | null;
  stepWidth: number | null;
  gaitSpeed: number | null;
  stepTimeCV: number | null;
  symmetryIndex: number | null;
  harmonicRatioVertical: number | null;
  harmonicRatioLateral: number | null;
  harmonicRatioOverall: number | null;
  leftStancePct: number | null;
  rightStancePct: number | null;
  doubleSupportPct: number | null;
  viewAngle: 'sagittal' | 'frontal' | 'oblique';
  samplingFps: number;
  confidenceIntervals?: Record<string, ReliabilityBounds>;
  // Secondary exploratory composite scores (demoted)
  stabilityScore?: number;
  rhythmScore?: number;
  overallScore?: number;
}
```

## Code Layout
```
src/
├── lib/
│   ├── gait/
│   │   ├── types.ts         # Updated GaitMetrics with nullability & ReliabilityBounds
│   │   ├── landmarks.ts
│   │   ├── pose.ts
│   │   ├── signal.ts        # Butterworth filtering, FFT with strideFreq & Hann leakage bin summation
│   │   ├── events.ts        # Foot orientation direction inference, peak prominence, parabolic subframe timestamps
│   │   ├── symmetry.ts      # Zifchock Symmetry Angle
│   │   ├── smoothness.ts    # Harmonic Ratio with stride fundamental frequency
│   │   ├── dte.ts           # Dual-Task Effect formulas
│   │   ├── angles.ts        # Joint Kinematic calculations & 0-100% gait cycle time-normalization
│   │   ├── analysis.ts      # Metric engine with split-half CIs & view-geometry null suppression
│   │   ├── ratings.ts       # Rating engine with null-metric handling & demoted composite scores
│   │   ├── guesses.ts       # Decision tree with view-suppression handling
│   │   └── __tests__/       # Comprehensive synthetic test suite
│   │       ├── signal.test.ts
│   │       ├── events.test.ts
│   │       ├── symmetry.test.ts
│   │       ├── smoothness.test.ts
│   │       ├── dte.test.ts
│   │       ├── angles.test.ts
│   │       └── analysis.test.ts
├── components/
│   ├── gait/
│   │   ├── GaitApp.tsx      # Continuous 10-12s 30 Hz sampling window & ~50%/~50% responsive dual-pane layout
│   │   ├── SkeletonCanvas.tsx
│   │   ├── WorkflowHeader.tsx # 4-Stage Linear Workflow Progression header
│   │   ├── CognitiveClusters.tsx # 4 Cognitive Clusters with Progressive Disclosure
│   │   ├── ReportPanel.tsx   # Displays 95% CIs and view-suppressed metric notices
│   │   ├── MetricsPanel.tsx  # Renders 95% CIs and defensible measured quantities
│   │   ├── GuessesPanel.tsx
│   │   ├── GuidePanel.tsx
│   │   ├── ScoreRing.tsx
│   │   ├── JointAnglesChart.tsx  # Recharts 0-100% gait cycle trajectory visualization vs normative envelope
│   │   ├── ClinicalReportView.tsx # 5-Domain Radar Chart, Patient Metadata, PDF Print export, Clinician sign-off
│   │   └── __tests__/
│   │       ├── ClinicalReportView.test.tsx
│   │       ├── CognitiveClusters.test.tsx
│   │       ├── GaitAppAccessibility.test.tsx
│   │       ├── JointAnglesChart.test.tsx
│   │       ├── SkeletonCanvas.test.tsx
│   │       ├── WorkflowHeader.test.tsx
│   │       └── m4_1_ui_keyboard_cls_challenger.test.tsx
migrations/
├── 0001_auth.sql
└── 0002_gait_sessions.sql
scientific_justifications.md # Updated with literature citations for R1-R5 & R1-R2 Kinematics
ux_design_rationale.md       # Multi-agent debate rationale for clinical UI layout optimization
```
