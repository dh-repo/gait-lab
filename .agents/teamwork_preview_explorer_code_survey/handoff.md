# Handoff Report — Code Survey & Biomechanical Architecture for Gait Cycle Kinematics

## 1. Observation

### 1.1 Existing Codebase & Data Structures (`src/lib/gait/`)
- **`types.ts`**:
  - `Landmark`: `{ x: number, y: number, z: number, visibility?: number }`
  - `PoseFrame`: `{ timeMs: number, landmarks: Landmark[], worldLandmarks?: Landmark[] }`
  - `GaitMetrics`: Contains gait metrics (`viewAngle`, `cadenceSpm`, `stepTimeCV`, `leftStancePct`, `rightStancePct`, `symmetryAngle`, `series`, `stepEvents`, etc.).
  - `AnalysisResult`: Wraps `metrics`, `guesses`, `personId`, `analyzedFrames`, `notes`, `taskMode`, `dualTaskCost`.

- **`landmarks.ts`**:
  - MediaPipe Pose landmark indices mapping (`LM` object):
    - `LM.L_SHOULDER = 11`, `LM.R_SHOULDER = 12`
    - `LM.L_HIP = 23`, `LM.R_HIP = 24`
    - `LM.L_KNEE = 25`, `LM.R_KNEE = 26`
    - `LM.L_ANKLE = 27`, `LM.R_ANKLE = 28`
    - `LM.L_HEEL = 29`, `LM.R_HEEL = 30`
    - `LM.L_FOOT = 31` (Left foot index/toe), `LM.R_FOOT = 32` (Right foot index/toe)
  - Helper functions: `angleDeg(a, b, c)` calculates interior angle $\angle ABC$ at vertex $B$ in degrees ($0\text{--}180^\circ$).

- **`pose.ts`**:
  - Implements `resamplePoseFrames(frames, targetFps)` using Catmull-Rom cubic spline interpolation on `PoseFrame[]` coordinates.

- **`events.ts`**:
  - `detectGaitEventsZeni(frames, fps)`: Detects Heel Strike (Initial Contact) and Toe Off (Terminal Contact) using zero-phase Butterworth pre-filtered (6.0 Hz) relative AP displacement of heel/toe relative to mid-hip (`filtLHeel`, `filtLToe`, `filtRHeel`, `filtRToe`).
  - Extrema peak finding (`findExtrema`) with peak prominence filtering and 3-point parabolic subframe timestamp refinement (`refinePeakTimestamp`).
  - Returns `stepEvents: GaitEvent[]` where `GaitEvent = { frame: number, timeSec: number, type: "heel_strike" | "toe_off", side: "left" | "right" }`.

- **`analysis.ts`**:
  - `computeGaitMetrics(frames)` builds time-series for `leftKneeAngle` and `rightKneeAngle` via `angleDeg`, runs `detectGaitEventsZeni`, and attaches `stepEvents` to `GaitMetrics`.

- **`ratings.ts` & `ReportPanel.tsx`**:
  - Domain scores generated for `overall`, `stability`, `symmetry`, `rhythm`, `mobility`, `automaticity`, `data_quality`.
  - Recharts 2.13.0 installed in `package.json`.

---

## 2. Logic Chain

### 2.1 Joint Kinematic Angle Computation (2D Sagittal View)

To compute joint angle trajectories that align with biomechanical clinical standards (e.g. Perry & Burnfield *Gait Analysis: Normal and Pathological Function*):

1. **Knee Flexion/Extension Angle**:
   - Vertex: Knee ($B = \text{Knee}$, index 25/26).
   - Endpoints: Hip ($A = \text{Hip}$, index 23/24) and Ankle ($C = \text{Ankle}$, index 27/28).
   - Interior angle: $\theta_{\text{int}} = \text{angleDeg}(\text{Hip}, \text{Knee}, \text{Ankle})$.
   - Biomechanical convention (Perry & Burnfield): $0^\circ$ = full anatomical extension (standing straight).
   - **Formula**:
     $$\theta_{\text{knee\_flexion}} = 180^\circ - \theta_{\text{int}}$$

