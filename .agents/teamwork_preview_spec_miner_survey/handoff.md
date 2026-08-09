# Handoff Report — Specification Survey for Interactive Joint Kinematics & Clinical PDF Export

**Agent ID**: spec_miner_survey  
**Role**: Specification Miner / Domain Surveyor  
**Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_spec_miner_survey`  
**Date**: 2026-08-09T11:01:30Z  

---

## 1. Observation

Direct evidence extracted from authoritative repository sources:
1. **Requirements Document (`ORIGINAL_REQUEST.md`)**:
   - **R1: Joint Kinematic Angle Trajectory Analytics & Recharts Visualization**:
     - Compute 2D joint angles across frames using MediaPipe landmarks:
       - Knee Flexion/Extension angle ($\angle \text{Hip-Knee-Ankle}$)
       - Hip Flexion/Extension angle ($\angle \text{Shoulder-Hip-Knee}$)
       - Ankle Flexion/Dorsiflexion angle ($\angle \text{Knee-Ankle-Toe}$)
     - Time-normalize joint trajectories to $0\text{--}100\%$ of the gait cycle across detected strides in `src/lib/gait/angles.ts`.
     - Create interactive `src/components/gait/JointAnglesChart.tsx` using Recharts for Left vs. Right joint angle curves, normative reference shaded bands, and peak joint range of motion (ROM) metrics.
   - **R2: Clinical Printable & PDF Export System with Domain Radar Chart**:
     - Create dedicated clinical report view `src/components/gait/ClinicalReportView.tsx` with `@media print` styling optimized for 1-click PDF/print export.
     - Include patient/session metadata inputs (Patient ID, Clinician Notes, Assessment Date, Assessment Condition).
     - Render 5-Domain Gait Health Radar Chart (Pace, Symmetry, Smoothness, Rhythmicity, Stability) using Recharts `RadarChart`.
     - Integrate "Print / Export PDF" button in `ReportPanel.tsx` triggering print view (`window.print()`).
2. **MediaPipe Landmark Definitions (`src/lib/gait/landmarks.ts`)**:
   - Hip: `LM.L_HIP` (23), `LM.R_HIP` (24)
   - Knee: `LM.L_KNEE` (25), `LM.R_KNEE` (26)
   - Ankle: `LM.L_ANKLE` (27), `LM.R_ANKLE` (28)
   - Shoulder: `LM.L_SHOULDER` (11), `LM.R_SHOULDER` (12)
   - Foot / Toe Index: `LM.L_FOOT` (31), `LM.R_FOOT` (32)
   - 3-point angle calculation function: `angleDeg(a, b, c)` (lines 83–106).
3. **Gait Event & Stride Detection (`src/lib/gait/events.ts`)**:
   - `detectGaitEventsZeni(frames, fps)` extracts heel strike (`heel_strike`) and toe off (`toe_off`) timestamps with `side: "left" | "right"`.
4. **Dependencies (`package.json`)**:
   - `"recharts": "^2.13.0"` is preinstalled and available for `RadarChart`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, `Radar`, `ResponsiveContainer`, `ComposedChart`, `Area`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `Legend`.

---

## 2. Logic Chain

1. **2D Joint Kinematics Calculation**:
   - For any 3 landmarks $A, B, C$ where $B$ is the joint vertex:
     $$\vec{BA} = (A.x - B.x, A.y - B.y), \quad \vec{BC} = (C.x - B.x, C.y - B.y)$$
     $$\text{dot} = \vec{BA} \cdot \vec{BC}, \quad \text{mag} = \|\vec{BA}\| \cdot \|\vec{BC}\|$$
     $$\theta = \arccos\left(\text{clamp}\left(\frac{\text{dot}}{\text{mag}}, -1, 1\right)\right) \times \frac{180^\circ}{\pi}$$
   - **Knee Flexion/Extension**: $\angle \text{Hip-Knee-Ankle}$ ($\text{Hip} \to \text{Knee} \to \text{Ankle}$). Full extension $\approx 180^\circ$, peak swing flexion $\approx 115^\circ\text{--}125^\circ$.
   - **Hip Flexion/Extension**: $\angle \text{Shoulder-Hip-Knee}$ ($\text{Shoulder} \to \text{Hip} \to \text{Knee}$). Neutral standing $\approx 180^\circ$, flexion decreases to $140^\circ\text{--}150^\circ$, extension increases toward/past $180^\circ$.
   - **Ankle Flexion/Dorsiflexion**: $\angle \text{Knee-Ankle-Toe}$ ($\text{Knee} \to \text{Ankle} \to \text{Toe}$). Neutral stance $\approx 90^\circ$, dorsiflexion drops to $80^\circ$, plantarflexion increases to $110^\circ$.

2. **Stride Partitioning & Time Normalization ($0\text{--}100\%$ Gait Cycle)**:
   - Consecutive same-side heel strikes $[\text{HS}_i, \text{HS}_{i+1}]$ define a stride interval $[t_{\text{start}}, t_{\text{end}}]$.
   - Each stride is linearly resampled onto a 101-point grid ($0\%, 1\%, \dots, 100\%$).
   - Normalized curves across all valid strides for Left and Right limbs are averaged to form `meanLeft` and `meanRight` trajectory arrays of length 101.
   - Peak Range of Motion (ROM) is computed as $\text{ROM} = \max(\text{trajectory}) - \min(\text{trajectory})$ for each limb.

3. **Recharts Joint Angles Visualization (`JointAnglesChart.tsx`)**:
   - `ComposedChart` renders:
     - Normative reference shaded band (`Area` with `normativeLower` and `normativeUpper` bounds from Perry/Winter clinical gait literature).
     - Left joint trajectory (`Line` in blue `#3b82f6`).
     - Right joint trajectory (`Line` in red `#ef4444`).
   - Interactive toggle tab for selecting active joint: Knee Flexion/Extension, Hip Flexion/Extension, or Ankle Flexion/Dorsiflexion.
   - Summary card displays Peak ROM (L vs R), Peak Flexion, Peak Extension, and ROM Asymmetry %.

