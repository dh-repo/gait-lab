# Plan — Synthetic Ground-Truth Gait Audit Remediation

## Phase 0: Codebase Survey for R1–R5 Audit Requirements
- Dispatch 3 parallel Explorers to investigate current implementation of:
  - `audit_explorer_1`: `src/lib/gait/events.ts` (follow-cam direction inference logic, `toe.x - heel.x` median difference, landmark visibility thresholds, `findExtrema` peak prominence filtering).
  - `audit_explorer_2`: `src/lib/gait/signal.ts` (Harmonic Ratio calculation, fundamental frequency $f_0 = 1 / \text{meanStrideSec}$, gait event integration, $\pm 1$ bin magnitude summation for Hann window leakage).
  - `audit_explorer_3`: `src/components/gait/GaitApp.tsx`, `src/lib/gait/analysis.ts`, `ratings.ts`, `guesses.ts` (300-seek frame sampling decimation bias over clips >10s, continuous 10-12s 30 Hz window / subpixel timestamp refinement, reporting true sampling rate, split-half reliability testing, camera view geometry metric suppression, demoting arbitrary composite scores).

## Phase 1: Milestone Decomposition & Scope Updating
- Aggregate Explorer findings.
- Update `PROJECT.md` with milestones M5–M9.

## Phase 2: Milestone M5 — R1 & R5 Fixes in `events.ts`
- Implement median foot orientation difference (`toe.x - heel.x`) for handheld follow-cam direction inference with low-visibility fallback.
- Implement peak prominence filtering in `findExtrema`.
- Unit tests and verification via Explorer -> Worker -> Reviewer -> Challenger -> Auditor.

## Phase 3: Milestone M6 — R2 Fixes in `signal.ts`
- Update Harmonic Ratio calculation to use true stride fundamental frequency ($f_0 = 1 / \text{meanStrideSec}$) derived from gait events.
- Sum harmonic magnitude over $\pm 1$ bin for Hann window leakage.
- Unit tests and verification.

## Phase 4: Milestone M7 — R3 Fixes in `GaitApp.tsx` & `analysis.ts`
- Fix frame sampling decimation bias: analyze continuous 10-12s window at 30 Hz or subpixel timestamp refinement, report true sampling rate.
- Fix step-time CV calculation across clip lengths.
- Unit and integration tests.

## Phase 5: Milestone M8 — R4 Fixes in `analysis.ts` & `ratings.ts`
- Implement split-half reliability testing across 1st and 2nd half of clips for confidence intervals.
- Suppress metrics (emit `null`) when camera view geometry does not support accurate measurement (e.g. stride parameters on frontal view).
- Demote arbitrary weighted composite scores in favor of defensible measured quantities.

## Phase 6: Milestone M9 — Comprehensive Synthetic Ground-Truth Test Suite & Verification
- Synthetic gait test cases for L->R and R->L follow-cam direction (~60% stance phase).
- Symmetric gait harmonic ratio test cases (~2.5-4.0 for vertical HR).
- Step-time CV consistency verification.
- Update `scientific_justifications.md`.
- Pass 100% of tests (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build`, and Forensic Audit.
