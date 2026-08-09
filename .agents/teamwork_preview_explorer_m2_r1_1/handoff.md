# Handoff Report: Feature 9 (`analysis.ts` & `types.ts` Refactoring Plan)

**Task:** Investigation and Architecture Mapping for Feature 9 (Milestone 2, Round 1)  
**Agent:** Explorer 1 (`teamwork_preview_explorer_m2_r1_1`)  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_r1_1`  
**Recipient:** Sub-Orchestrator / Implementer Agent (`teamwork_sub_orch_m2`)  

---

## 1. Observation

Direct observations from examining the codebase:

1. **`src/lib/gait/analysis.ts`**:
   - Uses `smooth(values: number[], window = 5)` boxcar moving average filtering (lines 23–37), causing phase distortion and peak attenuation.
   - Uses heuristic ankle-Y peak search (lines 240–301) instead of anterior-posterior kinematic displacement.
   - Computes asymmetry using raw magnitude percentage ratios `asymmetryRatio(a, b)` (lines 58–65).
   - Computes dual-task cost via simple unstandardized percentage deltas (lines 715–754).
   - Lacks direct outputs for stance/swing phase breakdown, Zifchock Symmetry Angle ($SA$), and Harmonic Ratio ($HR$).

2. **`src/lib/gait/types.ts`**:
   - `GaitMetrics` interface (lines 27–78) contains `doubleSupportHint`, `stepTimeAsymmetry`, `strideAsymmetry`, `armSwingAsymmetry`, `kneeAsymmetry`, but lacks `leftStancePct`, `rightStancePct`, `leftSwingPct`, `rightSwingPct`, `doubleSupportPct`, `symmetryAngle`, `harmonicRatioVertical`, `harmonicRatioLateral`, `harmonicRatio`.
   - `DualTaskCost` interface (lines 106–112) lacks `cadenceDTE`, `stepTimeCvDTE`, `symmetryDTE`, and `cmiClassification`.

3. **Core SOTA Scientific Modules in `src/lib/gait/`**:
   - `signal.ts`: Exports `zeroPhaseButterworth(data: number[], fps: number, cutoffHz = 6.0)`.
   - `events.ts`: Exports `detectGaitEventsZeni(frames: PoseFrame[], fps: number): GaitPhaseBreakdown` returning stance/swing percentages and `GaitEvent[]` (Heel Strike & Toe Off).
   - `symmetry.ts`: Exports `symmetryAngle(valLeft: number, valRight: number): number` (Zifchock SA in [0, 50]%).
   - `smoothness.ts`: Exports `computeHarmonicRatio(hipY: number[], hipX: number[], fps: number): { hrVertical, hrLateral, overallHR }`.
   - `dte.ts`: Exports `calculateDTE(baseline: GaitMetrics, dualTask: GaitMetrics): DTEAnalysis`.

4. **Database & Downstream Integration (`src/lib/gait/persistence.server.ts`)**:
   - Lines 21–22 and line 45 already anticipate `symmetryAngle` and `harmonicRatio` via `const extMetrics = metrics as GaitMetrics & { symmetryAngle?: number; harmonicRatio?: number }`.

---

## 2. Logic Chain

1. **Filtering Phase Delay Elimination**: Boxcar smoothing degrades gait peak timing. Replacing `smooth()` with `zeroPhaseButterworth(..., fps, 6.0)` eliminates phase lag via forward-backward biquad filtering, enabling accurate peak detection for kinematic event calculations.
2. **Kinematic Gait Phase Precision**: Replacing heuristic ankle-Y height peaks with `detectGaitEventsZeni` provides anterior-posterior (AP) foot-to-hip displacement analysis (Zeni et al. 2008). This directly yields Heel Strike and Toe Off events along with clinically relevant `leftStancePct`, `rightStancePct`, `leftSwingPct`, `rightSwingPct`, and `doubleSupportPct`.
3. **Reference-Free Symmetry Metric**: Raw percentage asymmetry depends on arbitrary limb reference selection. Replacing raw percentage ratios with `symmetryAngle(left, right)` implements Zifchock's reference-free angle equation, capping asymmetry at 50% max and providing standard clinical interpretation.
4. **Trunk Rhythmicity & Smoothness**: Integrating `computeHarmonicRatio(midHipY, midHipX, fps)` extracts spectral power across even vs. odd harmonics via FFT. `hrVertical` measures step-to-step rhythmicity while `hrLateral` measures stride-to-stride lateral stability.
5. **Standardized CMI & Dual-Task Taxonomy**: Standardizing `computeDualTaskCost` with `calculateDTE` aligns dual-task evaluation with Kelly et al. (2010) and Plummer & Eskes (2015), categorizing cognitive-motor interference into `no_interference`, `cognitive_prioritization`, `motor_prioritization`, or `mutual_interference`.

---

## 3. Caveats

- **Low Frame Count & Edge Case Fallbacks**: `detectGaitEventsZeni` requires at least 10 frames and detectable displacement. For stationary or short clips (<10 frames), `computeGaitMetrics` must maintain a robust fallback to `emptyMetrics` or oscillation estimation to prevent runtime exceptions or empty event arrays.
- **Backwards Compatibility**: Existing UI components (`ScoreRing.tsx`, `ReportPanel.tsx`) and rating formulas (`ratings.ts`, `guesses.ts`) rely on existing fields (e.g. `doubleSupportHint`, `stepTimeAsymmetry`, `stabilityScore`). The refactoring maintains all legacy fields while adding the SOTA metric extensions.

---

## 4. Conclusion

`src/lib/gait/analysis.ts` can be cleanly refactored without breaking existing application interfaces or score contracts. Updating `src/lib/gait/types.ts` with the new SOTA fields enables seamless data flow across the gait analysis engine, persistence layer (`persistence.server.ts`), clinical rating engine (`ratings.ts`), decision tree (`guesses.ts`), and frontend UI panels.

Detailed proposed code snippets and step-by-step refactoring instructions are documented in `analysis.md`.

---

## 5. Verification Method

1. **File Location Check**:
   - Inspect `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_r1_1/analysis.md`
   - Inspect `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_m2_r1_1/handoff.md`

2. **Type check and build verification (once implemented in subsequent worker step)**:
   - Run `npm run typecheck`
   - Run `npm test`
