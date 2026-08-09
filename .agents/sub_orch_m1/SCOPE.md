# Scope: Milestone 1 — Core Engine Integration & Polish (R1) [DONE]

## Architecture
Ensure every core engine module in `src/lib/gait/` (DSP filtering in `signal.ts`, Zeni Kinematic Event Detection in `events.ts`, Zifchock Symmetry Angles in `symmetry.ts`, Harmonic Ratio removal record, Standardized Dual-Task Cost in `dte.ts`, 3-Point Joint Kinematic Angles & Normalization in `angles.ts`, Clinical PDF Exporter in `ClinicalReportView.tsx`, PostgreSQL Database Persistence in `persistence.ts`, Reference Video Sample Picker in `SamplePicker.tsx`) is 100% integrated, seamlessly connected, and fully operational in `GaitApp.tsx` without scaffolds, mock data, or TODOs.

## Feature Inventory (Milestone 1)
| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | Zero-Phase LPF & Detrending | 4th-order zero-phase Butterworth filter & OLS linear detrending in `signal.ts` | DONE |
| 2 | Zeni Kinematic Event Engine | Heel strike (IC), toe off (TO), stance/swing/double-support breakdown in `events.ts` | DONE |
| 3 | Follow-Cam Direction Inference | Median foot orientation vector diff for tracking shots in `events.ts` | DONE |
| 4 | Peak Prominence & Subframe Refinement | Dynamic threshold $P_{\text{min}}$ and parabolic peak interpolation in `events.ts` | DONE |
| 5 | Zifchock Symmetry Angle ($SA$) | Reference-free symmetry angle and index in `symmetry.ts` | DONE |
| 6 | Standardized DTE & CMI Taxonomy | Standardized directional DTE & Plummer & Eskes 4-tier CMI taxonomy in `dte.ts` | DONE |
| 7 | Joint Kinematic Trajectories | 3-point joint angles, $0\text{--}100\%$ normalization, view suppression in `angles.ts` | DONE |
| 8 | Joint Angles Recharts Chart | Interactive Left vs Right trajectories with Perry & Burnfield normative bands in `JointAnglesChart.tsx` | DONE |
| 9 | Clinical PDF & 5-Domain Radar | Printable A4 report view, 5-domain radar chart, patient metadata in `ClinicalReportView.tsx` | DONE |
| 10 | Session Persistence & Hydration | PostgreSQL DB schema (`0002_gait_sessions.sql`) and server functions in `persistence.ts` | DONE |
| 11 | Reference Video Sample Picker | 4 reference gait videos (`sagittal`, `frontal`, `follow_cam`, `general`) in `SamplePicker.tsx` | DONE |
| 12 | Core Engine Seamless Integration | Full integration of all core engine modules into `GaitApp.tsx` and main app workflows | DONE |

## Interface Contracts
- `analyzeGait(frames: PoseFrame[], fps: number, viewAngle: ViewAngle, taskMode: TaskMode)` returns complete `AnalysisResult` containing `metrics`, `angleAnalysis`, `phaseBreakdown`, `guesses`, `ratings`.
- `saveGaitSession(data)` writes session record to database via `persistence.ts`.
- `ClinicalReportView` accepts `result`, `patientMeta`, renders radar chart and printable report.

## Code Layout
- `src/lib/gait/`: `signal.ts`, `events.ts`, `symmetry.ts`, `dte.ts`, `angles.ts`, `analysis.ts`, `ratings.ts`, `guesses.ts`, `persistence.ts`
- `src/components/gait/`: `GaitApp.tsx`, `ClinicalReportView.tsx`, `JointAnglesChart.tsx`, `SamplePicker.tsx`, `SkeletonCanvas.tsx`
