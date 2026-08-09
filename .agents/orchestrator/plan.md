# Master Plan: Joint Kinematics & Clinical PDF Report Implementation

## Overview
Based on the multi-agent survey (`spec_miner_survey`, `explorer_code_survey`, `explorer_ui_survey`), the requirements for Interactive Joint Kinematic Angle Trajectories (R1) and Clinical Printable & PDF Export System with 5-Domain Radar Chart (R2) are fully specified. The project executed 4 core implementation milestones.

## Milestones

| # | Milestone Name | Scope | Dependencies | Target Artifacts | Status |
|---|----------------|-------|--------------|------------------|--------|
| M1 | Joint Kinematic Calculation & Trajectory Normalization | Implement 2D 3-point joint angles (Knee, Hip, Ankle), 0-100% gait cycle time-normalization, Perry & Burnfield normative range bands, ROM metrics, and unit tests | Survey | `src/lib/gait/angles.ts`, `src/lib/gait/__tests__/angles.test.ts` | DONE |
| M2 | Interactive Recharts Joint Angle Visualization Component | Create `JointAnglesChart.tsx` with Recharts `ComposedChart`, joint selection tabs, normative shaded bands, ROM badges, and view suppression notice | M1 | `src/components/gait/JointAnglesChart.tsx`, `src/components/gait/__tests__/JointAnglesChart.test.tsx` | DONE |
| M3 | Clinical Printable & PDF Export System with Radar Chart | Create `ClinicalReportView.tsx` with 5-domain Recharts `RadarChart`, patient metadata form, clinician sign-off, `@media print` styles in `styles.css`, and Print button in `ReportPanel.tsx` | M1, M2 | `src/components/gait/ClinicalReportView.tsx`, `src/components/gait/ReportPanel.tsx`, `src/styles.css`, `src/components/gait/__tests__/ClinicalReportView.test.tsx` | DONE |
| M4 | Integration, Full Test Suite Expansion, Forensic Audit & Gate Check | Integrate all components into `GaitApp.tsx`/`ReportPanel.tsx`, run 2x Reviewers, 2x Challengers, 1x Forensic Auditor (`teamwork_preview_auditor`), verify 0 errors on build/test/typecheck/lint | M1, M2, M3 | `GATE_STATUS.md`, `PROJECT.md`, clean build output | DONE |

## Feature Inventory
| # | Feature / Requirement | Category | Target Milestone | Status |
|---|------------------------|----------|------------------|--------|
| 1 | 2D 3-Point Joint Angle Computations (Knee, Hip, Ankle) | R1 | M1 | DONE |
| 2 | Stride Partitioning & 0-100% Gait Cycle Time-Normalization | R1 | M1 | DONE |
| 3 | Biomechanical Normative Range Data (Perry & Burnfield) | R1 | M1 | DONE |
| 4 | Peak Joint Range of Motion (ROM) & Asymmetry Metrics | R1 | M1 | DONE |
| 5 | Comprehensive Unit Test Suite (`angles.test.ts`) | Verification | M1 | DONE |
| 6 | Interactive `JointAnglesChart.tsx` Component | R1 | M2 | DONE |
| 7 | Joint Selector Tabs & Normative Shaded Bands | R1 | M2 | DONE |
| 8 | View-Angle Suppression Handling (Frontal view) | R1 | M2 | DONE |
| 9 | 5-Domain Gait Health Radar Chart (`RadarChart`) | R2 | M3 | DONE |
| 10| Patient & Session Metadata Form Inputs | R2 | M3 | DONE |
| 11| Printable Clinical Summary View (`ClinicalReportView.tsx`) | R2 | M3 | DONE |
| 12| `@media print` Styling & Print Button Integration | R2 | M3 | DONE |
| 13| Full Verification (`npm test`, typecheck, lint, build) & Forensic Audit | Verification | M4 | DONE |
