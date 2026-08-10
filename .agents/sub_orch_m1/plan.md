# Execution Plan — Milestone M1 (Computer Vision & Model Fidelity Upgrades)

## Objective
Implement Milestone M1 as defined in `PROJECT.md` and `SCOPE.md`:
1. MediaPipe Model Loading Fallback (`src/lib/gait/pose.ts`):
   - Support `pose_landmarker_heavy.task` -> `pose_landmarker_full.task` -> `pose_landmarker_lite.task`.
   - Implement GPU delegate attempt with CPU delegate fallback per candidate model.
2. 1D Landmark Coordinate Temporal Smoothing (`src/lib/gait/signal.ts` and `src/lib/gait/analysis.ts`):
   - Implement 5-point Savitzky-Golay filtering (`savitzkyGolay5`) and 1D Kalman filtering (`kalmanFilter1D`).
   - Smooth raw keypoints in `computeGaitMetricsCore` prior to metric computation.

## Execution Strategy
1. **Survey & Plan (Explorers)**: Spawn 3 Explorers (`explorer_1`, `explorer_2`, `explorer_3`) to analyze `src/lib/gait/pose.ts`, `src/lib/gait/signal.ts`, `src/lib/gait/analysis.ts`, and existing test files. Formulate implementation plan and unit test strategy.
2. **Implementation (Worker)**: Spawn Worker (`worker_1`) to implement changes in `pose.ts`, `signal.ts`, `analysis.ts`, add unit/integration tests, and run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
3. **Verification & Challenge (Reviewers & Challengers)**: Spawn 2 Reviewers (`reviewer_1`, `reviewer_2`) and 2 Challengers (`challenger_1`, `challenger_2`) to verify code quality, edge cases, performance, and metric correctness.
4. **Forensic Audit (Auditor)**: Spawn 1 Forensic Auditor (`auditor_1`) to perform integrity verification.
5. **Gate Evaluation**: Verify all pass criteria in `GATE_STATUS.md`. If all green, mark M1 complete and hand off to parent.
