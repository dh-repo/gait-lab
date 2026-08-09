# Comprehensive Codebase Analysis: Gait Engine & Kinematic Trajectory Integration (Explorer 2 — Milestone 1)

## Executive Summary

An exhaustive analysis of `src/lib/gait/symmetry.ts`, `src/lib/gait/dte.ts`, `src/lib/gait/angles.ts`, `src/components/gait/JointAnglesChart.tsx`, `src/lib/gait/analysis.ts`, and `src/components/gait/GaitApp.tsx` was conducted. While individual algorithmic units in `symmetry.ts`, `dte.ts`, and `angles.ts` possess robust mathematical foundations and comprehensive unit test coverage (296/296 tests passing), a **critical integration disconnect** was identified in the runtime pipeline between `GaitApp.tsx`, `analysis.ts`, `ReportPanel.tsx`, `ClinicalReportView.tsx`, and `CognitiveClusters.tsx`.

Specifically, `GaitApp.tsx` never invokes `computeGaitAngleAnalysis` during video analysis, nor does `AnalysisResult` store `angleAnalysis`. Consequently, downstream UI components (`ReportPanel.tsx` and `CognitiveClusters.tsx`) fall back to passing an empty array (`frames: []`) to `computeGaitAngleAnalysis`. This causes `JointAnglesChart.tsx` and the Clinical PDF Report (`ClinicalReportView.tsx`) to render completely empty trajectory curves and display `—` for all Range of Motion (ROM) metrics in live production analysis.

Additionally, a minor classification edge case was discovered in `dte.ts` where motor prioritization is only evaluated against `cadenceDTE` rather than checking both `cadenceDTE` and `stepTimeCvDTE`.

---

## 1. Module-by-Module Findings

### 1.1 Zifchock Symmetry Angle & Symmetry Index (`src/lib/gait/symmetry.ts`)
- **Scientific Foundation**: Implements Zifchock et al. (2008) Symmetry Angle ($SA$):
  $$SA = \frac{|45^\circ - \arctan(X_L / X_R)|}{90^\circ} \times 100\%$$
- **Mathematical Bounds**:
  - For non-negative magnitudes ($X_L \ge 0, X_R \ge 0$), $\arctan(X_L / X_R) \in [0^\circ, 90^\circ]$.
  - The quantity $|45^\circ - \theta| / 90^\circ \times 100\%$ ranges from $0.0\%$ (perfect 1:1 symmetry) to $50.0\%$ (complete unilateral asymmetry where one limb is 0).
  - Docstring in line 11 mentions $[0, 100]\%$, but `symmetryAngle` mathematically maxes at $50.0\%$. Line 40 correctly caps with `Math.min(100.0, rawSA)`.
- **Epsilon Threshold**: Robustly checks `absL < 1e-6 && absR < 1e-6` returning `0.0%` to prevent division by zero or NaN propagation.
- **Reference-Free Invariance**: Verified that $SA(X_L, X_R) \equiv SA(X_R, X_L)$.
- **Gait Symmetry Index (GSI)**: Implements $GSI = (\min(|X_L|, |X_R|) / \max(|X_L|, |X_R|)) \times 100\%$, returning $100.0\%$ for equal magnitudes and $0.0\%$ when one limb is 0.

### 1.2 Standardized Dual-Task Effect & CMI Taxonomy (`src/lib/gait/dte.ts`)
- **Scientific Foundation**: Implements Kelly et al. (2010) directional DTE formula and Plummer & Eskes (2015) 4-tier Cognitive-Motor Interference (CMI) taxonomy:
  - Higher-is-better metrics (Cadence, Symmetry Score): $\text{DTE} = \frac{\text{DualTask} - \text{Baseline}}{\text{Baseline}} \times 100\%$
  - Lower-is-better metrics (Step Time CV): $\text{DTE} = -\frac{\text{DualTask} - \text{Baseline}}{\text{Baseline}} \times 100\%$
