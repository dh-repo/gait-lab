## 2026-08-09T21:16:52Z
Your working directory is: /Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_3
Your identity: explorer_e2e_spec_3 (Explorer - Target Lock Suite Spec)

Objective:
Investigate PoseTracker logic and formulate the detailed test design specification for TM2 part B: creating `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts`.

Inputs to read:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/TEST_INFRA.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/explorer_survey_3/handoff.md
- /Users/damian/GitHub/gait-lab/src/lib/gait/PoseTracker.ts (and related files in `src/lib/gait/`)
- `src/lib/gait/__tests__/testHelpers.ts`

Design requirements:
Map test cases across Tiers 1-4 covering:
1. Target lock initialization & lock acquisition on selected person.
2. Target lock retention in crowded scenarios with background distractors and passerby.
3. Target lock re-acquisition post-occlusion (2-10 frames) upon re-appearance.
4. Prevention of unintended lock transfer to secondary/background subjects.
5. Lock retention across scale shifts, direction reversals (U-turns), and rapid velocity shifts.

Write your detailed test spec to `/Users/damian/GitHub/gait-lab/.agents/explorer_e2e_spec_3/handoff.md`.
Then send a message back to parent (af82c884-6102-41a9-89f6-28ed51dead77) with summary and handoff path.
