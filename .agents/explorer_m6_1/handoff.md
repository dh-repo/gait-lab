# Handoff Report: Milestone 6 — Clinical Normative Reference Integration & GDI Technical Blueprint

## 1. Observation
- **Codebase Path**: `/Users/damian/GitHub/gait-lab`
- **Scope File**: `SCOPE.md` at `/Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m6_pass2/SCOPE.md` specifies Requirement R9 (Clinical Normative Reference Integration & GDI).
- **Target Files Inspected**:
  - `src/lib/gait/ratings.ts`: Currently exports `MetricRating`, `DomainRating`, `StructuredReport`, `buildStructuredReport()`. `MetricRating` line 37–47 defines fields `id`, `group`, `label`, `display`, `unit`, `favorability`, `band`, `note`.
  - `src/lib/gait/guesses.ts`: Currently exports `buildEducatedGuesses(m: GaitMetrics, opts?: { taskMode?: TaskMode; dualTaskCost?: DualTaskCost })`. Accepts `m` and optional `taskMode`/`dualTaskCost`.
  - `src/lib/gait/types.ts`: Line 7–12 defines `PatientMetadata` as `{ patientId: string; clinicianNotes: string; assessmentDate: string; assessmentCondition: string; }`.
  - `src/lib/gait/normatives.ts`: Currently does NOT exist (new module to be created).
  - `src/lib/gait/__tests__/normatives.test.ts`: Currently does NOT exist (new test suite to be created).
- **Prior Survey Reference**: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_3/report.md`.

## 2. Logic Chain
1. **Observation**: R9 requires normative datasets from Winter (2009) and Bovi et al. (2011) covering Cadence, Step Time CV, Stance %, Double Support %, and Knee Flexion ROM.
2. **Logic Step 1**: Structuring `src/lib/gait/normatives.ts` with constant tables for adult general baseline (Winter 2009) and age/sex-stratified baseline (Bovi et al. 2011) allows fallback lookup when patient demographics are missing while enabling precise stratification when age/sex are provided.
3. **Logic Step 2**: Z-score equation $Z = (x - \mu)/\sigma$ and normal CDF percentile calculation via error function approximation $P(Z) = 100 \cdot \frac{1}{2}[1 + \text{erf}(Z / \sqrt{2})]$ provide standardized continuous statistical metrics for each gait parameter.
4. **Logic Step 3**: Schwartz & Rozumalski (2008) GDI scaled to 100 for normative mean with -10 per 1 SD deviation (range [0, 130]) is computed via Root Mean Square Z-score ($\bar{Z}_{\text{rms}}$) over evaluated parameters: $\text{GDI} = \text{clamp}(100 - 10 \cdot \bar{Z}_{\text{rms}}, 0, 130)$.
5. **Logic Step 4**: Extending `MetricRating` and `StructuredReport` in `ratings.ts` attaches Z-scores, percentiles, and GDI breakdown to structured report outputs.
6. **Logic Step 5**: Extending `buildEducatedGuesses` options in `guesses.ts` enables hypothesis generation for GDI < 80 (`gdi-severe-deviation`), GDI < 90 (`gdi-moderate-deviation`), and extreme metric percentiles (< 5th or > 95th).

## 3. Caveats
- Schwartz & Rozumalski (2008) originally derived GDI using full 3D motion capture joint angle trajectories across 9 kinematic curves. In video pose estimation where partial views or key spatio-temporal/2D-kinematic parameters are available, the camera-adapted GDI operates over available scalar metrics (cadence, step time CV, stance %, double support %, knee flexion ROM). Missing metrics (e.g. frontal view where knee flexion is null) are safely omitted from $\bar{Z}_{\text{rms}}$ calculation.

## 4. Conclusion
The technical blueprint for Milestone 6 is complete, fully specified, and ready for immediate implementation. All type definitions, mathematical functions, dataset tables, integration points in `ratings.ts` and `guesses.ts`, and Vitest unit test cases in `normatives.test.ts` have been fully documented in `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_1/report.md`.

## 5. Verification Method
1. Inspect blueprint report at `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_1/report.md`.
2. Following implementation, execute:
   - `npx vitest run src/lib/gait/__tests__/normatives.test.ts`
   - `npx tsc --noEmit`
   - `npx vitest run` (to verify 0 regressions across all 986+ existing tests).
