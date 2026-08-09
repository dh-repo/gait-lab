# Analysis Report: Refactoring `src/lib/gait/analysis.ts` for Milestone 2 (Feature 9)

**Author:** Explorer 1 (m2_r1_1)  
**Target Files:** `src/lib/gait/analysis.ts`, `src/lib/gait/types.ts`  
**Dependencies:** `src/lib/gait/signal.ts`, `src/lib/gait/events.ts`, `src/lib/gait/symmetry.ts`, `src/lib/gait/smoothness.ts`, `src/lib/gait/dte.ts`  

---

## 1. Executive Summary

Milestone 1 successfully engineered five state-of-the-art (SOTA) scientific modules for gait processing:
1. `signal.ts`: 4th-order zero-phase low-pass Butterworth filter ($f_c = 6.0\text{ Hz}$) and FFT spectral decomposition.
2. `events.ts`: Zeni Kinematic Gait Event Detection algorithm (Anterior-Posterior foot displacement relative to mid-hip).
3. `symmetry.ts`: Reference-free Zifchock Symmetry Angle ($SA$) and Gait Symmetry Index ($GSI$).
4. `smoothness.ts`: Harmonic Ratio ($HR$) calculation via FFT for trunk rhythmicity.
5. `dte.ts`: Standardized Dual-Task Effect ($DTE$) formulas and Cognitive-Motor Interference ($CMI$) taxonomy.

Currently, `src/lib/gait/analysis.ts` relies on naive heuristics (5-point boxcar moving average smoothing, ad-hoc ankle-Y peak search, simple percentage asymmetry, and unstandardized dual-task costs).

This investigation maps out the exact refactoring required to integrate all five SOTA modules into `analysis.ts` and `types.ts`, providing complete code snippets, data type updates, boundary safety guarantees, and downstream component compatibility checks.

---

## 2. Type Adjustments in `src/lib/gait/types.ts`

To store and expose the SOTA biomechanical metrics across the application UI, database, and rating engine, `GaitMetrics` and `DualTaskCost` in `src/lib/gait/types.ts` must be extended.

### 2.1 Proposed Code Changes for `src/lib/gait/types.ts`

```typescript
// Import SOTA types from core modules
import type { GaitEvent } from "./events";
import type { DTEAnalysis } from "./dte";

export type ViewAngle = "sagittal" | "frontal" | "oblique" | "unknown";

export type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

export type PoseFrame = {
  timeMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

export type TrackedPerson = {
  id: number;
  color: string;
  sampleBox: { x: number; y: number; w: number; h: number };
  sampleFrameIndex: number;
  frameCount: number;
};

export type TaskMode = "single" | "dual";

export type GaitMetrics = {
  viewAngle: ViewAngle;
  viewConfidence: number;
  durationSec: number;
  fpsEffective: number;
  stepCount: number;
  cadenceSpm: number;
  avgStepTimeSec: number;
  stepTimeAsymmetry: number;
  strideAsymmetry: number;
  lateralSway: number;
  verticalBounce: number;
  armSwingLeft: number;
  armSwingRight: number;
  armSwingAsymmetry: number;
  kneeFlexLeft: number;
  kneeFlexRight: number;
  kneeAsymmetry: number;
  stepWidthVariability: number;
  doubleSupportHint: number;
  stepTimeCV: number;
  strideTimeCV: number;
  pelvicObliquity: number;
  pelvicObliquityVar: number;
  meanStepWidth: number;
  pathSmoothness: number;

  // --- NEW SOTA BIOMECHANICAL METRICS ---
  /** Zeni Gait Phase Breakdown (Stance % and Swing %) */
  leftStancePct: number;
  rightStancePct: number;
  leftSwingPct: number;
  rightSwingPct: number;
  doubleSupportPct: number;

  /** Zifchock Symmetry Angle (SA) in % [0, 50]% (0% = perfect symmetry) */
  symmetryAngle: number;

  /** Trunk Harmonic Ratios via FFT */
  harmonicRatioVertical: number;
  harmonicRatioLateral: number;
  harmonicRatio: number; // Overall geometric mean HR

  // --- SCORES ---
  stabilityScore: number;
  rhythmScore: number;
  symmetryScore: number;
  mobilityScore: number;
  automaticityScore: number;
  overallScore: number;

  series: {
    t: number;
    midHipX: number;
    midHipY: number;
    leftAnkleY: number;
    rightAnkleY: number;
    leftWristX: number;
    rightWristX: number;
    leftKneeAngle: number;
    rightKneeAngle: number;
  }[];

  /** Classified gait events (Heel Strike & Toe Off) with side and timestamp */
  stepEvents: GaitEvent[];
};

export type DualTaskCost = {
  cadenceCostPct: number;
  stepTimeCvCostPct: number;
  stabilityCostPts: number;
  automaticityCostPts: number;
  summary: string;

  // --- NEW STANDARDIZED DTE FIELDS ---
  cadenceDTE?: number;
  stepTimeCvDTE?: number;
  symmetryDTE?: number;
  cmiClassification?: DTEAnalysis["cmiClassification"];
};
```

