# Scope: Milestone 6 — Clinical Normative Reference Integration & GDI

## Requirements
- **R9: Clinical Normative Reference Integration**:
  1. Create `src/lib/gait/normatives.ts` containing age/sex-stratified normative datasets from Winter (2009) and Bovi et al. (2011) (cadence, step time CV, stance %, double support %, knee flexion ROM).
  2. Implement Z-score computation (`calculateZScore`), percentile conversion (`calculatePercentile`), and camera-adapted Gait Deviation Index (`calculateGDI`, Schwartz & Rozumalski 2008). GDI = 100 for normal mean, -10 per 1 SD deviation. Range [0, 130].
  3. Integrate into `src/lib/gait/ratings.ts` (`StructuredReport`, `DomainRating`, `MetricRating`) to add Z-scores and normative percentile context.
  4. Integrate into `src/lib/gait/guesses.ts` (`buildEducatedGuesses`) to trigger hypotheses based on normative percentiles and GDI scores (< 80, < 90).
  5. Add comprehensive unit tests in `src/lib/gait/__tests__/normatives.test.ts`.

## Key Files
- Target New File: `src/lib/gait/normatives.ts`
- Target Integration Files: `src/lib/gait/ratings.ts`, `src/lib/gait/guesses.ts`
- Test File: `src/lib/gait/__tests__/normatives.test.ts`

## Status
Status: **DONE** (Gate Passed: 1080/1080 tests pass, 0 tsc errors, 2 Reviewers APPROVE, 2 Challengers APPROVE, Auditor CLEAN)

## Survey References
- Explorer Survey 3 Report: `/Users/damian/GitHub/gait-lab/.agents/teamwork_preview_explorer_survey_pass2_3/report.md`

