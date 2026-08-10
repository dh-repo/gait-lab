## 2026-08-09T21:16:57Z
Your identity: teamwork_preview_explorer (Explorer 2 for Milestone M1)
Your working directory: /Users/damian/GitHub/gait-lab/.agents/m1_explorer_2

Objective:
Investigate and formulate a detailed, concrete fix plan for refactoring `matchPeople` frame matching and velocity-adaptive spatial gating in `src/lib/gait/analysis.ts`.

Input Files to Read:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md
- /Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts
- /Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/analysis.test.ts
- /Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/person_identification_stress.test.ts

Key Refactoring Tasks:
1. Examine `matchPeople` in `src/lib/gait/analysis.ts` (around lines 709-816).
2. Fix the gating logic flaw: Change `if (p.spatialDist > maxAllowedDist && p.cost > 0.40) continue;` to strict logical OR / adaptive gating:
   `if (p.spatialDist > maxAllowedDist || p.cost > maxAllowedCost) continue;`
3. Implement Velocity-Adaptive Spatial Gating:
   - Extract track velocity magnitude `speed = Math.hypot(vx, vy)` if `trk.velocity` exists.
   - Adaptively scale `maxAllowedDist` with `speed` so fast-walking subjects moving across large screen distances (e.g. > 0.22 normalized units per step) do not exceed spatial gates.
     Formula: `const maxAllowedDist = 0.22 + 0.15 * Math.min(1.0, speed) + Math.min(0.20, (gap - 1) * 0.08) + (p.bioDist < 0.25 ? 0.08 : 0);`
4. Handle Dual Spatial Distance Gating for U-Turns / Sudden Direction Changes:
   - When a person turns or flips direction, linear velocity extrapolation (`predHip`) projects them in the wrong direction, spiking predicted spatial distance.
   - Compute `distPred = hypot(detHip.x - predHip.x, detHip.y - predHip.y)` AND `distLast = hypot(detHip.x - trk.lastHip.x, detHip.y - trk.lastHip.y)`.
   - Set `spatialDist = Math.min(distPred, distLast)` (or use velocity damping during sudden direction changes).

Output:
Write a comprehensive handoff report to `/Users/damian/GitHub/gait-lab/.agents/m1_explorer_2/handoff.md` detailing exact line ranges, code snippets, and edge case strategies. Then send a message back to parent orchestrator.
