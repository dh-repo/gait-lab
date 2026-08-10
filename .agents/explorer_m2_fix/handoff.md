# Handoff Report: Milestone 2 Fix Strategy (Iteration 2)

**Task**: Formulate an exact line-by-line fix strategy for `src/components/gait/__tests__/challenger_m2_2_stress.test.tsx` to resolve all 10 TypeScript compilation errors.

---

## 1. Observation

### 1.1 Typecheck Audit Failure
Executing `npm run typecheck` produced 10 TypeScript compilation errors in `src/components/gait/__tests__/challenger_m2_2_stress.test.tsx`:

```
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(54,3): error TS2322: Type '"side"' is not assignable to type 'ViewAngle'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(57,5): error TS2739: Type '{ ci95Lower: number; ci95Upper: number; }' is missing the following properties from type 'ReliabilityBounds': value, splitHalfDiff
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(58,5): error TS2739: Type '{ ci95Lower: number; ci95Upper: number; }' is missing the following properties from type 'ReliabilityBounds': value, splitHalfDiff
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(59,5): error TS2739: Type '{ ci95Lower: number; ci95Upper: number; }' is missing the following properties from type 'ReliabilityBounds': value, splitHalfDiff
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(60,5): error TS2739: Type '{ ci95Lower: number; ci95Upper: number; }' is missing the following properties from type 'ReliabilityBounds': value, splitHalfDiff
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(62,3): error TS2322: Type '{ t: number; midHipX: number; midHipY: number; leftAnkleY: number; rightAnkleY: number; leftKneeAngle: number; rightKneeAngle: number; }[]' is not assignable to type '{ t: number; midHipX: number; midHipY: number; leftAnkleY: number; rightAnkleY: number; leftWristX: number; rightWristX: number; leftKneeAngle: number; rightKneeAngle: number; }[]'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(107,3): error TS2322: Type '{ kneeMin: number; kneeMax: number; hipMin: number; hipMax: number; ankleMin: number; ankleMax: number; }[]' is not assignable to type 'NormativeRangePoint[]'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(118,3): error TS2353: Object literal may only specify known properties, and 'baselineCadence' does not exist in type 'DualTaskCost'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(138,5): error TS2322: Type '"rhythm_variability"' is not assignable to type 'GuessCategory'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(149,5): error TS2820: Type '"asymmetry"' is not assignable to type 'GuessCategory'. Did you mean '"symmetry"'?
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(207,9): error TS2322: Type 'undefined' is not assignable to type 'JointAngleMetrics'.
src/components/gait/__tests__/challenger_m2_2_stress.test.tsx(250,9): error TS2820: Type '"front"' is not assignable to type 'ViewAngle'. Did you mean '"frontal"'?
```

### 1.2 Type Definitions Analysis
- **`ViewAngle`** in `@/lib/gait/types.ts:5`: `"sagittal" | "frontal" | "oblique" | "unknown"`.
- **`ReliabilityBounds`** in `@/lib/gait/types.ts:38-46`: Requires `value: number | null`, `ci95Lower: number | null`, `ci95Upper: number | null`, `splitHalfDiff: number | null`.
- **`GaitMetrics.series`** in `@/lib/gait/types.ts:98-108`: Requires `t`, `midHipX`, `midHipY`, `leftAnkleY`, `rightAnkleY`, `leftWristX`, `rightWristX`, `leftKneeAngle`, `rightKneeAngle`.
- **`NormativeRangePoint`** in `@/lib/gait/angles.ts:17-28`: Requires `gaitCyclePct`, `kneeMean`, `kneeMin`, `kneeMax`, `hipMean`, `hipMin`, `hipMax`, `ankleMean`, `ankleMin`, `ankleMax`.
- **`DualTaskCost`** in `@/lib/gait/types.ts:139-150`: Requires `cadenceCostPct`, `stepTimeCvCostPct`, `stabilityCostPts`, `automaticityCostPts`, `summary`. Optional: `cadenceDTE`, `stepTimeCvDTE`, `symmetryDTE`, `cmiClassification`. Invalid: `baselineCadence`, `dualTaskCadence`, etc.
- **`GuessCategory`** in `@/lib/gait/types.ts:115-124`: `"stability" | "symmetry" | "neuromotor" | "pain" | "general" | "view" | "variability" | "cognitive_adjacent" | "pattern"`.
- **`JointAngleMetrics`** in `@/lib/gait/angles.ts:30-52`: Non-nullable object of ROM/peak/asymmetry metric values or `null`s. Cannot be `undefined`.
- **`GaitAngleAnalysis`** in `@/lib/gait/angles.ts:63-71`: Does NOT contain `viewAngle` property. Requires `leftStrides: NormalizedGaitCycle[]` and `rightStrides: NormalizedGaitCycle[]`.

