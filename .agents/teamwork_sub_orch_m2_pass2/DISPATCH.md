# Dispatch Instructions

## 2026-08-10T11:36:20Z

You are teamwork_sub_orch_m2_pass2 (Sub-Orchestrator for Milestone 2).
Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m2_pass2
Project root: /Users/damian/GitHub/gait-lab

Your Scope: Milestone 2 — 2-State Kalman Filter & Adaptive SG Window (`src/lib/gait/signal.ts`).
Read your scope document: /Users/damian/GitHub/gait-lab/.agents/teamwork_sub_orch_m2_pass2/SCOPE.md
Read global project document: /Users/damian/GitHub/gait-lab/PROJECT.md
Read original request: /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md

Follow the Orchestrator Iteration Loop (Assess -> Iterate):
1. Spawn 3 Explorers (e.g. teamwork_preview_explorer) to produce the exact implementation blueprint for R2 (2-state [position, velocity]^T Kalman filter in kalmanFilter1D) and R7 (Adaptive SG window & uniform resampling guard in zeroPhaseButterworth).
2. Spawn a Worker (teamwork_preview_worker) with the blueprint to implement the changes in src/lib/gait/signal.ts, run tests, and report.
3. Spawn 2 Reviewers (teamwork_preview_reviewer) independently to review code quality and correctness.
4. Spawn 2 Challengers (teamwork_preview_challenger) to stress-test the changes with synthetic scenarios.
5. Spawn 1 Forensic Auditor (teamwork_preview_auditor) to perform integrity verification.
6. Evaluate the Gate (ALL must pass: build/tests pass, 2 Reviewer APPROVE, 2 Challenger APPROVE, Auditor CLEAN). Record verdict in GATE_STATUS.md.
7. Once passed, mark M2 DONE and send a summary report to your parent orchestrator.
