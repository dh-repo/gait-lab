# Handoff Report — Explorer 2: Metric Deltas, Color-Coded Badges & Overlaid Joint Trajectory Curves (Milestone 2)

## 1. Observation

Direct code and dataset observations from repository analysis:

- **Existing Chart Components & Recharts Usage**:
  - `src/components/gait/JointAnglesChart.tsx`: Renders 101-point time-normalized joint angle trajectories ($0\text{--}100\%$ gait cycle) using Recharts `ComposedChart`, `XAxis`, `YAxis`, `Tooltip`, `Legend`, `Area` (normative range), and `Line` (Left `#3b82f6` solid vs Right `#ef4444` dashed).
  - `src/components/gait/MetricsPanel.tsx`: Renders single session spatial-temporal metric stat cards, ankle height time-series `LineChart`, hip trajectory `AreaChart`, and knee flexion `LineChart`.
  - `src/components/gait/ClinicalReportView.tsx`: Integrates Recharts `RadarChart` (5-domain gait health), `JointAnglesChart`, and printable clinical summary tables with 95% confidence intervals.

- **Data Models & Metric Structures**:
  - `GaitSessionRecord` (`src/lib/gait/persistence.ts`): Stores `id`, `sessionName`, `taskMode`, `overallScore`, `stabilityScore`, `rhythmScore`, `symmetryScore`, `mobilityScore`, `automaticityScore`, `cadenceSpm`, `stepCount`, `durationSec`, `viewAngle`, `symmetryAngle`, `metricsJson` (`GaitMetrics`), `guessesJson`, `dualTaskJson` (`DualTaskCost`), `angleAnalysisJson` (`GaitAngleAnalysis`), `patientMetaJson` (`PatientMetadata`), `createdAt`.
  - `GaitAngleAnalysis` (`src/lib/gait/angles.ts`): Contains `normalizedPoints` (101 `JointAnglePoint` elements), `leftStrides`, `rightStrides`, `metrics` (`JointAngleMetrics`: ROM, Peak Flexion/Extension/Dorsiflexion/Plantarflexion, Asymmetry %), `normativeData` (101 `NormativeRangePoint` elements derived from Perry & Burnfield 2010), `isSuppressed`, and `suppressionReason`.

- **View Suppression Logic**:
  - In `angles.ts` (line 305): `viewAngle === "frontal"` suppresses sagittal joint kinematic angle calculations (`isSuppressed = true`), rendering a warning banner in `JointAnglesChart.tsx`.

---

## 2. Logic Chain

From the observations above, we derive the mathematical formulation and component specifications required for Milestone 2 (`SessionComparisonView.tsx`):

### 2.1 Metric Delta Calculations & Threshold Rules

When comparing Baseline (Session A) against Target / Follow-up (Session B):

1. **Absolute Delta ($\Delta$)**:
   $$\Delta = \text{Value}_B - \text{Value}_A$$

2. **Percentage Delta ($\% \Delta$)**:
   $$\% \Delta = \begin{cases}
   \frac{\text{Value}_B - \text{Value}_A}{|\text{Value}_A|} \times 100\% & \text{if } \text{Value}_A \neq 0 \\
   \text{null (or "N/A")} & \text{if } \text{Value}_A = 0
   \end{cases}$$

3. **Directionality & Favorability Classification**:
   Metrics fall into three clinical interpretation categories:

   - **Category I: Higher is Better** (e.g., Overall Score, Mobility, Stability, Symmetry, Rhythm, Automaticity Scores, Cadence, Stride Length, Joint ROM):
     - $\Delta \ge +\epsilon \implies$ **Improved** (`badgeTone = "success"` / Green)
     - $\Delta \le -\epsilon \implies$ **Degraded** (`badgeTone = "danger"` / Red or Amber)
     - $|\Delta| < \epsilon \implies$ **Unchanged** (`badgeTone = "neutral"` / Gray)

   - **Category II: Lower is Better** (e.g., Symmetry Angle %, Step-Time Asymmetry %, Stride Asymmetry %, Step-Time CV %, Stride-Time CV %, ROM Asymmetry %, Lateral Sway, Vertical Bounce):
     - $\Delta \le -\epsilon \implies$ **Improved** (`badgeTone = "success"` / Green)
     - $\Delta \ge +\epsilon \implies$ **Degraded** (`badgeTone = "danger"` / Red or Amber)
     - $|\Delta| < \epsilon \implies$ **Unchanged** (`badgeTone = "neutral"` / Gray)

   - **Category III: Neutral / Contextual** (e.g., Step Count, Duration, Avg Step Time):
     - Always rendered with `badgeTone = "neutral"` (Gray).

4. **Noise Immunity Threshold Matrix ($\epsilon$)**:
   To prevent minor landmark noise or frame quantization jitter from falsely triggering clinical alert badges:

