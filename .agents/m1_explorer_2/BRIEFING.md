# BRIEFING — 2026-08-09T21:18:00Z

## Mission
Investigate and formulate a detailed, concrete fix plan for refactoring `matchPeople` frame matching and velocity-adaptive spatial gating in `src/lib/gait/analysis.ts`.

## 🔒 My Identity
- Archetype: teamwork_preview_explorer
- Roles: Explorer 2 for Milestone M1
- Working directory: /Users/damian/GitHub/gait-lab/.agents/m1_explorer_2
- Original parent: 6f4ed619-9a76-4336-8ff7-4083809494f7
- Milestone: M1

## 🔒 Key Constraints
- Read-only investigation — do NOT implement changes in source code outside working directory
- Focus on `matchPeople` in `src/lib/gait/analysis.ts`
- Formulate concrete fix plan with exact line numbers, logic chains, caveats, edge case strategies, and verification methods

## Current Parent
- Conversation ID: 6f4ed619-9a76-4336-8ff7-4083809494f7
- Updated: 2026-08-09T21:18:00Z

## Investigation State
- **Explored paths**:
  - `src/lib/gait/analysis.ts` (lines 650–850, `matchPeople`, `computeBiometricSignature`, `biometricDistance`)
  - `src/lib/gait/__tests__/analysis.test.ts` (lines 174–378)
  - `src/lib/gait/__tests__/person_identification_stress.test.ts` (lines 1–146)
  - `ORIGINAL_REQUEST.md`, `PROJECT.md`, `.agents/sub_orch_m1/SCOPE.md`
- **Key findings**:
  - Identified gating condition flaw in line 754: `if (p.spatialDist > maxAllowedDist && p.cost > 0.40)` allows invalid spatial matches if cost <= 0.40. Needs strict logical OR: `if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost)`.
  - Designed velocity-adaptive spatial gating formula scaling `maxAllowedDist` with `speed = hypot(vx, vy)` to support fast walkers (>0.22 units/step).
  - Formulated dual spatial distance calculation (`minDist = min(distPred, distLast)`) and direction reversal velocity damping (`isReversal`) for U-turns.
- **Unexplored areas**: None within M1 `matchPeople` scope.

## Key Decisions Made
- Fully specified refactoring plan for `matchPeople` in `src/lib/gait/analysis.ts`.
- Documenting complete evidence chain, proposed code snippet, edge case handling, and verification methods in `handoff.md`.

## Artifact Index
- /Users/damian/GitHub/gait-lab/.agents/m1_explorer_2/DISPATCH.md — Received dispatch instructions
- /Users/damian/GitHub/gait-lab/.agents/m1_explorer_2/BRIEFING.md — Working memory index
- /Users/damian/GitHub/gait-lab/.agents/m1_explorer_2/handoff.md — Handoff report (to be created)
