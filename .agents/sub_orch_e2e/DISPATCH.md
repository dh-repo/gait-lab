## 2026-08-10T01:16:36Z
Objective:
Lead the E2E Testing Track to design and implement a comprehensive, requirement-driven, opaque-box test suite for gait-lab.

Inputs:
- Read /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- Read /Users/damian/GitHub/gait-lab/TEST_INFRA.md and PROJECT.md
- Read /Users/damian/GitHub/gait-lab/.agents/explorer_survey_3/handoff.md

Scope of E2E Testing Track:
1. TM1: Extend `src/lib/gait/__tests__/testHelpers.ts` with `generateMultiPersonScenario(config)` supporting primary target + crossing background passerby, static background observer, dynamic scale changes (h: 0.15 -> 0.85), continuous U-turns, fast walking, and 2-10 frame occlusions.
2. TM2: Expand `src/lib/gait/__tests__/person_identification_stress.test.ts` and create `src/lib/gait/__tests__/PoseTracker_target_lock.test.ts` covering Tiers 1-4.

Execution Protocol (Iteration Loop):
1. Initialize your BRIEFING.md, SCOPE.md, progress.md, and start your heartbeat cron in your working directory.
2. Spawn 3 teamwork_preview_explorer(s) to formulate test design specs.
3. Spawn a teamwork_preview_test_writer (or teamwork_preview_worker) to implement test helper generators and test suites, verifying with `npx vitest run` and `npx tsc --noEmit`.
   - MANDATORY INTEGRITY WARNING must be included in Worker/Writer dispatch prompt.
4. Spawn 2 teamwork_preview_reviewer(s) to review test coverage, assertions, and independence.
5. Spawn 2 teamwork_preview_challenger(s) to verify test suite robustness and edge case coverage.
6. Spawn 1 teamwork_preview_auditor to perform forensic audit.
7. Evaluate gate in GATE_STATUS.md.
8. Upon successful gate pass, write `TEST_READY.md` at project root (/Users/damian/GitHub/gait-lab/TEST_READY.md) summarizing test coverage.

When complete, write handoff.md in /Users/damian/GitHub/gait-lab/.agents/sub_orch_e2e/ and send a message to parent claiming completion.