- **Sign Convention**: All DTE values are signed such that negative values denote performance cost (decline) and positive values denote performance gain (prioritization).
- **Taxonomy Logic**:
  - `mutual_interference`: Both `cadenceDTE < -5.0` and `stepTimeCvDTE < -5.0`.
  - `cognitive_prioritization`: Either `cadenceDTE < -5.0` or `stepTimeCvDTE < -5.0`.
  - `motor_prioritization`: Currently `cadenceDTE > 5.0`.
  - `no_interference`: Both $|DTE| \le 5.0\%$.
- **Edge Case Bug Identified**:
  - Lines 78–79:
    ```ts
    } else if (cadenceDTE > 5.0) {
      cmiClassification = "motor_prioritization";
    }
    ```
  - **Issue**: If `stepTimeCvDTE > 5.0%` (e.g. step time CV improves by 50% from 0.08 to 0.04) while cadence DTE is $+2\%$, `cmiClassification` evaluates to `"no_interference"` instead of `"motor_prioritization"`.
  - **Fix**: Update line 78 to `else if (cadenceDTE > 5.0 || stepTimeCvDTE > 5.0)`.

### 1.3 3-Point Joint Kinematic Angles & Gait Cycle Normalization (`src/lib/gait/angles.ts`)
- **Biomechanical Formulas**:
  - **Knee Flexion**: $180^\circ - \angle(\text{Hip-Knee-Ankle})$. $0^\circ$ represents full extension (collinear leg). Max stance/swing flexion $\sim 60\text{--}70^\circ$.
  - **Hip Flexion/Extension**: Signed $180^\circ - \angle(\text{Shoulder-Hip-Knee})$ relative to walking direction. $+ = \text{Flexion}$ (anterior swing), $- = \text{Extension}$ (posterior stance).
  - **Ankle Angle**: $90^\circ - \angle(\text{Knee-Ankle-Toe})$ relative to $90^\circ$ neutral standing. $+ = \text{Dorsiflexion}$, $- = \text{Plantarflexion}$. Includes synthetic toe vector construction by reflecting heel across ankle if toe visibility $< 0.3$.
- **Signal Filtering & Normalization**:
  - Trajectories filtered with zero-phase 4th-order Butterworth LPF ($f_c = 6.0\text{ Hz}$) at effective sampling rate.
  - Stride segmentation driven by same-side heel strike events ($L \to L, R \to R$).
  - Resamples each stride to 101 uniform percentage points ($0.0\%$ to $100.0\%$) using linear interpolation.
  - Computes ensemble mean curves across all strides, Peak ROM ($\text{Max} - \text{Min}$), and Peak Flexion / Extension / Dorsiflexion / Plantarflexion values.
  - Computes ROM Asymmetry %: $\frac{|\text{ROM}_L - \text{ROM}_R|}{\max(\text{ROM}_L, \text{ROM}_R)} \times 100\%$.
- **Normative Reference Data**:
  - `getNormativeGaitCurves()` delivers Perry & Burnfield (2010) normative mean, min, and max bounds over 101 points.
- **View Angle Suppression**:
  - When `viewAngle === "frontal"`, sets `isSuppressed = true` with explanation: *"Joint kinematic angles in the sagittal plane (flexion/extension) cannot be reliably computed from a frontal camera view."*

### 1.4 Interactive Joint Angles Chart (`src/components/gait/JointAnglesChart.tsx`)
- **Recharts Integration**: Uses `ComposedChart` rendering:
  - `<Area dataKey="normativeRange" />`: Shaded Perry & Burnfield normative envelope (gray fill, opacity 0.25).
  - `<Line dataKey="leftAngle" />`: Solid blue curve ($2.5\text{px}$) for Left joint trajectory.
  - `<Line dataKey="rightAngle" />`: Dashed red curve ($2.5\text{px}$) for Right joint trajectory.
