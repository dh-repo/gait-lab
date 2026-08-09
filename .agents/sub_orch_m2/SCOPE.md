# Scope: Milestone 2 (M2) — Side-by-Side Dual Session Comparison View (R2)

## Architecture
- `SessionComparisonView.tsx`: Side-by-side dual session selector and metric delta renderer.
- Visual components:
  - Session selection dropdowns / multi-select triggers for Baseline (Session A) and Target (Session B).
  - Metric delta summary table / cards: step count, cadence (steps/min), stride length (m), gait speed (m/s), symmetry index (%), stance/swing ratio.
  - Color-coded badges for delta indicators: green for positive/improved, red/amber for negative/degraded, neutral/gray for unchanged.
  - Overlaid joint trajectory charts: Knee angle curve (Session A vs Session B), Ankle angle curve (Session A vs Session B), Hip angle curve (Session A vs Session B).
- Integration points:
  - `GaitApp.tsx`: Navigation / tab or modal view toggles to switch to Dual Session Comparison View.
  - `SessionHistoryDrawer.tsx` / `SessionHistory`: Multi-select check boxes or "Compare Selected (2)" action button triggering M2 comparison view.

## Work Items & Status
| Item | Description | Status |
|------|-------------|--------|
| M2.1 | `SessionComparisonView.tsx` component implementation | DONE |
| M2.2 | Metric delta calculations and color-coded badges | DONE |
| M2.3 | Overlaid joint trajectory curve visualization | DONE |
| M2.4 | Integration into `GaitApp.tsx` and `SessionHistoryDrawer.tsx` | DONE |
| M2.5 | Unit test coverage in `src/components/gait/__tests__/SessionComparisonView.test.tsx` | DONE |

## Verification Criteria
1. `npm test` passes with 100% green unit tests including `SessionComparisonView.test.tsx` (406 tests passed across 46 files) — PASS.
2. `npm run typecheck`, `npm run lint`, and `npm run build` pass clean with 0 errors — PASS.
3. Reviewer approval from 2 independent reviewers (Reviewer 1 APPROVE, Reviewer 2 APPROVE) — PASS.
4. Challenger approval from 2 independent stress test verifiers (Challenger 1 APPROVE, Challenger 2 APPROVE) — PASS.
5. Forensic Auditor CLEAN verdict with 0 integrity violations — PASS.
