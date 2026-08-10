## 2026-08-10T01:11:03Z
You are Worker (Iter 2 Remediation) assigned to resolve the Forensic Audit Integrity Violation in the E2E Test Suite for gait-lab R1-R4 engine enhancements.

Working directory: /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_worker_e2e_remediation_iter2

Read the following authoritative documents:
- /Users/damian/GitHub/gait-lab/ORIGINAL_REQUEST.md
- /Users/damian/GitHub/gait-lab/PROJECT.md
- /Users/damian/GitHub/gait-lab/.agents/sub_orch_e2e/SCOPE.md
- /Users/damian/GitHub/gait-lab/.agents/auditor_e2e_a1/handoff.md
- /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_reviewer_e2e_r2/handoff.md

AUDIT EVIDENCE & FINDINGS TO REMEDIATE:
The Forensic Auditor and Reviewer flagged an INTEGRITY VIOLATION because `src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` contained 300+ lines of local inline facade helper functions (`savitzkyGolay5`, `kalmanFilter1D`, `smoothPoseFrames`, `calculateMillimetersPerPixel`, `computeHomographyMatrix`, `transformPoint`, `filterSteadyStateStrides`, `detectFusedGaitEvents`) directly inside the test file instead of importing them from `src/lib/gait/*`.

REMEDIATION TASKS:
1. Module Exports Setup in `src/lib/gait/`:
   Ensure the following module files and interface contract exports exist in `src/lib/gait/`:
   - `src/lib/gait/pose.ts`: `createPoseLandmarker(preferredTier?: "heavy" | "full" | "lite"): Promise<{ landmarker: PoseLandmarkerLike, activeTier: string, delegate: string }>`
   - `src/lib/gait/signal.ts`: `smoothPoseFrames(frames: LandmarkFrame[]): LandmarkFrame[]`
   - `src/lib/gait/calibration.ts`: `computeCalibrationScale(markerPixels: number, knownLengthMm: number): CalibrationResult`, `applyCalibrationToPoint(xPx: number, yPx: number, scaleMmPerPx: number): { xMm: number, yMm: number }`
   - `src/lib/gait/homography.ts`: `computeHomographyMatrix(imagePoints: [number, number][], floorPoints: [number, number][]): HomographyMatrix`, `projectToFloorPlane(point: [number, number], matrix: HomographyMatrix): [number, number]`
   - `src/lib/gait/events.ts`: `detectGaitEventsFused(frames: LandmarkFrame[], fps: number, options?: EventDetectionOptions): GaitEventResults`
   - `src/lib/gait/analysis.ts`: `filterSteadyStateStrides(strides: Stride[]): { steadyStateStrides: Stride[], excludedStrides: Stride[] }`
   - `src/lib/gait/types.ts`: Export necessary types (`LandmarkFrame`, `CalibrationResult`, `HomographyMatrix`, `GaitEventResults`, `Stride`, etc.).

2. Refactor `/Users/damian/GitHub/gait-lab/src/lib/gait/__tests__/e2e_engine_enhancements.test.ts`:
   - REMOVE ALL local inline/facade helper functions from the test file.
   - Import all functions directly from `src/lib/gait/pose`, `src/lib/gait/signal`, `src/lib/gait/calibration`, `src/lib/gait/homography`, `src/lib/gait/events`, and `src/lib/gait/analysis`.
   - Ensure the 22 tests across Tiers 1-4 execute against these module imports.

3. Update Documentation:
   - Ensure `TEST_INFRA.md` and `TEST_READY.md` accurately document the runner, module imports, 4 tiers, feature matrix, and scenario details.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations and tests must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run `npx vitest run src/lib/gait/__tests__/e2e_engine_enhancements.test.ts` and `npx tsc --noEmit` to verify all tests pass cleanly with 0 TypeScript compilation errors.
Write your handoff report to /Users/damian/GitHub/gait-lab/.agents/teamwork_preview_worker_e2e_remediation_iter2/handoff.md and notify the parent orchestrator via send_message.
