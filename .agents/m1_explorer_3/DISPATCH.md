## 2026-08-09T21:16:57Z
<USER_REQUEST>
Your identity: teamwork_preview_explorer (Explorer 3 for Milestone M1)
Your working directory: /Users/damian/GitHub/gait-lab/.agents/m1_explorer_3

Objective:
Investigate and formulate a detailed, concrete fix plan for refactoring `mergeFragmentedTracks` tracklet consolidation in `src/lib/gait/analysis.ts`.

Input Files to Read:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/sub_orch_m1/SCOPE.md
- /Users/damian/GitHub/gait-lab/src/lib/gait/analysis.ts
- /Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/analysis.test.ts
- /Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/person_identification_stress.test.ts

Key Refactoring Tasks:
1. Examine `mergeFragmentedTracks` in `src/lib/gait/analysis.ts` (around lines 822-905).
2. Analyze how tracklets are currently checked for merging (frame overlap, frame gap, biometric distance, spatial distance).
3. Enhance U-Turn (Direction Flip) consolidation:
   - When a person does a U-turn or changes walking direction during frame gaps or temporary occlusions, `firstHip` / `lastHip` orientations change.
   - Check spatial gap proximity bidirectionally: distance between `a.lastHip` and `b.firstHip`, `b.lastHip` and `a.firstHip`, and minimum direct spatial distance between track endpoints.
4. Enhance Scale Change consolidation:
   - Leverage scale-invariant `bioDist` threshold so scale changes (subject walking towards or away from camera) do not prevent tracklet consolidation.
5. Review threshold parameters (`maxDist`, `bioDist` cutoff) to ensure fragmented tracks from U-turns, occlusions (2-10 frames), and scale changes are correctly merged into a single track without merging two distinct people walking side-by-side.

Output:
Write a comprehensive handoff report to `/Users/damian/GitHub/gait-lab/.agents/m1_explorer_3/handoff.md` detailing exact line numbers, code logic, and test cases to verify. Then send a message back to parent orchestrator.
</USER_REQUEST>