---

## 3. Concrete Refactoring Plan for `src/lib/gait/analysis.ts`

### 3.1 Module Imports Setup
Replace and add imports at top of `src/lib/gait/analysis.ts`:

```typescript
import { zeroPhaseButterworth } from "./signal";
import { detectGaitEventsZeni, type GaitEvent } from "./events";
import { symmetryAngle, gaitSymmetryIndex } from "./symmetry";
import { computeHarmonicRatio } from "./smoothness";
import { calculateDTE, type DTEAnalysis } from "./dte";
import {
  LM,
  angleDeg,
  boundingBox,
  clamp,
  dist,
  hipCenter,
  mean,
  mid,
  range,
  std,
  torsoHeight,
} from "./landmarks";
import type {
  DualTaskCost,
  GaitMetrics,
  Landmark,
  PoseFrame,
  TrackedPerson,
  ViewAngle,
} from "./types";
import { PERSON_COLORS } from "./landmarks";
```

---

### 3.2 Integration 3a: Zero-Phase 4th-Order Butterworth Filter (`signal.ts`)

**Current State:** Naive `smooth(values: number[], window = 5)` boxcar moving average.  
**SOTA Replacement:** `zeroPhaseButterworth(data, fps, 6.0)`

In `computeGaitMetrics(frames: PoseFrame[])`:

```typescript
const fps = Math.max(1, fpsEffective);

// Filter raw landmark time-series trajectories using zero-phase 4th-order Butterworth low-pass filter (fc = 6.0 Hz)
const leftY = zeroPhaseButterworth(series.map((s) => s.leftAnkleY), fps, 6.0);
const rightY = zeroPhaseButterworth(series.map((s) => s.rightAnkleY), fps, 6.0);
const leftX = zeroPhaseButterworth(series.map((s) => s.leftAnkleX), fps, 6.0);
const rightX = zeroPhaseButterworth(series.map((s) => s.rightAnkleX), fps, 6.0);
const midHipX = zeroPhaseButterworth(series.map((s) => s.midHipX), fps, 6.0);
const midHipY = zeroPhaseButterworth(series.map((s) => s.midHipY), fps, 6.0);
const leftWristRel = zeroPhaseButterworth(series.map((s) => s.leftWristRel), fps, 6.0);
const rightWristRel = zeroPhaseButterworth(series.map((s) => s.rightWristRel), fps, 6.0);
const leftKneeAngle = zeroPhaseButterworth(series.map((s) => s.leftKneeAngle), fps, 6.0);
const rightKneeAngle = zeroPhaseButterworth(series.map((s) => s.rightKneeAngle), fps, 6.0);
```

**Rationale:** `zeroPhaseButterworth` performs boundary-reflected forward and backward filtering, completely eliminating phase shift/delay while preserving true physical peak locations for kinematic event detection.

---

### 3.3 Integration 3b: Zeni Kinematic Gait Event Detection (`events.ts`)

**Current State:** Simple peak finding on ankle-Y with heuristic fallback. Naive double support calculation.  
**SOTA Replacement:** `detectGaitEventsZeni(frames, fpsEffective)`