- **Interactive UI**: Tab selector buttons for "Knee", "Hip", "Ankle". Stat badges for Left/Right Peak ROM, Peak Flexion/Extension, and ROM Asymmetry %. View suppression warning banner when `isSuppressed` is true.

---

## 2. Critical Integration Disconnect Analysis

### 2.1 The Bug
In `GaitApp.tsx` (lines 399–522), `runAnalysis()` extracts 30 Hz uniform `PoseFrame[]`, filters them, detects events, and calls:
```ts
const metrics = computeGaitMetrics(frames);
```
`computeGaitMetrics` does **NOT** call `computeGaitAngleAnalysis(frames, metrics.stepEvents, metrics.viewAngle, walkDir)`.
`AnalysisResult` in `types.ts` does **NOT** contain an `angleAnalysis` property.

When `GaitApp.tsx` sets `result`, `analysis` is created as:
```ts
const analysis: AnalysisResult = {
  metrics,
  guesses,
  personId: selectedPersonId,
  analyzedFrames: frames.length,
  taskMode,
  dualTaskCost,
  notes: [...],
};
```
Notice `angleAnalysis` is missing!

Consequently:
1. In `ReportPanel.tsx` (lines 16–22):
   ```ts
   const angleAnalysis = useMemo(() => {
     return computeGaitAngleAnalysis(
       [], // <--- EMPTY ARRAY PASSED!
       result.metrics.stepEvents || [],
       result.metrics.viewAngle || "unknown",
     );
   }, [result]);
   ```
2. In `CognitiveClusters.tsx` (lines 46–52):
   ```ts
   const derivedAngleAnalysis =
     angleAnalysis ||
     computeGaitAngleAnalysis(
       [], // <--- EMPTY ARRAY PASSED!
       metrics.stepEvents || [],
       metrics.viewAngle || "unknown",
     );
   ```
3. In `ClinicalReportView.tsx` (lines 58–65):
   ```ts
   const derivedAngleAnalysis = useMemo(() => {
     if (angleAnalysis) return angleAnalysis;
     return computeGaitAngleAnalysis(
       [], // <--- EMPTY ARRAY PASSED!
       result.metrics.stepEvents || [],
       result.metrics.viewAngle || "unknown",
     );
   }, [angleAnalysis, result]);
   ```

When `computeGaitAngleAnalysis([], ...)` is invoked with an empty array `[]`, `angles.ts` (lines 312–350) returns:
- `normalizedPoints` containing 101 points where all joint angles (`kneeAngleLeft`, `kneeAngleRight`, `hipAngleLeft`, etc.) are `null`.
- `metrics` where all ROM metrics (`kneeRomLeft`, `kneeRomRight`, `hipRomLeft`, etc.) are `null`.

### 2.2 Clinical & Visual Impact
- **`JointAnglesChart` in Stage 3 (`CognitiveClusters.tsx`)**: Renders empty chart canvas with no lines, and stat badges display `Left Peak ROM: —`, `Right Peak ROM: —`, `ROM Asymmetry: —`.
- **ROM Summary Table & `JointAnglesChart` in Stage 4 (`ClinicalReportView.tsx`)**: Table rows render `—` for all joints across Left Peak ROM, Right Peak ROM, Peak Flexion, Peak Extension, and ROM Asymmetry %.
- **Printable PDF Export**: Generated PDF reports lack all joint kinematic trajectory curves and ROM data.

---

## 3. Concrete Fix Recommendations for Implementer Agent

To completely resolve the integration disconnect and fix the CMI classification edge case, the following changes must be implemented:

### Step 1: Update `AnalysisResult` Interface in `src/lib/gait/types.ts`
Add `angleAnalysis?: GaitAngleAnalysis;` to `AnalysisResult`:
```typescript
import type { GaitAngleAnalysis } from "./angles";

export type AnalysisResult = {
  metrics: GaitMetrics;
  guesses: EducatedGuess[];
  personId: number;
  analyzedFrames: number;
  notes: string[];
  taskMode: TaskMode;
  dualTaskCost?: DualTaskCost;
  /** Normalized 101-point joint kinematic trajectories & ROM metrics */
  angleAnalysis?: GaitAngleAnalysis;
};
```

