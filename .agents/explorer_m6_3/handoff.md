# Handoff Report: Milestone 6 — Clinical Normative Reference Integration & GDI

**Agent Name:** `teamwork_preview_explorer_m6_3`  
**Date:** 2026-08-10  
**Working Directory:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_3`  
**Target File Outputs:** `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_3/report.md`

---

## 1. Observation

1. **`src/lib/gait/ratings.ts`**:
   - Lines 37–47 define `MetricRating` without `zScore`, `percentile`, `normativeMean`, or `normativeSd`.
   - Lines 55–72 define `StructuredReport` with `domains`, `metrics`, `hypotheses`, `dualTask`, `qualityNotes`, `disclaimer`, but lacking `gdi` or `normativeEvaluations`.
   - Lines 199–583 define `buildStructuredReport(m: GaitMetrics, guesses: EducatedGuess[], opts)` which accepts `taskMode`, `analyzedFrames`, and optional `dualTaskCost`.

2. **`src/lib/gait/guesses.ts`**:
   - Lines 32–628 define `buildEducatedGuesses(m: GaitMetrics, opts?: { taskMode?: TaskMode; dualTaskCost?: DualTaskCost })`.
   - Current rules cover `view`, `context-shopping`, `bag-load`, `task-dual`, `dual-task-cost`, `zifchock-sa-deviation`, `zeni-stance-breakdown`, `cmi-classification`, `variability-high`, `stability`, `wide-base`, `asymmetry`, `antalgic`, `trendelenburg-ish`, `arm-swing`, `unilateral-arm`, `cautious`, `parkinsonian-soft`, `brisk`, `bounce`, `stiff-knee`, `arrhythmia`, `cognitive-adjacent`, `overall-good`.
   - No rules currently calculate or evaluate GDI or normative percentile outliers.

3. **`src/lib/gait/types.ts`**:
   - Lines 7–12 define `PatientMetadata` with `patientId`, `clinicianNotes`, `assessmentDate`, `assessmentCondition`. Optional `age?: number` and `sex?: "male" | "female"` can be added to support age/sex stratification.

4. **Reference Literature**:
   - **Winter (2009)** *Biomechanics and Motor Control of Human Movement* (4th Ed.): Cadence $105.0 \pm 8.0$ spm, Step Time CV $2.0 \pm 0.6$ %, Stance $60.5 \pm 2.0$ %, Double Support $20.8 \pm 2.5$ %, Knee ROM $58.0 \pm 4.5$ °.
   - **Bovi et al. (2011)** *Gait & Posture* 33(4): 555-560: Lifespan age/sex stratifications for Young (18–49), Middle (50–64), and Elderly (65+).
   - **Schwartz & Rozumalski (2008)** *Gait & Posture* 28(3): 355-365: Gait Deviation Index (GDI), $100 - 10 \cdot Z_{\text{rms}}$, bounded $[0, 130]$.

---

## 2. Logic Chain

1. **Requirement R9 Definition**: R9 requires normative dataset lookup, Z-score computation, percentile conversion via error function $\text{erf}$, camera-adapted GDI computation, and integration into `ratings.ts`, `guesses.ts`, and a new test file `normatives.test.ts`.
2. **Module Design (`src/lib/gait/normatives.ts`)**:
   - To support stratified lookups, `NORMATIVE_DATASETS` must store age- (Young, Middle, Elderly) and sex-stratified (Male, Female, Combined) datasets alongside default Winter (2009) values.
   - `calculateZScore(val, mean, sd)` computes $(val - mean) / sd$ with finite and non-zero SD safety guards.
   - `calculatePercentile(zScore)` uses the Abramowitz & Stegun error function approximation to compute the standard normal CDF mapped to $[0.01, 99.99]\%$.
   - `calculateGDI(metrics, patientMeta)` extracts available parameters (Cadence, Step Time CV, Stance %, Double Support %, Knee Flexion ROM), computes $Z_{\text{rms}} = \sqrt{\frac{1}{K} \sum Z_i^2}$, calculates raw score $100 - 10 \cdot Z_{\text{rms}}$, and clamps to $[0, 130]$.
3. **Integration into `ratings.ts`**:
   - `MetricRating` needs optional `zScore`, `percentile`, `normativeMean`, `normativeSd` fields.
   - `StructuredReport` needs optional `gdi?: GaitDeviationIndexResult` and `normativeEvaluations?: NormativeEvaluationResult[]`.
   - `buildStructuredReport` evaluates normatives and GDI, enriching metric notes and adding overall GDI drivers.
4. **Integration into `guesses.ts`**:
   - `buildEducatedGuesses` evaluates `calculateGDI` to trigger `gdi-deviation` hypothesis when $\text{GDI} < 90$ ($\text{GDI} < 80 \implies$ elevated severity; $80 \le \text{GDI} < 90 \implies$ moderate severity).
   - Evaluates `evaluateGaitNormatives` to trigger `normative-percentile-deviation` when parameters exceed the 95th percentile or fall below the 5th percentile.
5. **Unit Test Design (`src/lib/gait/__tests__/normatives.test.ts`)**:
   - Tests core math functions (`calculateZScore`, `erf`, `calculatePercentile`).
   - Tests dataset lookup (`getNormativeReference`).
   - Tests GDI calculation for baseline (100), 1 SD deviation (90), 2 SD deviation (80), and missing parameters.
   - Tests integration outputs in `ratings.ts` and `guesses.ts`.

---

## 3. Caveats

- **Frontal / Oblique View Camera Limitations**: Frontal camera angles do not provide sagittal plane knee flexion ROM or step stance breakdown. The GDI calculation is designed to handle partial parameter sets dynamically ($K < 5$) by scaling $Z_{\text{rms}}$ over available parameters.
- **Population Reference**: Bovi et al. (2011) data applies to adult populations ($18+$ years). For pediatric gait (under 18), Schwartz & Rozumalski (2008) pediatric GDI parameters could be added in future work.

---

## 4. Conclusion

A comprehensive, mathematically rigorous technical implementation blueprint has been generated and written to `/Users/damian/GitHub/gait-lab/.agents/explorer_m6_3/report.md`. It provides exact code specifications for creating `src/lib/gait/normatives.ts`, integrating with `src/lib/gait/ratings.ts` and `src/lib/gait/guesses.ts`, and testing via `src/lib/gait/__tests__/normatives.test.ts`.

---

## 5. Verification Method

1. Inspect the written blueprint report:
   ```bash
   cat /Users/damian/GitHub/gait-lab/.agents/explorer_m6_3/report.md
   ```
2. When the implementer implements Milestone 6:
   ```bash
   npx vitest run src/lib/gait/__tests__/normatives.test.ts src/lib/gait/__tests__/ratings.test.ts src/lib/gait/__tests__/guesses.test.ts
   npx tsc --noEmit
   npx vitest run
   ```