4. **Clinical Printable PDF System & Domain Radar Chart (`ClinicalReportView.tsx`)**:
   - **5-Domain Gait Health Radar Chart**:
     - Domains: **Pace / Mobility** (`mobilityScore`), **Symmetry** (`symmetryScore`), **Smoothness** (`pathSmoothness * 100`), **Rhythmicity** (`rhythmScore`), **Stability** (`stabilityScore`).
     - Rendered via Recharts `RadarChart` with `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, and `Radar`.
   - **Patient & Session Metadata Input**:
     - Patient ID (e.g. `PAT-1029`), Assessment Date, Clinician Notes, Assessment Condition ("Single-Task", "Dual-Task", etc.).
   - **Print Optimization (`@media print`)**:
     - Hides interactive controls (`.no-print`).
     - Standardizes layout for A4/Letter print export with high-contrast text and crisp card boundaries.
     - 1-click trigger button in `ReportPanel.tsx` invokes `window.print()`.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Kinematics | Knee Angle Computation | 2D Knee Flexion/Extension angle ($\angle \text{Hip-Knee-Ankle}$) across pose frames | `PoseFrame[]`, side ("left" \| "right") | Angle series in degrees ($0\text{--}180^\circ$) | Returns $180^\circ$ fallback on zero magnitude / missing landmarks | `ORIGINAL_REQUEST.md` & `landmarks.ts` |
| 2 | Kinematics | Hip Angle Computation | 2D Hip Flexion/Extension angle ($\angle \text{Shoulder-Hip-Knee}$) across pose frames | `PoseFrame[]`, side ("left" \| "right") | Angle series in degrees ($0\text{--}180^\circ$) | Returns $180^\circ$ fallback on zero magnitude / missing landmarks | `ORIGINAL_REQUEST.md` & `landmarks.ts` |
| 3 | Kinematics | Ankle Angle Computation | 2D Ankle Flexion/Dorsiflexion angle ($\angle \text{Knee-Ankle-Toe}$) across pose frames | `PoseFrame[]`, side ("left" \| "right") | Angle series in degrees ($0\text{--}180^\circ$) | Fallback to heel vector if toe landmark visibility < 0.3 | `ORIGINAL_REQUEST.md` & `landmarks.ts` |
| 4 | Analytics | Stride Time Normalization | Resamples raw joint angle trajectories onto 101 uniform points ($0\text{--}100\%$ stride cycle) | Raw angle series, `stepEvents: GaitEvent[]` | 101-length normalized array for Left & Right | Fallback to full-clip 0–100% time grid if < 2 heel strikes | `ORIGINAL_REQUEST.md` & `angles.ts` |
| 5 | Analytics | Peak Joint ROM & Asymmetry | Computes Peak Flexion, Peak Extension, ROM ($\max - \min$), and ROM Asymmetry % | Normalized Left & Right trajectories | `ROMMetrics` object | Returns 0 for empty / invalid trajectories | `ORIGINAL_REQUEST.md` & `angles.ts` |
| 6 | Analytics | Normative Gait Bands | Clinical reference curves (Perry 2010 / Winter 1991) for Knee, Hip, Ankle over 0–100% stride | Joint type ("knee" \| "hip" \| "ankle") | 101-length normative mean, lower, upper arrays | Returns default normative band for specified joint | `ORIGINAL_REQUEST.md` & `angles.ts` |
| 7 | UI Visualization | `JointAnglesChart.tsx` | Recharts interactive visualization of Left vs Right joint curves with normative band | `GaitMetrics`, active joint selection | Interactive Recharts line chart + ROM stat cards | Renders view-suppression notice if `viewAngle` is frontal | `ORIGINAL_REQUEST.md` & `MetricsPanel.tsx` |
| 8 | Clinical PDF | 5-Domain Radar Chart | Recharts `RadarChart` displaying Pace, Symmetry, Smoothness, Rhythmicity, Stability | 5 Domain scores (0–100) | Interactive Radar Chart with polar grid & fill | Clamps domain scores to [0, 100] range | `ORIGINAL_REQUEST.md` & `ratings.ts` |
| 9 | Clinical PDF | `ClinicalReportView.tsx` | Printable clinical summary view with `@media print` layout and metadata form | `AnalysisResult`, patient metadata | Print-ready HTML document structure | Hides non-printable controls under print media query | `ORIGINAL_REQUEST.md` & `ReportPanel.tsx` |
| 10 | Clinical PDF | 1-Click PDF Export Button | Action button triggering browser print dialog (`window.print()`) | Click event | Native print / PDF save dialog | Safe no-op if window.print is undefined | `ORIGINAL_REQUEST.md` & `ReportPanel.tsx` |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Joint Angle Calculation | Missing / low visibility landmarks (e.g. toe landmark obscured) | `angleDeg` falls back to 180° interior angle; ankle calculation falls back to heel landmark vector. |
| 2 | Time Normalization | Clip with fewer than 2 heel strikes (< 1 full stride) | Resampling cannot partition individual strides; falls back to time-normalizing full clip duration onto 0–100% grid. |
| 3 | Camera View Angle | Frontal view camera clip (`viewAngle === "frontal"`) | Sagittal plane joint flexion angles are planar-distorted; `JointAnglesChart` displays an informative view-suppression banner. |
| 4 | ROM Metric Calculation | Constant angle trajectory (flat line zero motion) | $\max = \min \implies \text{ROM} = 0^\circ$; ROM Asymmetry returns $0\%$ without divide-by-zero errors. |
| 5 | Clinical Printable View | Unfilled patient metadata (blank Patient ID or Notes) | Displays clean placeholder strings ("N/A", "No clinician notes entered") in printable report layout. |
| 6 | PDF Print Export | High-density charts printed across page boundaries | `@media print` CSS includes `break-inside: avoid` on chart cards to prevent orphaned section splits. |

---

## 5. Caveats

1. **2D Projection Limits**: 2D video landmark angles reflect planar projections. In non-sagittal views (frontal camera), sagittal flexion/extension angles lack depth precision. The UI explicitly alerts the clinician when view angle confidence is low or frontal.
2. **MediaPipe Landmark Jitter**: Raw landmark coordinates experience frame-to-frame noise. Angle trajectories should be filtered using the existing Butterworth low-pass filter (`zeroPhaseButterworth`, fc = 6.0 Hz) prior to peak ROM extraction.
3. **Print Media Compatibility**: Chrome/Safari print styling relies on standard `@media print` rules; custom CSS variables must resolve to explicit hex/rgb values during printing for high-contrast rendering.

---

## 6. Conclusion

The specification survey for R1 (Joint Kinematic Angle Trajectories & Recharts Visualization) and R2 (Clinical PDF Export & 5-Domain Radar Chart) is complete:
- `angles.ts` mathematical definitions for 3-point joint angles, stride time-normalization, normative reference bands, and ROM metrics are defined.
- `JointAnglesChart.tsx` layout and Recharts `ComposedChart` structure are specified.
- `ClinicalReportView.tsx` 5-domain `RadarChart`, patient metadata form, `@media print` layout, and 1-click print integration into `ReportPanel.tsx` are fully detailed.
- Comprehensive test strategies for unit tests (`angles.test.ts`) and system verification (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) are established.

---

## 7. Verification Method

1. **Unit Test Suite Expansion (`src/lib/gait/__tests__/angles.test.ts`)**:
   - Verify 3-point angle calculation for Knee ($\angle \text{Hip-Knee-Ankle}$), Hip ($\angle \text{Shoulder-Hip-Knee}$), and Ankle ($\angle \text{Knee-Ankle-Toe}$).
   - Verify 0-100% stride time-normalization grid resampling.
   - Verify Peak ROM and ROM Asymmetry % calculations.
   - Verify fallback handling for frontal view, missing landmarks, and short clips.
2. **Automated Verification Commands**:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
