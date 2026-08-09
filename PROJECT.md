# Project: gait-lab

## Architecture
`gait-lab` is a browser-based computer vision web application for quantitative spatio-temporal gait analysis using MediaPipe Pose estimation.
- **Frontend Stack**: React 19, TypeScript 5.7, Vite 8, TanStack Start/Router, Tailwind CSS v4, Recharts, `@mediapipe/tasks-vision`.
- **Database & Backend Stack**: Node-Postgres / PGLite (`@electric-sql/pglite`), Better Auth (`better-auth`).
- **Scientific Gait Engine (`src/lib/gait/`)**:
  - `signal.ts`: Zero-phase 4th-order low-pass Butterworth digital filtering ($f_c = 6\text{ Hz}$), FFT spectral decomposition.
  - `events.ts`: Zeni Kinematic Algorithm (Anterior-Posterior foot position relative to pelvis center) for Initial Contact (Heel Strike) and Terminal Contact (Toe-Off) detection, Stance Phase %, Swing Phase %, Double Support Time.
  - `symmetry.ts`: Zifchock's Symmetry Angle ($SA$) and Gait Symmetry Index ($GSI$).
  - `smoothness.ts`: Harmonic Ratio ($HR$) via FFT for trunk rhythmicity and gait smoothness.
  - `dte.ts`: Standardized Dual-Task Effect ($DTE$) for cognitive-motor interference.
  - `analysis.ts`: Integrated spatio-temporal gait metric calculation engine.
  - `ratings.ts`: Domain composite scoring (0–100) and 5-band clinical rating engine.
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

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Environment, Tooling & Scientific Core Architecture | Features 1–8: `tsconfig.json`, `eslint.config.mjs`, DB migration, `signal.ts`, `events.ts`, `symmetry.ts`, `smoothness.ts`, `dte.ts` | none | DONE |
| 2 | M2: Analysis Engine Integration & UI Enhancement | Features 9–12: `analysis.ts` refactoring, `GaitApp.tsx` frame rate update, `ratings.ts`, `guesses.ts`, UI panel enhancements | M1 | DONE |
| 3 | M3: Comprehensive Unit & Integration Test Suite | Feature 13: `src/lib/gait/__tests__/` unit test suite for all scientific modules and overall engine | M1, M2 | DONE |
| 4 | M4: Scientific Documentation & Verification | Features 14–15: `scientific_justifications.md`, full verification (`npm test`, `npm run typecheck`, `npm run build`, `npm run lint`), Forensic Audit | M1, M2, M3 | DONE |

## Interface Contracts

### `src/lib/gait/signal.ts`
```typescript
export function butterworthLowPass(data: number[], fps: number, cutoffHz?: number): number[];
export function zeroPhaseButterworth(data: number[], fps: number, cutoffHz?: number): number[];
export function linearDetrend(data: number[]): { detrended: number[]; trend: (i: number) => number };
export function computeFFTHarmonics(data: number[], numHarmonics?: number): { evenSum: number; oddSum: number; harmonicRatio: number };
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
}

export function detectGaitEventsZeni(frames: PoseFrame[], fps: number): GaitPhaseBreakdown;
```

### `src/lib/gait/symmetry.ts`
```typescript
export function symmetryAngle(valLeft: number, valRight: number): number; // Returns SA in percentage [0, 100]%
export function gaitSymmetryIndex(valLeft: number, valRight: number): number;
```

### `src/lib/gait/smoothness.ts`
```typescript
export function computeHarmonicRatio(hipY: number[], hipX: number[], fps: number): { hrVertical: number; hrLateral: number; overallHR: number };
```

### `src/lib/gait/dte.ts`
```typescript
export interface DTEAnalysis {
  cadenceDTE: number;
  stepTimeCvDTE: number;
  symmetryDTE: number;
  cmiClassification: 'no_interference' | 'cognitive_prioritization' | 'motor_prioritization' | 'mutual_interference';
}

export function calculateDTE(baseline: GaitMetrics, dualTask: GaitMetrics): DTEAnalysis;
```

## Code Layout
```
src/
├── lib/
│   ├── gait/
│   │   ├── types.ts
│   │   ├── landmarks.ts
│   │   ├── pose.ts
│   │   ├── signal.ts        # Butterworth filtering & FFT
│   │   ├── events.ts        # Zeni algorithm event detection
│   │   ├── symmetry.ts      # Zifchock Symmetry Angle
│   │   ├── smoothness.ts    # Harmonic Ratio calculation
│   │   ├── dte.ts           # Dual-Task Effect formulas
│   │   ├── analysis.ts      # Spatio-temporal analysis engine
│   │   ├── ratings.ts       # Clinical rating engine
│   │   ├── guesses.ts       # Observational hypothesis rules
│   │   └── __tests__/       # Comprehensive unit test suite
│   │       ├── signal.test.ts
│   │       ├── events.test.ts
│   │       ├── symmetry.test.ts
│   │       ├── smoothness.test.ts
│   │       ├── dte.test.ts
│   │       └── analysis.test.ts
├── components/
│   ├── gait/
│   │   ├── GaitApp.tsx
│   │   ├── SkeletonCanvas.tsx
│   │   ├── ReportPanel.tsx
│   │   ├── MetricsPanel.tsx
│   │   ├── GuessesPanel.tsx
│   │   ├── GuidePanel.tsx
│   │   └── ScoreRing.tsx
migrations/
├── 0001_auth.sql
└── 0002_gait_sessions.sql
scientific_justifications.md
```
