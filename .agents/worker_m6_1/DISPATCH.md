## 2026-08-10T11:37:19Z
You are teamwork_preview_worker (Worker for Milestone 6).
Working directory: /Users/damian/GitHub/gait-lab/.agents/worker_m6_1
Project root: /Users/damian/GitHub/gait-lab

Your Scope: Milestone 6 — Clinical Normative Reference Integration & GDI (`normatives.ts`, `ratings.ts`, `guesses.ts`).

Context documents:
- Scope: /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m6_pass2/SCOPE.md
- Project: /Users/damian/GitHub/gait-lab/PROJECT.md
- Original Request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Explorer Blueprints:
  - Explorer 1: /Users/damian/GitHub/gait-lab/.agents/explorer_m6_1/report.md
  - Explorer 2: /Users/damian/GitHub/gait-lab/.agents/explorer_m6_2/report.md
  - Explorer 3: /Users/damian/GitHub/gait-lab/.agents/explorer_m6_3/report.md

File Ownership:
You exclusively own and are modifying:
- `src/lib/gait/normatives.ts` (New module)
- `src/lib/gait/ratings.ts` (Integration)
- `src/lib/gait/guesses.ts` (Integration)
- `src/lib/gait/__tests__/normatives.test.ts` (New test file)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Instructions:
1. Create `src/lib/gait/normatives.ts`:
   - Store age/sex-stratified normative datasets for cadence, step time CV, stance phase %, double support %, knee flexion ROM from Winter (2009) and Bovi et al. (2011).
   - Implement `calculateZScore(value: number, mean: number, sd: number): number` (returns 0 on invalid/non-finite or sd <= 0).
   - Implement `erf(x: number)` and `calculatePercentile(zScore: number): number` (normal CDF percentile 0..100).
   - Implement `getNormativeReference(paramId, age?, sex?)`.
   - Implement `calculateGDI(metrics: GaitMetrics, patientMeta?)`: camera-adapted Gait Deviation Index (Schwartz & Rozumalski 2008). 100 for normal population mean, -10 points per 1 SD of RMS Z-score deviation across available parameters. Clamped to [0, 130].
   - Implement `evaluateGaitNormatives(metrics: GaitMetrics, patientMeta?)`.

2. Update `src/lib/gait/ratings.ts`:
   - Extend `MetricRating` with `zScore?: number; percentile?: number; normativeMean?: number; normativeSd?: number`.
   - Extend `StructuredReport` with `gdi?: GaitDeviationIndexResult; normativeEvaluations?: NormativeEvaluationResult[]`.
   - Update `buildStructuredReport` to calculate GDI & evaluate normatives, attaching Z-scores, percentiles, and GDI to the report output.

3. Update `src/lib/gait/guesses.ts`:
   - Update `buildEducatedGuesses` to accept optional `patientMeta` in `opts`.
   - Add hypothesis rule for GDI deviation: GDI < 80 (severe) / GDI < 90 (moderate).
   - Add hypothesis rule for extreme normative percentiles (< 5th or > 95th).

4. Create `src/lib/gait/__tests__/normatives.test.ts`:
   - Thorough Vitest unit test suite covering pure math (`calculateZScore`, `calculatePercentile`), dataset lookups (`getNormativeReference`), GDI calculations (`calculateGDI` - test GDI=100 for normal, GDI=90 for 1 SD, GDI=80 for 2 SD, clamping to [0, 130]), and integration with `ratings.ts` & `guesses.ts`.

5. Verification:
   - Run `npx vitest run` to ensure 100% passing tests with 0 failures across the test suite.
   - Run `npx tsc --noEmit` to ensure 0 TypeScript compilation errors.
   - Document build/test commands and output in your `handoff.md` report.

Write your report and handoff in `/Users/damian/GitHub/gait-lab/.agents/worker_m6_1/handoff.md` and send a message back when completed.
