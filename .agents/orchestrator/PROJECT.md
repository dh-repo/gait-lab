# Project: gait-lab Engine Phase 3 Deep Dive

## Architecture
- TypeScript gait analysis engine in `src/lib/gait/`
- Key modules:
  - `symmetry.ts`: Zifchock Symmetry Angle equations & symmetry index computation
  - `analysis.ts`: Spatiotemporal metric extraction (stride length, step distance, cadence, double support)
  - `events.ts`: Heel strike / toe off event detection, duration thresholds
  - `dte.ts`: Dual-task effect calculation and clamping
  - `angles.ts`: Joint angle kinematics, arm swing asymmetry (ASA), trunk sway & harmonic ratio
  - `guesses.ts`: Diagnostic hypotheses & compensatory gait pattern classification
  - `normatives.ts`: Normative database, Gait Profile Score (GPS), Movement Analysis Profile (MAP)
  - `fallrisk.ts`: STEADI fall risk model, dynamic thresholds, frontal fallback, height adjustment
  - `signal.ts`: OneEuroFilter, Savitzky-Golay adaptive filtering, signal processing
  - `scientific_justifications.md`: Literature references & mathematical justifications

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1 Zifchock Denominator Fix | Fix SA equation denominator 90->45 in symmetry.ts | M1 (DONE) | ORIGINAL_REQUEST §R1 |
| 2 | R2 Ipsilateral Stride Length | Fix stride length computation to ipsilateral in analysis.ts | M1 (DONE) | ORIGINAL_REQUEST §R2 |
| 3 | R3 Cadence Penalty Removal | Remove c<70 penalty in analysis.ts, support 40-140 spm | M1 (DONE) | ORIGINAL_REQUEST §R3 |
| 4 | R4 Stride Duration & DS Search | Raise ceiling to 4.0s, scale DS search to min(0.75*meanStep, 1.0) | M1 (DONE) | ORIGINAL_REQUEST §R4 |
| 5 | R5 DTE Clamping | Clamp stepTimeCvDTE to [-100%, +100%] in dte.ts | M1 (DONE) | ORIGINAL_REQUEST §R5 |
| 6 | R6 Arm Swing Asymmetry | Add calculateArmSwingAsymmetry to angles.ts | M2 (DONE) | ORIGINAL_REQUEST §R6 |
| 7 | R7 Trunk Sway Quantification | Add calculateTrunkSway to angles.ts, replace fallrisk proxy | M2 (DONE) | ORIGINAL_REQUEST §R7 |
| 8 | R8 Compensatory Gait Patterns | Add 6 new hypothesis rules to guesses.ts | M2 (DONE) | ORIGINAL_REQUEST §R8 |
| 9 | R9 GPS & MAP | Upgrade normatives.ts with GPS, MAP, and age tiers | M2 (DONE) | ORIGINAL_REQUEST §R9 |
| 10| R10 Fall Risk Model Robustness | Height adjustment, dynamic STEADI, weight re-normalization | M3 | ORIGINAL_REQUEST §R10 |
| 11| R11 Test Coverage Expansion | Write unit tests for new & edge-case functions (>= 1350 tests) | M4 | ORIGINAL_REQUEST §R11 |
| 12| R12 Scientific Justifications | Update scientific_justifications.md literature & line mappings | M5 | ORIGINAL_REQUEST §R12 |
| 13| M6 Final Verification & Push | 100% tests pass, 0 tsc errors, 0 eslint errors, git commit & push | M6 | ORIGINAL_REQUEST §FINAL |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1 Critical Bug Fixes | R1, R2, R3, R4, R5 | None | DONE |
| 2 | M2 Clinical Metric Expansion | R6, R7, R8, R9 | M1 | DONE |
| 3 | M3 Fall Risk Hardening | R10 | M1, M2 | DONE |
| 4 | M4 Test Coverage Expansion | R11 | M1, M2, M3 | IN_PROGRESS |
| 5 | M5 Scientific Justifications | R12 | M1, M2, M3, M4 | PLANNED |
| 6 | M6 Verification & Git Push | Acceptance criteria & git push | M1-M5 | PLANNED |

## Code Layout
- `src/lib/gait/symmetry.ts`
- `src/lib/gait/analysis.ts`
- `src/lib/gait/events.ts`
- `src/lib/gait/dte.ts`
- `src/lib/gait/angles.ts`
- `src/lib/gait/guesses.ts`
- `src/lib/gait/normatives.ts`
- `src/lib/gait/fallrisk.ts`
- `src/lib/gait/signal.ts`
- `scientific_justifications.md`
- `tests/` or `src/lib/gait/__tests__/` (test files)
