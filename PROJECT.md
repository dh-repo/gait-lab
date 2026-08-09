# Project: gait-lab

## Architecture
`gait-lab` is a clinical-grade Web-based gait analysis workstation built with React 19, TypeScript, MediaPipe Pose Landmarker, Recharts, and PostgreSQL / PGLite persistence. It processes 2D video / live webcam feeds, extracts 33 body pose landmarks, performs digital signal processing (Butterworth filtering, detrending), detects kinematic gait events (heel strike, toe off), calculates symmetry angles and dual-task costs, normalizes 3-point joint kinematic trajectories (Knee, Hip, Ankle), renders interactive charts, provides side-by-side session comparison, and exports clinical A4 PDF reports.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Zero-Phase LPF & Detrending | 4th-order zero-phase Butterworth filter & OLS linear detrending in `signal.ts` | M1 | survey (R1) |
| 2 | Zeni Kinematic Event Engine | Heel strike (IC), toe off (TO), stance/swing/double-support breakdown in `events.ts` | M1 | survey (R1) |
| 3 | Follow-Cam Direction Inference | Median foot orientation vector diff for tracking shots in `events.ts` | M1 | survey (R1) |
| 4 | Peak Prominence & Subframe Refinement | Dynamic threshold $P_{\text{min}}$ and parabolic peak interpolation in `events.ts` | M1 | survey (R1) |
| 5 | Zifchock Symmetry Angle ($SA$) | Reference-free symmetry angle and index in `symmetry.ts` | M1 | survey (R1) |
| 6 | Standardized DTE & CMI Taxonomy | Standardized directional DTE & Plummer & Eskes 4-tier CMI taxonomy in `dte.ts` | M1 | survey (R1) |
| 7 | Joint Kinematic Trajectories | 3-point joint angles, $0\text{--}100\%$ normalization, view suppression in `angles.ts` | M1 | survey (R1) |
| 8 | Joint Angles Recharts Chart | Interactive Left vs Right trajectories with Perry & Burnfield normative bands in `JointAnglesChart.tsx` | M1 | survey (R1) |
| 9 | Clinical PDF & 5-Domain Radar | Printable A4 report view, 5-domain radar chart, patient metadata in `ClinicalReportView.tsx` | M1 | survey (R1) |
| 10 | Session Persistence & Hydration | PostgreSQL DB schema (`0002_gait_sessions.sql`) and server functions in `persistence.ts` | M1 | survey (R1) |
| 11 | Reference Video Sample Picker | 4 reference gait videos (`sagittal`, `frontal`, `follow_cam`, `general`) in `SamplePicker.tsx` | M1 | survey (R1) |
| 12 | Core Engine Seamless Integration | Full integration of all core engine modules into `GaitApp.tsx` and main app workflows | M1 | survey (R1) |
| 13 | Dual Session Selector Dropdowns | Select Session A (Baseline) and Session B (Follow-up) from historical DB sessions | M2 | survey (R2) |
| 14 | Metric Delta & % Change Badges | Compute absolute and relative metric deltas with clinical color-coded badges | M2 | survey (R2) |
| 15 | Overlaid Joint Trajectory Chart | Overlaid Recharts line chart comparing Session A vs Session B joint trajectories | M2 | survey (R2) |
| 16 | SessionComparisonView Component | Dedicated `SessionComparisonView.tsx` component integrated into main app UI & history drawer | M2 | survey (R2) |
| 17 | WebCam Stream Acquisition | MediaDevices getUserMedia webcam stream acquisition & canvas setup in `PoseTracker.ts` | M3 | survey (R3) |
| 18 | Live Real-Time Pose Tracking | Frame-by-frame real-time landmark extraction from live webcam feed | M3 | survey (R3) |
| 19 | Live Skeleton Canvas Overlay | Real-time 60 FPS canvas skeleton rendering over live webcam stream | M3 | survey (R3) |
| 20 | Real-Time Event & Metric Engine | Rolling frame buffer processing real-time gait events & instantaneous metrics in `GaitApp.tsx` | M3 | survey (R3) |
| 21 | Comprehensive Unit Test Suite | 100% test pass rate across unit tests (`signal`, `events`, `symmetry`, `dte`, `angles`, `persistence`) | M4 | survey (R4) |
| 22 | UI Component Test Suite | Component rendering tests for `ClinicalReportView`, `JointAnglesChart`, `SessionComparisonView`, etc. | M4 | survey (R4) |
| 23 | Adversarial Stress Test Suite | Stress test harness covering landmark jitter, camera shake, missing landmarks, micro-steps | M4 | survey (R4) |
| 24 | TypeScript Type Safety | Zero TypeScript compilation errors (`tsc --noEmit` / `npm run typecheck`) | M4 | survey (R4) |
| 25 | ESLint Static Analysis | Zero ESLint warnings or errors (`eslint .` / `npm run lint`) | M4 | survey (R4) |
| 26 | Production Build Verification | Clean Vercel Nitro production build (`npm run build`) | M4 | survey (R4) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Engine Integration & Polish | Polish & integrate DSP, events, symmetry, DTE, angles, PDF export, DB persistence, sample video picker into `GaitApp.tsx` | none | DONE |
| M2 | Side-by-Side Dual Session Comparison View | Build `SessionComparisonView.tsx` with dual session selection, metric deltas, color-coded badges, and overlaid joint trajectory charts | M1 | DONE |
| M3 | Live WebCam Real-Time Gait Capture Mode | Integrate live browser webcam streaming into `PoseTracker.ts` and `GaitApp.tsx`, live landmarks, and instantaneous event detection | M1 | DONE |
| M4 | E2E Test Suite & Deployment Verification | Unit, UI, adversarial test suite green, 0 tsc errors, 0 eslint warnings, clean `npm run build` | M1, M2, M3 | IN_PROGRESS (Conv: 94e95a73) |

## Interface Contracts
### `persistence.ts` ↔ `SessionComparisonView.tsx`
- `listGaitSessions(): Promise<GaitSessionRecord[]>`
- `getGaitSession(id: string): Promise<GaitSessionRecord | null>`
- `GaitSessionRecord` contains `id`, `user_id`, `created_at`, `patient_id`, `task_mode`, `view_angle`, `metrics` (`GaitMetrics`), `angle_analysis` (`GaitAngleAnalysis`), `phase_breakdown` (`GaitPhaseBreakdown`), `guesses` (`EducatedGuess[]`).

### `PoseTracker.ts` ↔ `GaitApp.tsx` (Webcam Mode)
- `startWebcamStream(videoElement: HTMLVideoElement): Promise<MediaStream>`
- `stopWebcamStream(): void`
- `onPoseFrame(callback: (frame: PoseFrame) => void): void`

## Code Layout
- `src/lib/gait/`: Core signal processing, gait event detection, symmetry, dual-task cost, joint kinematic angles, DB persistence, and analysis pipeline.
- `src/components/gait/`: React UI components (`GaitApp.tsx`, `ClinicalReportView.tsx`, `JointAnglesChart.tsx`, `SessionComparisonView.tsx`, `SamplePicker.tsx`, `SkeletonCanvas.tsx`, `SessionHistoryDrawer.tsx`).
- `migrations/`: Database SQL schema migrations (`0002_gait_sessions.sql`).
- `src/lib/gait/__tests__/`: Unit, integration, and adversarial stress test suites.
- `src/components/gait/__tests__/`: UI component rendering and accessibility test suites.