---

## 2. Logic Chain

1. **`ViewAngle` Mismatch**:
   - Lines 54 and 204 use `"side"`, line 250 uses `"front"`.
   - `ViewAngle` enum is `"sagittal" | "frontal" | "oblique" | "unknown"`.
   - Replacing `"side"` with `"sagittal"` and `"front"` with `"frontal"` satisfies the union.

2. **`ReliabilityBounds` Properties**:
   - Lines 56–60 only specify `ci95Lower` and `ci95Upper`.
   - `ReliabilityBounds` interface requires `value` and `splitHalfDiff`.
   - Adding `value` (matching the metric) and `splitHalfDiff` (e.g. 2 for cadence, 0.005 for CV) satisfies the interface.

3. **`series` Points Mismatch**:
   - Lines 62–70 generate objects missing `leftWristX` and `rightWristX`.
   - `GaitMetrics.series` requires both wrist coordinates.
   - Adding `leftWristX: 0.4 + Math.sin(i) * 0.01` and `rightWristX: 0.6 + Math.cos(i) * 0.01` satisfies the type.

4. **`NormativeRangePoint` Mismatch**:
   - Lines 107–114 map points with only `kneeMin/Max`, `hipMin/Max`, `ankleMin/Max`.
   - `NormativeRangePoint` requires `gaitCyclePct`, `kneeMean`, `hipMean`, `ankleMean`.
   - Updating the map function to return all 10 required properties satisfies the type.

5. **`DualTaskCost` Invalid Properties**:
   - Lines 117–132 declare `baselineCadence`, `dualTaskCadence`, etc. which do not exist on `DualTaskCost`.
   - `DualTaskCost` expects `cadenceCostPct`, `stepTimeCvCostPct`, `stabilityCostPts`, `automaticityCostPts`, `summary`, `cmiClassification`, `cadenceDTE`, `stepTimeCvDTE`.
   - Restructuring `mockDualTaskCost` to use the canonical interface properties eliminates TS2353.

6. **`GuessCategory` Invalid Values**:
   - Line 138 specifies `"rhythm_variability"`, line 149 specifies `"asymmetry"`.
   - `GuessCategory` union includes `"variability"` and `"symmetry"`.
   - Replacing `"rhythm_variability"` with `"variability"` and `"asymmetry"` with `"symmetry"` satisfies `GuessCategory`.

7. **`JointAngleMetrics` Undefined Mismatch**:
   - Line 207 sets `metrics: undefined`.
   - `GaitAngleAnalysis.metrics` is `JointAngleMetrics` (not optional / not undefined).
   - Providing a mock `JointAngleMetrics` object with null properties satisfies the interface and matches `JointAnglesChart` handling.

8. **`GaitAngleAnalysis` Extra/Missing Properties**:
   - `mockAngleAnalysis` (line 75) and `emptyAnalysis` (line 204) contained `viewAngle: "side"`, which is not on `GaitAngleAnalysis`.
   - Both also require `leftStrides: []` and `rightStrides: []`.
   - Cleaning up these properties prevents potential TS excess property errors.

---

## 3. Caveats

- `GuessCategory` union in `@/lib/gait/types.ts` defines `"variability"` (not `"rhythm"`). Using `"variability"` for `category: "rhythm_variability"` and `"symmetry"` for `category: "asymmetry"` aligns 100% with the codebase types and resolves TS errors cleanly.
- `GaitMetrics` also requires `fpsEffective`, `armSwingAsymmetry`, `kneeAsymmetry`, `doubleSupportHint`, and `pelvicObliquityVar`. Including these in `mockGaitMetrics` guarantees complete type safety.

---

## 4. Conclusion

### Line-by-Line Fix Strategy Table for `src/components/gait/__tests__/challenger_m2_2_stress.test.tsx`