```typescript
// Execute Zeni Kinematic Event Detection Algorithm
const zeniBreakdown = detectGaitEventsZeni(frames, fpsEffective);

const leftStancePct = zeniBreakdown.leftStancePct;
const rightStancePct = zeniBreakdown.rightStancePct;
const leftSwingPct = zeniBreakdown.leftSwingPct;
const rightSwingPct = zeniBreakdown.rightSwingPct;
const doubleSupportPct = zeniBreakdown.doubleSupportPct;
const doubleSupportHint = Number((doubleSupportPct / 100).toFixed(2));

// Extract Heel Strike events for step timing calculation
let stepEvents: GaitEvent[] = zeniBreakdown.stepEvents;

// Fallback for extreme low-frame or stationary video clips if Zeni returns fewer than 4 events
if (stepEvents.length < 4) {
  const times = series.map((s) => s.t);
  const oscSteps = estimateStepsFromOscillation(midHipY, times, durationSec);
  stepEvents = oscSteps.map((s, idx) => ({
    frame: Math.round(s.t * fpsEffective),
    timeSec: s.t,
    type: "heel_strike" as const,
    side: s.side === "L" ? "left" as const : "right" as const,
  }));
}

// Calculate step and stride timing statistics from Heel Strikes
const heelStrikes = stepEvents.filter((e) => e.type === "heel_strike");
const stepCount = heelStrikes.length;
const cadenceSpm = durationSec > 0 ? (stepCount / durationSec) * 60 : 0;

const stepIntervals: number[] = [];
for (let i = 1; i < heelStrikes.length; i++) {
  stepIntervals.push(heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec);
}
const avgStepTimeSec = mean(stepIntervals) || 0;
const stepTimeCV = avgStepTimeSec > 1e-6 ? std(stepIntervals) / avgStepTimeSec : 0;

// Same-side stride intervals
const strideIntervals: number[] = [];
for (const side of ["left", "right"] as const) {
  const sideStrikes = heelStrikes.filter((e) => e.side === side);
  for (let i = 1; i < sideStrikes.length; i++) {
    strideIntervals.push(sideStrikes[i].timeSec - sideStrikes[i - 1].timeSec);
  }
}
const meanStride = mean(strideIntervals);
const strideTimeCV = meanStride > 1e-6 ? std(strideIntervals) / meanStride : stepTimeCV;
```

---

### 3.4 Integration 3c: Zifchock's Symmetry Angle ($SA$) (`symmetry.ts`)

**Current State:** Raw percentage difference ratio `Math.abs(a - b) / max(a, b)`.  
**SOTA Replacement:** `symmetryAngle(valLeft, valRight)`

```typescript
// Separate left and right step time intervals
const leftIntervals: number[] = [];
const rightIntervals: number[] = [];
for (let i = 1; i < heelStrikes.length; i++) {
  const dt = heelStrikes[i].timeSec - heelStrikes[i - 1].timeSec;
  if (heelStrikes[i].side === "left") leftIntervals.push(dt);
  else rightIntervals.push(dt);
}

const meanLeftStepTime = mean(leftIntervals) || avgStepTimeSec;
const meanRightStepTime = mean(rightIntervals) || avgStepTimeSec;

// Compute Zifchock's Symmetry Angle for key gait domain variables
const stepTimeSA = symmetryAngle(meanLeftStepTime, meanRightStepTime);
const armSwingLeft = range(leftWristRel);
const armSwingRight = range(rightWristRel);
const armSwingSA = symmetryAngle(armSwingLeft, armSwingRight);

const kneeFlexLeft = range(leftKneeAngle);
const kneeFlexRight = range(rightKneeAngle);
const kneeFlexSA = symmetryAngle(kneeFlexLeft, kneeFlexRight);

// Overall composite Symmetry Angle
const symmetryAngleVal = Number(((stepTimeSA + armSwingSA + kneeFlexSA) / 3).toFixed(2));

// Deprecated percentage asymmetries retained for backwards compatibility
const stepTimeAsymmetry = asymmetryRatio(meanLeftStepTime, meanRightStepTime);
const armSwingAsymmetry = asymmetryRatio(armSwingLeft, armSwingRight);
const kneeAsymmetry = asymmetryRatio(kneeFlexLeft, kneeFlexRight);
const strideAsymmetry = stepTimeAsymmetry;

// Enhanced Symmetry Score using Zifchock Symmetry Angle
// SA range [0, 50]%, where 0% = perfect symmetry, >10% = marked asymmetry
const symmetryScore = clamp(100 - symmetryAngleVal * 1.8 - stepTimeSA * 0.8, 8, 98);
```

