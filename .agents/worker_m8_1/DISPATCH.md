## 2026-08-09T05:27:55Z

<USER_REQUEST>
You are worker_m8_1 (teamwork_preview_worker).
Your working directory is /Users/damian/GitHub/gait-lab/.agents/worker_m8_1.

OBJECTIVE:
Implement Milestone M8 (R4: Split-Half Reliability, Camera View Geometry Suppression, and Composite Score Demotion) across `src/lib/gait/types.ts`, `src/lib/gait/analysis.ts`, `src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`, `src/components/gait/ReportPanel.tsx`, `src/components/gait/MetricsPanel.tsx`, and `src/lib/gait/__tests__/analysis.test.ts`.

INPUT ARTIFACTS TO READ BEFORE CODING:
- `/Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md` (MUST read first)
- `/Users/damian/GitHub/gait-lab/PROJECT.md`
- `/Users/damian/GitHub/gait-lab/.agents/audit_explorer_3/analysis.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE BOUNDARIES:
You own and have exclusive write permission to:
- `src/lib/gait/types.ts`
- `src/lib/gait/analysis.ts`
- `src/lib/gait/ratings.ts`
- `src/lib/gait/guesses.ts`
- `src/components/gait/ReportPanel.tsx`
- `src/components/gait/MetricsPanel.tsx`
- `src/lib/gait/__tests__/analysis.test.ts`

REQUIREMENTS:

1. `types.ts`:
   - Add `ReliabilityBounds` interface/type:
     ```typescript
     export interface ReliabilityBounds {
       value: number | null;
       ci95Lower: number | null;
       ci95Upper: number | null;
       splitHalfDiff: number | null;
       se?: number | null;
       half1?: number | null;
       half2?: number | null;
     }
     ```
   - Update `GaitMetrics` interface so view-dependent metrics are nullable (`number | null`):
     `kneeFlexLeft`, `kneeFlexRight`, `kneeAsymmetry`, `strideAsymmetry`, `leftStancePct`, `rightStancePct`, `leftSwingPct`, `rightSwingPct`, `doubleSupportPct`, `meanStepWidth`, `stepWidthVariability`, `lateralSway`, `pelvicObliquity`, `pelvicObliquityVar`, etc.
   - Add optional `confidenceIntervals?: Record<string, ReliabilityBounds>` to `GaitMetrics`.

2. `analysis.ts`:
   - View Geometry Metric Suppression: Check detected `viewAngle` from `detectViewAngle(frames)`.
     - When `viewAngle === 'frontal'`: Sagittal-only metrics (`kneeFlexLeft`, `kneeFlexRight`, `kneeAsymmetry`, `strideAsymmetry`, stance/swing/double support percentages) MUST be set to `null` because 2D sagittal kinematics are invalid in frontal view.
     - When `viewAngle === 'sagittal'`: Frontal-only metrics (`lateralSway`, `meanStepWidth`, `stepWidthVariability`, `pelvicObliquity`, `pelvicObliquityVar`) MUST be set to `null` because lateral displacement measures forward surge/step length in sagittal view.
     - When `viewAngle === 'oblique'` (or unconstrained): Compute available metrics.
   - Split-Half Reliability Testing & 95% CIs:
     - Divide continuous frame sequence into Half 1 ($0 \dots \lfloor N/2 \rfloor$) and Half 2 ($\lfloor N/2 \rfloor \dots N-1$).
     - Calculate key metrics independently for Half 1 ($M^{(1)}$) and Half 2 ($M^{(2)}$).
     - Calculate split-half standard error: $\text{SE}_{\text{split}} = \frac{|M^{(1)} - M^{(2)}|}{\sqrt{2}}$.
     - Calculate 95% Confidence Interval: $\text{CI}_{95\%} = [M - 1.96 \cdot \text{SE}_{\text{split}}, M + 1.96 \cdot \text{SE}_{\text{split}}]$.
     - Populate `confidenceIntervals` for metrics (e.g. `cadence`, `stepTimeCV`, `symmetryIndex`, `harmonicRatioVertical`, `harmonicRatioLateral`, `harmonicRatioOverall`, etc.).
   - Demote composite scores: Treat composite scores as secondary exploratory indices, clearly documenting/labeling them.

3. `ratings.ts` and `guesses.ts`:
   - Gracefully handle `null` metric values.
   - Return `"suppressed"` or `"n_a"` status/ratings for `null` metrics.
   - Skip observational rules or hypothesis generation logic that depend on suppressed (`null`) metrics.

4. UI Panels (`ReportPanel.tsx`, `MetricsPanel.tsx`):
   - Render 95% Confidence Intervals next to point estimates where available (e.g. `112.4 spm [95% CI: 109.1 - 115.7]`).
   - For view-suppressed (`null`) metrics, display clear informative badges or labels such as `"N/A (Requires Side View)"` or `"N/A (Requires Front View)"`.

5. Unit & Integration Testing (`src/lib/gait/__tests__/analysis.test.ts`):
   - Add test cases verifying that `viewAngle === 'frontal'` suppresses sagittal metrics (`null`).
   - Add test cases verifying that `viewAngle === 'sagittal'` suppresses frontal metrics (`null`).
   - Add test cases verifying that `confidenceIntervals` are correctly computed with split-half testing.
   - Add test cases verifying that `ratings.ts` and `guesses.ts` process `null` metrics without errors.
   - Execute verification: run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

DELIVERABLES & REPORT:
Write your work report in `/Users/damian/GitHub/gait-lab/.agents/worker_m8_1/handoff.md` and `changes.md`.
Document test output, typecheck output, lint output, and build output.
Send a message when complete.
</USER_REQUEST>