| Metric Category | Metric | Unit | $\epsilon$ Threshold | Green Condition | Red Condition | Gray Condition |
|---|---|---|---|---|---|---|
| Scores | `overallScore`, `mobilityScore`, `stabilityScore`, etc. | /100 | $2.0\text{ pts}$ | $\Delta \ge +2.0$ | $\Delta \le -2.0$ | $|\Delta| < 2.0$ |
| Cadence | `cadenceSpm` | spm | $2.0\text{ spm}$ | $\Delta \ge +2.0$ | $\Delta \le -2.0$ | $|\Delta| < 2.0$ |
| Symmetry | `symmetryAngle`, `stepTimeAsymmetry` | % | $0.5\%$ / $1.0\%$ | $\Delta \le -\epsilon$ | $\Delta \ge +\epsilon$ | $|\Delta| < \epsilon$ |
| Variability | `stepTimeCV`, `strideTimeCV` | % | $0.5\%$ | $\Delta \le -0.5\%$ | $\Delta \ge +0.5\%$ | $|\Delta| < 0.5\%$ |
| Joint ROM | `kneeRomLeft/Right`, `hipRomLeft/Right` | deg (°) | $2.0^\circ$ | $\Delta \ge +2.0^\circ$ | $\Delta \le -2.0^\circ$ | $|\Delta| < 2.0^\circ$ |
| Ankle ROM | `ankleRomLeft/Right` | deg (°) | $1.5^\circ$ | $\Delta \ge +1.5^\circ$ | $\Delta \le -1.5^\circ$ | $|\Delta| < 1.5^\circ$ |
| ROM Asymmetry | `kneeAsymmetryPct`, `hipAsymmetryPct`, etc. | % | $2.0\%$ | $\Delta \le -2.0\%$ | $\Delta \ge +2.0\%$ | $|\Delta| < 2.0\%$ |

---

### 2.2 Overlaid Joint Trajectory Curve Charts Architecture

1. **Normalized Grid Alignment**:
   `GaitAngleAnalysis.normalizedPoints` for both Session A and Session B are pre-sampled to 101 uniform points ($0\%, 1\%, \dots, 100\%$).
   For each gait cycle percentage $p \in [0, 100]$, we map:
   ```typescript
   chartData[p] = {
     gaitCyclePct: p,
     // Session A curves
     kneeAngleLeftA: angleAnalysisA?.normalizedPoints[p]?.kneeAngleLeft ?? null,
     kneeAngleRightA: angleAnalysisA?.normalizedPoints[p]?.kneeAngleRight ?? null,
     // Session B curves
     kneeAngleLeftB: angleAnalysisB?.normalizedPoints[p]?.kneeAngleLeft ?? null,
     kneeAngleRightB: angleAnalysisB?.normalizedPoints[p]?.kneeAngleRight ?? null,
     // Perry & Burnfield Normative Envelope
     normativeRange: [normativeData[p]?.kneeMin ?? 0, normativeData[p]?.kneeMax ?? 0],
     normativeMean: normativeData[p]?.kneeMean ?? 0,
   };
   ```

2. **Visual Styling & Distinction**:
   - **Session A (Baseline)**: Solid lines (`strokeWidth={2.5}`)
     - Left: `#3b82f6` (Primary Blue)
     - Right: `#06b6d4` (Cyan)
   - **Session B (Target)**: Dashed lines (`strokeDasharray="5 5"`, `strokeWidth={2.5}`)
     - Left: `#10b981` (Emerald Green)
     - Right: `#f59e0b` (Amber)
   - **Normative Reference Envelope**: `Area` component with `fill="#94a3b8"` and `fillOpacity={0.2}`.

3. **Interactive Side Toggles**:
   Allow clinicians to switch between:
   - Joint Tabs: Knee | Hip | Ankle
   - Side View Options: Left Side Only | Right Side Only | Both Sides Overlaid

4. **View Suppression Handling**:
   If Session A or Session B (or both) has `isSuppressed === true` (frontal camera view):
   - Render a contextual notice banner above the chart explaining why sagittal angle trajectories are suppressed for that specific session.

---

## 3. Caveats

- **Null Handling**: If either session lacks `angleAnalysisJson` or has a suppressed view, trajectory curves for that session will be `null`. Recharts handles `null` values gracefully without crashing, provided lines use `connectNulls={false}`.
- **Task Mode Comparison**: Comparing Single-Task vs Dual-Task is valid and common. The UI should display badges indicating `TaskMode` for both Session A and Session B.
- **Zero Baseline**: If a baseline metric value is `0` (e.g. 0% asymmetry), percentage change calculation returns `null` ("N/A"), while absolute delta still displays correctly.

---

## 4. Conclusion

The metric delta calculations, threshold color-coding rules, and overlaid joint trajectory curve chart architecture are fully planned and ready for implementation in `src/components/gait/SessionComparisonView.tsx`.

Key design decisions:
1. **Robust Delta Engine**: Compute absolute delta ($\Delta$) and percentage delta ($\%\Delta$) with division-by-zero checks and metric-specific directionality.
2. **Thresholded Badges**: Use explicit $\epsilon$ thresholds (e.g. 2.0 pts for scores, 0.5% for CV/SA, 2.0° for ROM) to eliminate false alert noise.
3. **Unified Recharts Overlays**: Combine 101-point trajectories of Session A and Session B on shared X (0-100% Gait Cycle) and Y (Joint Angle °) axes with solid vs dashed line styling and normative shaded bands.

---

## 5. Verification Method

To independently verify the implementation:

1. **Unit Test Verification**:
   Run `npm test -- src/components/gait/__tests__/SessionComparisonView.test.tsx` to verify delta calculations, color badge rendering, and chart overlays.
2. **TypeScript Type Safety**:
   Run `npm run typecheck` to ensure zero compilation errors.
3. **Linting & Code Quality**:
   Run `npm run lint` to confirm zero warnings or errors.
4. **Full Production Build**:
   Run `npm run build` to confirm seamless Vercel production build compliance.