### Step 2: Compute and Attach `angleAnalysis` in `src/components/gait/GaitApp.tsx`
In `GaitApp.tsx` inside `runAnalysis()` (around line 495):
```typescript
import { computeGaitAngleAnalysis } from "@/lib/gait/angles";

// ... inside runAnalysis() ...
const metrics = computeGaitMetrics(frames);
const angleAnalysis = computeGaitAngleAnalysis(
  frames,
  metrics.stepEvents || [],
  metrics.viewAngle || "unknown",
);

const analysis: AnalysisResult = {
  metrics,
  guesses,
  personId: selectedPersonId,
  analyzedFrames: frames.length,
  taskMode,
  dualTaskCost,
  angleAnalysis, // <--- Attach angleAnalysis!
  notes: [...],
};
```

### Step 3: Pass `angleAnalysis` to Components in `GaitApp.tsx`, `ReportPanel.tsx`, `CognitiveClusters.tsx`, and `ClinicalReportView.tsx`

1. **In `GaitApp.tsx` (around line 1163)**:
   ```tsx
   <CognitiveClusters
     metrics={result.metrics}
     dualTaskCost={result.dualTaskCost}
     angleAnalysis={result.angleAnalysis}
   />
   ```

2. **In `ReportPanel.tsx`**:
   Remove `computeGaitAngleAnalysis([], ...)` and pass `result.angleAnalysis`:
   ```tsx
   export function ReportPanel({ result }: { result: AnalysisResult }) {
     // ...
     return (
       <ClinicalReportView
         result={result}
         patientMeta={patientMeta}
         angleAnalysis={result.angleAnalysis}
         onUpdateMeta={handleUpdateMeta}
         onPrint={() => window.print()}
       />
     );
   }
   ```

3. **In `CognitiveClusters.tsx` and `ClinicalReportView.tsx`**:
   Ensure `derivedAngleAnalysis` falls back to `result.angleAnalysis` or `angleAnalysis` before checking `computeGaitAngleAnalysis`.

### Step 4: Fix Motor Prioritization Edge Case in `src/lib/gait/dte.ts`
Update lines 78–79 of `dte.ts`:
```typescript
  // Before:
  // } else if (cadenceDTE > 5.0) {

  // After:
  } else if (cadenceDTE > 5.0 || stepTimeCvDTE > 5.0) {
    cmiClassification = "motor_prioritization";
  }
```

### Step 5: Verification & Regression Testing
1. Run full unit test suite: `npm test`.
2. Add integration unit tests verifying that `angleAnalysis` is populated with non-null 101-point trajectories when `computeGaitAngleAnalysis` is called with valid frames and attached to `AnalysisResult`.
3. Verify type checking (`npm run typecheck`), linting (`npm run lint`), and production build (`npm run build`).

---

## 4. Verification & Audit Trail Summary

| Check / Domain | Status | Notes |
|---|---|---|
| Zifchock SA Formula | VERIFIED | Reference-free, bounded $[0, 50]\%$, zero-phase safe |
| Plummer & Eskes DTE & CMI | VERIFIED (with 1 edge fix) | Kelly et al. signed DTE formulas correct; line 78 edge case noted |
| 3-Point Joint Kinematics | VERIFIED | 3-point vectors, signed hip angle, synthetic toe fallback for ankle |
| 0–100% Stride Normalization | VERIFIED | Resamples each same-side stride to 101 points with linear interpolation |
| Recharts Joint Angles Chart | VERIFIED | Interactive Knee/Hip/Ankle tabs, Perry & Burnfield normative range band |
| GaitApp & Report Integration | DISCONNECTED (Fixed in plan) | `frames` lost between analysis and chart; fix strategy detailed above |
| Test Suite Status | 100% PASS | 37 test files, 296 tests green |