| Item | Lines | Action / Replacement |
|------|-------|----------------------|
| 1. `ViewAngle` | 54 | Replace `viewAngle: "side"` with `viewAngle: "sagittal"`. |
| 2. `ReliabilityBounds` | 56–61 | Include `value` and `splitHalfDiff` for `cadenceSpm`, `stepTimeCV`, `strideTimeCV`, `symmetryAngle`. |
| 3. `series` points | 62–70 | Include `leftWristX: 0.4 + Math.sin(i) * 0.01` and `rightWristX: 0.6 + Math.cos(i) * 0.01`. |
| 4. Missing `GaitMetrics` fields | 24–72 | Add `fpsEffective: 30`, `armSwingAsymmetry: 0.04`, `kneeAsymmetry: 0.03`, `doubleSupportHint: 0.23`, `pelvicObliquityVar: 0.005`. |
| 5. `mockAngleAnalysis` fields | 74–115 | Remove `viewAngle: "side"`, add `leftStrides: []`, `rightStrides: []`. |
| 6. `NormativeRangePoint` | 107–114 | Add `gaitCyclePct: i`, `kneeMean: 35`, `hipMean: 10`, `ankleMean: -3.5` to `normativeData` array map. |
| 7. `DualTaskCost` | 117–132 | Replace `mockDualTaskCost` with valid fields (`cadenceCostPct`, `stepTimeCvCostPct`, `stabilityCostPts`, `automaticityCostPts`, `summary`, `cadenceDTE`, `stepTimeCvDTE`, `cmiClassification`). |
| 8. `GuessCategory` | 138 | Replace `category: "rhythm_variability"` with `category: "variability"`. |
| 9. `GuessCategory` | 149 | Replace `category: "asymmetry"` with `category: "symmetry"`. |
| 10. `JointAngleMetrics` | 203–209 | Remove `viewAngle: "side"`, add `leftStrides: []`, `rightStrides: []`, replace `metrics: undefined` with null-initialized `JointAngleMetrics` object. |
| 11. `ViewAngle` (frontal) | 250 | Replace `viewAngle: "front"` with `viewAngle: "frontal"`. |

### Exact Code Replacement Chunks

#### Chunk 1: Update `mockGaitMetrics` (Lines 24–72)
```tsx
const mockGaitMetrics: GaitMetrics = {
  durationSec: 10,
  fpsEffective: 30,
  stepCount: 18,
  cadenceSpm: 108,
  avgStepTimeSec: 0.55,
  stepTimeAsymmetry: 0.04,
  stepTimeCV: 0.03,
  strideTimeCV: 0.035,
  symmetryAngle: 2.1,
  kneeFlexLeft: 58,
  kneeFlexRight: 60,
  kneeAsymmetry: 0.03,
  leftStancePct: 62,
  rightStancePct: 61,
  leftSwingPct: 38,
  rightSwingPct: 39,
  doubleSupportPct: 23,
  doubleSupportHint: 0.23,
  strideAsymmetry: 0.02,
  lateralSway: 0.045,
  verticalBounce: 0.032,
  pelvicObliquity: 0.015,
  pelvicObliquityVar: 0.005,
  meanStepWidth: 0.12,
  armSwingLeft: 0.25,
  armSwingRight: 0.26,
  armSwingAsymmetry: 0.04,
  pathSmoothness: 0.92,
  overallScore: 88,
  stabilityScore: 85,
  symmetryScore: 90,
  rhythmScore: 87,
  mobilityScore: 86,
  automaticityScore: 89,
  viewAngle: "sagittal",
  viewConfidence: 0.95,
  confidenceIntervals: {
    cadenceSpm: { value: 108, ci95Lower: 104, ci95Upper: 112, splitHalfDiff: 2 },
    stepTimeCV: { value: 0.03, ci95Lower: 0.02, ci95Upper: 0.04, splitHalfDiff: 0.005 },
    strideTimeCV: { value: 0.035, ci95Lower: 0.025, ci95Upper: 0.045, splitHalfDiff: 0.005 },
    symmetryAngle: { value: 2.1, ci95Lower: 1.5, ci95Upper: 2.7, splitHalfDiff: 0.3 },
  },
  series: Array.from({ length: 20 }, (_, i) => ({
    t: i * 0.1,
    midHipX: 0.5 + Math.sin(i) * 0.02,
    midHipY: 0.5 + Math.cos(i) * 0.01,
    leftAnkleY: 0.8 + Math.sin(i) * 0.05,
    rightAnkleY: 0.8 + Math.cos(i) * 0.05,
    leftWristX: 0.4 + Math.sin(i) * 0.01,
    rightWristX: 0.6 + Math.cos(i) * 0.01,
    leftKneeAngle: 30 + Math.sin(i) * 20,
    rightKneeAngle: 30 + Math.cos(i) * 20,
  })),
  stepEvents: [],
};
```