---

### 3.5 Integration 3d: Trunk Harmonic Ratio ($HR$) (`smoothness.ts`)

**Current State:** Simple detrended linear residual standard deviation `1 - std(det) / range(prog)`.  
**SOTA Replacement:** `computeHarmonicRatio(midHipY, midHipX, fpsEffective)`

```typescript
// Compute FFT Harmonic Ratio (HR) for trunk smooth rhythmicity
const hrMetrics = computeHarmonicRatio(midHipY, midHipX, fps);
const harmonicRatioVertical = hrMetrics.hrVertical;
const harmonicRatioLateral = hrMetrics.hrLateral;
const harmonicRatio = hrMetrics.overallHR;

// Combine path linearity with overall Harmonic Ratio for pathSmoothness
const prog = midHipX;
const det = detrend(prog);
const linearSmoothness = clamp(1 - std(det) / Math.max(range(prog), 0.02), 0, 1);
const pathSmoothness = Number((0.6 * linearSmoothness + 0.4 * Math.min(1.0, harmonicRatio / 3.0)).toFixed(2));

// Refine Rhythm Score incorporating Vertical Harmonic Ratio (HR_vert)
const rhythmScore = clamp(
  100 - stepTimeCV * 120 - Math.abs(cadenceSpm - 110) * 0.25 + (harmonicRatioVertical - 2.0) * 5,
  5,
  98,
);

// Refine Automaticity Score incorporating Lateral Harmonic Ratio (HR_lat)
const automaticityScore = clamp(
  100 - stepTimeCV * 180 - strideTimeCV * 80 - lateralSway * 200 - (1 - pathSmoothness) * 25 + (harmonicRatioLateral - 1.5) * 4,
  5,
  98,
);
```

---

### 3.6 Integration 3e: Standardized Dual-Task Effect ($DTE$) (`dte.ts`)

**Current State:** Unstandardized percentage delta cost in `computeDualTaskCost`.  
**SOTA Replacement:** `calculateDTE(single, dual)` integrated into `computeDualTaskCost`.

```typescript
export function computeDualTaskCost(
  single: GaitMetrics,
  dual: GaitMetrics,
): DualTaskCost {
  // Execute standardized DTE analysis (Kelly et al. 2010, Plummer & Eskes 2015)
  const dte = calculateDTE(single, dual);

  // Invert signs for cost representation where positive = performance cost (decline)
  const cadenceCostPct = Number((-dte.cadenceDTE).toFixed(1));
  const stepTimeCvCostPct = Number((-dte.stepTimeCvDTE).toFixed(1));
  const stabilityCostPts = Number((single.stabilityScore - dual.stabilityScore).toFixed(1));
  const automaticityCostPts = Number((single.automaticityScore - dual.automaticityScore).toFixed(1));

  let summary = `Dual-Task Effect (${dte.cmiClassification}): Cadence DTE = ${dte.cadenceDTE}%, Step Time CV DTE = ${dte.stepTimeCvDTE}%, Symmetry DTE = ${dte.symmetryDTE}%.`;

  if (dte.cmiClassification === "mutual_interference") {
    summary += " Significant cognitive-motor mutual interference observed: both cadence and step rhythmicity degraded markedly under dual-task conditions.";
  } else if (dte.cmiClassification === "cognitive_prioritization") {
    summary += " Cognitive prioritization observed: motor performance declined during secondary task execution.";
  } else if (dte.cmiClassification === "motor_prioritization") {
    summary += " Motor prioritization observed: gait cadence or symmetry improved during dual-task execution.";
  } else {
    summary += " No significant cognitive-motor interference detected (|DTE| <= 5%).";
  }

  return {
    cadenceCostPct,
    stepTimeCvCostPct,
    stabilityCostPts,
    automaticityCostPts,
    summary,
    cadenceDTE: dte.cadenceDTE,
    stepTimeCvDTE: dte.stepTimeCvDTE,
    symmetryDTE: dte.symmetryDTE,
    cmiClassification: dte.cmiClassification,
  };
}
```

