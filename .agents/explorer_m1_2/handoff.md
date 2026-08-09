# Handoff Report: Gait Engine Kinematics, Symmetry, DTE, & UI Chart Integration

- **Agent**: Explorer 2 (Milestone 1)
- **Working Directory**: `/Users/damian/GitHub/gait-lab/.agents/explorer_m1_2`
- **Target Scope**: `src/lib/gait/symmetry.ts`, `src/lib/gait/dte.ts`, `src/lib/gait/angles.ts`, `src/components/gait/JointAnglesChart.tsx`, `src/lib/gait/analysis.ts`, `src/components/gait/GaitApp.tsx`
- **Timestamp**: 2026-08-09T16:42:50Z

---

## 1. Observation

Direct observations from source files, tool execution, and code inspection:

1. **`src/components/gait/ReportPanel.tsx` (lines 16–22)**:
   ```ts
   const angleAnalysis = useMemo(() => {
     return computeGaitAngleAnalysis(
       [],
       result.metrics.stepEvents || [],
       result.metrics.viewAngle || "unknown",
     );
   }, [result]);
   ```
   `computeGaitAngleAnalysis` is called with `frames: []` (empty array).

2. **`src/components/gait/CognitiveClusters.tsx` (lines 46–52)**:
   ```ts
   const derivedAngleAnalysis =
     angleAnalysis ||
     computeGaitAngleAnalysis(
       [],
       metrics.stepEvents || [],
       metrics.viewAngle || "unknown",
     );
   ```
   `computeGaitAngleAnalysis` is called with `frames: []` (empty array).

3. **`src/components/gait/ClinicalReportView.tsx` (lines 58–65)**:
   ```ts
   const derivedAngleAnalysis = useMemo(() => {
     if (angleAnalysis) return angleAnalysis;
     return computeGaitAngleAnalysis(
       [],
       result.metrics.stepEvents || [],
       result.metrics.viewAngle || "unknown",
     );
   }, [angleAnalysis, result]);
   ```
   `computeGaitAngleAnalysis` is called with `frames: []` (empty array).

4. **`src/lib/gait/angles.ts` (lines 312–330)**:
   ```ts
   if (!frames || frames.length === 0) {
     const emptyPoints: JointAnglePoint[] = Array.from({ length: 101 }, (_, i) => ({
       gaitCyclePct: i,
       kneeAngleLeft: null,
       kneeAngleRight: null,
       hipAngleLeft: null,
       hipAngleRight: null,
       ankleAngleLeft: null,
       ankleAngleRight: null,
     }));
     return {
       isSuppressed,
       suppressionReason,
       normalizedPoints: emptyPoints,
       leftStrides: [],
       rightStrides: [],
       metrics: { kneeRomLeft: null, kneeRomRight: null, ... },
       normativeData,
     };
   }
   ```
   When `frames` is empty (`[]`), all normalized points have `null` angle values and all ROM metrics are `null`.

5. **`src/components/gait/GaitApp.tsx` (lines 494–522)**:
   Inside `runAnalysis()`, `computeGaitMetrics(frames)` is called, but `computeGaitAngleAnalysis(frames, ...)` is **never called**, and `angleAnalysis` is not stored in `AnalysisResult`.

6. **`src/lib/gait/types.ts` (lines 144–152)**:
   ```ts
   export type AnalysisResult = {
     metrics: GaitMetrics;
     guesses: EducatedGuess[];
     personId: number;
     analyzedFrames: number;
     notes: string[];
     taskMode: TaskMode;
     dualTaskCost?: DualTaskCost;
   };
   ```
   `AnalysisResult` lacks `angleAnalysis?: GaitAngleAnalysis;`.

7. **`src/lib/gait/dte.ts` (lines 78–79)**:
   ```ts
   } else if (cadenceDTE > 5.0) {
     cmiClassification = "motor_prioritization";
   }
   ```
   Only checks `cadenceDTE > 5.0` for motor prioritization, omitting `stepTimeCvDTE > 5.0`.

8. **Test Suite Command Execution**:
   `npm test` executed with output:
   `Test Files 37 passed (37), Tests 296 passed (296)`.