2. **Hip Flexion/Extension Angle**:
   - Vertex: Hip ($B = \text{Hip}$, index 23/24).
   - Endpoints: Shoulder ($A = \text{Shoulder}$, index 11/12) and Knee ($C = \text{Knee}$, index 25/26).
   - Signed 2D angle relative to trunk vector ($\vec{V}_{\text{trunk}} = \text{Hip} - \text{Shoulder}$, $\vec{V}_{\text{thigh}} = \text{Knee} - \text{Hip}$):
   - **Formula**:
     $$\theta_{\text{hip\_raw}} = 180^\circ - \text{angleDeg}(\text{Shoulder}, \text{Hip}, \text{Knee})$$
     $$\text{Sign} = \text{sign}\left((\text{Knee}_x - \text{Hip}_x) \times \text{walkDirection}\right)$$
     $$\theta_{\text{hip\_flexion}} = \text{Sign} \times \theta_{\text{hip\_raw}}$$
     *(Where $+ = \text{Flexion (anterior swing)}$, $- = \text{Extension (posterior stance)}$)*.

3. **Ankle Dorsiflexion/Plantarflexion Angle**:
   - Vertex: Ankle ($B = \text{Ankle}$, index 27/28).
   - Endpoints: Knee ($A = \text{Knee}$, index 25/26) and Toe/Foot Index ($C = \text{Foot}$, index 31/32).
   - Neutral standing position ($\angle \text{Knee-Ankle-Toe} = 90^\circ$): $0^\circ$.
   - **Formula**:
     $$\theta_{\text{ankle}} = \text{angleDeg}(\text{Knee}, \text{Ankle}, \text{Toe}) - 90^\circ$$
     *(Where $+ = \text{Dorsiflexion}$, $- = \text{Plantarflexion}$)*.

### 2.2 Gait Cycle Time-Normalization ($0\text{--}100\%$)

1. **Stride Segmentation**:
   - A gait cycle is defined between two consecutive Heel Strikes ($\text{HS}_i$ and $\text{HS}_{i+1}$) of the **same leg**.
   - Stride duration: $T = t(\text{HS}_{i+1}) - t(\text{HS}_i)$.
   - Normalized time $p \in [0, 100\%]$ for any timestamp $t \in [t(\text{HS}_i), t(\text{HS}_{i+1})]$:
     $$p(t) = \frac{t - t(\text{HS}_i)}{T} \times 100\%$$

2. **101-Point Resampling**:
   - Discrete evaluation points: $p_k = k$ for $k = 0, 1, 2, \dots, 100$.
   - Using 1D linear or Catmull-Rom cubic spline interpolation across normalized stride timestamps, map the raw joint angle trajectory $\theta(t)$ to $\theta(p_k)$.
   - Averaging across all valid strides for Left and Right legs produces:
     - Mean trajectory array $\bar{\theta}_{\text{left}}[0..100]$, $\bar{\theta}_{\text{right}}[0..100]$
     - Standard deviation / envelope bounds.

3. **Peak Range of Motion (ROM) & Metrics**:
   - $\text{ROM}_{\text{joint}} = \max_{k}(\bar{\theta}[k]) - \min_{k}(\bar{\theta}[k])$
   - Peak Stance Flexion, Peak Swing Flexion, Peak Extension.

### 2.3 Normative Reference Curves (Perry & Burnfield Gait Analysis)

- **Knee Flexion ($0^\circ \text{ extension}$)**:
  - 0% (Initial Contact): $0\text{--}5^\circ$
  - 15% (Loading Response): $15\text{--}20^\circ$
  - 40% (Terminal Stance): $0\text{--}5^\circ$
  - 60% (Toe Off / Pre-Swing): $35\text{--}40^\circ$
  - 73% (Peak Swing Flexion): $60\text{--}65^\circ$
  - 100% (Terminal Swing): $0\text{--}5^\circ$

- **Hip Flexion/Extension ($+ = \text{Flexion}, - = \text{Extension}$)**:
  - 0% (Initial Contact): $+30^\circ$
  - 50% (Terminal Stance): $-10\text{ to }-15^\circ$
  - 60% (Toe Off): $0^\circ$
  - 85–90% (Peak Swing Flexion): $+30^\circ$
  - 100% (Terminal Swing): $+30^\circ$

- **Ankle Dorsiflexion/Plantarflexion ($+ = \text{Dorsiflexion}, - = \text{Plantarflexion}$)**:
  - 0% (Initial Contact): $0^\circ$
  - 10% (Loading Response): $-3\text{ to }-5^\circ$
  - 45–50% (Terminal Stance): $+10\text{ to }+12^\circ$
  - 60% (Push Off / Toe Off): $-15\text{ to }-20^\circ$
  - 75–100% (Swing Phase): $0^\circ$ (foot clearance)

---

## 3. Recommended Module Interfaces & Architecture

### 3.1 New Module: `src/lib/gait/angles.ts`