---

### 3.7 Complete `emptyMetrics` Fallback Method in `analysis.ts`

When `frames.length < 5`, `emptyMetrics` must return all default fields:

```typescript
function emptyMetrics(frames: PoseFrame[]): GaitMetrics {
  return {
    viewAngle: "unknown",
    viewConfidence: 0,
    durationSec: frames.length ? (frames[frames.length - 1].timeMs - frames[0].timeMs) / 1000 : 0,
    fpsEffective: 0,
    stepCount: 0,
    cadenceSpm: 0,
    avgStepTimeSec: 0,
    stepTimeAsymmetry: 0,
    strideAsymmetry: 0,
    lateralSway: 0,
    verticalBounce: 0,
    armSwingLeft: 0,
    armSwingRight: 0,
    armSwingAsymmetry: 0,
    kneeFlexLeft: 0,
    kneeFlexRight: 0,
    kneeAsymmetry: 0,
    stepWidthVariability: 0,
    doubleSupportHint: 0,
    leftStancePct: 60.0,
    rightStancePct: 60.0,
    leftSwingPct: 40.0,
    rightSwingPct: 40.0,
    doubleSupportPct: 20.0,
    symmetryAngle: 0.0,
    harmonicRatioVertical: 1.0,
    harmonicRatioLateral: 1.0,
    harmonicRatio: 1.0,
    stepTimeCV: 0,
    strideTimeCV: 0,
    pelvicObliquity: 0,
    pelvicObliquityVar: 0,
    meanStepWidth: 0,
    pathSmoothness: 0,
    stabilityScore: 0,
    rhythmScore: 0,
    symmetryScore: 0,
    mobilityScore: 0,
    automaticityScore: 0,
    overallScore: 0,
    series: [],
    stepEvents: [],
  };
}
```

---

## 4. Downstream System Compatibility Analysis

1. **Database Layer (`migrations/0002_gait_sessions.sql` & `src/lib/gait/persistence.server.ts`)**:
   - `persistence.server.ts` already defines columns `symmetry_angle` and `harmonic_ratio` and extracts:
     `const extMetrics = metrics as GaitMetrics & { symmetryAngle?: number; harmonicRatio?: number };`
   - Adding `symmetryAngle` and `harmonicRatio` directly to `GaitMetrics` will populate these columns in Postgres automatically without schema changes.

2. **Ratings & Guesses Engines (`src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`)**:
   - Feature 11 will consume `leftStancePct`, `rightStancePct`, `leftSwingPct`, `rightSwingPct`, `doubleSupportPct`, `symmetryAngle`, `harmonicRatio`, and `cmiClassification`.
   - Preserving legacy score names (`stabilityScore`, `symmetryScore`, `rhythmScore`, `mobilityScore`, `automaticityScore`) guarantees zero regressions in existing score ring visualizations.

3. **UI Panels (`ReportPanel.tsx`, `MetricsPanel.tsx`)**:
   - Feature 12 will bind `symmetryAngle`, `harmonicRatio`, stance/swing breakdown percentages, and `cmiClassification`.

---

## 5. Verification Plan

1. **Static Analysis & Type Checks**:
   - Run `npm run typecheck` to ensure `GaitMetrics` and `DualTaskCost` updates compile cleanly without type mismatches.
2. **Unit Tests**:
   - Run `npm test` to verify existing tests in `src/lib/gait/__tests__/` pass cleanly.
   - Implement comprehensive tests in `src/lib/gait/__tests__/analysis.test.ts` validating:
     - Butterworth low-pass filtering on pose landmarks.
     - Zeni gait event breakdown accuracy on synthetic gait cycles.
     - Symmetry Angle calculation matching Zifchock formula.
     - Harmonic Ratio computation for vertical and lateral movement.
     - Standardized DTE calculation and CMI classification.