---

## 2. Logic Chain

1. **Premise**: `GaitApp.tsx` extracts pose landmarks into `frames: PoseFrame[]` during video analysis. (Observation 5)
2. **Step 1**: In `GaitApp.tsx`, `runAnalysis()` calls `computeGaitMetrics(frames)` but does not invoke `computeGaitAngleAnalysis(frames, ...)` or store `angleAnalysis` on `AnalysisResult`. (Observations 5 & 6)
3. **Step 2**: Downstream UI components (`ReportPanel.tsx`, `CognitiveClusters.tsx`, `ClinicalReportView.tsx`) attempt to compute `angleAnalysis` by calling `computeGaitAngleAnalysis([], ...)`, supplying an empty array `[]` for `frames`. (Observations 1, 2, 3)
4. **Step 3**: `angles.ts` explicitly guards against empty frames (`if (!frames || frames.length === 0)`), returning 101 points with all joint angles set to `null` and all ROM metrics set to `null`. (Observation 4)
5. **Step 4**: `JointAnglesChart.tsx` receives all `null` joint angle points and ROM metrics, causing Recharts curves to be blank and the ROM Summary table & badges to render `—` for all joints. (Observations 1–4)
6. **Step 5**: Additionally, in `dte.ts`, when `stepTimeCvDTE > 5.0%` (rhythmicity improvement under dual task) while `cadenceDTE <= 5.0%`, the classifier falls through to `no_interference` instead of `motor_prioritization`. (Observation 7)

---

## 3. Caveats

- **Scope Limit**: Read-only exploration. No source code modifications in `src/` were performed by Explorer 2 (per agent instructions).
- **Assumptions**: Presumed `PoseFrame[]` from `GaitApp.tsx` contains complete MediaPipe 33 landmarks for the selected person track.
- **Alternative Interpretations**: `angleAnalysis` could theoretically be embedded inside `GaitMetrics` instead of directly on `AnalysisResult`. However, adding `angleAnalysis?: GaitAngleAnalysis` to `AnalysisResult` is cleaner and avoids inflating `GaitMetrics`.

---

## 4. Conclusion

1. The underlying mathematical and scientific algorithms in `symmetry.ts` (Zifchock Symmetry Angle $SA$), `dte.ts` (Kelly DTE & Plummer & Eskes CMI), and `angles.ts` (3-point joint angles & Perry & Burnfield normative bounds) are sound, correct, and pass all 296 unit tests.
2. A critical UI/data integration disconnect exists: `GaitApp.tsx` does not compute `angleAnalysis` on `frames` or store it in `AnalysisResult`, causing `JointAnglesChart.tsx` and `ClinicalReportView.tsx` to render empty charts and `—` ROM metrics in live analysis.
3. An edge case in `dte.ts` line 78 requires updating `cadenceDTE > 5.0` to `(cadenceDTE > 5.0 || stepTimeCvDTE > 5.0)`.

---

## 5. Verification Method

To independently verify these findings and the proposed fixes:

1. **Code Inspection**:
   - Inspect `src/components/gait/ReportPanel.tsx` line 18, `src/components/gait/CognitiveClusters.tsx` line 48, and `src/components/gait/ClinicalReportView.tsx` line 61 to verify they pass `[]` as the first parameter to `computeGaitAngleAnalysis`.
   - Inspect `src/lib/gait/types.ts` line 144 to verify `AnalysisResult` lacks `angleAnalysis`.
   - Inspect `src/lib/gait/dte.ts` line 78 to verify motor prioritization condition.

2. **Automated Test Execution**:
   - Run `npm test` from zsh in `/Users/damian/GitHub/gait-lab` to confirm current test suite passes (37 files, 296 tests).
   - After implementer applies the fix, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` to verify 100% green build.

3. **Invalidation Conditions**:
   - If `computeGaitAngleAnalysis` is called with `frames` in `runAnalysis` and attached to `AnalysisResult`, and `JointAnglesChart` renders valid non-null trajectories and ROM values in Stage 3 and Stage 4, the integration issue is resolved.