```typescript
import type { Landmark, PoseFrame, ViewAngle } from "./types";
import type { GaitEvent } from "./events";

export interface JointAnglePoint {
  /** Gait cycle percentage (0.0 to 100.0%) */
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
  hipRomLeft: number | null;
  hipRomRight: number | null;
  hipPeakFlexionLeft: number | null;
  hipPeakExtensionLeft: number | null;
  hipPeakFlexionRight: number | null;
  hipPeakExtensionRight: number | null;
  ankleRomLeft: number | null;
  ankleRomRight: number | null;
  anklePeakDorsiflexionLeft: number | null;
  anklePeakDorsiflexionRight: number | null;
  anklePeakPlantarflexionLeft: number | null;
  anklePeakPlantarflexionRight: number | null;
}

export interface NormalizedGaitCycle {
  side: "left" | "right";
  strideIndex: number;
  startTimeSec: number;
  endTimeSec: number;
  toeOffPct: number;
  points: JointAnglePoint[];
}

export interface GaitAngleAnalysis {
  normalizedPoints: JointAnglePoint[]; // 101-point mean trajectory
  leftStrides: NormalizedGaitCycle[];
  rightStrides: NormalizedGaitCycle[];
  metrics: JointAngleMetrics;
  normativeData: NormativeRangePoint[];
}

/** Core export functions */
export function calculateKneeFlexion(hip: Landmark, knee: Landmark, ankle: Landmark): number;
export function calculateHipFlexion(shoulder: Landmark, hip: Landmark, knee: Landmark, dir: number): number;
export function calculateAnkleAngle(knee: Landmark, ankle: Landmark, toe: Landmark, dir: number): number;

export function computeGaitAngleAnalysis(
  frames: PoseFrame[],
  events: GaitEvent[],
  viewAngle: ViewAngle,
  walkDirection = 1,
): GaitAngleAnalysis;

export function getNormativeGaitCurves(): NormativeRangePoint[];
```

### 3.2 UI Components Architecture

1. **`JointAnglesChart.tsx`**:
   - Uses Recharts `ResponsiveContainer`, `ComposedChart` / `LineChart`, `Area` (for shaded normative range band), `Line` (for Left vs Right trajectories), `XAxis` ($0\text{--}100\%$), `YAxis` (Degrees), `Tooltip`, `Legend`.
   - Tabs or toggle for Knee, Hip, and Ankle joint selection.
   - ROM metric badges rendered above the chart.
   - View angle suppression notice when `viewAngle === "frontal"`.

2. **`ClinicalReportView.tsx`**:
   - 5-Domain Radar Chart using Recharts `RadarChart`, `PolarGrid`, `PolarAngleAxis`, `PolarRadiusAxis`, `Radar` with domains:
     - Pace (Mobility)
     - Symmetry
     - Smoothness
     - Rhythmicity
     - Stability
   - Editable/input fields for Patient Metadata (Patient ID, Clinician Notes, Date, Condition).
   - `@media print` CSS block formatting report into a clean, professional A4 / Letter PDF printout.

3. **`ReportPanel.tsx` Integration**:
   - Add "Print / Export Clinical PDF" button at top of `ReportPanel.tsx` and integrate `ClinicalReportView` print target.

---

## 4. Caveats

1. **View Angle Constraints**:
   - 2D sagittal kinematics require side or oblique views. Frontal view angles distort knee and hip flexion projection. `JointAnglesChart.tsx` must display a clean "View Suppressed (Requires Sagittal/Oblique View)" banner when `viewAngle === "frontal"`.
2. **Foot Landmark Visibility**:
   - MediaPipe toe/foot landmarks (index 31 and 32) may occasionally drop in visibility when feet are near the frame boundary. Ankle angle computation should gracefully fall back to default neutral $90^\circ$ or null when visibility $< 0.3$.
3. **No Code Modifications Made**:
   - This survey is read-only. Source code implementation will be performed by the implementer agent.

---

## 5. Conclusion

The codebase is fully equipped with MediaPipe landmarks, stride event detection (`detectGaitEventsZeni`), and filtering primitives necessary to build `angles.ts`, `JointAnglesChart.tsx`, and `ClinicalReportView.tsx`. The proposed architecture and 101-point normalization scheme align directly with clinical literature standards (Perry & Burnfield).

---

## 6. Verification Method

To verify implementation once completed by implementer:

1. **Unit Testing (`src/lib/gait/__tests__/angles.test.ts`)**:
   - Verify 3-point angle functions for knee extension ($0^\circ$), right-angle flex ($90^\circ$), and hip flexion/extension.
   - Verify `computeGaitAngleAnalysis` generates exactly 101 normalized points ($0\text{--}100\%$).
   - Verify ROM metrics calculate $\max - \min$ correctly.

2. **Full Pipeline Test**:
   - Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` to confirm 0 errors.