#### Chunk 2: Update `mockAngleAnalysis` (Lines 74–115)
```tsx
const mockAngleAnalysis: GaitAngleAnalysis = {
  isSuppressed: false,
  normalizedPoints: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeAngleLeft: 10 + Math.sin((i / 100) * Math.PI * 2) * 25 + 25,
    kneeAngleRight: 12 + Math.sin((i / 100) * Math.PI * 2) * 24 + 24,
    hipAngleLeft: 5 + Math.sin((i / 100) * Math.PI * 2) * 15,
    hipAngleRight: 6 + Math.sin((i / 100) * Math.PI * 2) * 14,
    ankleAngleLeft: Math.sin((i / 100) * Math.PI * 2) * 10,
    ankleAngleRight: Math.cos((i / 100) * Math.PI * 2) * 10,
  })),
  leftStrides: [],
  rightStrides: [],
  metrics: {
    kneeRomLeft: 50,
    kneeRomRight: 48,
    kneePeakFlexionLeft: 60,
    kneePeakFlexionRight: 58,
    kneeAsymmetryPct: 4.15,
    hipRomLeft: 30,
    hipRomRight: 28,
    hipPeakFlexionLeft: 20,
    hipPeakFlexionRight: 19,
    hipPeakExtensionLeft: -10,
    hipPeakExtensionRight: -9,
    hipAsymmetryPct: 6.9,
    ankleRomLeft: 20,
    ankleRomRight: 19,
    anklePeakDorsiflexionLeft: 10,
    anklePeakDorsiflexionRight: 9,
    anklePeakPlantarflexionLeft: -10,
    anklePeakPlantarflexionRight: -10,
    ankleAsymmetryPct: 5.2,
  },
  normativeData: Array.from({ length: 101 }, (_, i) => ({
    gaitCyclePct: i,
    kneeMean: 35,
    kneeMin: 0,
    kneeMax: 70,
    hipMean: 10,
    hipMin: -18,
    hipMax: 38,
    ankleMean: -3.5,
    ankleMin: -22,
    ankleMax: 15,
  })),
};
```

#### Chunk 3: Update `mockDualTaskCost` (Lines 117–132)
```tsx
const mockDualTaskCost: DualTaskCost = {
  cadenceCostPct: 10.9,
  stepTimeCvCostPct: 66.7,
  stabilityCostPts: 10,
  automaticityCostPts: 11,
  cadenceDTE: -10.9,
  stepTimeCvDTE: 66.7,
  cmiClassification: "mutual_interference",
  summary: "Significant cognitive cost detected with motor performance decrement during dual-task walking.",
};
```

#### Chunk 4: Update `mockGuesses` (Lines 134–156)
```tsx
const mockGuesses: EducatedGuess[] = [
  {
    id: "g1",
    title: "Elevated Step-Time Variability Pattern",
    category: "variability",
    severity: "elevated",
    confidence: 0.85,
    summary: "Step time coefficient of variation is elevated above normal threshold.",
    evidence: ["Step time CV = 5.2% (> 4.0% threshold)", "Stride time CV = 5.8%"],
    alternatives: ["Fatigue during recording", "Irregular walking surface"],
    patternTag: "High variability",
  },
  {
    id: "g2",
    title: "Slight Inter-Limb Asymmetry",
    category: "symmetry",
    severity: "moderate",
    confidence: 0.65,
    summary: "Minor stance time imbalance between left and right legs.",
    evidence: ["Stance phase L/R ratio = 1.15", "Step time asymmetry = 6.2%"],
    alternatives: ["Antalgic gait adaptation"],
  },
];
```

#### Chunk 5: Update `emptyAnalysis` in Test (Lines 203–209)
```tsx
      const emptyAnalysis: GaitAngleAnalysis = {
        isSuppressed: false,
        normalizedPoints: [],
        leftStrides: [],
        rightStrides: [],
        metrics: {
          kneeRomLeft: null,
          kneeRomRight: null,
          kneePeakFlexionLeft: null,
          kneePeakFlexionRight: null,
          kneeAsymmetryPct: null,
          hipRomLeft: null,
          hipRomRight: null,
          hipPeakFlexionLeft: null,
          hipPeakExtensionLeft: null,
          hipPeakFlexionRight: null,
          hipPeakExtensionRight: null,
          hipAsymmetryPct: null,
          ankleRomLeft: null,
          ankleRomRight: null,
          anklePeakDorsiflexionLeft: null,
          anklePeakDorsiflexionRight: null,
          anklePeakPlantarflexionLeft: null,
          anklePeakPlantarflexionRight: null,
          ankleAsymmetryPct: null,
        },
        normativeData: [],
      };
```

#### Chunk 6: Update `frontalMetrics` in Test (Line 250)
```tsx
      const frontalMetrics: GaitMetrics = {
        ...mockGaitMetrics,
        viewAngle: "frontal",
        kneeFlexLeft: null,
        kneeFlexRight: null,
        leftStancePct: null,
        rightStancePct: null,
        doubleSupportPct: null,
        strideAsymmetry: null,
      };
```

---

## 5. Verification Method

1. Apply the line replacement chunks above to `src/components/gait/__tests__/challenger_m2_2_stress.test.tsx`.
2. Run static type checking:
   ```bash
   npm run typecheck
   ```
   **Expected**: Exit code 0 with zero errors.
3. Run test suite:
   ```bash
   npm test
   ```
   **Expected**: All 55 test files (530+ tests) pass.
